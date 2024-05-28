import { VM, run } from './internal/vm';
import { basic } from './internal/plugin/basic';
import { arithmetic } from './internal/plugin/arithmetic';
import * as esprima from 'esprima-next';
import * as readline from 'readline';
import { fundamental } from './internal/fundamental';

export const vm = new VM(esprima);
vm.install(fundamental);
vm.install(basic);
vm.install(arithmetic);

if (process.argv.length > 2) {
  console.dir(run(vm.evaluateScript(process.argv[2])));
} else {
  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  function loop(script: string) {
    if (!script || script === 'exit') return;
    console.dir(run(vm.evaluateScript(script)));
    rl.question('> ', loop);
  }
  rl.question('> ', loop);
}
