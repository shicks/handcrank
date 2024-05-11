//import { parseScript } from 'esprima';
import * as ESTree from 'estree';

import { CR } from './completion_record';
import type { Val } from './values';
import type { ExecutionContext } from './execution_context';
import { NOT_APPLICABLE } from './enums';

export class VM {

  executionStack: ExecutionContext[] = [];

  // Plugins
  defines = new Map<string, [string[], ($: VM, ...args: Val[]) => Val]>();
  definesRevdeps = new Map<string, string[]>();
  syntaxOperations: SyntaxOpMap = {
    Evaluate: {},
  };

  // TODO - can we store strictness of executing production here?

  getRunningContext(): ExecutionContext {
    // TODO - what if stack empty?!?
    return this.executionStack.at(-1)!;
  }

  evaluateScript(script: string, filename?: string): CR<Val> {
    return null!;
  }

  install(plugin: Plugin): void {
    plugin.install({
      define: (name: string, deps: string[], fn: ($: VM, ...args: Val[]) => Val) => {
        if (this.defines.has(name)) throw new Error(`already defined: ${name}`);
        this.defines.set(name, [deps, fn]);
        for (const dep of deps) {
          let revdeps = this.definesRevdeps.get(dep);
          if (!revdeps) this.definesRevdeps.set(dep, revdeps = []);
          revdeps.push(name);
        }
      },
      syntax: <const O extends keyof SyntaxOp, T extends keyof ESTree.NodeMap>(
        op: O,
        nodeTypes: T[],
        fn: ($: VM, node: ESTree.NodeMap[T]) => SyntaxOp[O]|NOT_APPLICABLE,
      ) => {
        const ops = this.syntaxOperations[op];
        for (const nt of nodeTypes) {
          (ops[nt] || (ops[nt] = [] as any[])).push(fn);
        }
      },
    });
  }
}

type SyntaxOpFn<O, N> = ($: VM, node: N) => O|NOT_APPLICABLE;
type SyntaxOpNodeMap<O> = {
  [N in keyof ESTree.NodeMap]?: Array<SyntaxOpFn<O, ESTree.NodeMap[N]>>
};
type SyntaxOpMap = {
  [O in keyof SyntaxOp]: SyntaxOpNodeMap<SyntaxOp[O]>
}
interface SyntaxOp {
  'Evaluate': Val;
}
interface PluginSPI {
  // NOTE: names can be %intrinsics% or GlobalBindings.
  define(name: string, deps: string[], fn: ($: VM, ...args: Val[]) => Val): void;
  syntax<const O extends keyof SyntaxOp, T extends keyof ESTree.NodeMap>(
    op: O,
    nodeTypes: T[],
    fn: ($: VM, node: ESTree.NodeMap[T]) => SyntaxOp[O]|NOT_APPLICABLE,
  ): void;
}

export interface Plugin {
  // TODO - how to solve ordering issues?
  //      - can we just install an as-needed graph so that
  //        we can just assume all prereqs exist?
  install(spi: PluginSPI): void;
}
