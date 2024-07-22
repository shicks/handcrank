#!/usr/bin/env bun

import { DebugString, VM, run } from './internal/vm';
import * as acorn from 'acorn';
import * as readline from 'readline';
import { IsAbrupt, IsThrowCompletion } from './internal/completion_record';
import * as fs from 'node:fs';
import { full, utc } from './plugins';

// TODO - try acorn with {ecmaVersion: latest}
//      - benchmark code size, performance, and test262 accuracy

export const vm = new VM({
  parseScript(source) { return acorn.parse(source, {ecmaVersion: 'latest'}); },
  parseModule(source) { return acorn.parse(source, {ecmaVersion: 'latest'}); },
});

// TODO - reasonable fallback when missing intrinsics?
//        i.e. %String.prototype% might fall back to an ordinary object?
// TODO - rewrite deps as provides/requires for intrinsics?
//        would this still allow overriding modules?  same id still a thing?
//          - but better still to just not install it in the first place?
//          - maybe deps still allows grouping?

vm.install(full);
const realm = vm.createRealm();

// TODO - consider adding REPL directives like .report to dump the
// most recent trace.
let reportStackTraceOnThrow = true;
let strict = false;

function runScript(script: string, filename: string, printResult = false) {
  const cr = run(vm.evaluateScript(script, realm, {filename, strict}));
  if (IsAbrupt(cr)) {
    if (IsThrowCompletion(cr)) {
      console.error(`Uncaught ${DebugString(cr.Value)}`);
      if (reportStackTraceOnThrow && (vm as any).lastThrow) {
        console.error((vm as any).lastThrow);
      }
      return 1;
    } else {
      console.dir(cr);
    }
  } else if (printResult) {
    const s = DebugString(cr, {depth: 2});
    console.log(s);
  }
  return 0;
}

// Usage:
//   main          start a repl
//   main file.js  run file from disk
//   main -e '...' run script from command line
function main(args: string[], exit: (arg: number) => void) {
  let run = false;
  let status = 0;
  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === '-e') {
      status = runScript(args.shift()!, 'input.js');
      if (status) exit(status);
      run = true;
    } else if (arg === '--strict') {
      strict = true;
    } else if (arg === '--sloppy') {
      strict = false;
    } else if (arg === '--utc') {
      vm.install(utc);
    } else {
      const script = String(fs.readFileSync(arg, 'utf8'));
      status = runScript(script, arg);
      if (status) exit(status);
      run = true;
    }
  }
  if (!run) {
    repl();
    return;
  }
  exit(0);
}

function repl() { 
  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  rl.on('history', (_h) => {
    // TODO - store to disk
  });
  let replNum = 0;
  function loop(script: string) {
    if (script === ':strict') {
      strict = true;
    } else if (script === ':sloppy') {
      strict = false;
    } else if (!script || script === 'exit') {
      return;
    } else {
      try {
        acorn.parse(script, {ecmaVersion: 'latest'});
      } catch (err) {
        if (err.description === 'Unexpected end of input') {
          rl.question('... ', (s) => loop(script + '\n' + s));
          return;
        }
      }
      runScript(script, `REPL${++replNum}`, true);
    }
    rl.question('> ', loop);
  }
  rl.question('> ', loop);
}

main(process.argv.slice(2), process.exit);
