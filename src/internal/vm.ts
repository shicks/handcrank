import { CR, CastNotAbrupt, IsAbrupt, ThrowCompletion } from './completion_record';
import { Val } from './val';
import { BuiltinExecutionContext, CodeExecutionContext, ExecutionContext, ResolveThisBinding } from './execution_context';
import { EMPTY, NOT_APPLICABLE, UNRESOLVABLE, UNUSED } from './enums';
import { NodeType, NodeMap, Node, Esprima, preprocess, Source } from './tree';
import { GetValue, ReferenceRecord } from './reference_record';
import { InitializeHostDefinedRealm, RealmAdvice, RealmRecord, getIntrinsicName } from './realm_record';
import { ParseScript, ScriptEvaluation } from './script_record';
import * as ESTree from 'estree';
import { Obj, OrdinaryObjectCreate } from './obj';
import { EnvironmentRecord } from './environment_record';
import { HasValueField, propWC } from './property_descriptor';
import { Assert } from './assert';
import { Func, IsFunc } from './func';
import { ArrayExoticObject } from './exotic_array';
import { PrivateEnvironmentRecord } from './private_environment_record';

export type Yield = {yield: Val};
export type EvalGen<T> = Generator<Yield|undefined, T, CR<Val>|undefined>;
export type ECR<T> = EvalGen<CR<T>>;

interface SyntaxOp {
  Evaluation(): ECR<Val|ReferenceRecord|EMPTY>;
  NamedEvaluation(name: string): ECR<Val>;
  LabelledEvaluation(labelSet: string[]): ECR<Val|EMPTY>;
  InstantiateFunctionObject(
    env: EnvironmentRecord,
    privateEnv: PrivateEnvironmentRecord|null,
  ): Func;
  BindingInitialization(value: Val, environment: EnvironmentRecord|undefined): ECR<UNUSED>;
}

export interface Plugin {
  id?: string|symbol;
  deps?: () => Plugin[];
  syntax?: SyntaxOpMap;
  realm?: RealmAdvice;
}

export function run<T>(gen: EvalGen<T>) {
  let result;
  do {
    result = gen.next();
  } while (!result.done);
  return result.value;
}

/** Similar to run(), but fails if there are any yields. */
export function runImmediate<T>(gen: EvalGen<T>) {
  const result = gen.next();
  Assert(result.done);
  return result.value;
}

export class VM {

  executionStack: ExecutionContext[] = [];

  // Plugins - note: globals and intrinsics built in RealmRecord
  plugins = new Map<string|symbol|Plugin, Plugin>();
  syntaxOperations: SyntaxHandlers = {
    Evaluation: {},
    NamedEvaluation: {},
    LabelledEvaluation: {},
    InstantiateFunctionObject: {},
    BindingInitialization: {},
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
    Assert(this.executionStack.length > 1, 'Cannot pop last context');
    if (context) Assert(this.executionStack.at(-1) === context, `Wrong context to pop`);
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
    const intrinsic = this.getRealm()!.Intrinsics.get(name);
    Assert(intrinsic, `No intrinsic: ${name}`);
    return intrinsic;
  }

  throw(name: string, message?: string): CR<never> {

    // NOTE: This can help with debugging; use Assert to compile it out in prod.
    try {
      Assert(1 > 2);
    } catch (e) {
      (this as any).lastThrow = new Error(message ? `${name}: ${message}` : name);
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

  // NOTE: this helper method is typically more useful than direct
  // Evaluation because it additionally unwraps ReferenceRecords.  The
  // spec does this in a production that's basically transparent to
  // ESTree, so we don't have a good opportunity, but we do know when
  // an rvalue is required from a child.
  * evaluateValue(node: Node): ECR<Val> {
    this.initialize()
    const result: CR<EMPTY|Val|ReferenceRecord> = yield* this.Evaluation(node);
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

  Evaluation(n: Node): ECR<Val|ReferenceRecord|EMPTY> {
    return this.operate('Evaluation', n, []);
  }
  NamedEvaluation(n: Node, name: string): ECR<Val> {
    return this.operate('NamedEvaluation', n, [name]);
  }
  LabelledEvaluation(n: Node, labelSet: string[]): ECR<Val|EMPTY> {
    return this.operate('LabelledEvaluation', n, [labelSet],
                        () => this.evaluateValue(n));
  }
  InstantiateFunctionObject(
    n: Node,
    env: EnvironmentRecord,
    privateEnv: PrivateEnvironmentRecord|null,
  ): Func {
    return this.operate('InstantiateFunctionObject', n, [env, privateEnv]);
  }
  BindingInitialization(
    n: Node,
    value: Val,
    environment: EnvironmentRecord|undefined,
  ): ECR<UNUSED> {
    return this.operate('BindingInitialization', n, [value, environment]);
  }

  private operate<O extends keyof SyntaxOp>(
    op: O,
    n: Node,
    args: SyntaxArgs<O>,
    fallback: () => SyntaxResult<O> = () => {
      throw new Error(`Cannot do '${op}' on ${n.type}({\n  ${
          Object.entries(n).map(([k, v]) => `${k}: ${v}`).join(',\n  ')}\n})`);
    },
  ): SyntaxResult<O> {
    if (op === 'Evaluation') {
      const ctx = this.getRunningContext();
      if (ctx instanceof CodeExecutionContext) {
        ctx.currentNode = n;
      }
    }
    for (const impl of this.syntaxOperations[op][n.type] || []) {
      const result = impl(this, n as any, ...args);
      if (!NOT_APPLICABLE.is(result)) return result;
    }
    // TODO - might be nice to print to depth 2?
    return fallback();
  }

  install(plugin: Plugin): void {
    for (const dep of plugin.deps?.() ?? []) {
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
      const op: any = this.syntaxOperations[key as keyof SyntaxOp];
      const on: SyntaxRegistration<any> =
        (types: NodeType|NodeType[], handler: SyntaxHandler<any, any>) => {
          if (!Array.isArray(types)) types = [types];
          for (const type of types) {
            (op[type] || (op[type] = [])).push(handler);
          }
        };
      register(on);
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
export function mapJust<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => Generator<any, R, any> {
  return (...args: A) => just(fn(...args));
}

export function when<N, A extends unknown[], T>(
  condition: (n: N) => boolean|undefined,
  action: ($: VM, n: N, ...rest: A) => T,
): ($: VM, n: N, ...rest: A) => T|NOT_APPLICABLE {
  return ($, n, ...rest) => condition(n) ? action($, n, ...rest) : NOT_APPLICABLE;
}

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

export function DebugString(
  v: Val|ReferenceRecord|ExecutionContext,
  depth = 0,
  circular = new Map<Obj, number>(),
  indent = '',
): string {
  // TODO - consider adding an optional `color = false` argument
  //  - color null bright white, undefined dark gray, num/bool yellow, strings green, objs cyan
  if (v instanceof ExecutionContext) {
    return `${v.constructor.name} ${String(v.Function ? (v.Function.InitialName ??
              v.Function.InternalName ?? v.Function.OwnProps?.get('name')?.Value) :
              v.Generator ? v.Generator.InternalName : '')}`;
  }
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
    const intrinsicName = getIntrinsicName(v);
    if (intrinsicName != null) return intrinsicName;

    if (v.ErrorData != null) return v.ErrorData || 'Error';
    if (IsFunc(v)) {
      const name = v.OwnProps.get('name')?.Value;
      return `[Function: ${name ? String(name) : v.InternalName || '(anonymous)'}]`;
    }
    // TODO - consider printing props? maybe even slots?
    if (v instanceof ArrayExoticObject()) {
      const length = Number(v.OwnProps.get('length')?.Value);
      if (depth <= 0) return `[... ${length} elements]`;
      const elems = [];
      for (let i = 0; i < length; i++) {
        const desc = v.OwnProps.get(String(i));
        elems.push(desc && HasValueField(desc) ? DebugString(desc.Value, depth - 1, circular) : '');
        if (i > 1000) {
          elems.push(`... ${length - i} more`);
          break;
        }
      }
      return `[${elems.join(', ')}]`;
    }
    if (depth <= 0) return '{...}';
    if (circular.has(v)) return `%circular%`;
    circular.set(v, 0); // TODO - keep track and backpopulate.
    const elems = [];
    let complex = false;
    let elided = 0;
    for (const [k, d] of v.OwnProps) {
      if (!d.Enumerable) continue;
      if (elems.length > 100) {
        elided++;
        continue;
      }
      const key = typeof k === 'symbol' ? `[${String(k)}]` : /^[_$a-z][_$a-z0-9]*$/i.test(k) ? k : JSON.stringify(k);
      if (d.Value instanceof Obj) complex = true;
      const val = HasValueField(d) ? DebugString(d.Value, depth - 1, circular, `${indent}  `) : '???'
      elems.push(`${key}: ${val}`);
    }
    if (elided) elems.push(`... ${elided} more`);
    if (!complex && elems.length < 10) return `{${elems.join(', ')}}`;
    return `{\n${indent}  ${elems.join(`,\n${indent}  `)}\n${indent}}`;
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

type SyntaxOpMap = {[K in keyof SyntaxOp]?: (on: SyntaxRegistration<K>) => void};
type SyntaxRegistration<O extends keyof SyntaxOp> =
  <N extends NodeType>(types: N|N[], handler: SyntaxHandler<N, O>) => void;
type SyntaxHandler<N extends NodeType, O extends keyof SyntaxOp> =
  ($: VM, n: NodeMap[N], ...rest: SyntaxArgs<O>) => SyntaxResult<O>|NOT_APPLICABLE;
type SyntaxArgs<O extends keyof SyntaxOp> =
  SyntaxOp[O] extends (...args: infer A) => any ? A : never[];
type SyntaxResult<O extends keyof SyntaxOp> =
  SyntaxOp[O] extends (...args: any[]) => infer R ? R : never;

type SyntaxHandlerMap<O extends keyof SyntaxOp> =
  {[N in NodeType]?: Array<SyntaxHandler<N, O>>};
type SyntaxHandlers = {[O in keyof SyntaxOp]: SyntaxHandlerMap<O>};
