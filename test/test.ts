// Runs test262.

import * as esprima from 'esprima-next';
import { parse } from 'yaml';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { test262 } from './262';
import { DebugString, VM, runAsync } from '../src/internal/vm';
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
    try {
      const content = String(await readFile(path, 'utf8'));
      const match = /\/\*---(.*?)---\*\//s.exec(content);
      const metadata = match ? parse(match[1].replace(/\x0d\x0a|\x0a?\x0d/g, '\x0a')) : {};
      return new File(path, content, metadata);
    } catch (err: unknown) {
      console.error(`Error loading ${path}: ${err}`);
      throw err;
    }
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

function allIncludes(f: File, h: Harness): string[] {
  const out = new Set<string>(f.metadata.includes || []);
  const defines = new Set<string>(f.metadata.defines || []);
  for (const ident of f.content.matchAll(/\b[$_a-z][$_a-z0-9]*\b/ig)) {
    if (defines.has(ident[0])) continue;
    const provide = h.provides.get(ident[0]);
    if (provide) out.add(provide);
  }
  return [...out];
}

function transitiveIncludes(f: File, h: Harness, out = new Set<string>): Set<string> {
  for (const i of allIncludes(f, h)) {
    if (out.has(i)) continue;
    out.add(i);
    transitiveIncludes(h.files.get(i)!, h, out);
    out.delete(i);
    out.add(i);
  }
  return out;
}

// function includes(f: File, h: Harness, m = new Map<string, File>()): Map<string, File> {
//   function include(i: string) {
//     if (m.has(i)) return;
//     const included = h.files.get(i);
//     if (!included) throw new Error(`Missing harness file: ${i} included by ${f.path}`);
//     m.set(i, included);
//     includes(included, h, m);
//   }
//   (f.metadata.includes || []).forEach(include);
//   for (const ident of f.content.matchAll(/\b[$_a-z][$_a-z0-9]*\b/ig)) {
//     const provide = h.provides.get(ident[0]);
//     if (provide && f.path !== provide) {
//       if (f.path.match(/compareArray/)) console.log(`include: ${ident} => ${provide}`);
//       include(provide);
//     }
//   }
//   if (f.path.match(/compareArray/)) console.log(m);
//   return m;
// }

class TestCase {
  readonly includes: File[];
  constructor(readonly file: File, readonly harness: Harness) {
    this.includes = [...transitiveIncludes(file, harness)].map(i => harness.files.get(i)!);
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
        let msg = `Unexpected rejection: ${DebugString(result.Value)}`;
        if ((vm as any).lastThrow) {
          msg += `\n${(vm as any).lastThrow.stack}`;
        }
        throw new Error(msg);
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
        let msg = `Unexpected failure: ${DebugString(err, 2)}`;
        if ((vm as any).lastThrow) {
          msg += `\n${(vm as any).lastThrow.stack}`;
        }
        throw new Error(msg);
      }
    } else if (this.file.metadata.negative) {
      throw new Error(`Expected test to fail with ${this.file.metadata.negative.type}`);
    }
  }
}

class Harness {
  constructor(
    readonly testRoot: string,
    readonly files: Map<string, File>,
    readonly provides: Map<string, string>,
  ) {}

  testFiles(): AsyncIterableIterator<string> {
    return readdirRecursive(`${this.testRoot}/test`);
  }

  async * testCases(
    filter: (fn: string) => boolean = () => true,
  ): AsyncIterable<TestCase> {
    for await (const f of this.testFiles()) {
      if (f.endsWith('.js') && filter(f)) {
        yield File.load(f).then(file => new TestCase(file, this));
      }
    }
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

Harness.load('test/test262').then(async harness => {
  let passed = 0;
  let failed = 0;
  let dir = '';
  // TODO - flags for outputting files, verbose print failures inline, etc.
  let filter: ((test: string) => boolean)|undefined;
  const filterRegexps: RegExp[] = [];
  let verbose = false;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '-v') {
      verbose = true;
      continue;
    } else {
      filterRegexps.push(new RegExp(arg));
    }
  }
  if (filterRegexps.length) filter = (f) => filterRegexps.some(r => r.test(f));
  for await (const t of harness.testCases(filter)) {
    //console.log(`TEST: ${t.file.path}`);
    //console.log(t.name());
    const name = t.name().replace('test/test262/test/', '').replace(/\.js$/, '');
    const thisDir = name.replace(/\/[^/]+$/, '');
    if (thisDir !== dir) {
      if (dir && !verbose) process.stdout.write('\n');
      dir = thisDir;
      if (!verbose) process.stdout.write(dir + '   ');
    }
    try {
      await Promise.race([
        runAsync(t.runSync()),
        new Promise((_, reject) => setTimeout(
          () => reject(new Error('timeout')), 10_000)),
      ]);
      if (!verbose) process.stdout.write('.');

      ++passed;
    } catch (err) {
      ++failed;
      if (!verbose) process.stdout.write('F');
      await mkdir(`dist/test/${thisDir}`, {recursive: true});
      writeFile(`dist/test/${name}.err`, err.message);
      if (verbose) {
        console.error(`${t.name()}: FAIL`);
        console.error(err);
      }
    }
  }
  console.log(`\n\nTests complete: ${passed} passed / ${failed} failed (${
               (passed / (passed + failed) * 100).toFixed(2)}%)`);
  process.exit(failed ? 1 : 0);
});

async function* asyncFlatMap<T, U>(iter: AsyncIterable<T>, fn: (t: T) => AsyncIterable<U>): AsyncIterableIterator<U> {
  const iters = [];
  for await (const t of iter) {
    iters.push(fn(t));
  }
  for (const iter of iters) {
    yield* iter;
  }
}

type Stats = typeof stat extends (...args: any[]) => Promise<infer U> ? U : never;
async function* asyncReaddir(path: string): AsyncIterable<[string, Stats]> {
  const promises = new Map<string, Promise<Stats>>();
  for (const f of await readdir(path)) {
    promises.set(f, stat(`${path}/${f}`));
  }
  for (const k of [...promises.keys()].sort()) {
    yield [k, await promises.get(k)!];
  }
}

export function readdirRecursive(path: string): AsyncIterableIterator<string> {
  return asyncFlatMap(asyncReaddir(path), async function*([f, s]) {
    if (s.isDirectory()) {
      yield* readdirRecursive(`${path}/${f}`);
    } else {
      yield `${path}/${f}`;
    }
  });
}
