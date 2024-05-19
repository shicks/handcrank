import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { OrdinaryObjectCreate, type Obj, type Val } from './values';
import type { ExecutionContext } from './execution_context';
import { EMPTY, NOT_APPLICABLE } from './enums';
import { NodeType, NodeMap, Node, Esprima, emptyLoc, SourceTextNode } from './tree';
import { GetValue, ReferenceRecord } from './reference_record';
import { PropertyDescriptor } from './property_descriptor';
import { InitializeHostDefinedRealm, RealmRecord } from './realm_record';
import { ParseScript, ScriptEvaluation } from './script_record';
import * as ESTree from 'estree';

interface SyntaxOp {
  Evaluation: CR<Val|ReferenceRecord|EMPTY>;
}


export class VM {

  executionStack: ExecutionContext[] = [];

  // Plugins
  intrinsics = new Map<string, [string[], (...args: Obj[]) => Obj]>();
  globals = new Map<string, [string[], (...args: Val[]) => Val|PropertyDescriptor]>();
  rdeps = new Map<string, string[]>();
  syntaxOperations: SyntaxOpMap = {
    Evaluation: {},
  };

  constructor(private readonly esprima?: Esprima) {}

  initialize() {
    if (!this.executionStack.length) {
      CastNotAbrupt(InitializeHostDefinedRealm(this));
    }
  }

  newError(_name: string): Obj {
    // TODO - make this work
    return OrdinaryObjectCreate(null, []);
  }

  // TODO - can we store strictness of executing production here?

  enterContext(context: ExecutionContext) {
    // TODO - resume? suspend previous?
    this.executionStack.push(context);
    context.resume();
  }

  popContext() {
    this.executionStack.pop()!.suspend();
    this.getRunningContext().resume();
  }

  getRunningContext(): ExecutionContext {
    // TODO - what if stack empty?!?
    return this.executionStack.at(-1)!;
  }

  getRealm(): RealmRecord|undefined {
    return this.executionStack.at(-1)?.Realm;
  }

  getIntrinsic(name: string): Obj {
    return this.getRealm()!.Intrinsics.get(name)!;
  }

  // NOTE: this helper method is typically more useful than the "recurse"
  // function passed to the syntax operator because it additionally unwraps
  // ReferenceRecords.  The spec does this in a production that's basically
  // transparent to ESTree, so we don't have a good opportunity, but we do
  // know when an rvalue is required from a child.
  evaluateValue(node: Node): CR<Val> {
    this.initialize()
    const result: CR<EMPTY|Val|ReferenceRecord> = this.operate('Evaluation', node);
    if (IsAbrupt(result)) return result;
    if (EMPTY.is(result)) return undefined;
    if (result instanceof ReferenceRecord) return GetValue(this, result);
    return result;
  }

  evaluateScript(script: ESTree.Program): CR<Val>;
  evaluateScript(script: string, filename?: string): CR<Val>;
  evaluateScript(script: string|ESTree.Program, filename?: string): CR<Val> {
    this.initialize()
    if (typeof script === 'string') {
      const source = script;
      if (!this.esprima) throw new Error(`no parser`);
      type Metadata = {start: {offset: number}, end: {offset: number}};
      script = this.esprima.parseScript(source, {loc: true}, (n: Node, meta: Metadata) => {
        if (filename) (n.loc || (n.loc = emptyLoc())).source = filename;
        if (n.range) {
          switch (n.type) {
            case 'FunctionExpression':
            case 'FunctionDeclaration':
            case 'MethodDefinition':
            case 'ClassDeclaration':
            case 'ClassExpression':
            case 'ArrowFunctionExpression':
              (n as SourceTextNode).sourceText =
                source.substring(meta.start.offset, meta.end.offset);
              break;
            case 'Property':
              if (n.value.type === 'FunctionExpression') {
                (n.value as SourceTextNode).sourceText =
                  source.substring(meta.start.offset, meta.end.offset);
              }
              break;
          }
        }
        delete n.range;
      }) as ESTree.Program;
    }
    const record = ParseScript(script, this.getRealm(), undefined);
    if (Array.isArray(record)) {
      throw record[0]; // TODO - handle failure better
    }
    const result = ScriptEvaluation(this, record);
    return IsAbrupt(result) ? result : EMPTY.is(result) ? undefined :
      GetValue(this, result);
  }

  operate<O extends keyof SyntaxOp>(op: O, n: Node): SyntaxOp[O] {
    for (const impl of this.syntaxOperations[op][n.type] || []) {
      const result = impl(this, n as any, (child) => this.operate(op, child));
      if (!NOT_APPLICABLE.is(result)) return result;
    }
    // TODO - might be nice to print to depth 2?
    throw new Error(`Cannot do '${op}' on ${n.type}({\n  ${
        Object.entries(n).map(([k, v]) => `${k}: ${v}`).join(',\n  ')}\n})`);
  }

  install(plugin: Plugin): void {
    const pushSyntaxOp = <const O extends keyof SyntaxOp>(op: O) =>
      <const N extends NodeType>(nodeTypes: N[], fn: SyntaxOpFn<O, N>) => {
        const ops: SyntaxOpNodeMap<O> = this.syntaxOperations[op];
        for (const nt of nodeTypes) {
          (ops[nt] || (ops[nt] = [] as any[])).push(fn);
        }
      };
    plugin({
      define: (name: string, deps: any[], fn: any) => {
        const map = name.startsWith('%') ? this.intrinsics : this.globals;
        if (map.has(name)) throw new Error(`already defined: ${name}`);
        map.set(name, [deps, fn]);
        for (const dep of deps) {
          let revdeps = this.rdeps.get(dep);
          if (!revdeps) this.rdeps.set(dep, revdeps = []);
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
  [N in NodeType]?: Array<SyntaxOpFn<O, N>>
};
type SyntaxOpMap = {
  [O in keyof SyntaxOp]: SyntaxOpNodeMap<O>
};

type SyntaxSPI = {
  [O in keyof SyntaxOp as `on${O}`]: <N extends NodeType>(nodeTypes: N[],
                                                          fn: SyntaxOpFn<O, N>) => void
}

type DepsType<Name> = Name extends `%${string}` ? `%${string}%`[] : string[];
type DefineType<Name> = Name extends `%${string}` ?
  (...args: Obj[]) => Obj :
(...args: Val[]) => Val|PropertyDescriptor;

export interface PluginSPI extends SyntaxSPI {
  // NOTE: names can be %intrinsics% or GlobalBindings.
  define<const N extends string>(name: N, deps: DepsType<N>, fn: DefineType<N>): void;
}

// TODO - how to solve ordering issues?
//      - can we just install an as-needed graph so that
//        we can just assume all prereqs exist?
export type Plugin = (spi: PluginSPI) => void;
