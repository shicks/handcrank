import { CR, CastNotAbrupt, IsAbrupt, ThrowCompletion } from './completion_record';
import { Val } from './val';
import { BuiltinExecutionContext, CodeExecutionContext, ExecutionContext, ResolveThisBinding } from './execution_context';
import { EMPTY, NOT_APPLICABLE, UNRESOLVABLE } from './enums';
import { NodeType, NodeMap, Node, Esprima, preprocess, Source } from './tree';
import { GetValue, ReferenceRecord } from './reference_record';
import { InitializeHostDefinedRealm, RealmAdvice, RealmRecord } from './realm_record';
import { ParseScript, ScriptEvaluation } from './script_record';
import * as ESTree from 'estree';
import { Obj, OrdinaryObjectCreate } from './obj';
import { EnvironmentRecord } from './environment_record';
import { HasValueField, propWC } from './property_descriptor';
import { Assert } from './assert';
import { Func, IsFunc } from './func';

export type EvalGen<T> = Generator<undefined, T, undefined>;
export type ECR<T> = EvalGen<CR<T>>;

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
  plugins = new Map<string|symbol|Plugin, Plugin>();
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
    return OrdinaryObjectCreate();
  }

  // TODO - can we store strictness of executing production here?

  enterContext(context: ExecutionContext) {
    // TODO - resume? suspend previous?
    this.executionStack.push(context);
    context.resume();
  }

  popContext(context?: ExecutionContext) {
    Assert(this.executionStack.length > 1);
    if (context) Assert(this.executionStack.at(-1) === context);
    this.executionStack.pop()!.suspend();
    this.getRunningContext().resume();
  }

  getRunningContext(): ExecutionContext {
    // TODO - what if stack empty?!?
    return this.executionStack.at(-1)!;
  }

  getActiveFunctionObject(): Func|undefined {
    return this.getRunningContext().Function ?? undefined;
  }

  getRealm(): RealmRecord|undefined {
    return this.executionStack.at(-1)?.Realm;
  }

  getIntrinsic(name: string): Obj {
    return this.getRealm()!.Intrinsics.get(name)!;
  }

  throw(name: string, message?: string): CR<never> {

    // NOTE: This can help with debugging... maybe we can
    // just store it in the VM?
    try {
      Assert(1 > 2);
    } catch (e) {
      /* throw */ (this as any).lastThrow = new Error(message ? `${name}: ${message}` : name);
    }

    const prototype = this.getIntrinsic(`%${name}.prototype%`);
    if (!prototype) throw new Error(`No such error: ${name}`);
    const error = OrdinaryObjectCreate({
      Prototype: prototype,
      ErrorData: '',
    }, {
      message: propWC(message),
    });
    this.captureStackTrace(error);
    return ThrowCompletion(error);
  }

  captureStackTrace(O: Obj) {
    const frames: string[] = [];
    for (let i = this.executionStack.length - 1; i >= 0; i--) {
      const frame = this.executionStack[i];
      if (frame instanceof BuiltinExecutionContext) {
        frames.push(`\n    at ${frame.Function!.InitialName} (builtin)`);
      } else if (frame instanceof CodeExecutionContext) {
        const currentNode = frame.currentNode;
        if (!currentNode) continue;
        const file = (currentNode.loc?.source as Source)?.sourceFile;
        let func = frame.Function?.OwnProps.get('name')?.Value;
        if (!func) func = frame.Function?.InternalName;
        if (func) {
          const thisValue = ResolveThisBinding(this);
          if (!IsAbrupt(thisValue) && thisValue instanceof Obj) {
            // TODO - read internal name from `this`?
            const className =
              (thisValue!.OwnProps?.get('constructor') as unknown as Obj)
              ?.OwnProps?.get('name')?.Value;
            if (className) func = `${String(className)}.${String(func)}`;
          }
        }
        const lineCol = currentNode.loc?.start ?
          ` (${file}:${currentNode.loc.start.line}:${
             currentNode.loc.start.column})` : '';
        frames.push(`\n    at ${func ? String(func) : '<anonymous>'}${lineCol}`);
      }
    }
    const name = findValueProp(O, 'name');
    const msg = findValueProp(O, 'message');
    const stack = `${String(name)}: ${String(msg)}${frames.join('')}`;
    // const stack = String((O.OwnProps.get('message')?.Value) ?? '') + frames.join('');
    O.OwnProps.set('stack', propWC(stack));
    O.ErrorData = stack;
  }

  // NOTE: this helper method is typically more useful than the "recurse"
  // function passed to the syntax operator because it additionally unwraps
  // ReferenceRecords.  The spec does this in a production that's basically
  // transparent to ESTree, so we don't have a good opportunity, but we do
  // know when an rvalue is required from a child.
  * evaluateValue(node: Node): ECR<Val> {
    this.initialize()
    const result: CR<EMPTY|Val|ReferenceRecord> = yield* this.operate('Evaluation', node);
    if (IsAbrupt(result)) return result;
    if (EMPTY.is(result)) return undefined;
    if (result instanceof ReferenceRecord) return yield* GetValue(this, result);
    return result;
  }

  evaluateScript(script: ESTree.Program): ECR<Val>;
  evaluateScript(script: string, filename?: string): ECR<Val>;
  * evaluateScript(script: string|ESTree.Program, filename?: string): ECR<Val> {
    this.initialize()
    if (typeof script === 'string') {
      const source = script;
      if (!this.esprima) throw new Error(`no parser`);
      try {
        script = this.esprima.parseScript(source) as ESTree.Program;
      } catch (err) {
        return this.throw('SyntaxError', err.message);
      }
      preprocess(script, {sourceFile: filename, sourceText: source});

      // script = this.esprima.parseScript(source, {loc: true}, (n: Node, meta: Metadata) => {
      //   // TODO - we want the following:
      //   //  - loc: {line, col} for each node
      //   //  - filenames for each node
      //   //  - sourceText for functions/classes
      //   //  - strict for each node (or at least scopes)
      //   // Consider providing parser wrappers for esprima, acorn, etc
      //   // Maybe use acorn-walk always?  Could use it in the wrapper...
      //   if (filename) (n.loc || (n.loc = emptyLoc())).source = filename;
      //   if (n.range) {
      //     switch (n.type) {
      //       case 'FunctionExpression':
      //       case 'FunctionDeclaration':
      //       case 'MethodDefinition':
      //       case 'ClassDeclaration':
      //       case 'ClassExpression':
      //       case 'ArrowFunctionExpression':
      //         (n as SourceTextNode).sourceText =
      //           source.substring(meta.start.offset, meta.end.offset);
      //         break;
      //       case 'Property':
      //         // Parser leaves the name off the FunctionExpression range for members
      //         if (n.value.type === 'FunctionExpression') {
      //           (n.value as SourceTextNode).sourceText =
      //             source.substring(meta.start.offset, meta.end.offset);
      //         }
      //         break;
      //     }
      //   }
      //   delete n.range;
      // }) as ESTree.Program;
    }
    const record = ParseScript(script, this.getRealm(), undefined);
    if (Array.isArray(record)) {
      throw record[0]; // TODO - handle failure better
    }
    const result = yield* ScriptEvaluation(this, record);
    return IsAbrupt(result) ? result : EMPTY.is(result) ? undefined :
      yield* GetValue(this, result);
  }

  Evaluation(n: Node): SyntaxOp['Evaluation'] {
    return this.operate('Evaluation', n);
  }

  operate<O extends keyof SyntaxOp>(op: O, n: Node): SyntaxOp[O] {
    if (op === 'Evaluation') {
      const ctx = this.getRunningContext();
      if (ctx instanceof CodeExecutionContext) {
        ctx.currentNode = n;
      }
    }
    for (const impl of this.syntaxOperations[op][n.type] || []) {
      const result = impl(n as any, (child) => this.operate(op, child));
      if (!NOT_APPLICABLE.is(result)) return result;
    }
    // TODO - might be nice to print to depth 2?
    throw new Error(`Cannot do '${op}' on ${n.type}({\n  ${
        Object.entries(n).map(([k, v]) => `${k}: ${v}`).join(',\n  ')}\n})`);
  }

  install(plugin: Plugin): void {
    for (const dep of plugin.deps ?? []) {
      const id = dep.id ?? dep;
      if (!this.plugins.has(id)) this.install(dep);
    }
    const id = plugin.id ?? plugin;
    this.plugins.set(id, plugin);

    if (!plugin.syntax) return;
    for (const key in this.syntaxOperations) {
      const register = plugin.syntax[key as keyof SyntaxOp];
      if (!Object.hasOwn(this.syntaxOperations, key) ||
        !Object.hasOwn(plugin.syntax, key) ||
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
  }

  isJsonParse() {
    // TODO - look thru execution context stack to figure this out...
    return false;
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
  Evaluation: ECR<Val|ReferenceRecord|EMPTY>;
}
type SyntaxOpMap = {[K in keyof SyntaxOp]?: ($: VM, on: SyntaxRegistration<K>) => void};

export interface Plugin {
  id?: string|symbol;
  deps?: Plugin[];
  syntax?: SyntaxOpMap;
  realm?: RealmAdvice;
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

export function DebugString(v: Val|ReferenceRecord): string {
  // TODO - consider adding an optional `color = false` argument
  //  - color null bright white, undefined dark gray, num/bool yellow, strings green, objs cyan
  if (v instanceof ReferenceRecord) {
    if (v.Base instanceof EnvironmentRecord) {
      return String(v.ReferencedName);
    } else if (UNRESOLVABLE.is(v.Base)) {
      return String(v.ReferencedName);
    } else {
      return `${DebugString(v.Base)}.${String(v.ReferencedName)}`;
    }
  }
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'bigint') return `${String(v)}n`;
  if (v instanceof Obj) {
    if (v.ErrorData != null) return v.ErrorData || 'Error';
    if (IsFunc(v)) {
      const name = v.OwnProps.get('name')?.Value;
      return `[Function: ${name ? String(name) : v.InternalName || '(anonymous)'}]`;
    }
    // TODO - consider printing props? maybe even slots?
    return '[Object]';
  }
  return String(v);
}

function findValueProp(o: Obj|null|undefined, p: string): Val {
  if (!o) return undefined;
  if (o.OwnProps.has(p)) {
    const desc = o.OwnProps.get(p)!;
    return HasValueField(desc) ? desc.Value : undefined;
  }
  return findValueProp(o.Prototype, p);
}
