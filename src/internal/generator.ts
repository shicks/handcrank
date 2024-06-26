import * as ESTree from 'estree';
import { GetSourceText } from './static/functions';
import { CreateBuiltinFunction, Func, FunctionDeclarationInstantiation, OrdinaryFunction, OrdinaryFunctionCreate, SetFunctionName, callOrConstruct, functions, methodO } from './func';
import { prop0, propC, propW } from './property_descriptor';
import { ECR, Plugin, VM, mapJust, runImmediate, when } from './vm';
import { functionConstructor } from './fundamental';
import { ASYNC, EMPTY, NON_LEXICAL_THIS, SYNC, UNUSED } from './enums';
import { Abrupt, CR, CastNotAbrupt, IsAbrupt, IsReturnCompletion, IsThrowCompletion, ReturnCompletion, ThrowCompletion } from './completion_record';
import { DeclarativeEnvironmentRecord, EnvironmentRecord } from './environment_record';
import { PrivateEnvironmentRecord, PrivateName } from './private_environment_record';
import { Obj, OrdinaryCreateFromConstructor, OrdinaryObjectCreate } from './obj';
import { Assert } from './assert';
import { PropertyKey, Val } from './val';
import { iterators } from './iterators';
import { RealmRecord, defineProperties } from './realm_record';
import { AsyncIteratorClose, CreateIterResultObject, GetIterator, IteratorClose, IteratorComplete, IteratorValue } from './abstract_iterator';
import { CodeExecutionContext, ExecutionContext } from './execution_context';
import { Call, GetMethod } from './abstract_object';

declare const CreateDynamicFunction: any;
declare const Await: any;
declare const AsyncGeneratorYield: any;

export const generators: Plugin = {
  id: 'generators',
  deps: () => [functionConstructor, iterators, functions],

  syntax: {
    NamedEvaluation(on) {
      on('FunctionExpression',
         when(n => !n.async && n.generator,
              mapJust(InstantiateGeneratorFunctionExpression)));
    },
    InstantiateFunctionObject(on) {
      on('FunctionDeclaration',
         when(n => !n.async && n.generator, InstantiateGeneratorFunctionObject));
    },
    Evaluation(on) {
      on('FunctionExpression',
         when(n => !n.async && n.generator,
              mapJust(InstantiateGeneratorFunctionExpression)));
      on('YieldExpression', function*($, n) {
        if (n.delegate) {
          return yield* Evaluation_YieldDelegateExpression($, n);
        } else {
          return yield* Evaluation_YieldExpression($, n);
        }
      });
    },
  },

  realm: {
    CreateIntrinsics,
  },
};

enum GeneratorState {
  suspendedStart = 1,
  suspendedYield = 2,
  executing = 3,
  completed = 4,
}

/**
 * 27.5.2 Properties of Generator Instances
 * 
 * Generator instances are initially created with the internal slots
 * described in Table 82.
 */
interface GeneratorSlots {
  /** 
   * TODO - document?
   */
  AsyncGeneratorState?: GeneratorState|undefined,

  /** 
   * [[GeneratorState]], undefined, suspendedStart, suspendedYield,
   * executing, or completed - The current execution state of the
   * generator.
   */
  GeneratorState?: GeneratorState|undefined,

  /** 
   * [[GeneratorContext]], an execution context - The execution context
   * that is used when executing the code of this generator.
   */
  GeneratorContext?: ExecutionContext,

  /** 
   * [[GeneratorBrand]], a String or empty - A brand used to distinguish
   * different kinds of generators. The [[GeneratorBrand]] of generators
   * declared by ECMAScript source text is always empty.
   */
  GeneratorBrand?: string|EMPTY,
}

declare global {
  interface ObjectSlots extends GeneratorSlots {}
}

/**
 * 15.5.2 Runtime Semantics: EvaluateGeneratorBody
 * The syntax-directed operation EvaluateGeneratorBody takes arguments functionObject (a function object) and argumentsList (a List of ECMAScript language values) and returns a throw completion or a return completion. It is defined piecewise over the following productions:
 * 
 * GeneratorBody : FunctionBody
 * 1. Perform ? FunctionDeclarationInstantiation(functionObject, argumentsList).
 * 2. Let G be ? OrdinaryCreateFromConstructor(functionObject, "%GeneratorFunction.prototype.prototype%", « [[GeneratorState]], [[GeneratorContext]], [[GeneratorBrand]] »).
 * 3. Set G.[[GeneratorBrand]] to empty.
 * 4. Perform GeneratorStart(G, FunctionBody).
 * 5. Return Completion Record { [[Type]]: return, [[Value]]: G, [[Target]]: empty }.
 */
export function* EvaluateGeneratorBody(
  this: OrdinaryFunction,
  $: VM,
  _thisArg: Val,
  argumentsList: Val[],
): ECR<Obj /*never*/> {
  const functionObject = this;
  const instantiation =
    yield* FunctionDeclarationInstantiation($, functionObject, argumentsList);
  if (IsAbrupt(instantiation)) return instantiation;
  const G = yield* OrdinaryCreateFromConstructor(
    $, functionObject, '%GeneratorFunction.prototype.prototype%', {
      GeneratorState: undefined,
      GeneratorContext: undefined,
      GeneratorBrand: EMPTY,
      InternalName: `${this.InternalName}()`, // for debugging
    });
  if (IsAbrupt(G)) return G;
  Assert(this.ECMAScriptCode.type === 'BlockStatement');
  GeneratorStart($, G, this.ECMAScriptCode /* FunctionBody */);
  return ReturnCompletion(G);
}

/**
 * 15.5.3 Runtime Semantics: InstantiateGeneratorFunctionObject
 * 
 * The syntax-directed operation InstantiateGeneratorFunctionObject
 * takes arguments env (an Environment Record) and privateEnv (a
 * PrivateEnvironment Record or null) and returns a function
 * object. It is defined piecewise over the following productions:
 * 
 * GeneratorDeclaration :
 *   function * BindingIdentifier ( FormalParameters ) { GeneratorBody }
 * 1. Let name be StringValue of BindingIdentifier.
 * 2. Let sourceText be the source text matched by GeneratorDeclaration.
 * 3. Let F be OrdinaryFunctionCreate(%GeneratorFunction.prototype%,
 *    sourceText, FormalParameters, GeneratorBody, non-lexical-this, env,
 *    privateEnv).
 * 4. Perform SetFunctionName(F, name).
 * 5. Let prototype be OrdinaryObjectCreate(%GeneratorFunction.prototype.prototype%).
 * 6. Perform ! DefinePropertyOrThrow(F, "prototype",
 *    PropertyDescriptor { [[Value]]: prototype, [[Writable]]: true,
 *    [[Enumerable]]: false, [[Configurable]]: false }).
 * 7. Return F.
 *
 * GeneratorDeclaration : function * ( FormalParameters ) { GeneratorBody }
 * 1. Let sourceText be the source text matched by GeneratorDeclaration.
 * 2. Let F be OrdinaryFunctionCreate(%GeneratorFunction.prototype%,
 *    sourceText, FormalParameters, GeneratorBody, non-lexical-this, env,
 *    privateEnv).
 * 3. Perform SetFunctionName(F, "default").
 * 4. Let prototype be OrdinaryObjectCreate(%GeneratorFunction.prototype.prototype%).
 * 5. Perform ! DefinePropertyOrThrow(F, "prototype",
 *    PropertyDescriptor { [[Value]]: prototype, [[Writable]]: true,
 *    [[Enumerable]]: false, [[Configurable]]: false }).
 * 6. Return F.
 *
 * NOTE: An anonymous GeneratorDeclaration can only occur as part of
 * an export default declaration, and its function code is therefore
 * always strict mode code.
 */
export function InstantiateGeneratorFunctionObject(
  $: VM,
  node: ESTree.FunctionDeclaration|ESTree.FunctionExpression,
  env: EnvironmentRecord,
  privateEnv: PrivateEnvironmentRecord|null,
): Func {
  const name = node.id?.name || 'default';
  const sourceText = GetSourceText(node);
  const F = OrdinaryFunctionCreate(
    $, $.getIntrinsic('%GeneratorFunction.prototype%'),
    sourceText, node.params, node.body,
    NON_LEXICAL_THIS, env, privateEnv);
  SetFunctionName(F, name);
  const prototype = OrdinaryObjectCreate(
    $.getIntrinsic('%GeneratorFunction.prototype.prototype%'));
  F.OwnProps.set('prototype', propW(prototype));
  F.EvaluateBody = EvaluateGeneratorBody;
  return F;
}

/**
 * 15.5.4 Runtime Semantics: InstantiateGeneratorFunctionExpression
 * 
 * The syntax-directed operation
 * InstantiateGeneratorFunctionExpression takes optional argument name
 * (a property key or a Private Name) and returns a function
 * object. It is defined piecewise over the following productions:
 * 
 * GeneratorExpression : function * ( FormalParameters ) { GeneratorBody }
 * 1. If name is not present, set name to "".
 * 2. Let env be the LexicalEnvironment of the running execution context.
 * 3. Let privateEnv be the running execution context's PrivateEnvironment.
 * 4. Let sourceText be the source text matched by GeneratorExpression.
 * 5. Let closure be
 *    OrdinaryFunctionCreate(%GeneratorFunction.prototype%, sourceText,
 *    FormalParameters, GeneratorBody, non-lexical-this, env,
 *    privateEnv).
 * 6. Perform SetFunctionName(closure, name).
 * 7. Let prototype be OrdinaryObjectCreate(%GeneratorFunction.prototype.prototype%).
 * 8. Perform ! DefinePropertyOrThrow(closure, "prototype",
 *    PropertyDescriptor { [[Value]]: prototype, [[Writable]]: true,
 *    [[Enumerable]]: false, [[Configurable]]: false }).
 * 9. Return closure.
 *
 * GeneratorExpression : function * BindingIdentifier ( FormalParameters ) { GeneratorBody }
 * 1. Assert: name is not present.
 * 2. Set name to StringValue of BindingIdentifier.
 * 3. Let outerEnv be the running execution context\'s LexicalEnvironment.
 * 4. Let funcEnv be NewDeclarativeEnvironment(outerEnv).
 * 5. Perform ! funcEnv.CreateImmutableBinding(name, false).
 * 6. Let privateEnv be the running execution context's PrivateEnvironment.
 * 7. Let sourceText be the source text matched by GeneratorExpression.
 * 8. Let closure be
 *    OrdinaryFunctionCreate(%GeneratorFunction.prototype%, sourceText,
 *    FormalParameters, GeneratorBody, non-lexical-this, funcEnv,
 *    privateEnv).
 * 9. Perform SetFunctionName(closure, name).
 * 10. Let prototype be OrdinaryObjectCreate(%GeneratorFunction.prototype.prototype%).
 * 11. Perform ! DefinePropertyOrThrow(closure, "prototype",
 *     PropertyDescriptor { [[Value]]: prototype, [[Writable]]: true,
 *     [[Enumerable]]: false, [[Configurable]]: false }).
 * 12. Perform ! funcEnv.InitializeBinding(name, closure).
 * 13. Return closure.
 * 
 * NOTE: The BindingIdentifier in a GeneratorExpression can be
 * referenced from inside the GeneratorExpression's FunctionBody to
 * allow the generator code to call itself recursively. However,
 * unlike in a GeneratorDeclaration, the BindingIdentifier in a
 * GeneratorExpression cannot be referenced from and does not affect
 * the scope enclosing the GeneratorExpression.
 */
export function InstantiateGeneratorFunctionExpression(
  $: VM,
  node: ESTree.FunctionExpression,
  name?: PropertyKey|PrivateName,
): Func {
  const sourceText = GetSourceText(node);
  const privateEnv = $.getRunningContext().PrivateEnvironment!;
  
  let env: EnvironmentRecord;
  if (node.id == null) {
    // GeneratorExpression : function * ( FormalParameters ) { GeneratorBody }
    if (name == null) name = '';
    env = $.getRunningContext().LexicalEnvironment!;
  } else {
    // GeneratorExpression : function * BindingIdentifier ( FormalParameters ) { GeneratorBody }
    Assert(name == null);
    name = node.id.name;
    const outerEnv = $.getRunningContext().LexicalEnvironment!;
    const funcEnv = new DeclarativeEnvironmentRecord(outerEnv);
    CastNotAbrupt(funcEnv.CreateImmutableBinding($, name, false));
    env = funcEnv;
  }

  const closure = OrdinaryFunctionCreate(
    $,
    $.getIntrinsic('%GeneratorFunction.prototype%'),
    sourceText,
    node.params,
    node.body,
    NON_LEXICAL_THIS,
    env,
    privateEnv,
  );
  SetFunctionName(closure, name);
  const prototype = OrdinaryObjectCreate(
    $.getIntrinsic('%GeneratorFunction.prototype.prototype%'));
  closure.OwnProps.set('prototype', propW(prototype));
  if (node.id != null) {
    // NOTE: we've already checked that the name is declarable in this scope
    // and should have given an early error - therefore, we shouldn't be
    // running into any setters that might need to execute.
    Assert(typeof name === 'string');
    CastNotAbrupt(runImmediate(env.InitializeBinding($, name, closure)));
  }
  closure.EvaluateBody = EvaluateGeneratorBody;
  return closure;
}

function CreateIntrinsics(realm: RealmRecord) {
  /**
   * 27.3.1 The GeneratorFunction Constructor
   * 
   * The GeneratorFunction constructor:
   * 
   *   - is %GeneratorFunction%.
   *   - is a subclass of Function.
   *   - creates and initializes a new GeneratorFunction when called as a
   *     function rather than as a constructor. Thus the function call
   *     GeneratorFunction (…) is equivalent to the object creation
   *     expression new GeneratorFunction (…) with the same arguments.
   *   - may be used as the value of an extends clause of a class
   *     definition. Subclass constructors that intend to inherit the
   *     specified GeneratorFunction behaviour must include a super call
   *     to the GeneratorFunction constructor to create and initialize
   *     subclass instances with the internal slots necessary for
   *     built-in GeneratorFunction behaviour. All ECMAScript syntactic
   *     forms for defining generator function objects create direct
   *     instances of GeneratorFunction. There is no syntactic means to
   *     create instances of GeneratorFunction subclasses.
   * 
   * ---
   * 
   * 27.3.1.1 GeneratorFunction ( ...parameterArgs, bodyArg )
   * 
   * The last argument (if any) specifies the body (executable code) of
   * a generator function; any preceding arguments specify formal
   * parameters.
   * 
   * This function performs the following steps when called:
   * 
   * 1. Let C be the active function object.
   * 2. If bodyArg is not present, set bodyArg to the empty String.
   * 3. Return ? CreateDynamicFunction(C, NewTarget, generator, parameterArgs, bodyArg).
   * 
   * NOTE: See NOTE for 20.2.1.1.
   * 
   * ---
   * 
   * 27.3.2 Properties of the GeneratorFunction Constructor
   * 
   * The GeneratorFunction constructor:
   * 
   *   - is a standard built-in function object that inherits from
   *     the Function constructor.
   *   - has a [[Prototype]] internal slot whose value is %Function%.
   *   - has a "name" property whose value is "GeneratorFunction".
   *   - has the following properties:
   */
  const generatorFunction = CreateBuiltinFunction(
    callOrConstruct(($, NewTarget, ...args) => {
      const bodyArg = args.pop() || '';
      const parameterArgs = args;
      const C = $.getActiveFunctionObject();
      return CreateDynamicFunction($, C, NewTarget, 'generator', parameterArgs, bodyArg);
    }), 1, 'GeneratorFunction', realm, realm.Intrinsics.get('%Function%')!);
  realm.Intrinsics.set('%GeneratorFunction%', generatorFunction);

  /**
   * 27.3.3 Properties of the GeneratorFunction Prototype Object
   * 
   * The GeneratorFunction prototype object:
   *   - is %GeneratorFunction.prototype% (see Figure 6).
   *   - is an ordinary object.
   *   - is not a function object and does not have an [[ECMAScriptCode]]
   *     internal slot or any other of the internal slots listed in
   *     Table 30 or Table 82.
   *   - has a [[Prototype]] internal slot whose value is %Function.prototype%.
   */
  const generatorFunctionPrototype = OrdinaryObjectCreate({
    Prototype: realm.Intrinsics.get('%Function.prototype%')!,
  }, {
    /**
     * 27.3.3.1 GeneratorFunction.prototype.constructor
     * 
     * The initial value of GeneratorFunction.prototype.constructor is
     * %GeneratorFunction%.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    'constructor': propC(generatorFunction),

    /**
     * 27.3.3.3 GeneratorFunction.prototype [ @@toStringTag ]
     * 
     * The initial value of the @@toStringTag property is the String value
     * "GeneratorFunction".
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    [Symbol.toStringTag]: propC('GeneratorFunction'),
  });
  realm.Intrinsics.set('%GeneratorFunction.prototype%', generatorFunctionPrototype);

  /**
   * 27.5.1 Properties of the Generator Prototype Object
   * 
   * The Generator prototype object:
   * 
   *   - is %GeneratorFunction.prototype.prototype%.
   *   - is an ordinary object.
   *   - is not a Generator instance and does not have a
   *     [[GeneratorState]] internal slot.
   *   - has a [[Prototype]] internal slot whose value is %IteratorPrototype%.
   *   - has properties that are indirectly inherited by all Generator instances.
   */
  const generatorFunctionPrototypePrototype = OrdinaryObjectCreate({
    Prototype: realm.Intrinsics.get('%IteratorPrototype%')!,
  }, {
    /**
     * 27.5.1.1 Generator.prototype.constructor
     * 
     * The initial value of Generator.prototype.constructor is
     * %GeneratorFunction.prototype%.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    'constructor': propC(generatorFunctionPrototype),
  });
  realm.Intrinsics.set('%GeneratorFunction.prototype.prototype%',
                       generatorFunctionPrototypePrototype);

  defineProperties(realm, generatorFunctionPrototypePrototype, {
    /**
     * 27.5.1.2 Generator.prototype.next ( value )
     * 
     * 1. Return ? GeneratorResume(this value, value, empty).
     */
    'next': methodO(($, thisValue, value) =>
      GeneratorResume($, thisValue, value, EMPTY)),

    /**
     * 27.5.1.3 Generator.prototype.return ( value )
     * 
     * This method performs the following steps when called:
     * 
     * 1. Let g be the this value.
     * 2. Let C be Completion Record { [[Type]]: return, [[Value]]: value,
     *    [[Target]]: empty }.
     * 3. Return ? GeneratorResumeAbrupt(g, C, empty).
     */
    'return': methodO(($, thisValue, value) =>
      GeneratorResumeAbrupt($, thisValue, ReturnCompletion(value), EMPTY)),

    /**
     * 27.5.1.4 Generator.prototype.throw ( exception )
     * 
     * This method performs the following steps when called:
     * 
     * 1. Let g be the this value.
     * 2. Let C be ThrowCompletion(exception).
     * 3. Return ? GeneratorResumeAbrupt(g, C, empty).
     */
    'throw': methodO(($, thisValue, exception) =>
      GeneratorResumeAbrupt($, thisValue, ThrowCompletion(exception), EMPTY)),

    /**
     * 27.5.1.5 Generator.prototype [ @@toStringTag ]
     * 
     * The initial value of the @@toStringTag property is the String value "Generator".
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    [Symbol.toStringTag]: propC('Generator'),
  });

  /**
   * 27.3.2.2 GeneratorFunction.prototype
   * 
   * The initial value of GeneratorFunction.prototype is the
   * GeneratorFunction prototype object.
   * 
   * This property has the attributes { [[Writable]]: false,
   * [[Enumerable]]: false, [[Configurable]]: false }.
   */
  defineProperties(realm, generatorFunction, {
    'prototype': prop0(generatorFunctionPrototype),
  });

  /**
   * 27.3.3.2 GeneratorFunction.prototype.prototype
   * 
   * The initial value of GeneratorFunction.prototype.prototype is the
   * Generator prototype object.
   * 
   * This property has the attributes { [[Writable]]: false,
   * [[Enumerable]]: false, [[Configurable]]: true }.
   */
  defineProperties(realm, generatorFunctionPrototype, {
    'prototype': propC(generatorFunctionPrototypePrototype),
  });
}

/**
 * 27.3.4 GeneratorFunction Instances
 * 
 * 27.3.4.3 prototype
 * 
 * Whenever a GeneratorFunction instance is created another ordinary
 * object is also created and is the initial value of the generator
 * function's "prototype" property. The value of the prototype
 * property is used to initialize the [[Prototype]] internal slot of a
 * newly created Generator when the generator function object is
 * invoked using [[Call]].
 * 
 * This property has the attributes { [[Writable]]: true,
 * [[Enumerable]]: false, [[Configurable]]: false }.
 * 
 * NOTE: Unlike Function instances, the object that is the value of a
 * GeneratorFunction's "prototype" property does not have a
 * "constructor" property whose value is the GeneratorFunction
 * instance.
 */




// 27.5.3 Generator Abstract Operations

/** 
 * 27.5.3.1 GeneratorStart ( generator, generatorBody )
 * 
 * The abstract operation GeneratorStart takes arguments generator (a
 * Generator) and generatorBody (a FunctionBody Parse Node or an
 * Abstract Closure with no parameters) and returns unused. It
 * performs the following steps when called:
 * 
 * 1. Assert: The value of generator.[[GeneratorState]] is undefined.
 * 2. Let genContext be the running execution context.
 * 3. Set the Generator component of genContext to generator.
 * 4. Let closure be a new Abstract Closure with no parameters that
 *    captures generatorBody and performs the following steps when
 *    called:
 *     a. Let acGenContext be the running execution context.
 *     b. Let acGenerator be the Generator component of acGenContext.
 *     c. If generatorBody is a Parse Node, then
 *         i. Let result be Completion(Evaluation of generatorBody).
 *     d. Else,
 *         i. Assert: generatorBody is an Abstract Closure with no parameters.
 *         ii. Let result be generatorBody().
 *     e. Assert: If we return here, the generator either threw an
 *        exception or performed either an implicit or explicit return.
 *     f. Remove acGenContext from the execution context stack and
 *        restore the execution context that is at the top of the
 *        execution context stack as the running execution context.
 *     g. Set acGenerator.[[GeneratorState]] to completed.
 *     h. NOTE: Once a generator enters the completed state it never
 *        leaves it and its associated execution context is never
 *        resumed. Any execution state associated with acGenerator can be
 *        discarded at this point.
 *     i. If result.[[Type]] is normal, let resultValue be undefined.
 *     j. Else if result.[[Type]] is return, let resultValue be result.[[Value]].
 *     k. Else,
 *         i. Assert: result.[[Type]] is throw.
 *         ii. Return ? result.
 *     l. Return CreateIterResultObject(resultValue, true).
 * 5. Set the code evaluation state of genContext such that when
 *    evaluation is resumed for that execution context, closure will be
 *    called with no arguments.
 * 6. Set generator.[[GeneratorContext]] to genContext.
 * 7. Set generator.[[GeneratorState]] to suspendedStart.
 * 8. Return unused.
 */
export function GeneratorStart(
  $: VM,
  generator: Obj,
  generatorBody: ESTree.BlockStatement|(() => ECR<Val>),
): UNUSED {
  Assert(generator.GeneratorState === undefined);
  const genContext = $.getRunningContext();
  genContext.Generator = generator;
  function* closure(): ECR<Val> {
    const acGenContext = $.getRunningContext();
    const acGenerator = acGenContext.Generator!;
    const result = yield* (
      typeof generatorBody === 'object' ?
        $.evaluateValue(generatorBody) :
        generatorBody());
    // NOTE: If we return here, the generator either threw an exception
    // or performed either an implicit or explicit return.
    $.popContext(acGenContext);
    acGenerator.GeneratorState = GeneratorState.completed;
    // NOTE: Once a generator enters the completed state it never leaves
    // it and its associated execution context is never resumed. Any
    // execution state associated with acGenerator can be discarded at
    // this point.
    if (IsThrowCompletion(result)) return result;
    const resultValue = IsReturnCompletion(result) ? result.Value : undefined;
    return CreateIterResultObject($, resultValue, true);
  };
  genContext.CodeEvaluationState = closure();
  generator.GeneratorContext = genContext;
  generator.GeneratorState = GeneratorState.suspendedStart;
  return UNUSED;
}

/**
 * 27.5.3.2 GeneratorValidate ( generator, generatorBrand )
 * 
 * The abstract operation GeneratorValidate takes arguments generator
 * (an ECMAScript language value) and generatorBrand (a String or
 * empty) and returns either a normal completion containing one of
 * suspendedStart, suspendedYield, or completed, or a throw
 * completion. It performs the following steps when called:
 * 
 * 1. Perform ? RequireInternalSlot(generator, [[GeneratorState]]).
 * 2. Perform ? RequireInternalSlot(generator, [[GeneratorBrand]]).
 * 3. If generator.[[GeneratorBrand]] is not generatorBrand, throw a
 *    TypeError exception.
 * 4. Assert: generator also has a [[GeneratorContext]] internal slot.
 * 5. Let state be generator.[[GeneratorState]].
 * 6. If state is executing, throw a TypeError exception.
 * 7. Return state.
 */
export function GeneratorValidate(
  $: VM,
  generator: Obj,
  generatorBrand: string|EMPTY,
): CR<GeneratorState> {
  // TODO - RequireInternalSlot ???
  if (generator.GeneratorBrand !== generatorBrand) {
    return $.throw('TypeError', `bad brand: got ${generator.GeneratorBrand}, expected ${generatorBrand}`);
  }
  const state = generator.GeneratorState;
  if (state === GeneratorState.executing) return $.throw('TypeError', 'already executing');
  Assert(state);
  return state;
}

/**
 * 27.5.3.3 GeneratorResume ( generator, value, generatorBrand )
 * 
 * The abstract operation GeneratorResume takes arguments generator
 * (an ECMAScript language value), value (an ECMAScript language value
 * or empty), and generatorBrand (a String or empty) and returns
 * either a normal completion containing an ECMAScript language value
 * or a throw completion. It performs the following steps when called:
 * 
 * 1. Let state be ? GeneratorValidate(generator, generatorBrand).
 * 2. If state is completed, return CreateIterResultObject(undefined, true).
 * 3. Assert: state is either suspendedStart or suspendedYield.
 * 4. Let genContext be generator.[[GeneratorContext]].
 * 5. Let methodContext be the running execution context.
 * 6. Suspend methodContext.
 * 7. Set generator.[[GeneratorState]] to executing.
 * 8. Push genContext onto the execution context stack; genContext is
 *    now the running execution context.
 * 9. Resume the suspended evaluation of genContext using
 *    NormalCompletion(value) as the result of the operation that
 *    suspended it. Let result be the value returned by the resumed
 *    computation.
 * 10. Assert: When we return here, genContext has already been
 *     removed from the execution context stack and methodContext is the
 *     currently running execution context.
 * 11. Return ? result.
 */
export function* GeneratorResume(
  $: VM,
  generator: Obj,
  value: Val,
  generatorBrand: string|EMPTY,
): ECR<Val> {
  const state = GeneratorValidate($, generator, generatorBrand);
  if (IsAbrupt(state)) return state;
  if (state === GeneratorState.completed) return CreateIterResultObject($, undefined, true);
  Assert(state === GeneratorState.suspendedStart || state === GeneratorState.suspendedYield);
  const genContext = generator.GeneratorContext!;
  const methodContext = $.getRunningContext();
  methodContext.suspend(); // $.popContext(methodContext);
  generator.GeneratorState = GeneratorState.executing;
  $.enterContext(genContext);

  // right here is where we probably want to be stepping through and looking
  // for suspension?  while ($.getRunningContext() === genContext) { result = iter.next(); if (result.done) break; yield iter.value; } or some such...?
  //  - NOTE: we could also end up with a NESTED context running... so really it's a question
  //    of whether genContext has been removed or just covered...?
  //     - maybe a special yield value is just as well???

  const iter = genContext.CodeEvaluationState;
  Assert(iter);
  // yield; // ???
  let iterResult = iter.next(value);
  while (!iterResult.done && !iterResult.value) {
    yield;
    iterResult = iter.next();
  }
  const result = iterResult.done ? iterResult.value : iterResult.value!.yield;

  // const result = yield* $.resume(value);
  // Assert: genContext has been removed already
  Assert(generator.GeneratorState !== GeneratorState.executing);
  Assert($.getRunningContext() == methodContext);
  return result;
}

/**
 * 27.5.3.4 GeneratorResumeAbrupt ( generator, abruptCompletion, generatorBrand )
 * 
 * The abstract operation GeneratorResumeAbrupt takes arguments
 * generator (an ECMAScript language value), abruptCompletion (a
 * return completion or a throw completion), and generatorBrand (a
 * String or empty) and returns either a normal completion containing
 * an ECMAScript language value or a throw completion. It performs the
 * following steps when called:
 * 
 * 1. Let state be ? GeneratorValidate(generator, generatorBrand).
 * 2. If state is suspendedStart, then
 *     a. Set generator.[[GeneratorState]] to completed.
 *     b. NOTE: Once a generator enters the completed state it never
 *        leaves it and its associated execution context is never
 *        resumed. Any execution state associated with generator can be
 *        discarded at this point.
 *     c. Set state to completed.
 * 3. If state is completed, then
 *     a. If abruptCompletion.[[Type]] is return, then
 *         i. Return CreateIterResultObject(abruptCompletion.[[Value]], true).
 *     b. Return ? abruptCompletion.
 * 4. Assert: state is suspendedYield.
 * 5. Let genContext be generator.[[GeneratorContext]].
 * 6. Let methodContext be the running execution context.
 * 7. Suspend methodContext.
 * 8. Set generator.[[GeneratorState]] to executing.
 * 9. Push genContext onto the execution context stack; genContext is
 *    now the running execution context.
 * 10. Resume the suspended evaluation of genContext using
 *     abruptCompletion as the result of the operation that suspended
 *     it. Let result be the Completion Record returned by the resumed
 *     computation.
 * 11. Assert: When we return here, genContext has already been
 *     removed from the execution context stack and methodContext is the
 *     currently running execution context.
 * 12. Return ? result.
 */
export function* GeneratorResumeAbrupt(
  $: VM,
  generator: Obj,
  abruptCompletion: Abrupt,
  generatorBrand: string|EMPTY,
): ECR<Val> {
  let state = GeneratorValidate($, generator, generatorBrand);
  if (IsAbrupt(state)) return state;
  if (state === GeneratorState.suspendedStart) {
    // NOTE: Once a generator enters the completed state it never leaves
    // it and its associated execution context is never resumed. Any
    // execution state associated with generator can be discarded at this
    // point.
    state = generator.GeneratorState = GeneratorState.completed;
  }
  if (state === GeneratorState.completed) {
    if (IsReturnCompletion(abruptCompletion)) {
      return CreateIterResultObject($, abruptCompletion.Value, true);
    }
    return abruptCompletion;
  }
  Assert(state === GeneratorState.suspendedYield);
  const genContext = generator.GeneratorContext!;
  const methodContext = $.getRunningContext();
  methodContext.suspend();
  generator.GeneratorState = GeneratorState.executing;
  $.enterContext(genContext);

  const iter = genContext.CodeEvaluationState;
  Assert(iter);
  // yield; // ???
  let iterResult = iter.next(abruptCompletion);
  while (!iterResult.done && !iterResult.value) {
    // yield;
    iterResult = iter.next();
  }
  const result = iterResult.done ? iterResult.value : iterResult.value!.yield;
  
  //const result = yield* $.resume(abruptCompletion);
  // Assert: genContext has been removed already
  Assert($.getRunningContext() == methodContext);
  return result;
}

/**
 * 27.5.3.5 GetGeneratorKind ( )
 * 
 * The abstract operation GetGeneratorKind takes no arguments and
 * returns non-generator, sync, or async. It performs the following
 * steps when called:
 * 
 * 1. Let genContext be the running execution context.
 * 2. If genContext does not have a Generator component, return non-generator.
 * 3. Let generator be the Generator component of genContext.
 * 4. If generator has an [[AsyncGeneratorState]] internal slot, return async.
 * 5. Else, return sync.
 */
export function GetGeneratorKind($: VM): false|SYNC|ASYNC {
  const genContext = $.getRunningContext();
  if (genContext.Generator == null) return false;
  const generator = genContext.Generator;
  if (generator.AsyncGeneratorState != null) return ASYNC;
  return SYNC;
}

/**
 * 27.5.3.6 GeneratorYield ( iterNextObj )
 * 
 * The abstract operation GeneratorYield takes argument iterNextObj
 * (an Object that conforms to the IteratorResult interface) and
 * returns either a normal completion containing an ECMAScript
 * language value or an abrupt completion. It performs the following
 * steps when called:
 * 
 * 1. Let genContext be the running execution context.
 * 2. Assert: genContext is the execution context of a generator.
 * 3. Let generator be the value of the Generator component of genContext.
 * 4. Assert: GetGeneratorKind() is sync.
 * 5. Set generator.[[GeneratorState]] to suspendedYield.
 * 6. Remove genContext from the execution context stack and restore
 *    the execution context that is at the top of the execution context
 *    stack as the running execution context.
 * 7. Let callerContext be the running execution context.
 * 8. Resume callerContext passing NormalCompletion(iterNextObj). If
 *    genContext is ever resumed again, let resumptionValue be the
 *    Completion Record with which it is resumed.
 * 9. Assert: If control reaches here, then genContext is the running
 *    execution context again.
 * 10. Return resumptionValue.
 */
export function* GeneratorYield(
  $: VM,
  iterNextObj: Obj,
): ECR<Val> {
  const genContext = $.getRunningContext();
  const generator = genContext.Generator;
  Assert(generator);
  Assert(GetGeneratorKind($) === SYNC);
  generator.GeneratorState = GeneratorState.suspendedYield;
  $.popContext(genContext);
  const callerContext = $.getRunningContext();
  const {} = {callerContext}; // unused???
  // If genContext is ever resumed again, let resumptionValue be the
  // Completion Record with which it is resumed.

  const resumptionValue = yield {yield: iterNextObj};

  // Assert: If control reaches here, then genContext is the running
  // execution context again.
  Assert($.getRunningContext() === genContext);
  return resumptionValue;
}

/**
 * 27.5.3.7 Yield ( value )
 * 
 * The abstract operation Yield takes argument value (an ECMAScript
 * language value) and returns either a normal completion containing
 * an ECMAScript language value or an abrupt completion. It performs
 * the following steps when called:
 * 
 * 1. Let generatorKind be GetGeneratorKind().
 * 2. If generatorKind is async, return ? AsyncGeneratorYield(? Await(value)).
 * 3. Otherwise, return ? GeneratorYield(CreateIterResultObject(value, false)).
 */
export function* Yield(
  $: VM,
  value: Val,
): ECR<Val> {
  const generatorKind = GetGeneratorKind($);
  if (generatorKind === ASYNC) {
    const awaited = yield* Await($, value);
    if (IsAbrupt(awaited)) return awaited;
    return yield* AsyncGeneratorYield($, awaited);
  }
  return yield* GeneratorYield($, CreateIterResultObject($, value, false));
}

/**
 * 27.5.3.8 CreateIteratorFromClosure ( closure, generatorBrand, generatorPrototype )
 * 
 * The abstract operation CreateIteratorFromClosure takes arguments
 * closure (an Abstract Closure with no parameters), generatorBrand (a
 * String or empty), and generatorPrototype (an Object) and returns a
 * Generator. It performs the following steps when called:
 * 
 * 1. NOTE: closure can contain uses of the Yield operation to yield
 *    an IteratorResult object.
 * 2. Let internalSlotsList be « [[GeneratorState]],
 *    [[GeneratorContext]], [[GeneratorBrand]] ».
 * 3. Let generator be OrdinaryObjectCreate(generatorPrototype, internalSlotsList).
 * 4. Set generator.[[GeneratorBrand]] to generatorBrand.
 * 5. Set generator.[[GeneratorState]] to undefined.
 * 6. Let callerContext be the running execution context.
 * 7. Let calleeContext be a new execution context.
 * 8. Set the Function of calleeContext to null.
 * 9. Set the Realm of calleeContext to the current Realm Record.
 * 10. Set the ScriptOrModule of calleeContext to callerContext's ScriptOrModule.
 * 11. If callerContext is not already suspended, suspend callerContext.
 * 12. Push calleeContext onto the execution context stack;
 *     calleeContext is now the running execution context.
 * 13. Perform GeneratorStart(generator, closure).
 * 14. Remove calleeContext from the execution context stack and
 *     restore callerContext as the running execution context.
 * 15. Return generator.
 */
export function CreateIteratorFromClosure(
  $: VM,
  closure: () => ECR<Val>,
  generatorBrand: string|EMPTY,
  generatorPrototype: Obj,
): Obj {
  const generator = OrdinaryObjectCreate({
    Prototype: generatorPrototype,
    GeneratorState: undefined,
    GeneratorContext: undefined,
    GeneratorBrand: generatorBrand,
  });
  const callerContext = $.getRunningContext();
  const calleeContext = new CodeExecutionContext(
    callerContext.ScriptOrModule,
    null,
    $.getRealm()!,
    null,
    null!, null!); // ??? - TODO - what are the envs? make a new EC subclass?
  callerContext.suspend();
  $.enterContext(calleeContext);
  GeneratorStart($, generator, closure);
  $.popContext(calleeContext);
  return generator;
}

/**
 * 15.5.5 Runtime Semantics: Evaluation
 * YieldExpression : yield * AssignmentExpression
 * 1. Let generatorKind be GetGeneratorKind().
 * 2. Let exprRef be ? Evaluation of AssignmentExpression.
 * 3. Let value be ? GetValue(exprRef).
 * 4. Let iteratorRecord be ? GetIterator(value, generatorKind).
 * 5. Let iterator be iteratorRecord.[[Iterator]].
 * 6. Let received be NormalCompletion(undefined).
 * 7. Repeat,
 *     a. If received.[[Type]] is normal, then
 *         i. Let innerResult be ? Call(iteratorRecord.[[NextMethod]],
 *            iteratorRecord.[[Iterator]], « received.[[Value]] »).
 *         ii. If generatorKind is async, set innerResult to ? Await(innerResult).
 *         iii. If innerResult is not an Object, throw a TypeError exception.
 *         iv. Let done be ? IteratorComplete(innerResult).
 *         v. If done is true, then
 *             1. Return ? IteratorValue(innerResult).
 *         vi. If generatorKind is async, set received to
 *             Completion(AsyncGeneratorYield(? IteratorValue(innerResult))).
 *         vii. Else, set received to Completion(GeneratorYield(innerResult)).
 *     b. Else if received.[[Type]] is throw, then
 *         i. Let throw be ? GetMethod(iterator, "throw").
 *         ii. If throw is not undefined, then
 *             1. Let innerResult be ? Call(throw, iterator, « received.[[Value]] »).
 *             2. If generatorKind is async, set innerResult to ? Await(innerResult).
 *             3. NOTE: Exceptions from the inner iterator
 *                throw method are propagated. Normal
 *                completions from an inner throw method are
 *                processed similarly to an inner next.
 *             4. If innerResult is not an Object, throw a TypeError exception.
 *             5. Let done be ? IteratorComplete(innerResult).
 *             6. If done is true, then
 *                 a. Return ? IteratorValue(innerResult).
 *             7. If generatorKind is async, set received to
 *                Completion(AsyncGeneratorYield(? IteratorValue(innerResult))).
 *             8. Else, set received to Completion(GeneratorYield(innerResult)).
 *         iii. Else,
 *             1. NOTE: If iterator does not have a throw
 *                method, this throw is going to terminate the
 *                yield* loop. But first we need to give
 *                iterator a chance to clean up.
 *             2. Let closeCompletion be Completion Record {
 *                [[Type]]: normal, [[Value]]: empty,
 *                [[Target]]: empty }.
 *             3. If generatorKind is async, perform
 *                ? AsyncIteratorClose(iteratorRecord, closeCompletion).
 *             4. Else, perform ? IteratorClose(iteratorRecord, closeCompletion).
 *             5. NOTE: The next step throws a TypeError to
 *                indicate that there was a yield* protocol
 *                violation: iterator does not have a throw
 *                method.
 *             6. Throw a TypeError exception.
 *     c. Else,
 *         i. Assert: received.[[Type]] is return.
 *         ii. Let return be ? GetMethod(iterator, "return").
 *         iii. If return is undefined, then
 *             1. Let value be received.[[Value]].
 *             2. If generatorKind is async, then
 *                 a. Set value to ? Await(value).
 *             3. Return Completion Record { [[Type]]:
 *                return, [[Value]]: value, [[Target]]: empty }.
 *         iv. Let innerReturnResult be ? Call(return,
 *             iterator, « received.[[Value]] »).
 *         v. If generatorKind is async, set
 *            innerReturnResult to ? Await(innerReturnResult).
 *         vi. If innerReturnResult is not an Object, throw a TypeError exception.
 *         vii. Let done be ? IteratorComplete(innerReturnResult).
 *         viii. If done is true, then
 *             1. Let value be ? IteratorValue(innerReturnResult).
 *             2. Return Completion Record { [[Type]]:
 *                return, [[Value]]: value, [[Target]]: empty }.
 *         ix. If generatorKind is async, set received to
 *             Completion(AsyncGeneratorYield(? IteratorValue(innerReturnResult))).
 *         x. Else, set received to Completion(GeneratorYield(innerReturnResult)).
 */
export function* Evaluation_YieldDelegateExpression($: VM, n: ESTree.YieldExpression): ECR<Val> {
  Assert(n.argument);
  const generatorKind = GetGeneratorKind($);
  Assert(generatorKind !== false);
  const value = yield* $.evaluateValue(n.argument);
  if (IsAbrupt(value)) return value;
  const iteratorRecord = yield* GetIterator($, value, generatorKind);
  if (IsAbrupt(iteratorRecord)) return iteratorRecord;
  const iterator = iteratorRecord.Iterator;
  let received: CR<Val> = undefined;
  while (true) {
    if (!IsAbrupt(received)) {
      let innerResult: CR<Val> = yield* Call($, iteratorRecord.NextMethod, iterator, [received]);
      if (IsAbrupt(innerResult)) return innerResult;
      if (generatorKind === ASYNC) {
        innerResult = yield* Await($, innerResult);
        if (IsAbrupt(innerResult)) return innerResult;
      }
      if (!(innerResult instanceof Obj)) return $.throw('TypeError', 'not an object');
      const done = yield* IteratorComplete($, innerResult);
      if (IsAbrupt(done)) return done;
      if (done) return yield* IteratorValue($, innerResult);
      if (generatorKind === ASYNC) {
        const innerResultValue: CR<Val> = yield* IteratorValue($, innerResult);
        if (IsAbrupt(innerResultValue)) return innerResultValue;
        received = yield* AsyncGeneratorYield($, innerResultValue);
      } else {
        received = yield* GeneratorYield($, innerResult);
      }
    } else if (IsThrowCompletion(received)) {
      const throwMethod = yield* GetMethod($, iterator, 'throw');
      if (IsAbrupt(throwMethod)) return throwMethod;
      if (throwMethod != null) {
        let innerResult = yield* Call($, throwMethod, iterator, [received.Value]);
        if (IsAbrupt(innerResult)) return innerResult;
        if (generatorKind === ASYNC) innerResult = yield* Await($, innerResult);
        // NOTE: Exceptions from the inner iterator throw method are
        // propagated. Normal completions from an inner throw method are
        // processed similarly to an inner next.
        if (!(innerResult instanceof Obj)) return $.throw('TypeError', 'not an object');
        const done = yield* IteratorComplete($, innerResult);
        if (IsAbrupt(done)) return done;
        if (done) return yield* IteratorValue($, innerResult);
        if (generatorKind === ASYNC) {
          const innerValue = yield* IteratorValue($, innerResult);
          if (IsAbrupt(innerValue)) return innerValue;
          received = yield* AsyncGeneratorYield($, innerValue);
        } else {
          received = yield* GeneratorYield($, innerResult);
        }
      } else {
        // NOTE: If iterator does not have a throw method, this throw
        // is going to terminate the yield* loop. But first we need to
        // give iterator a chance to clean up.
        const closeStatus = generatorKind === ASYNC ?
          yield* AsyncIteratorClose($, iteratorRecord, EMPTY) :
          yield* IteratorClose($, iteratorRecord, EMPTY);
        if (IsAbrupt(closeStatus)) return closeStatus;
        // NOTE: The next step throws a TypeError to indicate that
        // there was a yield* protocol violation: iterator does not
        // have a throw method.
        return $.throw('TypeError', 'no throw method');
      }
    } else {
      Assert(IsReturnCompletion(received)); // i
      const returnMethod = yield* GetMethod($, iterator, 'return'); // ii
      if (IsAbrupt(returnMethod)) return returnMethod;
      if (returnMethod === undefined) { // iii
        return ReturnCompletion( // 1-3
          generatorKind === ASYNC ? yield* Await($, received.Value) : received.Value);
      }
      let innerReturnResult = yield* Call($, returnMethod, iterator, [received.Value]); // iv
      if (IsAbrupt(innerReturnResult)) return innerReturnResult;
      if (ASYNC.is(generatorKind)) {
        innerReturnResult = yield* Await($, innerReturnResult); // v
        if (IsAbrupt(innerReturnResult)) return innerReturnResult;
      }
      if (!(innerReturnResult instanceof Obj)) return $.throw('TypeError', 'not an object'); // vi
      const done = yield* IteratorComplete($, innerReturnResult); // vii
      if (IsAbrupt(done)) return done;
      if (done) { // viii
        const value = yield* IteratorValue($, innerReturnResult); // 1
        if (IsAbrupt(value)) return value;
        return ReturnCompletion(value); // 2
      }
      if (ASYNC.is(generatorKind)) { // ix
        const value = yield* IteratorValue($, innerReturnResult);
        if (IsAbrupt(value)) return value;
        received = yield* AsyncGeneratorYield($, value);
      } else {
        received = yield* GeneratorYield($, innerReturnResult); // x
      }
      // Loop uses recevived
    }
  }
}

/**
 * 15.5.5 Runtime Semantics: Evaluation
 * 
 * YieldExpression : yield
 * 1. Return ? Yield(undefined).
 * 
 * YieldExpression : yield AssignmentExpression
 * 1. Let exprRef be ? Evaluation of AssignmentExpression.
 * 2. Let value be ? GetValue(exprRef).
 * 3. Return ? Yield(value).
 */
export function* Evaluation_YieldExpression($: VM, n: ESTree.YieldExpression): ECR<Val> {
  const value = n.argument == null ? undefined : yield* $.evaluateValue(n.argument);
  if (IsAbrupt(value)) return value;
  return yield* Yield($, value);
}

/** 
 * TODO - generate an evironment?!?
 * GeneratorExpression
 *    : function * BindingIdentifieropt ( FormalParameters ) { GeneratorBody }
 * 1. Return InstantiateGeneratorFunctionExpression of GeneratorExpression.
 */
