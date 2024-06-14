// Runs test262.

import * as esprima from 'esprima-next';
import { parse } from 'yaml';
import { readFile, readdir, stat } from 'node:fs/promises';
import { test262 } from './262';
import { DebugString, VM, run, runAsync } from '../src/internal/vm';
import { full } from '../src/plugins';
import { IsThrowCompletion } from '../src/internal/completion_record';
import { Obj } from '../src/internal/obj';

class File {
  constructor(
    readonly path: string,
    readonly content: string,
    readonly metadata: Metadata,
  ) {}

  static async load(path: string) {
    const content = String(await readFile(path, 'utf8'));
    const match = /\/\*---(.*?)---\*\//s.exec(content);
    const metadata = match ? parse(match[1]) : {};
    return new File(path, content, metadata);
  }
}

type Flag = 'onlyStrict'
  | 'noStrict'
  | 'module'
  | 'raw'
  | 'async'
  | 'generated'
  | 'CanBlockIsTrue'
  | 'non-deterministic';
interface Metadata {
  negative?: {
    phase: 'parse' | 'resolution' | 'runtime';
    type: string;
  };
  includes?: string[];
  flags?: Flag[];
  features?: string[];
  locale?: string[];
  defines?: string[];
  description?: string;
}

function includes(f: File, h: Harness, m = new Map<string, File>()): Map<string, File> {
  function include(i: string) {
    if (m.has(i)) return;
    const included = h.files.get(i);
    if (!included) throw new Error(`Missing harness file: ${i} included by ${f.path}`);
    m.set(i, included);
    includes(included, h, m);
  }
  (f.metadata.includes || []).forEach(include);
  for (const ident of f.content.matchAll(/\b[$_a-z][$_a-z0-9]*\b/ig)) {
    const provide = h.provides.get(ident[0]);
    if (provide && f.path !== provide) {
      include(provide);
    }
  }
  return m;
}

class TestCase {
  readonly includes: File[];
  constructor(readonly file: File, readonly harness: Harness) {
    this.includes = [...includes(file, harness).values()];
  }

  name() {
    return (/*this.file.metadata.description ||*/ this.file.path).trim();
  }

  async runAsync() {
    return await runAsync(this.runSync(), {maxSteps: 10000});
  }

  * runSync() {
    const vm = new VM({
      parseScript(source) {
        return esprima.parseScript(source, {loc: true, range: true});
      },
      parseModule(source) {
        return esprima.parseModule(source, {loc: true, range: true});
      },
    });
    vm.install(full);
    vm.install(test262);
    // Load the prerequisites and the test
    for (const f of this.includes) {
      const result = yield* vm.evaluateScript(f.content, f.path);
      if (IsThrowCompletion(result)) {
        throw new Error(`Unexpected rejection: ${DebugString(result.Value)}`);
      }
    }
    const result = yield* vm.evaluateScript(this.file.content, this.file.path);

    // TODO - pass in a reporter?

    if (IsThrowCompletion(result)) {
      const err = result.Value;
      // Check for an expected negative result
      if (this.file.metadata.negative) {
        // TODO - Verify the correct exception
        if (!(err instanceof Obj)) {
          throw new Error(`Expected a thrown object but got ${DebugString(err)}`);
        }
        if (!err.ErrorData) {
          throw new Error(`Expected a thrown Error but got ${DebugString(err)}`);
        }
        const expectedType = this.file.metadata.negative.type;
        const gotType = err.OwnProps.get('name');
        if (gotType !== expectedType) {
          throw new Error(`Expected ${expectedType} but got ${DebugString(err)}`);
        }
      } else {
        throw new Error(`Unexpected failure: ${DebugString(err)}`);
      }
    } else if (this.file.metadata.negative) {
      throw new Error(`Expected test to fail with ${this.file.metadata.negative.type}`);
    }
    console.log(`${this.name()}: PASS`);
  }
}

function makePool(free = 16): <T>(task: () => Promise<T>) => Promise<T> {
  const waiting: Array<() => void> = [];
  const reclaim = () => {
    if (waiting.length) {
      waiting.shift()!();
    } else {
      ++free;
    }
  }
  return (task) => {
    if (free > 0) {
      --free;
      return task().finally(reclaim);
    } else {
      return new Promise(resolve => {
        waiting.push(() => {
          resolve(task().finally(reclaim));
        });
      });
    }
  };
}

function makeAsyncIterator<T>(): {
  iterator: AsyncIterableIterator<T>,
  emit: (arg: T) => void,
  fail: (err: unknown) => void,
  done: () => void,
} {
  const resolvers: Array<(arg: Promise<IteratorResult<T>>) => void> = [];
  const values: T[] = [];
  let terminus: Promise<IteratorResult<T>>|undefined;
  const iterator = {
    [Symbol.asyncIterator]() { return this; },
    next(): Promise<IteratorResult<T>> {
      if (values.length) return Promise.resolve({value: values.shift()!, done: false});
      if (terminus) return Promise.resolve(terminus);
      return new Promise(resolve => {
        resolvers.push(resolve);
      });
    },
  };
  const emit = (value: T) => {
    if (terminus) return;
    if (resolvers.length) resolvers.shift()!(Promise.resolve({value, done: false}));
    values.push(value);
  };
  const fail = (err: unknown) => {
    if (terminus) return;
    terminus = Promise.reject(err);
    while (resolvers.length) resolvers.shift()!(terminus);
  };
  const done = () => {
    if (terminus) return;
    terminus = Promise.resolve({value: undefined, done: true});
    while (resolvers.length) resolvers.shift()!(terminus);
  };
  return {iterator, emit, fail, done};
}

class Harness {
  //pool = x => x(); // makePool();
  constructor(
    readonly testRoot: string,
    readonly files: Map<string, File>,
    readonly provides: Map<string, string>,
  ) {}

  testCases(): AsyncIterableIterator<TestCase> {
    const {iterator, emit, fail, done} = makeAsyncIterator<TestCase>();
    let count = 0;
    const decrement = () => {
      if (--count <= 0) done();
    };
    const recurse = async (dir: string) => {
      ++count;
      for (const f of await readdir(dir)) {
        const path = `${dir}/${f}`;
        if (f.endsWith('.js')) {
          ++count;
          File.load(path)
              .then(file => emit(new TestCase(file, this)), fail)
              .finally(decrement);
        }
        ++count;
        stat(`${dir}/${f}`).then(stats => {
          if (stats.isDirectory()) recurse(path);
        }, fail).finally(decrement);
      }
      decrement();
    }
    recurse(`${this.testRoot}/test`).catch(fail);
    return iterator;
  }

  static async load(testRoot: string) {
    const harnessFiles = new Map<string, File>();
    const harnessProvides = new Map<string, string>();
    const promises: Promise<void>[] = [];
    const path = `${testRoot}/harness`;
    for (const fn of await readdir(path)) {
      if (!fn.endsWith('.js')) continue;
      promises.push((async () => {
        const f = await File.load(`${path}/${fn}`);
        harnessFiles.set(fn, f);
        for (const sym of f.metadata.defines || []) {
          harnessProvides.set(sym, fn);
        }
      })());
    }
    await Promise.all(promises);
    return new Harness(testRoot, harnessFiles, harnessProvides);
  }
}

Harness.load('test262').then(async harness => {
  let passed = 0;
  let failed = 0;
  //const promises: Promise<void>[] = [];
  for await (const t of harness.testCases()) {
console.log(`TEST: ${t.file.path}`);
    // promises.push(
    //   harness.pool(() =>
    if (!t.file.path.match(/decimalToHexString/)) continue;
    console.log(t.name());
    try {
      run(t.runSync());
      ++passed;
    } catch (err) {
      ++failed;
      console.error(`${t.name()}: FAIL`); // ${err}`);
    }
    //   )
    // );
  }
});
