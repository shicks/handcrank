import { CR, CastNotAbrupt, IsAbrupt, ThrowCompletion } from './completion_record';
import { VM } from './vm';
import { BASE, DERIVED, EMPTY, GLOBAL, LEXICAL, LEXICAL_THIS, NON_LEXICAL_THIS, STRICT, UNINITIALIZED, UNUSED } from './enums';
import { DeclarativeEnvironmentRecord, EnvironmentRecord, FunctionEnvironmentRecord, GlobalEnvironmentRecord } from './environment_record';
import { PropertyDescriptor } from './property_descriptor';
import { Assert } from './assert';
import { DefinePropertyOrThrow } from './abstract_object';
import * as ESTree from 'estree';
import { RealmRecord } from './realm_record';
import { ScriptRecord } from './script_record';
import { ModuleRecord } from './module_record';
import { CodeExecutionContext, ExecutionContext } from './execution_context';
import { PrivateEnvironmentRecord, PrivateName } from './private_environment_record';

import Node = ESTree.Node;
import { BoundNames, IsConstantDeclaration, LexicallyDeclaredNames, LexicallyScopedDeclarations, VarDeclaredNames, VarScopedDeclarations } from './static/scope';
import { ContainsExpression, IsSimpleParameterList } from './static/functions';
import { Obj } from './obj_base';
import { PropertyKey, Val } from './val';
import { lazySuper } from './record';
import { OrdinaryObject } from './obj';
import { SourceTextNode } from './tree';
import { CreateListIteratorRecord } from './abstract_iterator';

type PrivateElement = never;
type ClassFieldDefinitionRecord = never;

export interface Func extends Obj {
  Environment: EnvironmentRecord;
  PrivateEnvironment: PrivateEnvironmentRecord;
  FormalParameters: ESTree.Pattern[];
  ECMAScriptCode: ESTree.BlockStatement|ESTree.Expression;
  ConstructorKind: BASE|DERIVED;
  Realm: RealmRecord;
  ScriptOrModule: ScriptRecord|ModuleRecord;
  ThisMode: LEXICAL|STRICT|GLOBAL;
  Strict: boolean;
  HomeObject: Obj|undefined;
  SourceText: string;
  Fields: ClassFieldDefinitionRecord[]; // TODO - Map?
  PrivateMethods: PrivateElement[]; // TODO - Map?
  ClassFieldInitializerName: string|symbol|PrivateName|EMPTY;
  IsClassConstructor: boolean;

  // (from OrdinaryObjectCreate)
  Prototype: Obj;
  Extensible: boolean;
  OwnProps: Map<PropertyKey, PropertyDescriptor>;
  Call($: VM, thisArgument: Val, argumentsList: Val[]): CR<Val>;
  Construct($: VM, argumentsList: Val[], newTarget: Obj): CR<Obj>;
}
export function Func() { throw new Error('do not call'); }
Object.defineProperty(Func, Symbol.hasInstance, {value(arg: unknown): arg is Func {
  return arg instanceof Obj && Boolean(arg.Call || arg.Construct);
}});

// Basic function
export abstract class OrdinaryFunction extends lazySuper(() => OrdinaryObject) implements Func {
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
  declare PrivateEnvironment: PrivateEnvironmentRecord;

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
  override Call($: VM, thisArgument: Val, argumentsList: Val[]): CR<Val> {
    //const callerContext = $.getRunningContext();
    const calleeContext = PrepareForOrdinaryCall($, this, undefined);
    Assert(calleeContext === $.getRunningContext());
    if (this.IsClassConstructor) {
      const error = $.newError('TypeError');
      $.popContext();
      return ThrowCompletion(error);
    }
    OrdinaryCallBindThis($, this, calleeContext, thisArgument);
    const result = OrdinaryCallEvaluateBody($, this, argumentsList);
    $.popContext();
    if (IsAbrupt(result)) {
      if (result.Type === 'return') return result.Value;
      return result;
    }
    return undefined;
  }

  override Construct($: VM, argumentsList: Val[], newTarget: Obj): CR<Obj> {
    throw 'not implemented';
  }
}

export class BuiltinFunction extends OrdinaryFunction {
  constructor(public InitialName: string) {
    super();
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
export function InstantiateFunctionObject($: VM, env: EnvironmentRecord, privateEnv: PrivateEnvironmentRecord|null, node: ESTree.Node): CR<Func> {
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
): CR<Func> {
  const F = OrdinaryFunctionCreate($, $.getIntrinsic('%Function.prototype%'),
                                   (node as SourceTextNode).sourceText || '(no source)',
                                   node.params, node.body,
                                   NON_LEXICAL_THIS, env, privateEnv);
  SetFunctionName($, F, (node as ESTree.FunctionExpression).id?.name || 'default');
  MakeConstructor($, F);
  return F;
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
export function OrdinaryFunctionCreate($: VM, functionPrototype: Obj,
                                       sourceText: string,
                                       ParameterList: ESTree.Pattern[],
                                       Body: Node,
                                       thisMode: LEXICAL_THIS|NON_LEXICAL_THIS,
                                       env: EnvironmentRecord,
                                       privateEnv: PrivateEnvironmentRecord|null): Func {
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
export function EvaluateBody($: VM, functionObject: Func, argumentsList: Val[],
                             node: ESTree.BlockStatement|ESTree.Expression): CR<Val> {
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
    const err = FunctionDeclarationInstantiation($, functionObject, argumentsList);
    if (IsAbrupt(err)) return err;
    return $.evaluateValue(node);
  }
    
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
export function OrdinaryCallEvaluateBody($: VM, F: Func, argumentsList: Val[]): CR<Val> {
  return EvaluateBody($, F, argumentsList, F.ECMAScriptCode);
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
  CastNotAbrupt(DefinePropertyOrThrow($, F, 'name', PropertyDescriptor({
    Value: name, Writable: false, Enumerable: false, Configurable: true})));
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
export function FunctionDeclarationInstantiation($: VM, func: Func, argumentsList: Val[]) {
  // It performs the following steps when called:
  // 1. Let calleeContext be the running execution context.
  const calleeContext = $.getRunningContext();
  // 2. Let code be func.[[ECMAScriptCode]].
  const code = func.ECMAScriptCode;
  // 3. Let strict be func.[[Strict]].
  const strict = func.Strict;
  // 4. Let formals be func.[[FormalParameters]].
  const formals = func.FormalParameters;
  // 5. Let parameterNames be the BoundNames of formals.
  const parameterNames = [];
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
  const varNames = VarDeclaredNames(code, true);
  // 10. Let varDeclarations be the VarScopedDeclarations of code.
  const varDeclarations = VarScopedDeclarations(code, true);
  // 11. Let lexicalNames be the LexicallyDeclaredNames of code.
  const lexicalNames = LexicallyDeclaredNames(code, true);
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
  const iteratorRecord = CreateListIteratorRecord($, argumentsList);
  // 25. If hasDuplicates is true, then
  //     a. Perform ? IteratorBindingInitialization of formals with
  //        arguments iteratorRecord and undefined.
  // 26. Else,
  //     a. Perform ? IteratorBindingInitialization of formals with
  //        arguments iteratorRecord and env.
  const result = IteratorBindingInitialization(
    iteratorRecord, hasDuplicates ? undefined : env, formals);
  if (IsAbrupt(result)) return result;

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
  const lexDeclarations = LexicallyScopedDeclarations(code, true);
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
  CastNotAbrupt(DefinePropertyOrThrow($, obj, 'length', PropertyDescriptor({
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
  CastNotAbrupt(DefinePropertyOrThrow($, obj, Symbol.iterator, PropertyDescriptor({
    Value: $.getIntrinsic('%Array.prototype.values%'),
    Writable: true, Enumerable: false, Configurable: true})));
  // 8. Perform ! DefinePropertyOrThrow(obj, "callee",
  //      PropertyDescriptor { [[Get]]: %ThrowTypeError%, [[Set]]: %ThrowTypeError%,
  //                           [[Enumerable]]: false, [[Configurable]]: false }).
  CastNotAbrupt(DefinePropertyOrThrow($, obj, 'callee', PropertyDescriptor({
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
  throw new Error('NOT IMPLEMENTED');
} 
