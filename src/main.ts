import { DebugString, VM, run } from './internal/vm';
import { basic } from './internal/plugin/basic';
import { arithmetic } from './internal/plugin/arithmetic';
import * as esprima from 'esprima-next';
import * as readline from 'readline';
import { fundamental } from './internal/fundamental';
import { IsAbrupt } from './internal/completion_record';

export const vm = new VM({
  parseScript(source) { return esprima.parseScript(source, {loc: true, range: true}); },
  parseModule(source) { return esprima.parseModule(source, {loc: true, range: true}); },
});
vm.install(fundamental);
vm.install(basic);
vm.install(arithmetic);

if (process.argv.length > 2) {
  console.dir(run(vm.evaluateScript(process.argv[2])));
} else {
  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  rl.on('history', (h) => {
    // TODO - store to disk
  });
  let replNum = 0;
  function loop(script: string) {
    if (!script || script === 'exit') return;
    const cr = run(vm.evaluateScript(script, `REPL${++replNum}`));
    if (IsAbrupt(cr)) {
      if (cr.Type === 'throw') {
        console.error(`Uncaught ${DebugString(cr.Value)}`);
      } else {
        console.dir(cr);
      }
    } else {
      console.log(DebugString(cr));
    }
    rl.question('> ', loop);
  }
  rl.question('> ', loop);
}
