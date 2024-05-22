import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { Val } from './val';
import { ExecutionContext } from './execution_context';
import { EMPTY, NOT_APPLICABLE } from './enums';
import { NodeType, NodeMap, Node, Esprima, emptyLoc, SourceTextNode } from './tree';
import { GetValue, ReferenceRecord } from './reference_record';
import { PropertyDescriptor } from './property_descriptor';
import { InitializeHostDefinedRealm, RealmRecord } from './realm_record';
import { ParseScript, ScriptEvaluation } from './script_record';
import * as ESTree from 'estree';
import { Obj, OrdinaryObjectCreate } from './obj';

export type EvalGen<T> = Generator<undefined, T, undefined>;

export function run<T>(gen: EvalGen<T>) {
  let result;
  do {
    result = gen.next();
  } while (!result.done);
  return result.value;
}

export class VM {

  executionStack: ExecutionContext[] = [];

  // Plugins - note: globals and intrinsics built in RealmRecord
  intrinsics = new Map<string, IntrinsicFn>();
  globals = new Map<string, GlobalDefFn>();
  syntaxOperations: SyntaxHandlers = {
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
  * evaluateValue(node: Node): EvalGen<CR<Val>> {
    this.initialize()
    const result: CR<EMPTY|Val|ReferenceRecord> = yield* this.operate('Evaluation', node);
    if (IsAbrupt(result)) return result;
    if (EMPTY.is(result)) return undefined;
    if (result instanceof ReferenceRecord) return GetValue(this, result);
    return result;
  }

  evaluateScript(script: ESTree.Program): EvalGen<CR<Val>>;
  evaluateScript(script: string, filename?: string): EvalGen<CR<Val>>;
  * evaluateScript(script: string|ESTree.Program, filename?: string): EvalGen<CR<Val>> {
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
    const result = yield* ScriptEvaluation(this, record);
    return IsAbrupt(result) ? result : EMPTY.is(result) ? undefined :
      GetValue(this, result);
  }

  operate<O extends keyof SyntaxOp>(op: O, n: Node): SyntaxOp[O] {
    for (const impl of this.syntaxOperations[op][n.type] || []) {
      const result = impl(n as any, (child) => this.operate(op, child));
      if (!NOT_APPLICABLE.is(result)) return result;
    }
    // TODO - might be nice to print to depth 2?
    throw new Error(`Cannot do '${op}' on ${n.type}({\n  ${
        Object.entries(n).map(([k, v]) => `${k}: ${v}`).join(',\n  ')}\n})`);
  }

  install(plugin: Plugin): void {
    for (const key in this.syntaxOperations) {
      const register = plugin[key as keyof SyntaxOp];
      if (!Object.hasOwn(this.syntaxOperations, key) ||
        !Object.hasOwn(plugin, key) ||
        typeof register != 'function') continue;
      const op = this.syntaxOperations[key as keyof SyntaxOp];
      const on = (types: NodeType|NodeType[], handler: SyntaxHandler<any, any>) => {
        if (!Array.isArray(types)) types = [types];
        for (const type of types) {
          (op[type] || (op[type] = [])).push(handler);
        }
      };
      register(this, on);
    }
    for (const name in plugin.Intrinsics || {}) {
      const gen = plugin.Intrinsics![name as `%${string}%`];
      if (this.intrinsics.has(name)) throw new Error(`already defined: ${name}`);
      this.intrinsics.set(name, gen);
    }
    for (const name in plugin.Globals || {}) {
      const gen = plugin.Globals![name];
      if (this.globals.has(name)) throw new Error(`already defined: ${name}`);
      this.globals.set(name, gen);
    }
  }
}

export function* just<T>(value: T): Generator<any, T, any> {
  return value;
}

export function when<N, T>(
  condition: (n: N) => boolean,
  action: (n: N, recurse: (n: Node) => T) => T,
): (n: N, recurse: (n: Node) => T) => T|NOT_APPLICABLE {
  return (n, recurse) => condition(n) ? action(n, recurse) : NOT_APPLICABLE;
}

interface SyntaxOp {
  Evaluation: EvalGen<CR<Val|ReferenceRecord|EMPTY>>;
}
type IntrinsicFn = ($: VM) => Generator<string, Obj, Obj>;
type GlobalDefFn = ($: VM) => Generator<string, Val|PropertyDescriptor, Obj>;
type SyntaxOpMap = {[K in keyof SyntaxOp]?: ($: VM, on: SyntaxRegistration<K>) => void};

export interface Plugin extends SyntaxOpMap {
  Intrinsics?: Record<`%${string}%`, IntrinsicFn>;
  Globals?: Record<string, GlobalDefFn>;
  // Evaluation?($: VM, on: <N>(types: N|N[], handler: (NodeMap[N]) => Gen<CR<Val>>|NA) => void);
}

type SyntaxRegistration<O extends keyof SyntaxOp> =
  <N extends NodeType>(types: N|N[], handler: SyntaxHandler<N, O>) => void;
type SyntaxHandler<N extends NodeType, O extends keyof SyntaxOp> =
  (n: NodeMap[N], recurse: (n: Node) => SyntaxOp[O]) => SyntaxOp[O]|NOT_APPLICABLE;

type SyntaxHandlerMap<O extends keyof SyntaxOp> =
  {[N in NodeType]?: Array<SyntaxHandler<N, O>>};
type SyntaxHandlers = {[O in keyof SyntaxOp]: SyntaxHandlerMap<O>};

// type SyntaxOpFn<O extends keyof SyntaxOp, N extends keyof NodeMap> =
//     ($: VM, node: NodeMap[N],
//      recurse: (n: Node) => SyntaxOp[O]) => SyntaxOp[O]|NOT_APPLICABLE;
// type SyntaxOpNodeMap<O extends keyof SyntaxOp> = {
//   [N in NodeType]?: Array<SyntaxOpFn<O, N>>
// };
// type SyntaxOpMap = {
//   [O in keyof SyntaxOp]: SyntaxOpNodeMap<O>
// };

// type SyntaxSPI = {
//   [O in keyof SyntaxOp as `on${O}`]: <N extends NodeType>(nodeTypes: N[],
//                                                           fn: SyntaxOpFn<O, N>) => void
// }

// type DepsType<Name> = Name extends `%${string}` ? `%${string}%`[] : string[];
// type DefineType<Name> = Name extends `%${string}` ?
//   (...args: Obj[]) => Obj :
// (...args: Val[]) => Val|PropertyDescriptor;

// export interface PluginSPI extends SyntaxSPI {
//   // NOTE: names can be %intrinsics% or GlobalBindings.
//   define<const N extends string>(name: N, deps: DepsType<N>, fn: DefineType<N>): void;
// }

// TODO - how to solve ordering issues?
//      - can we just install an as-needed graph so that
//        we can just assume all prereqs exist?
//export type Plugin = (spi: PluginSPI) => void;
