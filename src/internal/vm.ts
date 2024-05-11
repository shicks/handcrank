import { parseScript } from 'esprima';
import { CR } from './completion_record';
import type { Val } from './values';
import type { ExecutionContext } from './execution_context';
import { EMPTY, NOT_APPLICABLE } from './enums';
import { NodeTypes, NodeMap, Node } from './tree';

interface SyntaxOp {
  Evaluation: CR<Val|EMPTY>;
}

export class VM {

  executionStack: ExecutionContext[] = [];

  // Plugins
  defines = new Map<string, [string[], ($: VM, ...args: Val[]) => Val]>();
  definesRevdeps = new Map<string, string[]>();
  syntaxOperations: SyntaxOpMap = {
    Evaluation: {},
  };

  // TODO - can we store strictness of executing production here?

  getRunningContext(): ExecutionContext {
    // TODO - what if stack empty?!?
    return this.executionStack.at(-1)!;
  }

  evaluateScript(script: string, filename?: string): CR<Val> {
    const result = this.operate('Evaluation', parseScript(script));
    return EMPTY.is(result) ? undefined : result;
  }

  operate<O extends keyof SyntaxOp>(op: O, n: Node): SyntaxOp[O] {
    for (const impl of this.syntaxOperations[op][n.type] || []) {
      const result = impl(this, n as any, (child) => this.operate(op, child));
      if (!NOT_APPLICABLE.is(result)) return result;
    }
    console.dir(n);
    throw new Error(`Could not do '${op}' on ${n.type}({\n  ${
        Object.entries(n).map((k, v) => `${k}: ${v}`).join(',\n  ')}\n})`);
  }

  install(plugin: Plugin): void {
    const pushSyntaxOp = <const O extends keyof SyntaxOp>(op: O) =>
      <const N extends NodeTypes>(nodeTypes: N[], fn: SyntaxOpFn<O, N>) => {
        const ops: SyntaxOpNodeMap<O> = this.syntaxOperations[op];
        for (const nt of nodeTypes) {
          (ops[nt] || (ops[nt] = [] as any[])).push(fn);
        }
      };
    plugin({
      define: (name: string, deps: string[], fn: ($: VM, ...args: Val[]) => Val) => {
        if (this.defines.has(name)) throw new Error(`already defined: ${name}`);
        this.defines.set(name, [deps, fn]);
        for (const dep of deps) {
          let revdeps = this.definesRevdeps.get(dep);
          if (!revdeps) this.definesRevdeps.set(dep, revdeps = []);
          revdeps.push(name);
        }
      },
      onEvaluation: pushSyntaxOp('Evaluation'),
    });
  }
}

type SyntaxOpFn<O extends keyof SyntaxOp, N extends keyof NodeMap> =
    ($: VM, node: NodeMap[N],
     recurse: (n: Node) => SyntaxOp[O]) => SyntaxOp[O]|NOT_APPLICABLE;
type SyntaxOpNodeMap<O extends keyof SyntaxOp> = {
  [N in NodeTypes]?: Array<SyntaxOpFn<O, N>>
};
type SyntaxOpMap = {
  [O in keyof SyntaxOp]: SyntaxOpNodeMap<O>
};

type SyntaxSPI = {
  [O in keyof SyntaxOp as `on${O}`]: <N extends NodeTypes>(nodeTypes: N[],
                                                           fn: SyntaxOpFn<O, N>) => void
}

export interface PluginSPI extends SyntaxSPI {
  // NOTE: names can be %intrinsics% or GlobalBindings.
  define(name: string, deps: string[], fn: ($: VM, ...args: Val[]) => Val): void;
}

// TODO - how to solve ordering issues?
//      - can we just install an as-needed graph so that
//        we can just assume all prereqs exist?
export type Plugin = (spi: PluginSPI) => void;
