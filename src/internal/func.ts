import { CR, CastNotAbrupt, IsAbrupt, ThrowCompletion } from './completion_record';
import { EvalGen, VM } from './vm';
import { BASE, DERIVED, EMPTY, GLOBAL, LEXICAL, LEXICAL_THIS, NON_LEXICAL_THIS, STRICT, UNINITIALIZED, UNUSED } from './enums';
import { DeclarativeEnvironmentRecord, EnvironmentRecord, FunctionEnvironmentRecord, GlobalEnvironmentRecord } from './environment_record';
import { PropertyDescriptor } from './property_descriptor';
import { Assert } from './assert';
import { Call, DefinePropertyOrThrow } from './abstract_object';
import * as ESTree from 'estree';
import { RealmRecord } from './realm_record';
import { ScriptRecord } from './script_record';
import { ModuleRecord } from './module_record';
import { CodeExecutionContext, ExecutionContext, ResolveBinding } from './execution_context';
import { PrivateEnvironmentRecord, PrivateName } from './private_environment_record';
import { BoundNames, IsConstantDeclaration, IsStrictMode, LexicallyDeclaredNames, LexicallyScopedDeclarations, VarDeclaredNames, VarScopedDeclarations } from './static/scope';
import { ContainsExpression, GetSourceText, IsSimpleParameterList, IteratorBindingInitialization } from './static/functions';
import { Obj, OrdinaryObject } from './obj';
import { PropertyKey, Val } from './val';
import { lazySuper } from './record';
import { ParentNode, Source } from './tree';
import { CreateListIteratorRecord } from './abstract_iterator';
import { ToObject } from './abstract_conversion';
import { GetThisValue, GetValue, InitializeReferencedBinding, IsPropertyReference, PutValue, ReferenceRecord } from './reference_record';
import { IsCallable } from './abstract_compare';

type Node = ESTree.Node;

type PrivateElement = never;
type ClassFieldDefinitionRecord = never;

function MakeConstructor(...args: any[]): void {}
function PrepareForTailCall(...args: any): void {}
declare const CreateDataPropertyOrThrow: (...args: any[]) => Obj;
declare const GetIterator: any;
declare const IteratorStep: any;
declare const IteratorValue: any;

// New interface with various required properties
export interface Func extends Obj {
  // Environment: EnvironmentRecord;
  PrivateEnvironment: PrivateEnvironmentRecord|null;
  // FormalParameters: ESTree.Pattern[];
  // ECMAScriptCode: ESTree.BlockStatement|ESTree.Expression;
  // ConstructorKind: BASE|DERIVED;
  // Realm: RealmRecord;
  // ScriptOrModule: ScriptRecord|ModuleRecord;
  // ThisMode: LEXICAL|STRICT|GLOBAL;
  // Strict: boolean;
  // HomeObject: Obj|undefined;
  // SourceText: string;
  // Fields: ClassFieldDefinitionRecord[]; // TODO - Map?
  // PrivateMethods: PrivateElement[]; // TODO - Map?
  // ClassFieldInitializerName: string|symbol|PrivateName|EMPTY;
  // IsClassConstructor: boolean;

  // (from OrdinaryObjectCreate)
  Prototype: Obj;
  Extensible: boolean;
  OwnProps: Map<PropertyKey, PropertyDescriptor>;

  Call?($: VM, thisArgument: Val, argumentsList: Val[]): EvalGen<CR<Val>>;
  Construct?($: VM, argumentsList: Val[], newTarget: Obj): EvalGen<CR<Obj>>;
}

export function IsFunc(arg: unknown): arg is Func {
  return arg instanceof Obj &&
    (typeof (arg as Func).Call === 'function' ||
      typeof (arg as Func).Construct === 'function');
}

// TODO - maybe remove this?
export function Func() { throw new Error('do not call'); }
Object.defineProperty(Func, Symbol.hasInstance, {value: IsFunc});

// Basic function
export class OrdinaryFunction extends lazySuper(() => OrdinaryObject) implements Func {
  override Prototype: Obj;

  /**
   * [[Environment]], an Environment Record - The Environment Record
   * that the function was closed over. Used as the outer environment
   * when evaluating the code of the function.
   */
  declare Environment: EnvironmentRecord;

  /**
   * [[PrivateEnvironment]], a PrivateEnvironment Record or null - The
   * PrivateEnvironment Record for Private Names that the function was
   * closed over. null if this function is not syntactically contained
   * within a class. Used as the outer PrivateEnvironment for inner
   * classes when evaluating the code of the function.
   */
  declare PrivateEnvironment: PrivateEnvironmentRecord|null;

  /**
   * [[FormalParameters]], a Parse Node - The root parse node of the
   * source text that defines the function's formal parameter list.
   */
  declare FormalParameters: ESTree.Pattern[];

  /**
   * [[ECMAScriptCode]], a Parse Node - The root parse node of the
   * source text that defines the function's body.
   */
  declare ECMAScriptCode: ESTree.BlockStatement|ESTree.Expression;

  /**
   * [[ConstructorKind]], base or derived - Whether or not the function
   * is a derived class constructor.
   */
  declare ConstructorKind: BASE|DERIVED;

  /**
   * [[Realm]], a Realm Record - The realm in which the function was
   * created and which provides any intrinsic objects that are accessed
   * when evaluating the function.
   */
  declare Realm: RealmRecord;

  /**
   * [[ScriptOrModule]], a Script Record or a Module Record - The script
   * or module in which the function was created.
   */
  declare ScriptOrModule: ScriptRecord|ModuleRecord;

  /**
   * [[ThisMode]], lexical, strict, or global - Defines how this
   * references are interpreted within the formal parameters and code
   * body of the function. lexical means that this refers to the this
   * value of a lexically enclosing function. strict means that the this
   * value is used exactly as provided by an invocation of the
   * function. global means that a this value of undefined or null is
   * interpreted as a reference to the global object, and any other this
   * value is first passed to ToObject.
   */
  declare ThisMode: LEXICAL|STRICT|GLOBAL;

  /**
   * [[Strict]], a Boolean - true if this is a strict function, false if
   * this is a non-strict function.
   */
  declare Strict: boolean;

  /**
   * [[HomeObject]], an Object - If the function uses super, this is the
   * object whose [[GetPrototypeOf]] provides the object where super
   * property lookups begin.
   */
  declare HomeObject: Obj|undefined; // |undefined?

  /**
   * [[SourceText]], a sequence of Unicode code points - The source text
   * that defines the function.
   */
  declare SourceText: string;

  /**
   * [[Fields]], a List of ClassFieldDefinition Records - If the
   * function is a class, this is a list of Records representing the
   * non-static fields and corresponding initializers of the class.
   */
  declare Fields: ClassFieldDefinitionRecord[]; // TODO - Map?

  /**
   * [[PrivateMethods]], a List of PrivateElements - If the function is
   * a class, this is a list representing the non-static private methods
   * and accessors of the class.
   */
  declare PrivateMethods: PrivateElement[]; // TODO - Map?

  /**
   * [[ClassFieldInitializerName]], a String, a Symbol, a Private Name,
   * or empty - If the function is created as the initializer of a class
   * field, the name to use for NamedEvaluation of the field; empty
   * otherwise.
   */
  declare ClassFieldInitializerName: string|symbol|PrivateName|EMPTY;

  /**
   * [[IsClassConstructor]], a Boolean - Indicates whether the function
   * is a class constructor. (If true, invoking the function's [[Call]]
   * will immediately throw a TypeError exception.)
   */
  declare IsClassConstructor: boolean;

  constructor(functionPrototype: Obj,
              sourceText: string,
              ParameterList: ESTree.Pattern[],
              Body: ESTree.BlockStatement|ESTree.Expression,
              thisMode: LEXICAL_THIS|NON_LEXICAL_THIS,
              env: EnvironmentRecord,
              privateEnv: PrivateEnvironmentRecord|null,
             ) {
    super();
    this.Prototype = functionPrototype;
    this.SourceText = sourceText;
    this.FormalParameters = ParameterList;
    this.ECMAScriptCode = Body;
    this.Environment = env;
    this.PrivateEnvironment = privateEnv;
    if (IsStrictMode(Body)) {
      // TODO - can we recurse through in the post-parse step to do this?
      //  - does it belong somewhere else?
    }
  }

  /**
   * 10.2.1 [[Call]] ( thisArgument, argumentsList )
   *
   * The [[Call]] internal method of an ECMAScript function object F
   * takes arguments thisArgument (an ECMAScript language value) and
   * argumentsList (a List of ECMAScript language values) and returns
   * either a normal completion containing an ECMAScript language
   * value or a throw completion. It performs the following steps when
   * called:
   *
   * 1. Let callerContext be the running execution context.
   * 2. Let calleeContext be PrepareForOrdinaryCall(F, undefined).
   * 3. Assert: calleeContext is now the running execution context.
   * 4. If F.[[IsClassConstructor]] is true, then
   *     a. Let error be a newly created TypeError object.
   *     b. NOTE: error is created in calleeContext with F's
   *        associated Realm Record.
   *     c. Remove calleeContext from the execution context stack and
   *        restore callerContext as the running execution context.
   *     d. Return ThrowCompletion(error).
   * 5. Perform OrdinaryCallBindThis(F, calleeContext, thisArgument).
   * 6. Let result be Completion(OrdinaryCallEvaluateBody(F, argumentsList)).
   * 7. Remove calleeContext from the execution context stack and
   *    restore callerContext as the running execution context.
   * 8. If result.[[Type]] is return, return result.[[Value]].
   * 9. ReturnIfAbrupt(result).
   * 10. Return undefined.
   *
   * NOTE: When calleeContext is removed from the execution context
   * stack in step 7 it must not be destroyed if it is suspended and
   * retained for later resumption by an accessible Generator.
   */
  *Call($: VM, thisArgument: Val, argumentsList: Val[]): EvalGen<CR<Val>> {
    //const callerContext = $.getRunningContext();
    const calleeContext = PrepareForOrdinaryCall($, this, undefined);
    Assert(calleeContext === $.getRunningContext());
    if (this.IsClassConstructor) {
      const error = $.newError('TypeError');
      $.popContext();
      return ThrowCompletion(error);
    }
    OrdinaryCallBindThis($, this, calleeContext, thisArgument);
    const result = yield* OrdinaryCallEvaluateBody($, this, argumentsList);
    $.popContext();
    if (IsAbrupt(result)) {
      if (result.Type === 'return') return result.Value;
      return result;
    }
    return undefined;
  }

  *Construct($: VM, argumentsList: Val[], newTarget: Obj): EvalGen<CR<Obj>> {
    throw 'not implemented';
  }
}


/**
 * 8.6.1 Runtime Semantics: InstantiateFunctionObject
 *
 * The syntax-directed operation InstantiateFunctionObject takes
 * arguments env (an Environment Record) and privateEnv (a
 * PrivateEnvironment Record or null) and returns a function
 * object. It is defined piecewise over the following productions:
 *
 * FunctionDeclaration :
 *         function BindingIdentifier ( FormalParameters ) { FunctionBody }
 *         function ( FormalParameters ) { FunctionBody }
 * 1. Return InstantiateOrdinaryFunctionObject of
 *    FunctionDeclaration with arguments env and privateEnv.
 *
 * GeneratorDeclaration :
 *         function * BindingIdentifier ( FormalParameters ) { GeneratorBody }
 *         function * ( FormalParameters ) { GeneratorBody }
 * 1. Return InstantiateGeneratorFunctionObject of
 *    GeneratorDeclaration with arguments env and privateEnv.
 *
 * AsyncGeneratorDeclaration :
 *         async function * BindingIdentifier ( FormalParameters ) { AsyncGeneratorBody }
 *         async function * ( FormalParameters ) { AsyncGeneratorBody }
 * 1. Return InstantiateAsyncGeneratorFunctionObject of
 *    AsyncGeneratorDeclaration with arguments env and privateEnv.
 *
 * AsyncFunctionDeclaration :
 *         async function BindingIdentifier ( FormalParameters ) { AsyncFunctionBody }
 *         async function ( FormalParameters ) { AsyncFunctionBody }
 * 1. Return InstantiateAsyncFunctionObject of
 *    AsyncFunctionDeclaration with arguments env and privateEnv.
 */
export function InstantiateFunctionObject($: VM, env: EnvironmentRecord, privateEnv: PrivateEnvironmentRecord|null, node: ESTree.Node): Func {
  Assert(node.type === 'FunctionDeclaration'
    || node.type === 'FunctionExpression'
    || node.type === 'ArrowFunctionExpression');
  if (node.generator) {
    if (node.async) return InstantiateAsyncGeneratorFunctionObject($, node, env, privateEnv);
    return InstantiateGeneratorFunctionObject($, node, env, privateEnv);
  }
  if (node.async) return InstantiateAsyncFunctionObject($, node, env, privateEnv);
  return InstantiateOrdinaryFunctionObject($, node, env, privateEnv);
}
declare const InstantiateAsyncGeneratorFunctionObject: any;
declare const InstantiateGeneratorFunctionObject: any;
declare const InstantiateAsyncFunctionObject: any;

/**
 * 15.2.4 Runtime Semantics: InstantiateOrdinaryFunctionObject
 *
 * The syntax-directed operation InstantiateOrdinaryFunctionObject
 * takes arguments env (an Environment Record) and privateEnv (a
 * PrivateEnvironment Record or null) and returns a function
 * object. It is defined piecewise over the following productions:
 *
 * FunctionDeclaration : function BindingIdentifier ( FormalParameters ) { FunctionBody }
 * 1. Let name be StringValue of BindingIdentifier.
 * 2. Let sourceText be the source text matched by FunctionDeclaration.
 * 3. Let F be OrdinaryFunctionCreate(%Function.prototype%, sourceText,
      FormalParameters, FunctionBody, non-lexical-this, env, privateEnv).
 * 4. Perform SetFunctionName(F, name).
 * 5. Perform MakeConstructor(F).
 * 6. Return F.
 *
 * FunctionDeclaration : function ( FormalParameters ) { FunctionBody }
 * 1. Let sourceText be the source text matched by FunctionDeclaration.
 * 2. Let F be OrdinaryFunctionCreate(%Function.prototype%, sourceText,
 *    FormalParameters, FunctionBody, non-lexical-this, env, privateEnv).
 * 3. Perform SetFunctionName(F, "default").
 * 4. Perform MakeConstructor(F).
 * 5. Return F.
 *
 * NOTE: An anonymous FunctionDeclaration can only occur as part of an
 * export default declaration, and its function code is therefore
 * always strict mode code.
 */
export function InstantiateOrdinaryFunctionObject(
  $: VM,
  node: ESTree.FunctionDeclaration|ESTree.FunctionExpression|ESTree.ArrowFunctionExpression,
  env: EnvironmentRecord,
  privateEnv: PrivateEnvironmentRecord|null,
): Func {
  const F = OrdinaryFunctionCreate($, $.getIntrinsic('%Function.prototype%'),
                                   sourceText(node) || '(no source)',
                                   node.params, node.body,
                                   NON_LEXICAL_THIS, env, privateEnv);
  SetFunctionName($, F, (node as ESTree.FunctionExpression).id?.name || 'default');
  MakeConstructor($, F);
  return F;
}

/**
 * 15.2.5 Runtime Semantics: InstantiateOrdinaryFunctionExpression
 *
 * The syntax-directed operation InstantiateOrdinaryFunctionExpression
 * takes optional argument name (a property key or a Private Name) and
 * returns a function object. It is defined piecewise over the
 * following productions:
 * 
 * FunctionExpression : function ( FormalParameters ) { FunctionBody }
 * 1. If name is not present, set name to "".
 * 2. Let env be the LexicalEnvironment of the running execution context.
 * 3. Let privateEnv be the running execution context\'s PrivateEnvironment.
 * 4. Let sourceText be the source text matched by FunctionExpression.
 * 5. Let closure be OrdinaryFunctionCreate(%Function.prototype%,
 *    sourceText, FormalParameters, FunctionBody, non-lexical-this, env,
 *    privateEnv).
 * 6. Perform SetFunctionName(closure, name).
 * 7. Perform MakeConstructor(closure).
 * 8. Return closure.
 *
 * FunctionExpression :
 *     function BindingIdentifier ( FormalParameters ) { FunctionBody }
 * 1. Assert: name is not present.
 * 2. Set name to StringValue of BindingIdentifier.
 * 3. Let outerEnv be the running execution context's LexicalEnvironment.
 * 4. Let funcEnv be NewDeclarativeEnvironment(outerEnv).
 * 5. Perform ! funcEnv.CreateImmutableBinding(name, false).
 * 6. Let privateEnv be the running execution context's PrivateEnvironment.
 * 7. Let sourceText be the source text matched by FunctionExpression.
 * 8. Let closure be OrdinaryFunctionCreate(%Function.prototype%,
 *    sourceText, FormalParameters, FunctionBody, non-lexical-this,
 *    funcEnv, privateEnv).
 * 9. Perform SetFunctionName(closure, name).
 * 10. Perform MakeConstructor(closure).
 * 11. Perform ! funcEnv.InitializeBinding(name, closure).
 * 12. Return closure.
 *
 * NOTE: The BindingIdentifier in a FunctionExpression can be
 * referenced from inside the FunctionExpression\'s FunctionBody to
 * allow the function to call itself recursively. However, unlike in a
 * FunctionDeclaration, the BindingIdentifier in a FunctionExpression
 * cannot be referenced from and does not affect the scope enclosing
 * the FunctionExpression.
 */
export function InstantiateOrdinaryFunctionExpression(
  $: VM,
  node: ESTree.FunctionExpression,
  name?: PropertyKey|PrivateName,
): Func {
  const sourceText = GetSourceText(node);
  const privateEnv = $.getRunningContext().PrivateEnvironment!;
  
  let env: EnvironmentRecord;
  if (node.id == null) {
    // FunctionExpression : function ( FormalParameters ) { FunctionBody }
    if (!name) name = '';
    env = $.getRunningContext().LexicalEnvironment!;
  } else {
    // FunctionExpression :
    //     function BindingIdentifier ( FormalParameters ) { FunctionBody }
    Assert(name == null);
    name = node.id.name;
    const outerEnv = $.getRunningContext().LexicalEnvironment!;
    const funcEnv = new DeclarativeEnvironmentRecord(outerEnv);
    CastNotAbrupt(funcEnv.CreateImmutableBinding($, name, false));
    env = funcEnv;
  }

  // TODO - handle these functions better...!!!
  const closure = OrdinaryFunctionCreate(
    $,
    $.getIntrinsic('%Function.prototype%'),
    sourceText,
    node.params,
    node.body,
    NON_LEXICAL_THIS,
    env,
    privateEnv,
  );
  SetFunctionName($, closure, name);
  MakeConstructor(closure);
  if (node.id != null) {
    CastNotAbrupt(env.InitializeBinding($, name as string, closure));
  }
  return closure;
}

function sourceText(node: Node): string {
  let n = node as Node&ParentNode;
  if (n.type === 'FunctionExpression' && n.parent?.type === 'Property') {
    n = n.parent;
  }
  const source = n.loc?.source as unknown as Source;
  if (!source) return '';
  const range = n.range || [(n as any).start, (n as any).end];
  return source.sourceText?.substring(range[0], range[1]) || '';
}

// TODO - use range to get actual sourceText ??? is that too much ???

/**
 * 10.2.3 OrdinaryFunctionCreate (
 *           functionPrototype, sourceText, ParameterList, Body,
 *           thisMode, env, privateEnv )
 *
 * The abstract operation OrdinaryFunctionCreate takes arguments
 * functionPrototype (an Object), sourceText (a sequence of Unicode
 * code points), ParameterList (a Parse Node), Body (a Parse Node),
 * thisMode (lexical-this or non-lexical-this), env (an Environment
 * Record), and privateEnv (a PrivateEnvironment Record or null) and
 * returns a function object. It is used to specify the runtime
 * creation of a new function with a default [[Call]] internal method
 * and no [[Construct]] internal method (although one may be
 * subsequently added by an operation such as
 * MakeConstructor). sourceText is the source text of the syntactic
 * definition of the function to be created. It performs the following
 * steps when called:
 */
export function OrdinaryFunctionCreate(
  $: VM,
  functionPrototype: Obj,
  sourceText: string,
  ParameterList: ESTree.Pattern[],
  Body: ESTree.BlockStatement|ESTree.Expression,
  thisMode: LEXICAL_THIS|NON_LEXICAL_THIS,
  env: EnvironmentRecord,
  privateEnv: PrivateEnvironmentRecord|null,
): Func {
  // 1. Let internalSlotsList be the internal slots listed in Table 30.
  // 2. Let F be OrdinaryObjectCreate(functionPrototype, internalSlotsList).
  // 3. Set F.[[Call]] to the definition specified in 10.2.1.
  // 4. Set F.[[SourceText]] to sourceText.
  // 5. Set F.[[FormalParameters]] to ParameterList.
  // 6. Set F.[[ECMAScriptCode]] to Body.
  // 7. If the source text matched by Body is strict mode code, let Strict
  //    be true; else let Strict be false.
  // 8. Set F.[[Strict]] to Strict.
  // 9. If thisMode is lexical-this, set F.[[ThisMode]] to lexical.
  // 10. Else if Strict is true, set F.[[ThisMode]] to strict.
  // 11. Else, set F.[[ThisMode]] to global.
  // 12. Set F.[[IsClassConstructor]] to false.
  // 13. Set F.[[Environment]] to env.
  // 14. Set F.[[PrivateEnvironment]] to privateEnv.
  // 15. Set F.[[ScriptOrModule]] to GetActiveScriptOrModule().
  // 16. Set F.[[Realm]] to the current Realm Record.
  // 17. Set F.[[HomeObject]] to undefined.
  // 18. Set F.[[Fields]] to a new empty List.
  // 19. Set F.[[PrivateMethods]] to a new empty List.
  // 20. Set F.[[ClassFieldInitializerName]] to empty.
  // 21. Let len be the ExpectedArgumentCount of ParameterList.
  // 22. Perform SetFunctionLength(F, len).
  // 23. Return F.

  const F = new OrdinaryFunction(
    functionPrototype,
    sourceText,
    ParameterList,
    Body,
    thisMode,
    env,
    privateEnv,
  );
  F.ScriptOrModule = castExists($.getRunningContext().ScriptOrModule);
  F.Realm = castExists($.getRealm());

  // TODO - length, class field initializer name?

  return F;
}

function castExists<T>(arg: T|null|undefined): T {
  Assert(arg != null);
  return arg;
}

/**
 * 10.2.1.1 PrepareForOrdinaryCall ( F, newTarget )
 *
 * The abstract operation PrepareForOrdinaryCall takes arguments F (a
 * function object) and newTarget (an Object or undefined) and returns
 * an execution context. It performs the following steps when called:
 *
 * 1. Let callerContext be the running execution context.
 * 2. Let calleeContext be a new ECMAScript code execution context.
 * 3. Set the Function of calleeContext to F.
 * 4. Let calleeRealm be F.[[Realm]].
 * 5. Set the Realm of calleeContext to calleeRealm.
 * 6. Set the ScriptOrModule of calleeContext to F.[[ScriptOrModule]].
 * 7. Let localEnv be NewFunctionEnvironment(F, newTarget).
 * 8. Set the LexicalEnvironment of calleeContext to localEnv.
 * 9. Set the VariableEnvironment of calleeContext to localEnv.
 * 10. Set the PrivateEnvironment of calleeContext to F.[[PrivateEnvironment]].
 * 11. If callerContext is not already suspended, suspend callerContext.
 * 12. Push calleeContext onto the execution context stack; calleeContext is now the running execution context.
 * 13. NOTE: Any exception objects produced after this point are associated with calleeRealm.
 * 14. Return calleeContext.
 */
export function PrepareForOrdinaryCall($: VM, F: Func, newTarget: Obj|undefined) {
  const callerContext = $.getRunningContext();
  const localEnv = new FunctionEnvironmentRecord(F, newTarget);
  Assert(F.ScriptOrModule);
  Assert(F.Realm);
  //Assert(F.PrivateEnvironment);
  const calleeContext = new CodeExecutionContext(
      F.ScriptOrModule, F, F.Realm, F.PrivateEnvironment, localEnv, localEnv);
  if (callerContext.isRunning) callerContext.suspend();
  $.enterContext(calleeContext);
  return calleeContext;
}

/**
 * 10.2.1.2 OrdinaryCallBindThis ( F, calleeContext, thisArgument )
 *
 * The abstract operation OrdinaryCallBindThis takes arguments F (a
 * function object), calleeContext (an execution context), and
 * thisArgument (an ECMAScript language value) and returns unused. It
 * performs the following steps when called:
 *
 * 1. Let thisMode be F.[[ThisMode]].
 * 2. If thisMode is lexical, return unused.
 * 3. Let calleeRealm be F.[[Realm]].
 * 4. Let localEnv be the LexicalEnvironment of calleeContext.
 * 5. If thisMode is strict, let thisValue be thisArgument.
 * 6. Else,
 *     a. If thisArgument is either undefined or null, then
 *         i. Let globalEnv be calleeRealm.[[GlobalEnv]].
 *         ii. Assert: globalEnv is a Global Environment Record.
 *         iii. Let thisValue be globalEnv.[[GlobalThisValue]].
 *     b. Else,
 *         i. Let thisValue be ! ToObject(thisArgument).
 *         ii. NOTE: ToObject produces wrapper objects using calleeRealm.
 * 7. Assert: localEnv is a Function Environment Record.
 * 8. Assert: The next step never returns an abrupt completion because
 *     localEnv.[[ThisBindingStatus]] is not initialized.
 * 9. Perform ! localEnv.BindThisValue(thisValue).
 * 10. Return unused.
 */
export function OrdinaryCallBindThis($: VM, F: Func, calleeContext: ExecutionContext,
                                     thisArgument: Val): UNUSED {
  const thisMode = F.ThisMode;
  if (thisMode === LEXICAL) return UNUSED;
  const calleeRealm = F.Realm;
  Assert(calleeContext instanceof CodeExecutionContext); // not in spec.
  const localEnv = calleeContext.LexicalEnvironment;
  let thisValue: Val;
  if (thisMode === STRICT) {
    thisValue = thisArgument;
  } else if (thisArgument == null) {
    Assert(calleeRealm);
    const globalEnv = calleeRealm.GlobalEnv;
    Assert(globalEnv instanceof GlobalEnvironmentRecord);
    thisValue = globalEnv.GlobalThisValue;
  } else {
    thisValue = CastNotAbrupt(ToObject($, thisArgument));
  }
  Assert(localEnv instanceof FunctionEnvironmentRecord);
  Assert(localEnv.ThisBindingStatus === UNINITIALIZED);
  CastNotAbrupt(localEnv.BindThisValue($, thisValue));
  return UNUSED;
}

/**
 * 10.2.1.3 Runtime Semantics: EvaluateBody
 *
 * The syntax-directed operation EvaluateBody takes arguments
 * functionObject (a function object) and argumentsList (a List of
 * ECMAScript language values) and returns either a normal completion
 * containing an ECMAScript language value or an abrupt completion. It
 * is defined piecewise over the following productions:
 *
 * FunctionBody : FunctionStatementList
 * 1. Return ? EvaluateFunctionBody of FunctionBody with arguments
 *    functionObject and argumentsList.
 *
 * ConciseBody : ExpressionBody
 * 1. Return ? EvaluateConciseBody of ConciseBody with arguments
 *    functionObject and argumentsList.
 *
 * GeneratorBody : FunctionBody
 * 1. Return ? EvaluateGeneratorBody of GeneratorBody with arguments
 *    functionObject and argumentsList.
 *
 * AsyncGeneratorBody : FunctionBody
 * 1. Return ? EvaluateAsyncGeneratorBody of AsyncGeneratorBody
 *    with arguments functionObject and argumentsList.
 *
 * AsyncFunctionBody : FunctionBody
 * 1. Return ? EvaluateAsyncFunctionBody of AsyncFunctionBody with
 *    arguments functionObject and argumentsList.
 *
 * AsyncConciseBody : ExpressionBody
 * 1. Return ? EvaluateAsyncConciseBody of AsyncConciseBody with
 *    arguments functionObject and argumentsList.
 *
 * Initializer : = AssignmentExpression
 * 1. Assert: argumentsList is empty.
 * 2. Assert: functionObject.[[ClassFieldInitializerName]] is not empty.
 * 3. If IsAnonymousFunctionDefinition(AssignmentExpression) is true, then
 *     a. Let value be ? NamedEvaluation of Initializer with argument
 *        functionObject.[[ClassFieldInitializerName]].
 * 4. Else,
 *     a. Let rhs be ? Evaluation of AssignmentExpression.
 *     b. Let value be ? GetValue(rhs).
 * 5. Return Completion Record { [[Type]]: return, [[Value]]: value, [[Target]]: empty }.
 *
 * NOTE: Even though field initializers constitute a function
 * boundary, calling FunctionDeclarationInstantiation does not have
 * any observable effect and so is omitted.
 *
 * ClassStaticBlockBody : ClassStaticBlockStatementList
 * 1. Assert: argumentsList is empty.
 * 2. Return ? EvaluateClassStaticBlockBody of ClassStaticBlockBody
 *    with argument functionObject.
 */
export function* EvaluateBody(
  $: VM, functionObject: Func, argumentsList: Val[],
  node: ESTree.BlockStatement|ESTree.Expression
): EvalGen<CR<Val>> {
  // TODO - check for generator and/or async, which will probably be different
  // subtypes of Function.
  if (functionObject instanceof OrdinaryFunction && functionObject.ECMAScriptCode) {
    //return EvaluateFunctionBody(functionObject, argumentsList, node);
    // 15.2.3 Runtime Semantics: EvaluateFunctionBody
    //
    // The syntax-directed operation EvaluateFunctionBody takes
    // arguments functionObject (a function object) and argumentsList
    // (a List of ECMAScript language values) and returns either a
    // normal completion containing an ECMAScript language value or an
    // abrupt completion. It is defined piecewise over the following
    // productions:
    //
    // FunctionBody : FunctionStatementList
    // 1. Perform ? FunctionDeclarationInstantiation(functionObject, argumentsList).
    // 2. Return ? Evaluation of FunctionStatementList.
    const err = yield* FunctionDeclarationInstantiation($, functionObject, argumentsList);
    if (IsAbrupt(err)) return err;
    return yield* $.evaluateValue(node);
  }
  // TODO - other types?
  throw '';
}
/**
 * 10.2.1.4 OrdinaryCallEvaluateBody ( F, argumentsList )
 *
 * The abstract operation OrdinaryCallEvaluateBody takes arguments F
 * (a function object) and argumentsList (a List of ECMAScript
 * language values) and returns either a normal completion containing
 * an ECMAScript language value or an abrupt completion. It performs
 * the following steps when called:
 *
 * 1. Return ? EvaluateBody of F.[[ECMAScriptCode]] with arguments F
 *    and argumentsList.
 */
export function* OrdinaryCallEvaluateBody($: VM, F: Func, argumentsList: Val[]): EvalGen<CR<Val>> {
  Assert(F.ECMAScriptCode);
  return yield* EvaluateBody($, F, argumentsList, F.ECMAScriptCode);
}

/**
 * 10.2.9 SetFunctionName ( F, name [ , prefix ] )
 *
 * The abstract operation SetFunctionName takes arguments F (a
 * function object) and name (a property key or Private Name) and
 * optional argument prefix (a String) and returns unused. It adds a
 * "name" property to F. It performs the following steps when called:
 *
 * 1. Assert: F is an extensible object that does not have a "name" own property.
 * 2. If name is a Symbol, then
 *     a. Let description be name's [[Description]] value.
 *     b. If description is undefined, set name to the empty String.
 *     c. Else, set name to the string-concatenation of "[", description, and "]".
 * 3. Else if name is a Private Name, then
 *     a. Set name to name.[[Description]].
 * 4. If F has an [[InitialName]] internal slot, then
 *     a. Set F.[[InitialName]] to name.
 * 5. If prefix is present, then
 *     a. Set name to the string-concatenation of prefix, the code unit 0x0020 (SPACE), and name.
 *     b. If F has an [[InitialName]] internal slot, then
 *         i. Optionally, set F.[[InitialName]] to name.
 * 6. Perform ! DefinePropertyOrThrow(F, "name", PropertyDescriptor {
 *    [[Value]]: name, [[Writable]]: false, [[Enumerable]]: false,
 *    [[Configurable]]: true }).
 * 7. Return unused.
 */
export function SetFunctionName($: VM, F: Func,
                                name: PropertyKey|PrivateName, prefix?: string): UNUSED {
  Assert(F.Extensible && !F.OwnProps.has('name'));
  if (typeof name === 'symbol') {
    const description = name.description;
    if (description == null) {
      name = '';
    } else {
      name = `[%{description}]`;
    }
  } else if (name instanceof PrivateName) {
    name = name.Description;
  }
  if (prefix) {
    name = `${prefix} ${String(name)}`;
  }
  if (F instanceof BuiltinFunction) {
    F.InitialName = name;
  }
  CastNotAbrupt(DefinePropertyOrThrow($, F, 'name', new PropertyDescriptor({
    Value: name, Writable: false, Enumerable: false, Configurable: true})));
  return UNUSED;
}

/**
 * 10.2.10 SetFunctionLength ( F, length )
 *
 * The abstract operation SetFunctionLength takes arguments F (a
 * function object) and length (a non-negative integer or +∞) and
 * returns unused. It adds a "length" property to F. It performs the
 * following steps when called:
 *
 * 1. Assert: F is an extensible object that does not have a "length"
 *    own property.
 * 2. Perform ! DefinePropertyOrThrow(F, "length", PropertyDescriptor {
 *    [[Value]]: 𝔽(length), [[Writable]]: false, [[Enumerable]]: false,
 *    [[Configurable]]: true }).
 * 3. Return unused.
 */
export function SetFunctionLength($: VM, F: Func, length: number): UNUSED {
  Assert(F.Extensible);
  Assert(!F.OwnProps.has('length'));
  CastNotAbrupt(DefinePropertyOrThrow($, F, 'length', new PropertyDescriptor({
    Value: length, Writable: false, Enumerable: false, Configurable: true,
  })));
  return UNUSED;
}

/**
 * 10.2.11 FunctionDeclarationInstantiation ( func, argumentsList )
 *
 * The abstract operation FunctionDeclarationInstantiation takes
 * arguments func (a function object) and argumentsList (a List of
 * ECMAScript language values) and returns either a normal completion
 * containing unused or an abrupt completion. func is the function
 * object for which the execution context is being established.
 *
 * NOTE 1: When an execution context is established for evaluating an
 * ECMAScript function a new Function Environment Record is created
 * and bindings for each formal parameter are instantiated in that
 * Environment Record. Each declaration in the function body is also
 * instantiated. If the function\'s formal parameters do not include
 * any default value initializers then the body declarations are
 * instantiated in the same Environment Record as the parameters. If
 * default value parameter initializers exist, a second Environment
 * Record is created for the body declarations. Formal parameters and
 * functions are initialized as part of
 * FunctionDeclarationInstantiation. All other bindings are
 * initialized during evaluation of the function body.
 */
export function* FunctionDeclarationInstantiation($: VM, func: Func, argumentsList: Val[]): EvalGen<CR<UNUSED>> {
  // It performs the following steps when called:
  // 1. Let calleeContext be the running execution context.
  const calleeContext = $.getRunningContext();
  // 2. Let code be func.[[ECMAScriptCode]].
  const code = func.ECMAScriptCode;
  Assert(code != null);
  // 3. Let strict be func.[[Strict]].
  const strict = func.Strict;
  // 4. Let formals be func.[[FormalParameters]].
  const formals = func.FormalParameters;
  // 5. Let parameterNames be the BoundNames of formals.
  const parameterNames = [];
  Assert(formals);
  for (const formal of formals) {
    parameterNames.push(...BoundNames(formal));
  }
  // 6. If parameterNames has any duplicate entries, let hasDuplicates
  //    be true. Otherwise, let hasDuplicates be false.
  const hasDuplicates = new Set(parameterNames).size < parameterNames.length;
  // 7. Let simpleParameterList be IsSimpleParameterList of formals.
  const simpleParameterList = IsSimpleParameterList(formals);
  // 8. Let hasParameterExpressions be ContainsExpression of formals.
  const hasParameterExpressions = formals.some(ContainsExpression);
  // 9. Let varNames be the VarDeclaredNames of code.
  const varNames = VarDeclaredNames(code);
  // 10. Let varDeclarations be the VarScopedDeclarations of code.
  const varDeclarations = VarScopedDeclarations(code);
  // 11. Let lexicalNames be the LexicallyDeclaredNames of code.
  const lexicalNames = LexicallyDeclaredNames(code);
  // 12. Let functionNames be a new empty List.
  const functionNames: string[] = [];
  // 13. Let functionsToInitialize be a new empty List.
  const functionsToInitialize: ESTree.FunctionDeclaration[] = [];
  // 14. For each element d of varDeclarations, in reverse List order, do
  for (const d of varDeclarations.reverse()) {
    //   a. If d is neither a VariableDeclaration nor a ForBinding nor a
    //      BindingIdentifier, then
    if (d.type === 'FunctionDeclaration') {
      //     i. Assert: d is either a FunctionDeclaration, a
      //        GeneratorDeclaration, an AsyncFunctionDeclaration, or an
      //        AsyncGeneratorDeclaration.
      //     ii. Let fn be the sole element of the BoundNames of d.
      const [fn, ...empty] = BoundNames(d);
      Assert(!empty.length);
      //     iii. If functionNames does not contain fn, then
      if (!functionNames.includes(fn)) {
        //       1. Insert fn as the first element of functionNames.
        //       2. NOTE: If there are multiple function declarations for the same
        //          name, the last declaration is used.
        functionNames.unshift(fn);
        //       3. Insert d as the first element of functionsToInitialize.
        functionsToInitialize.unshift(d);
      }
    }
  }
  // 15. Let argumentsObjectNeeded be true.
  let argumentsObjectNeeded = true;
  // 16. If func.[[ThisMode]] is lexical, then
  //     a. NOTE: Arrow functions never have an arguments object.
  //     b. Set argumentsObjectNeeded to false.
  if (func.ThisMode === LEXICAL) argumentsObjectNeeded = false;
  // 17. Else if parameterNames contains "arguments", then
  //     a. Set argumentsObjectNeeded to false.
  else if (parameterNames.includes('arguments')) argumentsObjectNeeded = false;
  // 18. Else if hasParameterExpressions is false, then
  //     a. If functionNames contains "arguments" or lexicalNames contains
  //        "arguments", then
  //         i. Set argumentsObjectNeeded to false.
  else if (!hasParameterExpressions &&
    (functionNames.includes('arguments') || lexicalNames.includes('arguments'))) {
    argumentsObjectNeeded = false;
  }
  // 19. If strict is true or hasParameterExpressions is false, then
  //     a. NOTE: Only a single Environment Record is needed for the
  //        parameters, since calls to eval in strict mode code cannot create
  //        new bindings which are visible outside of the eval.
  //     b. Let env be the LexicalEnvironment of calleeContext.
  // 20. Else,
  //     a. NOTE: A separate Environment Record is needed to ensure that
  //        bindings created by direct eval calls in the formal parameter
  //        list are outside the environment where parameters are declared.
  //     b. Let calleeEnv be the LexicalEnvironment of calleeContext.
  //     c. Let env be NewDeclarativeEnvironment(calleeEnv).
  //     d. Assert: The VariableEnvironment of calleeContext is calleeEnv.
  //     e. Set the LexicalEnvironment of calleeContext to env.
  const env = strict || !hasParameterExpressions ?
      calleeContext.LexicalEnvironment! :
      (() => {
        const calleeEnv = calleeContext.LexicalEnvironment!;
        const env = new DeclarativeEnvironmentRecord(calleeEnv);
        Assert(calleeEnv === calleeContext.VariableEnvironment);
        calleeContext.LexicalEnvironment = env;
        return env;
      })();
  // 21. For each String paramName of parameterNames, do
  for (const paramName of parameterNames) {
    //   a. Let alreadyDeclared be ! env.HasBinding(paramName).
    const alreadyDeclared = CastNotAbrupt(env.HasBinding($, paramName));
    //   b. NOTE: Early errors ensure that duplicate parameter names can
    //      only occur in non-strict functions that do not have parameter
    //      default values or rest parameters.
    //   c. If alreadyDeclared is false, then
    //       i. Perform ! env.CreateMutableBinding(paramName, false).
    //       ii. If hasDuplicates is true, then
    //           1. Perform ! env.InitializeBinding(paramName, undefined).
    if (!alreadyDeclared) {
      CastNotAbrupt(env.CreateMutableBinding($, paramName, false));
      if (hasDuplicates) CastNotAbrupt(env.InitializeBinding($, paramName, undefined));
    }
  }
  // 23. Else (if argumentsObjectNeeded is false),
  //     a. Let parameterBindings be parameterNames.
  let parameterBindings = parameterNames;
  // 22. If argumentsObjectNeeded is true, then
  if (argumentsObjectNeeded) {
    //   a. If strict is true or simpleParameterList is false, then
    //       i. Let ao be CreateUnmappedArgumentsObject(argumentsList).
    //   b. Else,
    //       i. NOTE: A mapped argument object is only provided for non-strict
    //          functions that don't have a rest parameter, any parameter
    //          default value initializers, or any destructured parameters.
    //       ii. Let ao be CreateMappedArgumentsObject(func, formals, argumentsList, env).
    const ao = strict || !simpleParameterList ?
      CreateUnmappedArgumentsObject($, argumentsList) :
      CreateMappedArgumentsObject($, func, formals, argumentsList, env);
    //   c. If strict is true, then
    //       i. Perform ! env.CreateImmutableBinding("arguments", false).
    //       ii. NOTE: In strict mode code early errors prevent attempting to
    //           assign to this binding, so its mutability is not observable.
    if (strict) CastNotAbrupt(env.CreateImmutableBinding($, 'arguments', false));
    //   d. Else,
    //       i. Perform ! env.CreateMutableBinding("arguments", false).
    else CastNotAbrupt(env.CreateMutableBinding($, 'arguments', false));
    //   e. Perform ! env.InitializeBinding("arguments", ao).
    CastNotAbrupt(env.InitializeBinding($, 'arguments', ao));
    //   f. Let parameterBindings be the list-concatenation of
    //      parameterNames and « "arguments" ».
    parameterBindings = [...parameterNames, 'arguments'];
  }
  // 24. Let iteratorRecord be CreateListIteratorRecord(argumentsList).
  // 25. If hasDuplicates is true, then
  //     a. Perform ? IteratorBindingInitialization of formals with
  //        arguments iteratorRecord and undefined.
  // 26. Else,
  //     a. Perform ? IteratorBindingInitialization of formals with
  //        arguments iteratorRecord and env.

  // if (hasDuplicates) {
  //   const iteratorRecord = CreateListIteratorRecord($, argumentsList);
  //   const result = yield* IteratorBindingInitialization(
  //     $, iteratorRecord, undefined, formals);
  //   if (IsAbrupt(result)) return result;
  // } else {
  //   const iteratorRecord = CreateListIteratorRecord($, argumentsList);
  //   const result = yield* IteratorBindingInitialization(
  //     $, iteratorRecord, env, formals);
  //   if (IsAbrupt(result)) return result;
  // }
  let argIndex = 0;
  for (const formal of formals) {
    // NOTE: This is going off-spec a bit, but the overhead of doing
    // a full iterator here is a bit ridiculous - we can revisit this if
    // we need to support destructuring (etc) more faithfully someday.
    switch (formal?.type) {
      case undefined:
        argIndex++;
        break;
      case 'Identifier': {
        const name = formal.name;
        const lhs = ResolveBinding($, name, hasDuplicates ? env : undefined);
        if (IsAbrupt(lhs)) return lhs;
        const result = hasDuplicates ?
          PutValue($, lhs, argumentsList[argIndex++]) :
          InitializeReferencedBinding($, lhs, argumentsList[argIndex++]);
        if (IsAbrupt(result)) return result;
        break;
      }
      case 'RestElement': {
        // TODO - recurse because this could be a pattern?
        //  - probably need to pull this out into a separate function
      }
      case 'AssignmentPattern': {
        // NOTE: we may need to recurse here if `left` is a pattern
      }
      default:
        throw new Error('not implemented: complex bindings');
    }
  }

  let varEnv: EnvironmentRecord;

  // 27. If hasParameterExpressions is false, then
  if (!hasParameterExpressions) {
    //   a. NOTE: Only a single Environment Record is needed for the
    //      parameters and top-level vars.
    //   b. Let instantiatedVarNames be a copy of the List parameterBindings.
    //   c. For each element n of varNames, do
    //       i. If instantiatedVarNames does not contain n, then
    for (const n of new Set(varNames)) {
      //         1. Append n to instantiatedVarNames.
      //         2. Perform ! env.CreateMutableBinding(n, false).
      //         3. Perform ! env.InitializeBinding(n, undefined).
      CastNotAbrupt(env.CreateMutableBinding($, n, false));
      CastNotAbrupt(env.InitializeBinding($, n, undefined));
    }
    //   d. Let varEnv be env.
    varEnv = env;
  }
  // 28. Else,
  else {
    //   a. NOTE: A separate Environment Record is needed to ensure that
    //      closures created by expressions in the formal parameter list do
    //      not have visibility of declarations in the function body.
    //   b. Let varEnv be NewDeclarativeEnvironment(env).
    varEnv = new DeclarativeEnvironmentRecord(env);
    //   c. Set the VariableEnvironment of calleeContext to varEnv.
    calleeContext.VariableEnvironment = varEnv;
    //   d. Let instantiatedVarNames be a new empty List.
    //   e. For each element n of varNames, do
    //       i. If instantiatedVarNames does not contain n, then
    //           1. Append n to instantiatedVarNames.
    for (const n of new Set(varNames)) {
      //         2. Perform ! varEnv.CreateMutableBinding(n, false).
      CastNotAbrupt(varEnv.CreateMutableBinding($, n, false));
      //         3. If parameterBindings does not contain n, or if functionNames
      //            contains n, let initialValue be undefined.
      //         4. Else,
      //             a. Let initialValue be ! env.GetBindingValue(n, false).
      const initialValue =
        !parameterBindings.includes(n) || functionNames.includes(n) ?
        undefined :
        CastNotAbrupt(env.GetBindingValue($, n, false));
      //         5. Perform ! varEnv.InitializeBinding(n, initialValue).
      CastNotAbrupt(varEnv.InitializeBinding($, n, initialValue));
      //         6. NOTE: A var with the same name as a formal parameter initially
      //            has the same value as the corresponding initialized parameter.
    }
  }
  // 29. NOTE: Annex B.3.2.1 adds additional steps at this point.
  // 30. If strict is false, then
  //     a. Let lexEnv be NewDeclarativeEnvironment(varEnv).
  //     b. NOTE: Non-strict functions use a separate Environment Record
  //        for top-level lexical declarations so that a direct eval can
  //        determine whether any var scoped declarations introduced by the
  //        eval code conflict with pre-existing top-level lexically scoped
  //        declarations. This is not needed for strict functions because a
  //        strict direct eval always places all declarations into a new
  //        Environment Record.
  // 31. Else, let lexEnv be varEnv.
  const lexEnv = strict ? varEnv : new DeclarativeEnvironmentRecord(varEnv);
  // 32. Set the LexicalEnvironment of calleeContext to lexEnv.
  calleeContext.LexicalEnvironment = lexEnv;
  // 33. Let lexDeclarations be the LexicallyScopedDeclarations of code.
  const lexDeclarations = LexicallyScopedDeclarations(code);
  // 34. For each element d of lexDeclarations, do
  //     a. NOTE: A lexically declared name cannot be the same as a
  //        function/generator declaration, formal parameter, or a var
  //        name. Lexically declared names are only instantiated here but not
  //        initialized.
  //     b. For each element dn of the BoundNames of d, do
  //         i. If IsConstantDeclaration of d is true, then
  //             1. Perform ! lexEnv.CreateImmutableBinding(dn, true).
  //         ii. Else,
  //             1. Perform ! lexEnv.CreateMutableBinding(dn, false).
  for (const d of lexDeclarations) {
    for (const dn of BoundNames(d)) {
      CastNotAbrupt(
        IsConstantDeclaration(d) ?
          lexEnv.CreateImmutableBinding($, dn, true) :
          lexEnv.CreateMutableBinding($, dn, false));
    }
  }
  // 35. Let privateEnv be the PrivateEnvironment of calleeContext.
  const privateEnv = calleeContext.PrivateEnvironment;
  // 36. For each Parse Node f of functionsToInitialize, do
  //     a. Let fn be the sole element of the BoundNames of f.
  //     b. Let fo be InstantiateFunctionObject of f with arguments
  //        lexEnv and privateEnv.
  //     c. Perform ! varEnv.SetMutableBinding(fn, fo, false).
  for (const f of functionsToInitialize) {
    const [fn, ...rest] = BoundNames(f);
    Assert(fn != null && !rest.length);
    const fo = InstantiateFunctionObject($, lexEnv, privateEnv, f);
    CastNotAbrupt(varEnv.SetMutableBinding($, fn, fo, false));
  }

  // 37. Return unused.
  return UNUSED;

  // NOTE 2: B.3.2 provides an extension to the above algorithm that
  // is necessary for backwards compatibility with web browser
  // implementations of ECMAScript that predate ECMAScript 2015.
}


/**
 * 10.3 Built-in Function Objects
 *
 * The built-in function objects defined in this specification may be
 * implemented as either ECMAScript function objects (10.2) whose
 * behaviour is provided using ECMAScript code or as function objects
 * whose behaviour is provided in some other manner. In either case,
 * the effect of calling such functions must conform to their
 * specifications. An implementation may also provide additional
 * built-in function objects that are not defined in this
 * specification.
 *
 * If a built-in function object is implemented as an ECMAScript
 * function object, it must have all the internal slots described in
 * 10.2 ([[Prototype]], [[Extensible]], and the slots listed in Table
 * 30), and [[InitialName]]. The value of the [[InitialName]] internal
 * slot is a String value that is the initial name of the function. It
 * is used by 20.2.3.5.
 *
 * Built-in function objects must have the ordinary object behaviour
 * specified in 10.1. All such function objects have [[Prototype]],
 * [[Extensible]], [[Realm]], and [[InitialName]] internal slots, with
 * the same meanings as above.
 *
 * Unless otherwise specified every built-in function object has the
 * %Function.prototype% object as the initial value of its
 * [[Prototype]] internal slot.
 *
 * The behaviour specified for each built-in function via algorithm
 * steps or other means is the specification of the function body
 * behaviour for both [[Call]] and [[Construct]] invocations of the
 * function. However, [[Construct]] invocation is not supported by all
 * built-in functions. For each built-in function, when invoked with
 * [[Call]], the [[Call]] thisArgument provides the this value, the
 * [[Call]] argumentsList provides the named parameters, and the
 * NewTarget value is undefined. When invoked with [[Construct]], the
 * this value is uninitialized, the [[Construct]] argumentsList
 * provides the named parameters, and the [[Construct]] newTarget
 * parameter provides the NewTarget value. If the built-in function is
 * implemented as an ECMAScript function object then this specified
 * behaviour must be implemented by the ECMAScript code that is the
 * body of the function. Built-in functions that are ECMAScript
 * function objects must be strict functions. If a built-in
 * constructor has any [[Call]] behaviour other than throwing a
 * TypeError exception, an ECMAScript implementation of the function
 * must be done in a manner that does not cause the function's
 * [[IsClassConstructor]] internal slot to have the value true.
 *
 * Built-in function objects that are not identified as constructors
 * do not implement the [[Construct]] internal method unless otherwise
 * specified in the description of a particular function. When a
 * built-in constructor is called as part of a new expression the
 * argumentsList parameter of the invoked [[Construct]] internal
 * method provides the values for the built-in constructor's named
 * parameters.
 *
 * Built-in functions that are not constructors do not have a
 * "prototype" property unless otherwise specified in the description
 * of a particular function.
 *
 * If a built-in function object is not implemented as an ECMAScript
 * function it must provide [[Call]] and [[Construct]] internal
 * methods that conform to the following definitions:
 */
export abstract class BuiltinFunction extends OrdinaryObject implements Func {

  PrivateEnvironment!: PrivateEnvironmentRecord|null;

  Prototype: Obj;
  Realm: RealmRecord;
  InitialName!: string;

  /**
   * 10.3.3 CreateBuiltinFunction (
   *     behaviour, length, name, additionalInternalSlotsList
   *     [ , realm [ , prototype [ , prefix ] ] ] )
   *
   * The abstract operation CreateBuiltinFunction takes arguments
   * behaviour (an Abstract Closure, a set of algorithm steps, or some
   * other definition of a function's behaviour provided in this
   * specification), length (a non-negative integer or +∞), name (a
   * property key or a Private Name), and additionalInternalSlotsList (a
   * List of names of internal slots) and optional arguments realm (a
   * Realm Record), prototype (an Object or null), and prefix (a String)
   * and returns a function object. additionalInternalSlotsList contains
   * the names of additional internal slots that must be defined as part
   * of the object. This operation creates a built-in function
   * object. It performs the following steps when called:
   *
   * 1. If realm is not present, set realm to the current Realm Record.
   * 2. If prototype is not present, set prototype to
   *    realm.[[Intrinsics]].[[%Function.prototype%]].
   * 3. Let internalSlotsList be a List containing the names of all the
   *    internal slots that 10.3 requires for the built-in function object
   *    that is about to be created.
   * 4. Append to internalSlotsList the elements of additionalInternalSlotsList.
   * 5. Let func be a new built-in function object that, when called,
   *    performs the action described by behaviour using the provided
   *    arguments as the values of the corresponding parameters specified
   *    by behaviour. The new function object has internal slots whose
   *    names are the elements of internalSlotsList, and an [[InitialName]]
   *    internal slot.
   * 6. Set func.[[Prototype]] to prototype.
   * 7. Set func.[[Extensible]] to true.
   * 8. Set func.[[Realm]] to realm.
   * 9. Set func.[[InitialName]] to null.
   * 10. Perform SetFunctionLength(func, length).
   * 11. If prefix is not present, then
   *     a. Perform SetFunctionName(func, name).
   * 12. Else,
   *     a. Perform SetFunctionName(func, name, prefix).
   * 13. Return func.
   *
   * Each built-in function defined in this specification is created by
   * calling the CreateBuiltinFunction abstract operation.
   */
  constructor($: VM, length: number, name: string,
              realm: RealmRecord|undefined, prototype: Obj,
              prefix?: string) {
    super();
    // NOTE: require %FunctionPrototype% as explicit dep
    this.Prototype = prototype;
    if (!realm) realm = $.getRealm();
    Assert(realm != null);
    this.Realm = realm;
    SetFunctionLength($, this, length);
    SetFunctionName($, this, name, prefix);
  }

  /**
   * 10.3.1 [[Call]] ( thisArgument, argumentsList )
   *
   * The [[Call]] internal method of a built-in function object F takes
   * arguments thisArgument (an ECMAScript language value) and
   * argumentsList (a List of ECMAScript language values) and returns
   * either a normal completion containing an ECMAScript language value
   * or a throw completion. It performs the following steps when called:
   *
   * 1. Let callerContext be the running execution context.
   * 2. If callerContext is not already suspended, suspend callerContext.
   * 3. Let calleeContext be a new execution context.
   * 4. Set the Function of calleeContext to F.
   * 5. Let calleeRealm be F.[[Realm]].
   * 6. Set the Realm of calleeContext to calleeRealm.
   * 7. Set the ScriptOrModule of calleeContext to null.
   * 8. Perform any necessary implementation-defined initialization of calleeContext.
   * 9. Push calleeContext onto the execution context stack;
   *    calleeContext is now the running execution context.
   * 10. Let result be the Completion Record that is the result of
   *     evaluating F in a manner that conforms to the specification of
   *     F. thisArgument is the this value, argumentsList provides the named
   *     parameters, and the NewTarget value is undefined.
   * 11. Remove calleeContext from the execution context stack and
   *     restore callerContext as the running execution context.
   * 12. Return ? result.
   *
   * NOTE: When calleeContext is removed from the execution context
   * stack it must not be destroyed if it has been suspended and
   * retained by an accessible Generator for later resumption.
   */
  *Call($: VM, thisArgument: Val, argumentsList: Val[]): EvalGen<CR<Val>> {
    throw 'NotImplemented';
  }

  /**
   * 10.3.2 [[Construct]] ( argumentsList, newTarget )
   *
   * The [[Construct]] internal method of a built-in function object F
   * (when the method is present) takes arguments argumentsList (a List
   * of ECMAScript language values) and newTarget (a constructor) and
   * returns either a normal completion containing an Object or a throw
   * completion. The steps performed are the same as [[Call]] (see
   * 10.3.1) except that step 10 is replaced by:
   *
   * 10. Let result be the Completion Record that is the result of
   *     evaluating F in a manner that conforms to the specification of
   *     F. The this value is uninitialized, argumentsList provides the named
   *     parameters, and newTarget provides the NewTarget value.
   */
  *Construct($: VM, argumentsList: Val[], newTarget: Obj): EvalGen<CR<Obj>> {
    throw 'NotImplemented';
  }
}

/**
 * 10.4.4.6 CreateUnmappedArgumentsObject ( argumentsList )
 *
 * The abstract operation CreateUnmappedArgumentsObject takes argument
 * argumentsList (a List of ECMAScript language values) and returns an
 * ordinary object. It performs the following steps when called:
 */
export function CreateUnmappedArgumentsObject($: VM, argumentsList: Val[]): Obj {
  // 1. Let len be the number of elements in argumentsList.
  const len = argumentsList.length;
  // 2. Let obj be OrdinaryObjectCreate(%Object.prototype%, « [[ParameterMap]] »).
  const obj = new OrdinaryObject($.getIntrinsic('%Object.prototype%'));
  // 3. Set obj.[[ParameterMap]] to undefined.
  obj.ParameterMap = undefined;
  // 4. Perform ! DefinePropertyOrThrow(obj, "length",
  //      PropertyDescriptor { [[Value]]: 𝔽(len), [[Writable]]: true,
  //                           [[Enumerable]]: false, [[Configurable]]: true }).
  CastNotAbrupt(DefinePropertyOrThrow($, obj, 'length', new PropertyDescriptor({
    Value: len, Writable: true, Enumerable: false, Configurable: true})));
  // 5. Let index be 0.
  // 6. Repeat, while index < len,
  for (let index = 0; index < len; index++) {
    //   a. Let val be argumentsList[index].
    const val = argumentsList[index];
    //   b. Perform ! CreateDataPropertyOrThrow(obj, ! ToString(𝔽(index)), val).
    CastNotAbrupt(CreateDataPropertyOrThrow($, obj, String(index), val));
    //   c. Set index to index + 1.
  }
  // 7. Perform ! DefinePropertyOrThrow(obj, @@iterator,
  //      PropertyDescriptor { [[Value]]: %Array.prototype.values%, [[Writable]]: true,
  //                           [[Enumerable]]: false, [[Configurable]]: true }).
  CastNotAbrupt(DefinePropertyOrThrow($, obj, Symbol.iterator, new PropertyDescriptor({
    Value: $.getIntrinsic('%Array.prototype.values%'),
    Writable: true, Enumerable: false, Configurable: true})));
  // 8. Perform ! DefinePropertyOrThrow(obj, "callee",
  //      PropertyDescriptor { [[Get]]: %ThrowTypeError%, [[Set]]: %ThrowTypeError%,
  //                           [[Enumerable]]: false, [[Configurable]]: false }).
  CastNotAbrupt(DefinePropertyOrThrow($, obj, 'callee', new PropertyDescriptor({
    Get: $.getIntrinsic('ThrowTypeError'),
    Set: $.getIntrinsic('ThrowTypeError'),
    Enumerable: false, Configurable: false,
  })));
  // 9. Return obj.
  return obj;
}

/**
 * 10.4.4.7 CreateMappedArgumentsObject ( func, formals, argumentsList, env )
 *
 * The abstract operation CreateMappedArgumentsObject takes arguments
 * func (an Object), formals (a Parse Node), argumentsList (a List of
 * ECMAScript language values), and env (an Environment Record) and
 * returns an arguments exotic object. It performs the following steps
 * when called:
 */
export function CreateMappedArgumentsObject($: VM, func: Func, formals: Node[],
                                            argumentsList: Val[],
                                            env: EnvironmentRecord): Obj {
  // 1. Assert: formals does not contain a rest parameter, any binding patterns, or any initializers. It may contain duplicate identifiers.
  // 2. Let len be the number of elements in argumentsList.
  // 3. Let obj be MakeBasicObject(« [[Prototype]], [[Extensible]], [[ParameterMap]] »).
  // 4. Set obj.[[GetOwnProperty]] as specified in 10.4.4.1.
  // 5. Set obj.[[DefineOwnProperty]] as specified in 10.4.4.2.
  // 6. Set obj.[[Get]] as specified in 10.4.4.3.
  // 7. Set obj.[[Set]] as specified in 10.4.4.4.
  // 8. Set obj.[[Delete]] as specified in 10.4.4.5.
  // 9. Set obj.[[Prototype]] to %Object.prototype%.
  // 10. Let map be OrdinaryObjectCreate(null).
  // 11. Set obj.[[ParameterMap]] to map.
  // 12. Let parameterNames be the BoundNames of formals.
  // 13. Let numberOfParameters be the number of elements in parameterNames.
  // 14. Let index be 0.
  // 15. Repeat, while index < len,
  // a. Let val be argumentsList[index].
  // b. Perform ! CreateDataPropertyOrThrow(obj, ! ToString(𝔽(index)), val).
  // c. Set index to index + 1.
  // 16. Perform ! DefinePropertyOrThrow(obj, "length", PropertyDescriptor { [[Value]]: 𝔽(len), [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true }).
  // 17. Let mappedNames be a new empty List.
  // 18. Set index to numberOfParameters - 1.
  // 19. Repeat, while index ≥ 0,
  // a. Let name be parameterNames[index].
  // b. If mappedNames does not contain name, then
  // i. Append name to mappedNames.
  // ii. If index < len, then
  // 1. Let g be MakeArgGetter(name, env).
  // 2. Let p be MakeArgSetter(name, env).
  // 3. Perform ! map.[[DefineOwnProperty]](! ToString(𝔽(index)), PropertyDescriptor { [[Set]]: p, [[Get]]: g, [[Enumerable]]: false, [[Configurable]]: true }).
  // c. Set index to index - 1.
  // 20. Perform ! DefinePropertyOrThrow(obj, @@iterator, PropertyDescriptor { [[Value]]: %Array.prototype.values%, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true }).
  // 21. Perform ! DefinePropertyOrThrow(obj, "callee", PropertyDescriptor { [[Value]]: func, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true }).
  // 22. Return obj.

  return new OrdinaryObject($.getIntrinsic('%Object.prototype%'));

  //throw new Error('NOT IMPLEMENTED');
} 



/**
 * 13.3.6 Function Calls
 *
 * 13.3.6.1 Runtime Semantics: Evaluation
 * 
 * CallExpression : CoverCallExpressionAndAsyncArrowHead
 * 1. Let expr be the CallMemberExpression that is covered by
 *    CoverCallExpressionAndAsyncArrowHead.
 * 2. Let memberExpr be the MemberExpression of expr.
 * 3. Let arguments be the Arguments of expr.
 * 4. Let ref be ? Evaluation of memberExpr.
 * 5. Let func be ? GetValue(ref).
 * 6. If ref is a Reference Record, IsPropertyReference(ref) is false,
 *    and ref.[[ReferencedName]] is "eval", then
 *     a. If SameValue(func, %eval%) is true, then
 *         i. Let argList be ? ArgumentListEvaluation of arguments.
 *         ii. If argList has no elements, return undefined.
 *         iii. Let evalArg be the first element of argList.
 *         iv. If the source text matched by this CallExpression is
 *             strict mode code, let strictCaller be true. Otherwise let
 *             strictCaller be false.
 *         v. Return ? PerformEval(evalArg, strictCaller, true).
 * 7. Let thisCall be this CallExpression.
 * 8. Let tailCall be IsInTailPosition(thisCall).
 * 9. Return ? EvaluateCall(func, ref, arguments, tailCall).
 *
 * A CallExpression evaluation that executes step 6.a.v is a direct eval.
 * 
 * CallExpression : CallExpression Arguments
 * 1. Let ref be ? Evaluation of CallExpression.
 * 2. Let func be ? GetValue(ref).
 * 3. Let thisCall be this CallExpression.
 * 4. Let tailCall be IsInTailPosition(thisCall).
 * 5. Return ? EvaluateCall(func, ref, Arguments, tailCall).
 */
export function* Evaluation_CallExpression(
  $: VM,
  node: ESTree.CallExpression,
): EvalGen<CR<Val>> {

  // TODO - handle the async case above

  const ref = yield* $.Evaluation(node.callee);
  if (IsAbrupt(ref)) return ref;
  Assert(!EMPTY.is(ref)); // ??? does this break stuff?
  const func = GetValue($, ref);
  if (IsAbrupt(func)) return func;

  // if (ref instanceof ReferenceRecord)  && !IsPropertyReference(ref)
  //   && ref.ReferencedName === 'eval') {
  // const thisCall = n;
  const tailCall = false; // IsInTailPosition(thisCall);
  return yield* EvaluateCall($, func, ref, node.arguments, tailCall);
}

/**
 * 13.3.6.2 EvaluateCall ( func, ref, arguments, tailPosition )
 *
 * The abstract operation EvaluateCall takes arguments func (an
 * ECMAScript language value), ref (an ECMAScript language value or a
 * Reference Record), arguments (a Parse Node), and tailPosition (a
 * Boolean) and returns either a normal completion containing an
 * ECMAScript language value or an abrupt completion. It performs the
 * following steps when called:
 * 
 * 1. If ref is a Reference Record, then
 *     a. If IsPropertyReference(ref) is true, then
 *         i. Let thisValue be GetThisValue(ref).
 *     b. Else,
 *         i. Let refEnv be ref.[[Base]].
 *         ii. Assert: refEnv is an Environment Record.
 *         iii. Let thisValue be refEnv.WithBaseObject().
 * 2. Else,
 *     a. Let thisValue be undefined.
 * 3. Let argList be ? ArgumentListEvaluation of arguments.
 * 4. If func is not an Object, throw a TypeError exception.
 * 5. If IsCallable(func) is false, throw a TypeError exception.
 * 6. If tailPosition is true, perform PrepareForTailCall().
 * 7. Return ? Call(func, thisValue, argList).
 */
export function* EvaluateCall(
  $: VM,
  func: Val,
  ref: Val|ReferenceRecord,
  // NOTE: "arguments" is not allowed for param names in strict mode
  args: Array<ESTree.Expression|ESTree.SpreadElement>,
  tailPosition: boolean,
): EvalGen<CR<Val>> {
  let thisValue: Val;
  if (ref instanceof ReferenceRecord) {
    if (IsPropertyReference(ref)) {
      thisValue = GetThisValue($, ref);
    } else {
      const refEnv = ref.Base;
      Assert(refEnv instanceof EnvironmentRecord);
      thisValue = refEnv.WithBaseObject();
    }
  } else {
    thisValue = undefined;
  }
  const argList = yield* ArgumentListEvaluation($, args);
  if (IsAbrupt(argList)) return argList;
  if (typeof func !== 'object') throw new TypeError('func is not an object');
  if (!IsCallable(func)) throw new TypeError('func is not callable');
  if (tailPosition) PrepareForTailCall($);
  return yield* Call($, func, thisValue, argList);
}

/**
 * 13.3.8.1 Runtime Semantics: ArgumentListEvaluation
 * 
 * The syntax-directed operation ArgumentListEvaluation takes no
 * arguments and returns either a normal completion containing a List
 * of ECMAScript language values or an abrupt completion. It is
 * defined piecewise over the following productions:
 * 
 * Arguments : ( )
 * 1. Return a new empty List.
 *
 * ArgumentList : AssignmentExpression
 * 1. Let ref be ? Evaluation of AssignmentExpression.
 * 2. Let arg be ? GetValue(ref).
 * 3. Return « arg ».
 *
 * ArgumentList : ... AssignmentExpression
 * 1. Let list be a new empty List.
 * 2. Let spreadRef be ? Evaluation of AssignmentExpression.
 * 3. Let spreadObj be ? GetValue(spreadRef).
 * 4. Let iteratorRecord be ? GetIterator(spreadObj, sync).
 * 5. Repeat,
 *     a. Let next be ? IteratorStep(iteratorRecord).
 *     b. If next is false, return list.
 *     c. Let nextArg be ? IteratorValue(next).
 *     d. Append nextArg to list.
 *
 * ArgumentList : ArgumentList , AssignmentExpression
 * 1. Let precedingArgs be ? ArgumentListEvaluation of ArgumentList.
 * 2. Let ref be ? Evaluation of AssignmentExpression.
 * 3. Let arg be ? GetValue(ref).
 * 4. Return the list-concatenation of precedingArgs and « arg ».
 *
 * ArgumentList : ArgumentList , ... AssignmentExpression
 * 1. Let precedingArgs be ? ArgumentListEvaluation of ArgumentList.
 * 2. Let spreadRef be ? Evaluation of AssignmentExpression.
 * 3. Let iteratorRecord be ? GetIterator(? GetValue(spreadRef), sync).
 * 4. Repeat,
 *     a. Let next be ? IteratorStep(iteratorRecord).
 *     b. If next is false, return precedingArgs.
 *     c. Let nextArg be ? IteratorValue(next).
 *     d. Append nextArg to precedingArgs.
 *
 * TODO - template literal is not handled here
 *
 * TemplateLiteral : NoSubstitutionTemplate
 * 1. Let templateLiteral be this TemplateLiteral.
 * 2. Let siteObj be GetTemplateObject(templateLiteral).
 * 3. Return « siteObj ».
 *
 * TemplateLiteral : SubstitutionTemplate
 * 1. Let templateLiteral be this TemplateLiteral.
 * 2. Let siteObj be GetTemplateObject(templateLiteral).
 * 3. Let remaining be ? ArgumentListEvaluation of SubstitutionTemplate.
 * 4. Return the list-concatenation of « siteObj » and remaining.
 *
 * SubstitutionTemplate : TemplateHead Expression TemplateSpans
 * 1. Let firstSubRef be ? Evaluation of Expression.
 * 2. Let firstSub be ? GetValue(firstSubRef).
 * 3. Let restSub be ? SubstitutionEvaluation of TemplateSpans.
 * 4. Assert: restSub is a possibly empty List.
 * 5. Return the list-concatenation of « firstSub » and restSub.
 */
function* ArgumentListEvaluation(
  $: VM,
  argList: Array<ESTree.Expression|ESTree.SpreadElement>,
): EvalGen<CR<Val[]>> {
  const list: Val[] = [];
  for (const arg of argList) {
    if (arg.type === 'SpreadElement') {
      // TODO - we haven't implemented iterators yet
      const spreadObj = yield* $.evaluateValue(arg.argument);
      if (IsAbrupt(spreadObj)) return spreadObj;
      const iteratorRecord = GetIterator($, spreadObj, false);
      if (IsAbrupt(iteratorRecord)) return iteratorRecord;
      while (true) {
        const next = IteratorStep($, iteratorRecord);
        if (IsAbrupt(next)) return next;
        if (!next) break;
        const nextArg = IteratorValue($, next);
        if (IsAbrupt(nextArg)) return nextArg;
        list.push(nextArg);
      }
    } else {
      const ref = yield* $.evaluateValue(arg);
      if (IsAbrupt(ref)) return ref;
      const argVal = GetValue($, ref);
      if (IsAbrupt(argVal)) return argVal;
      list.push(argVal);
    }
  }
  return list;
}
