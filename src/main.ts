import { DebugString, VM, run } from './internal/vm';
import { syntax } from './internal/syntax';
import { arithmetic } from './internal/arithmetic';
import * as esprima from 'esprima-next';
import * as readline from 'readline';
import { fundamental } from './internal/fundamental';
import { IsAbrupt } from './internal/completion_record';
import { arrayObject } from './internal/exotic_array';
import { stringObject } from './internal/exotic_string';
import { errorObject } from './internal/error_object';
import { consoleObject } from './internal/console';

export const vm = new VM({
  parseScript(source) { return esprima.parseScript(source, {loc: true, range: true}); },
  parseModule(source) { return esprima.parseModule(source, {loc: true, range: true}); },
});
vm.install(fundamental);
vm.install(stringObject);
vm.install(syntax);
vm.install(arithmetic);
vm.install(arrayObject);
vm.install(errorObject);
vm.install(consoleObject);

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
    try {
      esprima.parseScript(script);
    } catch (err) {
      if (err.description === 'Unexpected end of input') {
        rl.question('... ', (s) => loop(script + '\n' + s));
        return;
      }
    }
    const cr = run(vm.evaluateScript(script, `REPL${++replNum}`));
    if (IsAbrupt(cr)) {
      if (cr.Type === 'throw') {
        console.error(`Uncaught ${DebugString(cr.Value)}`);
      } else {
        console.dir(cr);
      }
    } else {
      const s = DebugString(cr, 2);
      console.log(s);
    }
    rl.question('> ', loop);
  }
  rl.question('> ', loop);
}
