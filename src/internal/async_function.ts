import * as ESTree from 'estree';
import { CreateBuiltinFunction, CreateBuiltinFunctionFromClosure, Func, FunctionDeclarationInstantiation, InstantiateOrdinaryFunctionExpression, OrdinaryFunction, OrdinaryFunctionCreate, SetFunctionName, callOrConstruct, functions } from './func';
import { prop0, propC } from './property_descriptor';
import { Await, ECR, Plugin, VM, mapJust, when } from './vm';
import { EMPTY, NON_LEXICAL_THIS, UNUSED } from './enums';
import { CR, CastNotAbrupt, IsAbrupt, IsNormalCompletion, IsReturnCompletion, IsThrowCompletion, ReturnCompletion, ThrowCompletion } from './completion_record';
import { Obj, OrdinaryObjectCreate } from './obj';
import { Assert } from './assert';
import { PropertyKey, Val } from './val';
import { CodeExecutionContext, ExecutionContext } from './execution_context';
import { Call } from './abstract_object';
import { NewPromiseCapability, PerformPromiseThen, PromiseCapability, PromiseResolve, promises } from './promise';
import { BlockLike, isBlockLike } from './tree';
import { RealmRecord, defineProperties } from './realm_record';
import { EnvironmentRecord } from './environment_record';
import { PrivateEnvironmentRecord, PrivateName } from './private_environment_record';
import { GetSourceText } from './static/functions';
import { CreateDynamicFunction, prelude } from './prelude';

/**
 * 27.7 AsyncFunction Objects
 * 
 * AsyncFunctions are functions that are usually created by evaluating
 * AsyncFunctionDeclarations, AsyncFunctionExpressions, AsyncMethods,
 * and AsyncArrowFunctions. They may also be created by calling the
 * %AsyncFunction% intrinsic.
 */
export const asyncFunctions: Plugin = {
  id: 'asyncFunctions',
  deps: () => [prelude, functions, promises],
  syntax: {
    NamedEvaluation(on) {
      on(['ArrowFunctionExpression', 'FunctionExpression'],
         when(n => n.async && !n.generator,
              mapJust(InstantiateAsyncFunctionExpression)));
    },
    InstantiateFunctionObject(on) {
      on('FunctionDeclaration',
         when(n => n.async && !n.generator, InstantiateAsyncFunctionObject));
    },
    Evaluation(on) {
      on(['ArrowFunctionExpression', 'FunctionExpression'],
         when(n => n.async && !n.generator,
              mapJust(InstantiateAsyncFunctionExpression)));
      on('AwaitExpression', function*($, n) {
        return yield* Evaluation_AwaitExpression($, n);
      });
    },
  },
  realm: {CreateIntrinsics},
  abstract: {Await},
};

function CreateIntrinsics(realm: RealmRecord) {
  /**
   * 27.7.1 The AsyncFunction Constructor
   * 
   * The AsyncFunction constructor:
   *   - is %AsyncFunction%.
   *   - is a subclass of Function.
   *   - creates and initializes a new AsyncFunction when called as a
   *     function rather than as a constructor. Thus the function call
   *     AsyncFunction(…) is equivalent to the object creation
   *     expression new AsyncFunction(…) with the same arguments.
   *   - may be used as the value of an extends clause of a class
   *     definition. Subclass constructors that intend to inherit the
   *     specified AsyncFunction behaviour must include a super call to
   *     the AsyncFunction constructor to create and initialize a
   *     subclass instance with the internal slots necessary for
   *     built-in async function behaviour. All ECMAScript syntactic
   *     forms for defining async function objects create direct
   *     instances of AsyncFunction. There is no syntactic means to
   *     create instances of AsyncFunction subclasses.
   *
   * ---
   *
   * 27.7.2 Properties of the AsyncFunction Constructor
   * 
   * The AsyncFunction constructor:
   *   - is a standard built-in function object that inherits from the Function constructor.
   *   - has a [[Prototype]] internal slot whose value is %Function%.
   *   - has a "name" property whose value is "AsyncFunction".
   *   - has the following properties:
   *
   * 27.7.2.1 AsyncFunction.length
   * 
   * This is a data property with a value of 1. This property has the
   * attributes { [[Writable]]: false, [[Enumerable]]: false,
   * [[Configurable]]: true }.
   */
  const asyncFunctionCtor = CreateBuiltinFunction(
    callOrConstruct(AsyncFunctionConstructor), 1, 'AsyncFunction',
    {Realm: realm, Prototype: realm.Intrinsics.get('%Function%')!});
  realm.Intrinsics.set('%AsyncFunction%', asyncFunctionCtor);

  /**
   * 27.7.3 Properties of the AsyncFunction Prototype Object
   * 
   * The AsyncFunction prototype object:
   *   - is %AsyncFunction.prototype%.
   *   - is an ordinary object.
   *   - is not a function object and does not have an [[ECMAScriptCode]]
   *     internal slot or any other of the internal slots listed in
   *     Table 30.
   *   - has a [[Prototype]] internal slot whose value is %Function.prototype%.
   */
  const asyncFunctionPrototype = OrdinaryObjectCreate({
    Prototype: realm.Intrinsics.get('%Function.prototype%')!,
  }, {
    /**
     * 27.7.3.1 AsyncFunction.prototype.constructor
     * 
     * The initial value of AsyncFunction.prototype.constructor is %AsyncFunction%
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    'constructor': propC(asyncFunctionCtor),

    /**
     * 27.7.3.2 AsyncFunction.prototype [ @@toStringTag ]
     * 
     * The initial value of the @@toStringTag property is the String value "AsyncFunction".
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    [Symbol.toStringTag]: propC('AsyncFunction'),
  });
  realm.Intrinsics.set('%AsyncFunction.prototype%', asyncFunctionPrototype);

  defineProperties(realm, asyncFunctionCtor, {
    /**
     * 27.7.2.2 AsyncFunction.prototype
     * 
     * The initial value of AsyncFunction.prototype is the AsyncFunction prototype object.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: false }.
     */
    'prototype': prop0(asyncFunctionPrototype),
  });
}

/**
 * 27.7.1.1 AsyncFunction ( ...parameterArgs, bodyArg )
 * 
 * The last argument (if any) specifies the body (executable code) of
 * an async function. Any preceding arguments specify formal
 * parameters.
 * 
 * This function performs the following steps when called:
 * 
 * 1. Let C be the active function object.
 * 2. If bodyArg is not present, set bodyArg to the empty String.
 * 3. Return ? CreateDynamicFunction(C, NewTarget, async, parameterArgs, bodyArg).
 * 
 * NOTE: See NOTE for 20.2.1.1.
 */
export function* AsyncFunctionConstructor($: VM, NewTarget: Val, ...args: Val[]): ECR<Obj> {
  const C = $.getActiveFunctionObject()!;
  const bodyArg = args.pop() ?? '';
  Assert(NewTarget === undefined || NewTarget instanceof Obj);
  return yield* CreateDynamicFunction($, C, NewTarget, 'async', args, bodyArg);
}

/**
 * 27.7.4 AsyncFunction Instances
 * 
 * Every AsyncFunction instance is an ECMAScript function object and
 * has the internal slots listed in Table 30. The value of the
 * [[IsClassConstructor]] internal slot for all such instances is
 * false. AsyncFunction instances are not constructors and do not have
 * a [[Construct]] internal method. AsyncFunction instances do not
 * have a prototype property as they are not constructible.
 * 
 * Each AsyncFunction instance has the following own properties:
 * 
 * ---
 * 
 * 27.7.4.1 length
 * 
 * The specification for the "length" property of Function instances
 * given in 20.2.4.1 also applies to AsyncFunction instances.
 * 
 * ---
 * 
 * 27.7.4.2 name
 * 
 * The specification for the "name" property of Function instances
 * given in 20.2.4.2 also applies to AsyncFunction instances.
 */

// 27.7.5 Async Functions Abstract Operations

/**
 * 27.7.5.1 AsyncFunctionStart ( promiseCapability, asyncFunctionBody )
 * 
 * The abstract operation AsyncFunctionStart takes arguments
 * promiseCapability (a PromiseCapability Record) and
 * asyncFunctionBody (a FunctionBody Parse Node or an ExpressionBody
 * Parse Node) and returns unused. It performs the following steps
 * when called:
 * 
 * 1. Let runningContext be the running execution context.
 * 2. Let asyncContext be a copy of runningContext.
 * 3. NOTE: Copying the execution state is required for
 *    AsyncBlockStart to resume its execution. It is ill-defined to
 *    resume a currently executing context.
 * 4. Perform AsyncBlockStart(promiseCapability, asyncFunctionBody, asyncContext).
 * 5. Return unused.
 */
export function AsyncFunctionStart(
  $: VM,
  promiseCapability: PromiseCapability,
  asyncFunctionBody: BlockLike|ESTree.Expression,
): ECR<UNUSED> {
  const runningContext = $.getRunningContext();
  const asyncContext = (runningContext as CodeExecutionContext).clone();
  return AsyncBlockStart($, promiseCapability, asyncFunctionBody, asyncContext);
}

/**
 * 27.7.5.2 AsyncBlockStart ( promiseCapability, asyncBody, asyncContext )
 * 
 * The abstract operation AsyncBlockStart takes arguments
 * promiseCapability (a PromiseCapability Record), asyncBody (a Parse
 * Node), and asyncContext (an execution context) and returns
 * unused. It performs the following steps when called:
 * 
 * 1. Assert: promiseCapability is a PromiseCapability Record.
 * 2. Let runningContext be the running execution context.
 * 3. Let closure be a new Abstract Closure with no parameters that
 *    captures promiseCapability and asyncBody and performs the following
 *    steps when called:
 *     a. Let acAsyncContext be the running execution context.
 *     b. Let result be Completion(Evaluation of asyncBody).
 *     c. Assert: If we return here, the async function either threw
 *        an exception or performed an implicit or explicit return; all
 *        awaiting is done.
 *     d. Remove acAsyncContext from the execution context stack and
 *        restore the execution context that is at the top of the
 *        execution context stack as the running execution context.
 *     e. If result.[[Type]] is normal, then
 *         i. Perform ! Call(promiseCapability.[[Resolve]], undefined, « undefined »).
 *     f. Else if result.[[Type]] is return, then
 *         i. Perform ! Call(promiseCapability.[[Resolve]], undefined, « result.[[Value]] »).
 *     g. Else,
 *         i. Assert: result.[[Type]] is throw.
 *         ii. Perform ! Call(promiseCapability.[[Reject]], undefined, « result.[[Value]] »).
 *     h. Return unused.
 * 4. Set the code evaluation state of asyncContext such that when
 *    evaluation is resumed for that execution context, closure will be
 *    called with no arguments.
 * 5. Push asyncContext onto the execution context stack; asyncContext
 *    is now the running execution context.
 * 6. Resume the suspended evaluation of asyncContext. Let result be
 *    the value returned by the resumed computation.
 * 7. Assert: When we return here, asyncContext has already been
 *    removed from the execution context stack and runningContext is the
 *    currently running execution context.
 * 8. Assert: result is a normal completion with a value of
 *    unused. The possible sources of this value are Await or, if the
 *    async function doesn't await anything, step 3.h above.
 * 9. Return unused.
 *
 * ---
 *
 * 27.7.5.3 Await ( value )
 * 
 * The abstract operation Await takes argument value (an ECMAScript
 * language value) and returns either a normal completion containing
 * either an ECMAScript language value or empty, or a throw
 * completion. It performs the following steps when called:
 * 
 * 1. Let asyncContext be the running execution context.
 * 2. Let promise be ? PromiseResolve(%Promise%, value).
 * 3. Let fulfilledClosure be a new Abstract Closure with parameters (v) that
 *    captures asyncContext and performs the following steps when called:
 *     a. Let prevContext be the running execution context.
 *     b. Suspend prevContext.
 *     c. Push asyncContext onto the execution context stack;
 *        asyncContext is now the running execution context.
 *     d. Resume the suspended evaluation of asyncContext using
 *        NormalCompletion(v) as the result of the operation that
 *        suspended it.
 *     e. Assert: When we reach this step, asyncContext has already
 *        been removed from the execution context stack and prevContext
 *        is the currently running execution context.
 *     f. Return undefined.
 * 4. Let onFulfilled be CreateBuiltinFunction(fulfilledClosure, 1, "", « »).
 * 5. Let rejectedClosure be a new Abstract Closure with parameters
 *    (reason) that captures asyncContext and performs the following
 *    steps when called:
 *     a. Let prevContext be the running execution context.
 *     b. Suspend prevContext.
 *     c. Push asyncContext onto the execution context stack;
 *        asyncContext is now the running execution context.
 *     d. Resume the suspended evaluation of asyncContext using
 *        ThrowCompletion(reason) as the result of the operation that
 *        suspended it.
 *     e. Assert: When we reach this step, asyncContext has already
 *        been removed from the execution context stack and prevContext
 *        is the currently running execution context.
 *     f. Return undefined.
 * 6. Let onRejected be CreateBuiltinFunction(rejectedClosure, 1, "", « »).
 * 7. Perform PerformPromiseThen(promise, onFulfilled, onRejected).
 * 8. Remove asyncContext from the execution context stack and restore
 *    the execution context that is at the top of the execution context
 *    stack as the running execution context.
 * 9. Let callerContext be the running execution context.
 * 10. Resume callerContext passing empty. If asyncContext is ever
 *     resumed again, let completion be the Completion Record with which
 *     it is resumed.
 * 11. Assert: If control reaches here, then asyncContext is the running execution context again.
 * 12. Return completion.
 */
export function* AsyncBlockStart(
  $: VM,
  promiseCapability: PromiseCapability,
  asyncBody: BlockLike|ESTree.Expression,
  asyncContext: ExecutionContext,
): ECR<UNUSED> {
  Assert(promiseCapability instanceof PromiseCapability);
  const runningContext = $.getRunningContext();
  const iter = function*(): ECR<UNUSED> {
    const acAsyncContext = $.getRunningContext();
    const result = yield* $.evaluateValue(asyncBody);
    // Assert: If we return here, the async function either threw an
    // exception or performed an implicit or explicit return; all
    // awaiting is done.  ... ?
    $.popContext(acAsyncContext);
    if (IsNormalCompletion(result)) {
      // NOTE: Handle concise body here
      CastNotAbrupt(
        yield* Call($, promiseCapability.Resolve, undefined,
                    [isBlockLike(asyncBody) ? undefined : result]));
    } else if (IsReturnCompletion(result)) {
      CastNotAbrupt(yield* Call($, promiseCapability.Resolve, undefined, [result.Value]));
    } else {
      Assert(IsThrowCompletion(result));
      CastNotAbrupt(yield* Call($, promiseCapability.Reject, undefined, [result.Value]));
    }
    return UNUSED;
  }(); // NOTE: execution does not start yet.

  yield* proceed(undefined);

  function* proceed(cr: CR<Val>): ECR<undefined> {
    $.enterContext(asyncContext);
    let iterResult = iter.next(cr);
    while (!iterResult.done && !iterResult.value) {
      yield;
      iterResult = iter.next();
    }
    if (iterResult.done) {
      Assert(UNUSED.is(iterResult.value));
      return;
    }

    // an await has happened
    Assert(iterResult.value!.type === 'await');
    const promise = iterResult.value!.await;
    Assert($.getRunningContext() === asyncContext);
    //const asyncContext = $.getRunningContext();
    const onFulfilled = CreateBuiltinFunctionFromClosure(function*(v) {
      const prevContext = $.getRunningContext();
      prevContext.suspend();
      return yield* proceed(v);
    }, 1, '', {$});
    const onRejected = CreateBuiltinFunctionFromClosure(function*(reason) {
      const prevContext = $.getRunningContext();
      prevContext.suspend();
      return yield* proceed(ThrowCompletion(reason));
    }, 1, '', {$});
    PerformPromiseThen($, promise, onFulfilled, onRejected);
    $.popContext(asyncContext);
    return undefined;
  }

  Assert($.getRunningContext() === runningContext);
  return UNUSED;
}

export function* Await($: VM, value: Val): ECR<Val> {
  const promise = yield* PromiseResolve($, $.getIntrinsic('%Promise%'), value);
  if (IsAbrupt(promise)) return promise;
  return yield {await: promise, type: 'await'};
}

/**
 * 15.8.2 Runtime Semantics: InstantiateAsyncFunctionObject
 * 
 * The syntax-directed operation InstantiateAsyncFunctionObject takes
 * arguments env (an Environment Record) and privateEnv (a
 * PrivateEnvironment Record or null) and returns a function
 * object. It is defined piecewise over the following productions:
 * 
 * AsyncFunctionDeclaration :
 *   async function BindingIdentifier ( FormalParameters ) { AsyncFunctionBody }
 * 1. Let name be StringValue of BindingIdentifier.
 * 2. Let sourceText be the source text matched by AsyncFunctionDeclaration.
 * 3. Let F be OrdinaryFunctionCreate(%AsyncFunction.prototype%,
 *    sourceText, FormalParameters, AsyncFunctionBody, non-lexical-this,
 *    env, privateEnv).
 * 4. Perform SetFunctionName(F, name).
 * 5. Return F.
 * 
 * AsyncFunctionDeclaration : async function ( FormalParameters ) { AsyncFunctionBody }
 * 1. Let sourceText be the source text matched by AsyncFunctionDeclaration.
 * 2. Let F be OrdinaryFunctionCreate(%AsyncFunction.prototype%,
 *    sourceText, FormalParameters, AsyncFunctionBody, non-lexical-this,
 *    env, privateEnv).
 * 3. Perform SetFunctionName(F, "default").
 * 4. Return F.
 */
export function InstantiateAsyncFunctionObject(
  $: VM,
  node: ESTree.FunctionDeclaration|ESTree.FunctionExpression,
  env: EnvironmentRecord,
  privateEnv: PrivateEnvironmentRecord|null,
): Func {
  const name = node.id?.name || 'default';
  const sourceText = GetSourceText(node);
  const F = OrdinaryFunctionCreate(
    $, $.getIntrinsic('%AsyncFunction.prototype%'),
    sourceText, node.params, node.body,
    NON_LEXICAL_THIS, env, privateEnv);
  SetFunctionName(F, name);
  F.EvaluateBody = EvaluateAsyncFunctionBody;
  return F;
}

/**
 * 15.8.3 Runtime Semantics: InstantiateAsyncFunctionExpression
 * 
 * The syntax-directed operation InstantiateAsyncFunctionExpression
 * takes optional argument name (a property key or a Private Name) and
 * returns a function object. It is defined piecewise over the
 * following productions:
 * 
 * AsyncFunctionExpression : async function ( FormalParameters ) { AsyncFunctionBody }
 * 1. If name is not present, set name to "".
 * 2. Let env be the LexicalEnvironment of the running execution context.
 * 3. Let privateEnv be the running execution context's PrivateEnvironment.
 * 4. Let sourceText be the source text matched by AsyncFunctionExpression.
 * 5. Let closure be OrdinaryFunctionCreate(%AsyncFunction.prototype%,
 *    sourceText, FormalParameters, AsyncFunctionBody, non-lexical-this,
 *    env, privateEnv).
 * 6. Perform SetFunctionName(closure, name).
 * 7. Return closure.
 * 
 * AsyncFunctionExpression :
 *   async function BindingIdentifier ( FormalParameters ) { AsyncFunctionBody }
 * 1. Assert: name is not present.
 * 2. Set name to StringValue of BindingIdentifier.
 * 3. Let outerEnv be the LexicalEnvironment of the running execution context.
 * 4. Let funcEnv be NewDeclarativeEnvironment(outerEnv).
 * 5. Perform ! funcEnv.CreateImmutableBinding(name, false).
 * 6. Let privateEnv be the running execution context's PrivateEnvironment.
 * 7. Let sourceText be the source text matched by AsyncFunctionExpression.
 * 8. Let closure be OrdinaryFunctionCreate(%AsyncFunction.prototype%,
 *    sourceText, FormalParameters, AsyncFunctionBody, non-lexical-this,
 *    funcEnv, privateEnv).
 * 9. Perform SetFunctionName(closure, name).
 * 10. Perform ! funcEnv.InitializeBinding(name, closure).
 * 11. Return closure.
 * 
 * NOTE: The BindingIdentifier in an AsyncFunctionExpression can be
 * referenced from inside the AsyncFunctionExpression's
 * AsyncFunctionBody to allow the function to call itself
 * recursively. However, unlike in a FunctionDeclaration, the
 * BindingIdentifier in a AsyncFunctionExpression cannot be referenced
 * from and does not affect the scope enclosing the AsyncFunctionExpression.
 */
export function InstantiateAsyncFunctionExpression(
  $: VM,
  node: ESTree.FunctionExpression|ESTree.ArrowFunctionExpression,
  name?: PropertyKey|PrivateName,
): Func {
  const closure =
    InstantiateOrdinaryFunctionExpression(
      $, node, name, '%AsyncFunction.prototype%');
  closure.EvaluateBody = EvaluateAsyncFunctionBody;
  return closure;
}

/**
 * 15.8.4 Runtime Semantics: EvaluateAsyncFunctionBody
 * 
 * The syntax-directed operation EvaluateAsyncFunctionBody takes
 * arguments functionObject (a function object) and argumentsList (a
 * List of ECMAScript language values) and returns a return
 * completion. It is defined piecewise over the following productions:
 * 
 * AsyncFunctionBody : FunctionBody
 * 1. Let promiseCapability be ! NewPromiseCapability(%Promise%).
 * 2. Let declResult be Completion(FunctionDeclarationInstantiation(functionObject, argumentsList)).
 * 3. If declResult is an abrupt completion, then
 *     a. Perform ! Call(promiseCapability.[[Reject]], undefined, « declResult.[[Value]] »).
 * 4. Else,
 *     a. Perform AsyncFunctionStart(promiseCapability, FunctionBody).
 * 5. Return Completion Record { [[Type]]: return, [[Value]]:
 *    promiseCapability.[[Promise]], [[Target]]: empty }.
 */
export function* EvaluateAsyncFunctionBody(
  this: OrdinaryFunction,
  $: VM,
  functionObject: Func,
  argumentsList: Val[],
): ECR<Val> {
  const promiseCapability =
    CastNotAbrupt(yield* NewPromiseCapability($, $.getIntrinsic('%Promise%')!));
  const declResult = yield* FunctionDeclarationInstantiation($, functionObject, argumentsList);
  if (IsAbrupt(declResult)) {
    Assert(!EMPTY.is(declResult.Value));
    CastNotAbrupt(yield* Call($, promiseCapability.Reject, undefined, [declResult.Value]));
  } else {
    yield* AsyncFunctionStart($, promiseCapability, this.ECMAScriptCode /* FunctionBody */);
  }
  return ReturnCompletion(promiseCapability.Promise);
}

/**
 * 15.8.5 Runtime Semantics: Evaluation
 * 
 * AsyncFunctionExpression :
 *   async function BindingIdentifieropt ( FormalParameters ) { AsyncFunctionBody }
 * 1. Return InstantiateAsyncFunctionExpression of AsyncFunctionExpression.
 * 
 * AwaitExpression : await UnaryExpression
 * 1. Let exprRef be ? Evaluation of UnaryExpression.
 * 2. Let value be ? GetValue(exprRef).
 * 3. Return ? Await(value).
 */
export function *Evaluation_AwaitExpression($: VM, n: ESTree.AwaitExpression): ECR<Val> {
  const value = yield* $.evaluateValue(n.argument);
  if (IsAbrupt(value)) return value;
  return yield* Await($, value);
}
