import { VM } from './internal/vm';
import { basic } from './internal/plugin/basic';
import { arithmetic } from './internal/plugin/arithmetic';

export const vm = new VM();
vm.install(basic);
vm.install(arithmetic);

console.dir(vm.evaluateScript('1 + 4'));
