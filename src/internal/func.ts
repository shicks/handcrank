import { Abrupt, CR, CastNotAbrupt, CompletionType, IsAbrupt, IsReturnCompletion, ThrowCompletion } from './completion_record';
import { DebugString, ECR, EvalGen, Plugin, VM, just, mapJust, when } from './vm';
import { ACCESSOR, BASE, DERIVED, EMPTY, GLOBAL, LEXICAL, LEXICAL_THIS, METHOD, NON_LEXICAL_THIS, STRICT, SYNC, UNINITIALIZED, UNUSED } from './enums';
import { DeclarativeEnvironmentRecord, EnvironmentRecord, FunctionEnvironmentRecord, GlobalEnvironmentRecord } from './environment_record';
import { PropertyDescriptor, PropertyRecord, propC, propW, propWC } from './property_descriptor';
import { Assert } from './assert';
import { Call, Construct, DefinePropertyOrThrow, InitializeInstanceElements } from './abstract_object';
import * as ESTree from 'estree';
import { RealmRecord } from './realm_record';
import { ScriptRecord } from './script_record';
import { ModuleRecord } from './module_record';
import { BuiltinExecutionContext, CodeExecutionContext, ExecutionContext, GetActiveScriptOrModule, ResolveBinding } from './execution_context';
import { PrivateElement, PrivateEnvironmentRecord, PrivateName } from './private_environment_record';
import { BoundNames, IsConstantDeclaration, IsStrictMode, LexicallyDeclaredNames, LexicallyScopedDeclarations, VarDeclaredNames, VarScopedDeclarations } from './static/scope';
import { ContainsExpression, ExpectedArgumentCount, GetSourceText, IsSimpleParameterList } from './static/functions';
import { EvaluatePropertyKey, Obj, OrdinaryCreateFromConstructor, OrdinaryObject, OrdinaryObjectCreate, PropertyMap } from './obj';
import { PropertyKey, Val } from './val';
import { BlockLike, Source, isBlockLike } from './tree';
import { ToObject } from './abstract_conversion';
import { GetThisValue, GetValue, InitializeReferencedBinding, IsPropertyReference, PutValue, ReferenceRecord } from './reference_record';
import { IsCallable, IsConstructor } from './abstract_compare';
import { memoize } from './slots';
import { GetIterator, IteratorStep, IteratorValue } from './abstract_iterator';
import { functionConstructor } from './fundamental';
import type { ClassFieldDefinitionRecord } from './class';
import { CreateMappedArgumentsObject, CreateUnmappedArgumentsObject } from './exotic_arguments';

type Node = ESTree.Node;

function PrepareForTailCall(..._: any): void {}

export const functions: Plugin = {
  id: 'functions',
  deps: () => [functionConstructor],

  syntax: {
    NamedEvaluation(on) {
      on('ArrowFunctionExpression',
         when(n => !n.async, mapJust(InstantiateArrowFunctionExpression)));
      on('FunctionExpression',
         when(n => !n.async && !n.generator, InstantiateOrdinaryFunctionExpression));
    },
    InstantiateFunctionObject(on) {
      on('FunctionDeclaration',
         when(n => !n.async && !n.generator,
              InstantiateOrdinaryFunctionObject));
    },
    Evaluation(on) {
      on('FunctionDeclaration', () => just(EMPTY));
      on('FunctionExpression',
         when(n => !n.async && !n.generator,
              InstantiateOrdinaryFunctionExpression));
      on('ArrowFunctionExpression',
         when(n => !n.async,
              mapJust(InstantiateArrowFunctionExpression)));
      on('ReturnStatement', function*($, n) {
        // 14.10.1 Runtime Semantics: Evaluation
        //
        // ReturnStatement : return ;
        // 1. Return Completion Record { [[Type]]: return, [[Value]]:
        //    undefined, [[Target]]: empty }.
        if (!n.argument) return new Abrupt(CompletionType.Return, undefined, EMPTY);

        // ReturnStatement : return Expression ;
        // 1. Let exprRef be ? Evaluation of Expression.
        // 2. Let exprValue be ? GetValue(exprRef).
        // 3. If GetGeneratorKind() is async, set exprValue to ? Await(exprValue).
        // 4. Return Completion Record { [[Type]]: return, [[Value]]:
        //    exprValue, [[Target]]: empty }.
        const exprValue = yield* $.evaluateValue(n.argument);
        if (IsAbrupt(exprValue)) return exprValue;
        //if (GetGeneratorKind() === 'async') {
        return new Abrupt(CompletionType.Return, exprValue, EMPTY);
      });
    },
    ArgumentListEvaluation(on) {
      on(['CallExpression', 'NewExpression'], ArgumentListEvaluation_CallExpression);
    },
  },
};

declare global {
  interface ObjectSlots {
    ////////////////////////////////////////////////////////////////
    // Slots for function objects

    /**
     * [[Environment]], an Environment Record - The Environment Record
     * that the function was closed over. Used as the outer environment
     * when evaluating the code of the function.
     */
    Environment?: EnvironmentRecord;

    /**
     * [[PrivateEnvironment]], a PrivateEnvironment Record or null - The
     * PrivateEnvironment Record for Private Names that the function was
     * closed over. null if this function is not syntactically contained
     * within a class. Used as the outer PrivateEnvironment for inner
     * classes when evaluating the code of the function.
     */
    PrivateEnvironment?: PrivateEnvironmentRecord|null;

    /**
     * [[FormalParameters]], a Parse Node - The root parse node of the
     * source text that defines the function's formal parameter list.
     */
    FormalParameters?: ESTree.Pattern[];

    /**
     * [[ECMAScriptCode]], a Parse Node - The root parse node of the
     * source text that defines the function's body.
     */
    ECMAScriptCode?: BlockLike|ESTree.Expression;

    /**
     * [[ConstructorKind]], base or derived - Whether or not the function
     * is a derived class constructor.
     */
    ConstructorKind?: BASE|DERIVED;

    /**
     * [[Realm]], a Realm Record - The realm in which the function was
     * created and which provides any intrinsic objects that are accessed
     * when evaluating the function.
     */
    Realm?: RealmRecord;

    /**
     * [[ScriptOrModule]], a Script Record or a Module Record - The script
     * or module in which the function was created.
     */
    ScriptOrModule?: ScriptRecord|ModuleRecord;

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
    ThisMode?: LEXICAL|STRICT|GLOBAL;

    /**
     * [[Strict]], a Boolean - true if this is a strict function, false if
     * this is a non-strict function.
     */
    Strict?: boolean;

    /**
     * [[HomeObject]], an Object - If the function uses super, this is the
     * object whose [[GetPrototypeOf]] provides the object where super
     * property lookups begin.
     */
    HomeObject?: Obj|undefined;

    /**
     * [[SourceText]], a sequence of Unicode code points - The source text
     * that defines the function.
     */
    SourceText?: string;

    /**
     * [[Fields]], a List of ClassFieldDefinition Records - If the
     * function is a class, this is a list of Records representing the
     * non-static fields and corresponding initializers of the class.
     */
    Fields?: readonly ClassFieldDefinitionRecord[]; // TODO - Map?

    /**
     * [[PrivateMethods]], a List of PrivateElements - If the function is
     * a class, this is a list representing the non-static private methods
     * and accessors of the class.
     */
    PrivateMethods?: ReadonlyMap<PrivateName, PrivateElement>;

    /**
     * [[ClassFieldInitializerName]], a String, a Symbol, a Private Name,
     * or empty - If the function is created as the initializer of a class
     * field, the name to use for NamedEvaluation of the field; empty
     * otherwise.
     */
    ClassFieldInitializerName?: string|symbol|PrivateName|EMPTY;

    /**
     * [[IsClassConstructor]], a Boolean - Indicates whether the function
     * is a class constructor. (If true, invoking the function's [[Call]]
     * will immediately throw a TypeError exception.)
     */
    IsClassConstructor?: boolean;

    ////////////////////////////////////////////////////////////////
    // Non-standard slot for improved stack traces

    /** Internal-only name stored when OwnProps.name is empty. */
    InternalName?: string;

    ////////////////////////////////////////////////////////////////
    // Slot for builtin function object

    InitialName?: string;
  }
}

// New interface with various required properties
export interface Func extends Obj {

  Prototype: Obj;
  Extensible: boolean;
  OwnProps: PropertyMap;
  Realm: RealmRecord;

  Call?(this: Func, $: VM, thisArgument: Val, argumentsList: Val[]): EvalGen<CR<Val>>;
  Construct?(this: Func, $: VM, argumentsList: Val[], newTarget: Obj): EvalGen<CR<Obj>>;
}

export function IsFunc(arg: unknown): arg is Func {
  return arg instanceof Obj &&
    (typeof (arg as Func).Call === 'function' ||
      typeof (arg as Func).Construct === 'function');
}

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
 *
 * 1. Let internalSlotsList be the internal slots listed in Table 30.
 * 2. Let F be OrdinaryObjectCreate(functionPrototype, internalSlotsList).
 * 3. Set F.[[Call]] to the definition specified in 10.2.1.
 * 4. Set F.[[SourceText]] to sourceText.
 * 5. Set F.[[FormalParameters]] to ParameterList.
 * 6. Set F.[[ECMAScriptCode]] to Body.
 * 7. If the source text matched by Body is strict mode code, let Strict
 *    be true; else let Strict be false.
 * 8. Set F.[[Strict]] to Strict.
 * 9. If thisMode is lexical-this, set F.[[ThisMode]] to lexical.
 * 10. Else if Strict is true, set F.[[ThisMode]] to strict.
 * 11. Else, set F.[[ThisMode]] to global.
 * 12. Set F.[[IsClassConstructor]] to false.
 * 13. Set F.[[Environment]] to env.
 * 14. Set F.[[PrivateEnvironment]] to privateEnv.
 * 15. Set F.[[ScriptOrModule]] to GetActiveScriptOrModule().
 * 16. Set F.[[Realm]] to the current Realm Record.
 * 17. Set F.[[HomeObject]] to undefined.
 * 18. Set F.[[Fields]] to a new empty List.
 * 19. Set F.[[PrivateMethods]] to a new empty List.
 * 20. Set F.[[ClassFieldInitializerName]] to empty.
 * 21. Let len be the ExpectedArgumentCount of ParameterList.
 * 22. Perform SetFunctionLength(F, len).
 * 23. Return F.
 */
export function OrdinaryFunctionCreate(
  $: VM,
  functionPrototype: Obj,
  sourceText: string,
  ParameterList: ESTree.Pattern[],
  Body: BlockLike|ESTree.Expression,
  thisMode: LEXICAL_THIS|NON_LEXICAL_THIS,
  env: EnvironmentRecord,
  privateEnv: PrivateEnvironmentRecord|null,
): OrdinaryFunction {
  const realm = $.getRealm();
  const strict = IsStrictMode(Body);
  const scriptOrModule = GetActiveScriptOrModule($);
  const len = ExpectedArgumentCount(ParameterList);
  Assert(realm);
  Assert(scriptOrModule);
  return new (OrdinaryFunction())({
    Prototype: functionPrototype,
    SourceText: sourceText,
    FormalParameters: ParameterList,
    ECMAScriptCode: Body,
    Strict: strict,
    ThisMode: LEXICAL_THIS.is(thisMode) ? LEXICAL : strict ? STRICT : GLOBAL,
    Environment: env,
    PrivateEnvironment: privateEnv,
    ScriptOrModule: scriptOrModule,
    Realm: realm,
  }, {
    length: propC(len),
  });
}

export interface OrdinaryFunctionSlots extends ObjectSlots {
  Prototype: Obj;
  Realm: RealmRecord;
  Environment: EnvironmentRecord;
  PrivateEnvironment: PrivateEnvironmentRecord|null,
  FormalParameters: ESTree.Pattern[],
  ECMAScriptCode: BlockLike|ESTree.Expression,
  ScriptOrModule: ScriptRecord|ModuleRecord;
  ThisMode: LEXICAL|STRICT|GLOBAL;
  SourceText: string;
  Strict: boolean;
}

export type OrdinaryFunction = InstanceType<ReturnType<typeof OrdinaryFunction>>;
export const OrdinaryFunction = memoize(() => class OrdinaryFunction extends OrdinaryObject() implements Func {

  declare Prototype: Obj;
  declare Realm: RealmRecord;
  declare Environment: EnvironmentRecord;
  declare PrivateEnvironment: PrivateEnvironmentRecord|null;
  declare FormalParameters: ESTree.Pattern[];
  declare ECMAScriptCode: BlockLike|ESTree.Expression;
  declare ScriptOrModule: ScriptRecord|ModuleRecord;
  declare ThisMode: LEXICAL|STRICT|GLOBAL;
  declare Strict: boolean;
  declare SourceText: string;
  declare HomeObject: Obj|undefined;
  declare Fields: readonly ClassFieldDefinitionRecord[];
  declare PrivateMethods: ReadonlyMap<PrivateName, PrivateElement>;
  declare ClassFieldInitializerName: string|symbol|PrivateName|EMPTY;
  declare IsClassConstructor: boolean;

  constructor(slots: OrdinaryFunctionSlots, props: PropertyRecord) {
    super(slots, props);
    this.HomeObject ??= undefined;
    this.Fields ??= [];
    this.PrivateMethods ??= new Map();
    this.ClassFieldInitializerName ??= EMPTY;
    this.IsClassConstructor ??= false;
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
  *Call($: VM, thisArgument: Val, argumentsList: Val[]): ECR<Val> {
    //const callerContext = $.getRunningContext();
    const calleeContext = PrepareForOrdinaryCall($, this, undefined);
    Assert(calleeContext === $.getRunningContext());
    if (this.IsClassConstructor) {
      const error = $.newError('TypeError');
      $.popContext();
      return ThrowCompletion(error);
    }
    OrdinaryCallBindThis($, this, calleeContext, thisArgument);
    const result = yield* this.EvaluateBody($, this, argumentsList);
    $.popContext();
    if (IsAbrupt(result)) {
      if (IsReturnCompletion(result)) return result.Value;
      return result;
    }
    return undefined;
  }

  EvaluateBody($: VM, thisArg: Func, argumentsList: Val[]): ECR<Val> {
    return OrdinaryCallEvaluateBody($, thisArg, argumentsList);
  }
});

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
  SetFunctionName(F, (node as ESTree.FunctionExpression).id?.name || 'default');
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
 * 3. Let privateEnv be the running execution context's PrivateEnvironment.
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
 * referenced from inside the FunctionExpression's FunctionBody to
 * allow the function to call itself recursively. However, unlike in a
 * FunctionDeclaration, the BindingIdentifier in a FunctionExpression
 * cannot be referenced from and does not affect the scope enclosing
 * the FunctionExpression.
 */
export function* InstantiateOrdinaryFunctionExpression(
  $: VM,
  node: ESTree.FunctionExpression,
  name?: PropertyKey|PrivateName,
): EvalGen<Func> {
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
  SetFunctionName(closure, name);
  MakeConstructor($, closure);
  if (node.id != null) {
    // NOTE: we've already checked that the name is declarable in this scope
    // and should have given an early error - therefore, we shouldn't be
    // running into any setters that might need to execute.
    CastNotAbrupt(yield* env.InitializeBinding($, name as string, closure));
  }
  return closure;
}

function sourceText(node: Node): string {
  const source = node.loc?.source as unknown as Source;
  if (!source) return '';
  const range = node.range || [(node as any).start, (node as any).end];
  return source.sourceText?.substring(range[0], range[1]) || '';
}

/**
 * 15.3.4 Runtime Semantics: InstantiateArrowFunctionExpression
 * 
 * The syntax-directed operation InstantiateArrowFunctionExpression
 * takes optional argument name (a property key or a Private Name) and
 * returns a function object. It is defined piecewise over the
 * following productions:
 * 
 * ArrowFunction : ArrowParameters => ConciseBody
 * 1. If name is not present, set name to "".
 * 2. Let env be the LexicalEnvironment of the running execution context.
 * 3. Let privateEnv be the running execution context's PrivateEnvironment.
 * 4. Let sourceText be the source text matched by ArrowFunction.
 * 5. Let closure be OrdinaryFunctionCreate(%Function.prototype%,
 *    sourceText, ArrowParameters, ConciseBody, lexical-this, env,
 *    privateEnv).
 * 6. Perform SetFunctionName(closure, name).
 * 7. Return closure.
 * 
 * NOTE: An ArrowFunction does not define local bindings for
 * arguments, super, this, or new.target. Any reference to arguments,
 * super, this, or new.target within an ArrowFunction must resolve to
 * a binding in a lexically enclosing environment. Typically this will
 * be the Function Environment of an immediately enclosing
 * function. Even though an ArrowFunction may contain references to
 * super, the function object created in step 5 is not made into a
 * method by performing MakeMethod. An ArrowFunction that references
 * super is always contained within a non-ArrowFunction and the
 * necessary state to implement super is accessible via the env that
 * is captured by the function object of the ArrowFunction.
 */
export function InstantiateArrowFunctionExpression(
  $: VM,
  node: ESTree.ArrowFunctionExpression,
  name?: PropertyKey|PrivateName,
): Func {
  const sourceText = GetSourceText(node);
  const privateEnv = $.getRunningContext().PrivateEnvironment!;
  const env = $.getRunningContext().LexicalEnvironment!;
  if (!name) name = '';
  const closure = OrdinaryFunctionCreate(
    $,
    $.getIntrinsic('%Function.prototype%'),
    sourceText,
    node.params,
    node.body,
    LEXICAL_THIS,
    env,
    privateEnv,
  );
  SetFunctionName(closure, name);
  return closure;
}

/**
 * 15.4.4 Runtime Semantics: DefineMethod
 * 
 * The syntax-directed operation DefineMethod takes argument object
 * (an Object) and optional argument functionPrototype (an Object) and
 * returns either a normal completion containing a Record with fields
 * [[Key]] (a property key) and [[Closure]] (a function object) or an
 * abrupt completion. It is defined piecewise over the following
 * productions:
 * 
 * MethodDefinition : ClassElementName ( UniqueFormalParameters ) { FunctionBody }
 * 1. Let propKey be ? Evaluation of ClassElementName.
 * 2. Let env be the running execution context's LexicalEnvironment.
 * 3. Let privateEnv be the running execution context's PrivateEnvironment.
 * 4. If functionPrototype is present, then
 *     a. Let prototype be functionPrototype.
 * 5. Else,
 *     a. Let prototype be %Function.prototype%.
 * 6. Let sourceText be the source text matched by MethodDefinition.
 * 7. Let closure be OrdinaryFunctionCreate(prototype, sourceText,
 *    UniqueFormalParameters, FunctionBody, non-lexical-this, env,
 *    privateEnv).
 * 8. Perform MakeMethod(closure, object).
 * 9. Return the Record { [[Key]]: propKey, [[Closure]]: closure }.
 */
export function* DefineMethod(
  $: VM,
  def: ESTree.MethodDefinition|ESTree.Property,
  object: Obj,
  functionPrototype?: Obj,
): ECR<{Key: PropertyKey, Closure: Func}> {
  const funcNode = def.value as ESTree.FunctionExpression;
  Assert(!funcNode.async && !funcNode.generator); // NOTE: async/generator handled separately.
  const propKey = yield* EvaluatePropertyKey($, def);
  if (IsAbrupt(propKey)) return propKey;
  Assert(!(propKey instanceof PrivateName));
  const env = $.getRunningContext().LexicalEnvironment!;
  const privateEnv = $.getRunningContext().PrivateEnvironment!;
  const prototype = functionPrototype || $.getIntrinsic('%Function.prototype%');
  const sourceText = GetSourceText(def);
  const closure = OrdinaryFunctionCreate(
    $,
    prototype,
    sourceText,
    funcNode.params,
    funcNode.body,
    NON_LEXICAL_THIS,
    env,
    privateEnv,
  );
  MakeMethod(closure, object);
  return {Key: propKey, Closure: closure};
}

/**
 * 15.4.5 Runtime Semantics: MethodDefinitionEvaluation
 * 
 * The syntax-directed operation MethodDefinitionEvaluation takes
 * arguments object (an Object) and enumerable (a Boolean) and returns
 * either a normal completion containing either a PrivateElement or
 * unused, or an abrupt completion. It is defined piecewise over the
 * following productions:
 * 
 * MethodDefinition : ClassElementName ( UniqueFormalParameters ) { FunctionBody }
 * 1. Let methodDef be ? DefineMethod of MethodDefinition with argument object.
 * 2. Perform SetFunctionName(methodDef.[[Closure]], methodDef.[[Key]]).
 * 3. Return DefineMethodProperty(object, methodDef.[[Key]], methodDef.[[Closure]], enumerable).
 * 
 * MethodDefinition : get ClassElementName ( ) { FunctionBody }
 * 1. Let propKey be ? Evaluation of ClassElementName.
 * 2. Let env be the running execution context's LexicalEnvironment.
 * 3. Let privateEnv be the running execution context's PrivateEnvironment.
 * 4. Let sourceText be the source text matched by MethodDefinition.
 * 5. Let formalParameterList be an instance of the production FormalParameters : [empty] .
 * 6. Let closure be OrdinaryFunctionCreate(%Function.prototype%, sourceText, formalParameterList, FunctionBody, non-lexical-this, env, privateEnv).
 * 7. Perform MakeMethod(closure, object).
 * 8. Perform SetFunctionName(closure, propKey, "get").
 * 9. If propKey is a Private Name, then
 *     a. Return PrivateElement { [[Key]]: propKey, [[Kind]]: accessor, [[Get]]: closure, [[Set]]: undefined }.
 * 10. Else,
 *     a. Let desc be the PropertyDescriptor { [[Get]]: closure, [[Enumerable]]: enumerable, [[Configurable]]: true }.
 *     b. Perform ? DefinePropertyOrThrow(object, propKey, desc).
 *     c. Return unused.
 * 
 * MethodDefinition : set ClassElementName ( PropertySetParameterList ) { FunctionBody }
 * 1. Let propKey be ? Evaluation of ClassElementName.
 * 2. Let env be the running execution context's LexicalEnvironment.
 * 3. Let privateEnv be the running execution context's PrivateEnvironment.
 * 4. Let sourceText be the source text matched by MethodDefinition.
 * 5. Let closure be OrdinaryFunctionCreate(%Function.prototype%, sourceText, PropertySetParameterList, FunctionBody, non-lexical-this, env, privateEnv).
 * 6. Perform MakeMethod(closure, object).
 * 7. Perform SetFunctionName(closure, propKey, "set").
 * 8. If propKey is a Private Name, then
 *     a. Return PrivateElement { [[Key]]: propKey, [[Kind]]: accessor, [[Get]]: undefined, [[Set]]: closure }.
 * 9. Else,
 *     a. Let desc be the PropertyDescriptor { [[Set]]: closure, [[Enumerable]]: enumerable, [[Configurable]]: true }.
 *     b. Perform ? DefinePropertyOrThrow(object, propKey, desc).
 *     c. Return unused.
 * 
 * GeneratorMethod : * ClassElementName ( UniqueFormalParameters ) { GeneratorBody }
 * 1. Let propKey be ? Evaluation of ClassElementName.
 * 2. Let env be the running execution context's LexicalEnvironment.
 * 3. Let privateEnv be the running execution context's PrivateEnvironment.
 * 4. Let sourceText be the source text matched by GeneratorMethod.
 * 5. Let closure be OrdinaryFunctionCreate(%GeneratorFunction.prototype%, sourceText, UniqueFormalParameters, GeneratorBody, non-lexical-this, env, privateEnv).
 * 6. Perform MakeMethod(closure, object).
 * 7. Perform SetFunctionName(closure, propKey).
 * 8. Let prototype be OrdinaryObjectCreate(%GeneratorFunction.prototype.prototype%).
 * 9. Perform ! DefinePropertyOrThrow(closure, "prototype", PropertyDescriptor { [[Value]]: prototype, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: false }).
 * 10. Return DefineMethodProperty(object, propKey, closure, enumerable).
 * 
 * AsyncGeneratorMethod : async * ClassElementName ( UniqueFormalParameters ) { AsyncGeneratorBody }
 * 1. Let propKey be ? Evaluation of ClassElementName.
 * 2. Let env be the running execution context's LexicalEnvironment.
 * 3. Let privateEnv be the running execution context's PrivateEnvironment.
 * 4. Let sourceText be the source text matched by AsyncGeneratorMethod.
 * 5. Let closure be OrdinaryFunctionCreate(%AsyncGeneratorFunction.prototype%, sourceText, UniqueFormalParameters, AsyncGeneratorBody, non-lexical-this, env, privateEnv).
 * 6. Perform MakeMethod(closure, object).
 * 7. Perform SetFunctionName(closure, propKey).
 * 8. Let prototype be OrdinaryObjectCreate(%AsyncGeneratorFunction.prototype.prototype%).
 * 9. Perform ! DefinePropertyOrThrow(closure, "prototype", PropertyDescriptor { [[Value]]: prototype, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: false }).
 * 10. Return DefineMethodProperty(object, propKey, closure, enumerable).
 * 
 * AsyncMethod : async ClassElementName ( UniqueFormalParameters ) { AsyncFunctionBody }
 * 1. Let propKey be ? Evaluation of ClassElementName.
 * 2. Let env be the LexicalEnvironment of the running execution context.
 * 3. Let privateEnv be the running execution context's PrivateEnvironment.
 * 4. Let sourceText be the source text matched by AsyncMethod.
 * 5. Let closure be OrdinaryFunctionCreate(%AsyncFunction.prototype%, sourceText, UniqueFormalParameters, AsyncFunctionBody, non-lexical-this, env, privateEnv).
 * 6. Perform MakeMethod(closure, object).
 * 7. Perform SetFunctionName(closure, propKey).
 * 8. Return DefineMethodProperty(object, propKey, closure, enumerable).
 */
export function* MethodDefinitionEvaluation(
  $: VM,
  def: ESTree.MethodDefinition|ESTree.Property,
  object: Obj,
  enumerable: boolean,
): ECR<PrivateElement|UNUSED> {
  const propKey = yield* EvaluatePropertyKey($, def);
  if (IsAbrupt(propKey)) return propKey;
  const env = $.getRunningContext().LexicalEnvironment!;
  const privateEnv = $.getRunningContext().PrivateEnvironment!;
  const sourceText = GetSourceText(def);
  switch (def.kind) {
    case 'method': {
      // NOTE: We've inlined DefineMethod into here.
      const isGenerator = def.value.generator ? 'Generator' : '';
      const isAsync = def.value.async ? 'Async' : '';
      const functionProto = $.getIntrinsic(`%${isAsync}${isGenerator}Function.prototype%`)!;
      const closure = OrdinaryFunctionCreate(
        $, functionProto, sourceText, def.value.params, def.value.body, NON_LEXICAL_THIS,
        env, privateEnv);
      MakeMethod(closure, object);
      SetFunctionName(closure, propKey);
      if (isGenerator) {
        const prototype = OrdinaryObjectCreate({
          Prototype: $.getIntrinsic(`%${isAsync}${isGenerator}Function.prototype.prototype%`)!,
        });
        CastNotAbrupt(DefinePropertyOrThrow($, closure, 'prototype', propW(prototype)));
      }
      return DefineMethodProperty($, object, propKey, closure, enumerable);
    }
    case 'get': {
      const closure = OrdinaryFunctionCreate(
        $, $.getIntrinsic('%Function.prototype%'), sourceText, [],
        (def.value as ESTree.FunctionExpression).body, NON_LEXICAL_THIS, env, privateEnv);
      MakeMethod(closure, object);
      SetFunctionName(closure, propKey, 'get');
      if (propKey instanceof PrivateName) {
        return {Key: propKey, Kind: ACCESSOR, Get: closure, Set: undefined};
      }
      const desc = {Get: closure, Enumerable: enumerable, Configurable: true};
      return DefinePropertyOrThrow($, object, propKey, desc);
    }
    case 'set': {
      const closure = OrdinaryFunctionCreate(
        $, $.getIntrinsic('%Function.prototype%'), sourceText,
        (def.value as ESTree.FunctionExpression).params,
        (def.value as ESTree.FunctionExpression).body,
        NON_LEXICAL_THIS, env, privateEnv);
      MakeMethod(closure, object);
      SetFunctionName(closure, propKey, 'set');
      if (propKey instanceof PrivateName) {
        return {Key: propKey, Kind: ACCESSOR, Get: undefined, Set: closure};
      }
      const desc = {Set: closure, Enumerable: enumerable, Configurable: true};
      return DefinePropertyOrThrow($, object, propKey, desc);
    }
  }
  throw new Error(`Invalid MethodDefinition kind: ${def.kind}`);
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
export function PrepareForOrdinaryCall($: VM, F: OrdinaryFunction, newTarget: Obj|undefined) {
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
  node: BlockLike|ESTree.Expression
): ECR<Val> {
  // TODO - check for generator and/or async, which will probably be different
  // subtypes of Function.
  if (functionObject.ECMAScriptCode) {
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
  throw new Error(`Unknown function type`);
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
export function* OrdinaryCallEvaluateBody($: VM, F: Func, argumentsList: Val[]): ECR<Val> {
  Assert(F.ECMAScriptCode);
  const result = yield* EvaluateBody($, F, argumentsList, F.ECMAScriptCode);
  if (!IsAbrupt(result) && !isBlockLike(F.ECMAScriptCode)) {
    // Handle concise bodies
    return new Abrupt(CompletionType.Return, result, EMPTY);
  }
  return result;
}

/**
 * 10.2.2 [[Construct]] ( argumentsList, newTarget )
 * 
 * The [[Construct]] internal method of an ECMAScript function object
 * F takes arguments argumentsList (a List of ECMAScript language
 * values) and newTarget (a constructor) and returns either a normal
 * completion containing an Object or a throw completion. It performs
 * the following steps when called:
 * 
 * 1. Let callerContext be the running execution context.
 * 2. Let kind be F.[[ConstructorKind]].
 * 3. If kind is base, then
 *     a. Let thisArgument be ? OrdinaryCreateFromConstructor(newTarget, "%Object.prototype%").
 * 4. Let calleeContext be PrepareForOrdinaryCall(F, newTarget).
 * 5. Assert: calleeContext is now the running execution context.
 * 6. If kind is base, then
 *     a. Perform OrdinaryCallBindThis(F, calleeContext, thisArgument).
 *     b. Let initializeResult be Completion(InitializeInstanceElements(thisArgument, F)).
 *     c. If initializeResult is an abrupt completion, then
 *         i. Remove calleeContext from the execution context stack
 *            and restore callerContext as the running execution context.
 *         ii. Return ? initializeResult.
 * 7. Let constructorEnv be the LexicalEnvironment of calleeContext.
 * 8. Let result be Completion(OrdinaryCallEvaluateBody(F, argumentsList)).
 * 9. Remove calleeContext from the execution context stack and
 *    restore callerContext as the running execution context.
 * 10. If result.[[Type]] is return, then
 *     a. If result.[[Value]] is an Object, return result.[[Value]].
 *     b. If kind is base, return thisArgument.
 *     c. If result.[[Value]] is not undefined, throw a TypeError exception.
 * 11. Else, ReturnIfAbrupt(result).
 * 12. Let thisBinding be ? constructorEnv.GetThisBinding().
 * 13. Assert: thisBinding is an Object.
 * 14. Return thisBinding.
 */
export function* OrdinaryConstruct($: VM, F: Func, argumentsList: Val[], newTarget: Func): ECR<Obj> {
  //const callerContext = $.getRunningContext();
  const kind = F.ConstructorKind;
  let thisArgument!: Obj;
  if (BASE.is(kind)) {
    const result = yield* OrdinaryCreateFromConstructor($, newTarget, '%Object.prototype%');
    if (IsAbrupt(result)) return result;
    thisArgument = result;
  }
  const calleeContext = PrepareForOrdinaryCall($, F as OrdinaryFunction, newTarget);
  Assert(calleeContext === $.getRunningContext());
  if (BASE.is(kind)) {
    CastNotAbrupt(OrdinaryCallBindThis($, F, calleeContext, thisArgument));
    const initializeResult = yield* InitializeInstanceElements($, thisArgument, F);
    if (IsAbrupt(initializeResult)) {
      $.popContext(calleeContext);
      return initializeResult;
    }
  }
  const constructorEnv = calleeContext.LexicalEnvironment;
  const result = yield* OrdinaryCallEvaluateBody($, F, argumentsList);
  $.popContext(calleeContext);
  if (IsAbrupt(result)) {
    if (result.Type === 'return') {
      if (result.Value instanceof Obj) return result.Value;
      if (BASE.is(kind)) return thisArgument;
      if (result.Value !== undefined) {
        return $.throw('TypeError', 'Unexpected return value');
      }
    }
    return result;
  }
  return constructorEnv.GetThisBinding($) as CR<Obj>;
}

/**
 * 10.2.5 MakeConstructor ( F [ , writablePrototype [ , prototype ] ] )
 * The abstract operation MakeConstructor takes argument F (an ECMAScript function object or a built-in function object) and optional arguments writablePrototype (a Boolean) and prototype (an Object) and returns unused. It converts F into a constructor. It performs the following steps when called:
 * 
 * 1. If F is an ECMAScript function object, then
 *     a. Assert: IsConstructor(F) is false.
 *     b. Assert: F is an extensible object that does not have a "prototype" own property.
 *     c. Set F.[[Construct]] to the definition specified in 10.2.2.
 * 2. Else,
 *     a. Set F.[[Construct]] to the definition specified in 10.3.2.
 * 3. Set F.[[ConstructorKind]] to base.
 * 4. If writablePrototype is not present, set writablePrototype to true.
 * 5. If prototype is not present, then
 *     a. Set prototype to OrdinaryObjectCreate(%Object.prototype%).
 *     b. Perform ! DefinePropertyOrThrow(prototype, "constructor", PropertyDescriptor { [[Value]]: F, [[Writable]]: writablePrototype, [[Enumerable]]: false, [[Configurable]]: true }).
 * 6. Perform ! DefinePropertyOrThrow(F, "prototype", PropertyDescriptor { [[Value]]: prototype, [[Writable]]: writablePrototype, [[Enumerable]]: false, [[Configurable]]: false }).
 * 7. Return unused.
 */
export function MakeConstructor(
  $: VM,
  F: Func,
  writablePrototype = true,
  prototype?: Obj,
): UNUSED {
  if (F instanceof OrdinaryFunction()) {
    Assert(!IsConstructor(F));
    Assert(F.Extensible && !F.OwnProps.has('prototype'));
    (F as Func).Construct = function($: VM, args: Val[], newTarget: Func) {
      return OrdinaryConstruct($, this, args, newTarget);
    };
  // } else {
  //   F.Construct = BuiltinConstruct;
  }
  F.ConstructorKind = BASE;
  if (prototype == null) {
    prototype = OrdinaryObjectCreate({
      Prototype: $.getIntrinsic('%Object.prototype%')!,
    }, {
      'constructor': {...propC(F), Writable: writablePrototype},
    });
  }
  F.OwnProps.set('prototype', {...propC(prototype), Writable: writablePrototype});
  return UNUSED;
}

/**
 * 10.2.6 MakeClassConstructor ( F )
 * 
 * The abstract operation MakeClassConstructor takes argument F (an
 * ECMAScript function object) and returns unused. It performs the
 * following steps when called:
 * 
 * 1. Assert: F.[[IsClassConstructor]] is false.
 * 2. Set F.[[IsClassConstructor]] to true.
 * 3. Return unused.
 */
export function MakeClassConstructor(F: Func): UNUSED {
  Assert(!F.IsClassConstructor);
  F.IsClassConstructor = true;
  return UNUSED;
}

/**
 * 10.2.7 MakeMethod ( F, homeObject )
 * 
 * The abstract operation MakeMethod takes arguments F (an ECMAScript
 * function object) and homeObject (an Object) and returns unused. It
 * configures F as a method. It performs the following steps when
 * called:
 * 
 * 1. Set F.[[HomeObject]] to homeObject.
 * 2. Return unused.
 */
export function MakeMethod(F: Func, homeObject: Obj): UNUSED {
  F.HomeObject = homeObject;
  return UNUSED;
}

/**
 * 10.2.8 DefineMethodProperty ( homeObject, key, closure, enumerable )
 * 
 * The abstract operation DefineMethodProperty takes arguments
 * homeObject (an Object), key (a property key or Private Name),
 * closure (a function object), and enumerable (a Boolean) and returns
 * a PrivateElement or unused. It performs the following steps when
 * called:
 * 
 * 1. Assert: homeObject is an ordinary, extensible object with no
 *    non-configurable properties.
 * 2. If key is a Private Name, then
 *     a. Return PrivateElement { [[Key]]: key, [[Kind]]: method, [[Value]]: closure }.
 * 3. Else,
 *     a. Let desc be the PropertyDescriptor { [[Value]]: closure,
 *     [[Writable]]: true, [[Enumerable]]: enumerable,
 *     [[Configurable]]: true }.
 *     b. Perform ! DefinePropertyOrThrow(homeObject, key, desc).
 *     c. Return unused.
 */
export function DefineMethodProperty(
  $: VM,
  homeObject: Obj,
  key: PropertyKey|PrivateName,
  closure: Func,
  enumerable: boolean,
): PrivateElement|UNUSED {
  if (key instanceof PrivateName) {
    return {Key: key, Kind: METHOD, Value: closure};
  }
  const desc = {
    Value: closure,
    Writable: true,
    Enumerable: enumerable,
    Configurable: true,
  };
  CastNotAbrupt(DefinePropertyOrThrow($, homeObject, key, desc));
  return UNUSED;
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
 *     a. Set name to the string-concatenation of prefix, the code
 *        unit 0x0020 (SPACE), and name.
 *     b. If F has an [[InitialName]] internal slot, then
 *         i. Optionally, set F.[[InitialName]] to name.
 * 6. Perform ! DefinePropertyOrThrow(F, "name", PropertyDescriptor {
 *    [[Value]]: name, [[Writable]]: false, [[Enumerable]]: false,
 *    [[Configurable]]: true }).
 * 7. Return unused.
 */
export function SetFunctionName(
  F: Func,
  name: PropertyKey|PrivateName,
  prefix?: string,
): UNUSED {
  Assert(F.Extensible);
  // NOTE: For whatever reason we're duplicating this.
  //       - for now, just skip the check.
  //Assert(!F.OwnProps.has('name'));
  if (typeof name === 'symbol') {
    const description = name.description;
    if (description == null) {
      name = '';
    } else {
      name = `[${description}]`;
    }
  } else if (name instanceof PrivateName) {
    name = name.Description;
  }
  if (prefix) {
    name = `${prefix} ${String(name)}`;
  }
  if (F instanceof BuiltinFunction()) {
    F.InitialName = name;
  }
  F.OwnProps.set('name', propC(name));
  F.InternalName = name;
  // CastNotAbrupt(DefinePropertyOrThrow($, F, 'name', propC(name)));
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
export function SetFunctionLength(F: Func, length: number): UNUSED {
  Assert(F.Extensible);
  Assert(!F.OwnProps.has('length'));
  F.OwnProps.set('length', propC(length));
  // CastNotAbrupt(DefinePropertyOrThrow($, F, 'length', propC(length)));
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
 * instantiated. If the function's formal parameters do not include
 * any default value initializers then the body declarations are
 * instantiated in the same Environment Record as the parameters. If
 * default value parameter initializers exist, a second Environment
 * Record is created for the body declarations. Formal parameters and
 * functions are initialized as part of
 * FunctionDeclarationInstantiation. All other bindings are
 * initialized during evaluation of the function body.
 */
export function* FunctionDeclarationInstantiation($: VM, func: Func, argumentsList: Val[]): ECR<UNUSED> {
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
  const body: Node|Node[] = code.type === 'BlockStatement' ? code.body : code;
  const varNames = VarDeclaredNames(body);
  // 10. Let varDeclarations be the VarScopedDeclarations of code.
  const varDeclarations = VarScopedDeclarations(code);
  // 11. Let lexicalNames be the LexicallyDeclaredNames of code.
  const lexicalNames = new Set(LexicallyDeclaredNames(code));
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
    (functionNames.includes('arguments') || lexicalNames.has('arguments'))) {
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
      if (hasDuplicates) CastNotAbrupt(yield* env.InitializeBinding($, paramName, undefined));
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
    //   c. If strict is true, then
    //       i. Perform ! env.CreateImmutableBinding("arguments", false).
    //       ii. NOTE: In strict mode code early errors prevent attempting to
    //           assign to this binding, so its mutability is not observable.
    //   d. Else,
    //       i. Perform ! env.CreateMutableBinding("arguments", false).
    //   e. Perform ! env.InitializeBinding("arguments", ao).
    Assert(env instanceof DeclarativeEnvironmentRecord);

    const ao = () => strict || !simpleParameterList ?
      CreateUnmappedArgumentsObject($, argumentsList) :
      CreateMappedArgumentsObject($, func, formals, argumentsList, env);

    // NOTE: The following evaluates arguments eagerly, which is probably a performance hit.
    // if (strict) CastNotAbrupt(env.CreateImmutableBinding($, 'arguments', false));
    // else CastNotAbrupt(env.CreateMutableBinding($, 'arguments', false));
    // CastNotAbrupt(yield* env.InitializeBinding($, 'arguments', ao));

    if (strict) {
      env.CreateImmutableLazyBinding('arguments', ao, false);
    } else {
      env.CreateMutableLazyBinding('arguments', ao, false);
    }

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
          yield* PutValue($, lhs, argumentsList[argIndex++]) :
          yield* InitializeReferencedBinding($, lhs, argumentsList[argIndex++]);
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
      CastNotAbrupt(yield* env.InitializeBinding($, n, undefined));
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
        CastNotAbrupt(yield* env.GetBindingValue($, n, false));
      //         5. Perform ! varEnv.InitializeBinding(n, initialValue).
      CastNotAbrupt(yield* varEnv.InitializeBinding($, n, initialValue));
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
    const fo = $.InstantiateFunctionObject(f, lexEnv, privateEnv);
    CastNotAbrupt(yield* varEnv.SetMutableBinding($, fn, fo, false));
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
export type BuiltinFunction = InstanceType<ReturnType<typeof BuiltinFunction>>;
export const BuiltinFunction = memoize(() => class BuiltinFunction extends OrdinaryObject() implements Func {

  declare Prototype: Obj;
  declare Realm: RealmRecord;
  declare InitialName: string;
  declare CallBehavior?: CallBehavior;
  declare ConstructBehavior?: ConstructBehavior;
  declare Call: Func['Call'];
  declare Construct: Func['Construct'];

  constructor(slots: BuiltinFunctionSlots, props: PropertyRecord) {
    super(slots, props);

    if (this.CallBehavior) this.Call = wrapBehavior(this, this.CallBehavior);
    if (this.ConstructBehavior) this.Construct = wrapBehavior(this, this.ConstructBehavior);
  }

  // Call($: VM, thisArgument: Val, argumentsList: Val[]): ECR<Val> {
  //   console.dir(this);
  //   if (this.CallBehavior) return this.CallBehavior($, thisArgument, argumentsList);
  //   return (function*() { return Throw('TypeError', 'not callable'); })();
  // }

  /**
   */
  // Construct($: VM, argumentsList: Val[], newTarget: Obj): ECR<Obj> {
  //   if (this.ConstructBehavior) return this.ConstructBehavior($, argumentsList, newTarget);
  //   return (function*() { return Throw('TypeError', 'not a constructible'); })();
  // }
});

/**
 * 10.3.1 BuiltinFunction.[[Call]] ( thisArgument, argumentsList )
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
 *
 * ---
 *
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
export function wrapBehavior<B extends CallBehavior|ConstructBehavior>(
  F: Func,
  behavior: B,
): B {
  return function*(this: BuiltinFunction, $: VM) {
    const callerContext = $.getRunningContext();
    callerContext.suspend();
    const calleeContext =
      new BuiltinExecutionContext(F);
    $.enterContext(calleeContext);
    const result = yield* behavior.apply(this, arguments);
    $.popContext(calleeContext); // TODO - finally? catch/rethrow??
    return result;
  } as any;
}

export interface BuiltinFunctionSlots extends ObjectSlots {
  // NOTE: See 10.3.1 for details on exact correct behavior of Call
  CallBehavior?: CallBehavior;
  ConstructBehavior?: ConstructBehavior;
  Prototype: Obj;
  Realm: RealmRecord;
  InitialName: string;
  Extensible: boolean;
}
interface CallBehavior {
  (
    this: Func,
    $: VM,
    thisArgument: Val,
    argumentsList: Val[],
  ): ECR<Val>;
}
interface ConstructBehavior {
  (
    this: Func,
    $: VM,
    argumentsList: Val[],
    newTarget: Val,
  ): ECR<Obj>;
}
export interface BuiltinFunctionBehavior {
  Call?: CallBehavior;
  Construct?: ConstructBehavior;
}

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
export function CreateBuiltinFunction(
  behaviour: BuiltinFunctionBehavior,
  length: number,
  name: string,
  realm: RealmRecord,
  functionPrototype: Obj,
  prefix?: string,
) {
  const fnName = prefix ? `${prefix} ${name}` : name;
  const slots: BuiltinFunctionSlots = {
    Prototype: functionPrototype,
    Extensible: true,
    Realm: realm,
    InitialName: fnName,
  };
  if (behaviour.Call) slots.CallBehavior = behaviour.Call;
  if (behaviour.Construct) slots.ConstructBehavior = behaviour.Construct;
  return new (BuiltinFunction())(
    slots, {
      length: propC(length),
      name: propC(fnName),
    });
}

/**
 * Returns an internal Func object that should not be exposed to users.
 * The returned object does _not_ have all the required slots for a
 * function.
 */
export function MakeInternalClosure(fn: ($: VM, ...args: Val[]) => ECR<Val>): Func {
  return new (BuiltinFunction())({
    CallBehavior($: VM, _: Val, args: Val[]) {
      return fn($, ...args);
    }
  } as any, {});
  
}

/**
 * 13.3.5 The new Operator
 *
 * 13.3.5.1 Runtime Semantics: Evaluation
 *
 * NewExpression : new NewExpression
 * 1. Return ? EvaluateNew(NewExpression, empty).
 *
 * MemberExpression : new MemberExpression Arguments
 * 1. Return ? EvaluateNew(MemberExpression, Arguments).
 *
 * 13.3.5.1.1 EvaluateNew ( constructExpr, arguments )
 *
 * The abstract operation EvaluateNew takes arguments constructExpr (a
 * NewExpression Parse Node or a MemberExpression Parse Node) and
 * arguments (empty or an Arguments Parse Node) and returns either a
 * normal completion containing an ECMAScript language value or an
 * abrupt completion. It performs the following steps when called:
 * 
 * 1. Let ref be ? Evaluation of constructExpr.
 * 2. Let constructor be ? GetValue(ref).
 * 3. If arguments is empty, let argList be a new empty List.
 * 4. Else,
 *     a. Let argList be ? ArgumentListEvaluation of arguments.
 * 5. If IsConstructor(constructor) is false, throw a TypeError exception.
 * 6. Return ? Construct(constructor, argList).
 */
export function* Evaluation_NewExpression(
  $: VM,
  node: ESTree.NewExpression,
): ECR<Obj> {
  const ref = yield* $.Evaluation(node.callee);
  if (IsAbrupt(ref)) return ref;
  Assert(!EMPTY.is(ref));
  const constructor = yield* GetValue($, ref);
  if (IsAbrupt(constructor)) return constructor;
  const argList = yield* $.ArgumentListEvaluation(node);
  if (IsAbrupt(argList)) return argList;
  if (!IsConstructor(constructor)) {
    return $.throw('TypeError', `${DebugString(ref)} is not a constructor`);
  }
  return yield* Construct($, constructor as Func, argList);
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
): ECR<Val> {

  // TODO - handle the async case above

  const ref = yield* $.Evaluation(node.callee);
  if (IsAbrupt(ref)) return ref;
  Assert(!EMPTY.is(ref)); // ??? does this break stuff?
  const func = yield* GetValue($, ref);
  if (IsAbrupt(func)) return func;

  // if (ref instanceof ReferenceRecord)  && !IsPropertyReference(ref)
  //   && ref.ReferencedName === 'eval') {
  // const thisCall = n;
  const tailCall = false; // IsInTailPosition(thisCall);
  return yield* EvaluateCall($, func, ref, node, tailCall);
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
  callNode: Node,
  tailPosition: boolean,
): ECR<Val> {
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
  const argList = yield* $.ArgumentListEvaluation(callNode);
  if (IsAbrupt(argList)) return argList;
  if (typeof func !== 'object') return $.throw('TypeError', `${DebugString(ref)} is not an object`);
  if (!IsCallable(func)) return $.throw('TypeError', `${DebugString(ref)} is not callable`);
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
 */
export function* ArgumentListEvaluation_CallExpression(
  $: VM,
  node: ESTree.CallExpression,
): EvalGen<CR<Val[]>> {
  const list: Val[] = [];
  for (const arg of node.arguments) {
    if (arg.type === 'SpreadElement') {
      const spreadObj = yield* $.evaluateValue(arg.argument);
      if (IsAbrupt(spreadObj)) return spreadObj;
      const iteratorRecord = yield* GetIterator($, spreadObj, SYNC);
      if (IsAbrupt(iteratorRecord)) return iteratorRecord;
      while (true) {
        const next = yield* IteratorStep($, iteratorRecord);
        if (IsAbrupt(next)) return next;
        if (!next) break;
        const nextArg = yield* IteratorValue($, next);
        if (IsAbrupt(nextArg)) return nextArg;
        list.push(nextArg);
      }
    } else {
      const ref = yield* $.evaluateValue(arg);
      if (IsAbrupt(ref)) return ref;
      const argVal = yield* GetValue($, ref);
      if (IsAbrupt(argVal)) return argVal;
      list.push(argVal);
    }
  }
  return list;
}

/**
 * Defines a property descriptor for a builtin method.  For use with
 * `defineProperties`, which allows passing lazy descriptors.
 */
export function method(
  fn: ($: VM, thisValue: Val, ...params: Val[]) => ECR<Val>,
  length = fn.length - 2,
  specifiedName?: string,
): (realm: RealmRecord, name: string) => PropertyDescriptor {
  return (realm, name) => propWC(CreateBuiltinFunction({
    Call($, thisObj, argumentsList) { return fn($, thisObj, ...argumentsList); },
  }, length, specifiedName ?? name, realm, realm.Intrinsics.get('%Function.prototype%')!));
}

/**
 * Same as `method` but guards that `thisValue` is an Object.
 */
export function methodO(
  fn: ($: VM, thisValue: Obj, ...params: Val[]) => ECR<Val>,
  length = fn.length - 2,
  specifiedName?: string,
): (realm: RealmRecord, name: string) => PropertyDescriptor {
  return method(
    ($, thisObj, argumentsList) =>
      thisObj instanceof Obj ?
      fn($, thisObj, argumentsList) :
      just($.throw('TypeError', 'invalid receiver')),
    length, specifiedName);
}

/**
 * Defines a property descriptor for a builtin method.  For use with
 * `defineProperties`, which allows passing lazy descriptors.
 */
export function getter(
  fn: ($: VM, thisValue: Val) => ECR<Val>,
  attrs: PropertyDescriptor = {},
): (realm: RealmRecord, name: string) => PropertyDescriptor {
  return (realm, name) => ({
    Enumerable: false,
    Configurable: true,
    Get: CreateBuiltinFunction({
      Call($, thisObj) { return fn($, thisObj); },
    }, 0, name, realm, realm.Intrinsics.get('%Function.prototype%')!, 'get'),
    Set: undefined,
    ...attrs,
  });
}

/**
 * Returns a FunctionBehavior for both calling and constructing.
 * The `this` value is not exposed for calls, and `NewTarget` is
 * undefined.
 */
export function callOrConstruct(
  fn: ($: VM, NewTarget: Func|undefined, ...argumentList: Val[]) => ECR<Val>,
): BuiltinFunctionBehavior {
  return {
    Call($, _, argumentList) {
      return fn($, undefined, ...argumentList);
    },
    Construct($, argumentList, NewTarget) {
      return fn($, NewTarget as Func, ...argumentList) as ECR<Obj>;
    },
  };
}
