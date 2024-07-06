import * as ESTree from 'estree';
import { prop0, propC, propW } from './property_descriptor';
import { CreateBuiltinFunction, CreateBuiltinFunctionFromClosure, Func, FunctionDeclarationInstantiation, InstantiateOrdinaryFunctionExpression, OrdinaryFunction, OrdinaryFunctionCreate, SetFunctionName, callOrConstruct, methodO } from './func';
import { ECR, EvalGen, Plugin, VM, mapJust, when } from './vm';
import { PropertyKey, Val } from './val';
import { Obj, OrdinaryCreateFromConstructor, OrdinaryObjectCreate } from './obj';
import { CR, CastNotAbrupt, IsAbrupt, IsNormalCompletion, IsReturnCompletion, IsThrowCompletion, ReturnCompletion, ThrowCompletion } from './completion_record';
import { ASYNC, EMPTY, NON_LEXICAL_THIS, NOT_APPLICABLE, UNUSED } from './enums';
import { ExecutionContext } from './execution_context';
import { NewPromiseCapability, PerformPromiseThen, PromiseCapability, PromiseResolve, RejectAndReturnPromise } from './promise';
import { Assert } from './assert';
import { EnvironmentRecord } from './environment_record';
import { GetSourceText } from './static/functions';
import { PrivateEnvironmentRecord, PrivateName } from './private_environment_record';
import { BlockLike } from './tree';
import { Call, GetMethod } from './abstract_object';
import { RealmRecord, defineProperties } from './realm_record';
import { AsyncIteratorClose, CreateIterResultObject, GetIterator, IteratorComplete, IteratorValue } from './abstract_iterator';
import { GetGeneratorKind, generators } from './generator';
import { Await, asyncFunctions } from './async_function';
import { CreateDynamicFunction } from './fundamental';


/**
 * 27.4 AsyncGeneratorFunction Objects
 * 
 * AsyncGeneratorFunctions are functions that are usually created by
 * evaluating AsyncGeneratorDeclaration, AsyncGeneratorExpression, and
 * AsyncGeneratorMethod syntactic productions. They may also be
 * created by calling the %AsyncGeneratorFunction% intrinsic.
 */
export const asyncGenerators: Plugin = {
  id: 'asyncGenerators',
  deps: () => [generators, asyncFunctions],

  syntax: {
    NamedEvaluation(on) {
      on('FunctionExpression',
         when(n => n.async && n.generator,
              mapJust(InstantiateAsyncGeneratorFunctionExpression)));
    },
    InstantiateFunctionObject(on) {
      on('FunctionDeclaration',
         when(n => n.async && n.generator, InstantiateAsyncGeneratorFunctionObject));
    },
    Evaluation(on) {
      on('FunctionExpression',
         when(n => n.async && n.generator,
              mapJust(InstantiateAsyncGeneratorFunctionExpression)));
      on('YieldExpression', function($, n) {
        if (GetGeneratorKind($) !== ASYNC) return NOT_APPLICABLE;
        if (n.delegate) {
          return Evaluation_AsyncYieldDelegateExpression($, n);
        } else {
          return Evaluation_AsyncYieldExpression($, n);
        }
      });
      // TODO - for-await ?
    },
  },

  realm: {
    CreateIntrinsics,
  },
};


function CreateIntrinsics(realm: RealmRecord) {
  /**
   * 27.4.1 The AsyncGeneratorFunction Constructor
   * 
   * The AsyncGeneratorFunction constructor:
   * 
   *   - is %AsyncGeneratorFunction%.
   *   - is a subclass of Function.
   *   - creates and initializes a new AsyncGeneratorFunction when
   *     called as a function rather than as a constructor. Thus the
   *     function call AsyncGeneratorFunction (...) is equivalent to
   *     the object creation expression new AsyncGeneratorFunction
   *     (...) with the same arguments.
   *   - may be used as the value of an extends clause of a class
   *     definition. Subclass constructors that intend to inherit the
   *     specified AsyncGeneratorFunction behaviour must include a
   *     super call to the AsyncGeneratorFunction constructor to
   *     create and initialize subclass instances with the internal
   *     slots necessary for built-in AsyncGeneratorFunction
   *     behaviour. All ECMAScript syntactic forms for defining async
   *     generator function objects create direct instances of
   *     AsyncGeneratorFunction. There is no syntactic means to create
   *     instances of AsyncGeneratorFunction subclasses.
   * 
   * ---
   * 
   * 27.4.2 Properties of the AsyncGeneratorFunction Constructor
   * 
   * The AsyncGeneratorFunction constructor:
   * 
   *   - is a standard built-in function object that inherits from the
   *     Function constructor.
   *   - has a [[Prototype]] internal slot whose value is %Function%.
   *   - has a "name" property whose value is "AsyncGeneratorFunction".
   *   - has the following properties:
   * 
   * ---
   * 
   * 27.4.2.1 AsyncGeneratorFunction.length
   * 
   * This is a data property with a value of 1. This property has the
   * attributes { [[Writable]]: false, [[Enumerable]]: false,
   * [[Configurable]]: true }.
   */
  const asyncGeneratorFunction = CreateBuiltinFunction(
    callOrConstruct(AsyncGeneratorFunctionConstructor),
    1, 'AsyncGeneratorFunction', {
      Realm: realm,
      Prototype: realm.Intrinsics.get('%Function%')!,
    });
  realm.Intrinsics.set('%AsyncGeneratorFunction%', asyncGeneratorFunction);

  /**
   * 27.4.3 Properties of the AsyncGeneratorFunction Prototype Object
   * 
   * The AsyncGeneratorFunction prototype object:
   *   - is %AsyncGeneratorFunction.prototype%.
   *   - is an ordinary object.
   *   - is not a function object and does not have an
   *     [[ECMAScriptCode]] internal slot or any other of the internal
   *     slots listed in Table 30 or Table 83.
   *   - has a [[Prototype]] internal slot whose value is %Function.prototype%.
   */
  const asyncGeneratorFunctionPrototype = OrdinaryObjectCreate({
    Prototype: realm.Intrinsics.get('%Function.prototype%')!,
  }, {
    /**
     * 27.4.3.1 AsyncGeneratorFunction.prototype.constructor
     * 
     * The initial value of AsyncGeneratorFunction.prototype.constructor
     * is %AsyncGeneratorFunction%.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    'constructor': propC(asyncGeneratorFunction),

    /**
     * 27.4.3.3 AsyncGeneratorFunction.prototype [ @@toStringTag ]
     * 
     * The initial value of the @@toStringTag property is the String
     * value "AsyncGeneratorFunction".
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    [Symbol.toStringTag]: propC('AsyncGeneratorFunction'),
  });
  realm.Intrinsics.set('%AsyncGeneratorFunction.prototype%', asyncGeneratorFunctionPrototype);

  /**
   * 27.6 AsyncGenerator Objects
   * 
   * An AsyncGenerator is an instance of an async generator function and
   * conforms to both the AsyncIterator and AsyncIterable interfaces.
   * 
   * AsyncGenerator instances directly inherit properties from the
   * object that is the initial value of the "prototype" property of the
   * AsyncGenerator function that created the instance. AsyncGenerator
   * instances indirectly inherit properties from the AsyncGenerator
   * Prototype intrinsic, %AsyncGeneratorFunction.prototype.prototype%.
   * 
   * ---
   * 
   * 27.6.1 Properties of the AsyncGenerator Prototype Object
   * 
   * The AsyncGenerator prototype object:
   * 
   *   - is %AsyncGeneratorFunction.prototype.prototype%.
   *   - is an ordinary object.
   *   - is not an AsyncGenerator instance and does not have an
   *     [[AsyncGeneratorState]] internal slot.
   *   - has a [[Prototype]] internal slot whose value is %AsyncIteratorPrototype%.
   *   - has properties that are indirectly inherited by all AsyncGenerator instances.
   */
  const asyncGeneratorFunctionPrototypePrototype = OrdinaryObjectCreate({
    Prototype: realm.Intrinsics.get('%AsyncIteratorPrototype%')!,
  }, {
    /**
     * 27.6.1.1 AsyncGenerator.prototype.constructor
     * 
     * The initial value of AsyncGenerator.prototype.constructor is
     * %AsyncGeneratorFunction.prototype%.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    'constructor': propC(asyncGeneratorFunctionPrototype),
  });
  realm.Intrinsics.set('%AsyncGeneratorFunction.prototype.prototype%',
                       asyncGeneratorFunctionPrototypePrototype);

  defineProperties(realm, asyncGeneratorFunctionPrototypePrototype, {
    'next': methodO(AsyncGeneratorPrototypeNext),
    'return': methodO(AsyncGeneratorPrototypeReturn),
    'throw': methodO(AsyncGeneratorPrototypeThrow),
    /**
     * 27.6.1.5 AsyncGenerator.prototype [ @@toStringTag ]
     * 
     * The initial value of the @@toStringTag property is the String value
     * "AsyncGenerator".
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    [Symbol.toStringTag]: propC('AsyncGenerator'),
  });

  /**
   * 27.4.2.2 AsyncGeneratorFunction.prototype
   * 
   * The initial value of AsyncGeneratorFunction.prototype is the
   * AsyncGeneratorFunction prototype object.
   * 
   * This property has the attributes { [[Writable]]: false,
   * [[Enumerable]]: false, [[Configurable]]: false }.
   */
  defineProperties(realm, asyncGeneratorFunction, {
    'prototype': prop0(asyncGeneratorFunctionPrototype),
  });

  /**
   * 27.4.3.2 AsyncGeneratorFunction.prototype.prototype
   * 
   * The initial value of AsyncGeneratorFunction.prototype.prototype
   * is the AsyncGenerator prototype object.
   * 
   * This property has the attributes { [[Writable]]: false,
   * [[Enumerable]]: false, [[Configurable]]: true }.
   */
  defineProperties(realm, asyncGeneratorFunctionPrototype, {
    'prototype': propC(asyncGeneratorFunctionPrototypePrototype),
  });
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
export function* Evaluation_AsyncYieldDelegateExpression($: VM, n: ESTree.YieldExpression): ECR<Val> {
  Assert(n.argument);
  const value = yield* $.evaluateValue(n.argument);
  if (IsAbrupt(value)) return value;
  const iteratorRecord = yield* GetIterator($, value, ASYNC);
  if (IsAbrupt(iteratorRecord)) return iteratorRecord;
  const iterator = iteratorRecord.Iterator;
  let received: CR<Val> = undefined;
  while (true) {
    if (!IsAbrupt(received)) {
      let innerResult: CR<Val> = yield* Call($, iteratorRecord.NextMethod, iterator, [received]);
      if (IsAbrupt(innerResult)) return innerResult;
      innerResult = yield* Await($, innerResult);
      if (IsAbrupt(innerResult)) return innerResult;
      if (!(innerResult instanceof Obj)) return $.throw('TypeError', 'not an object');
      const done = yield* IteratorComplete($, innerResult);
      if (IsAbrupt(done)) return done;
      if (done) return yield* IteratorValue($, innerResult);
      const innerResultValue: CR<Val> = yield* IteratorValue($, innerResult);
      if (IsAbrupt(innerResultValue)) return innerResultValue;
      received = yield* AsyncGeneratorYield($, innerResultValue);
    } else if (IsThrowCompletion(received)) {
      const throwMethod = yield* GetMethod($, iterator, 'throw');
      if (IsAbrupt(throwMethod)) return throwMethod;
      if (throwMethod != null) {
        let innerResult = yield* Call($, throwMethod, iterator, [received.Value]);
        if (IsAbrupt(innerResult)) return innerResult;
        innerResult = yield* Await($, innerResult);
        // NOTE: Exceptions from the inner iterator throw method are
        // propagated. Normal completions from an inner throw method are
        // processed similarly to an inner next.
        if (!(innerResult instanceof Obj)) return $.throw('TypeError', 'not an object');
        const done = yield* IteratorComplete($, innerResult);
        if (IsAbrupt(done)) return done;
        if (done) return yield* IteratorValue($, innerResult);
        const innerValue = yield* IteratorValue($, innerResult);
        if (IsAbrupt(innerValue)) return innerValue;
        received = yield* AsyncGeneratorYield($, innerValue);
      } else {
        // NOTE: If iterator does not have a throw method, this throw
        // is going to terminate the yield* loop. But first we need to
        // give iterator a chance to clean up.
        const closeStatus = yield* AsyncIteratorClose($, iteratorRecord, EMPTY);
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
        // 1-3
        const result = yield* Await($, received.Value);
        return IsAbrupt(result) ? result : ReturnCompletion(result);
      }
      let innerReturnResult = yield* Call($, returnMethod, iterator, [received.Value]); // iv
      if (IsAbrupt(innerReturnResult)) return innerReturnResult;
      innerReturnResult = yield* Await($, innerReturnResult); // v
      if (IsAbrupt(innerReturnResult)) return innerReturnResult;
      if (!(innerReturnResult instanceof Obj)) return $.throw('TypeError', 'not an object'); // vi
      const done = yield* IteratorComplete($, innerReturnResult); // vii
      if (IsAbrupt(done)) return done;
      if (done) { // viii
        const value = yield* IteratorValue($, innerReturnResult); // 1
        if (IsAbrupt(value)) return value;
        return ReturnCompletion(value); // 2
      }
      const value = yield* IteratorValue($, innerReturnResult);
      if (IsAbrupt(value)) return value;
      received = yield* AsyncGeneratorYield($, value);
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
export function* Evaluation_AsyncYieldExpression($: VM, n: ESTree.YieldExpression): ECR<Val> {
  const value = n.argument == null ? undefined : yield* $.evaluateValue(n.argument);
  if (IsAbrupt(value)) return value;
  return yield* AsyncYield($, value);
}



/**
 * 15.6.2 Runtime Semantics: EvaluateAsyncGeneratorBody
 * 
 * The syntax-directed operation EvaluateAsyncGeneratorBody takes
 * arguments functionObject (a function object) and argumentsList (a
 * List of ECMAScript language values) and returns a throw completion
 * or a return completion. It is defined piecewise over the following
 * productions:
 * 
 * AsyncGeneratorBody : FunctionBody
 * 1. Perform ? FunctionDeclarationInstantiation(functionObject, argumentsList).
 * 2. Let generator be ? OrdinaryCreateFromConstructor(functionObject,
 *    "%AsyncGeneratorFunction.prototype.prototype%", «
 *    [[AsyncGeneratorState]], [[AsyncGeneratorContext]],
 *    [[AsyncGeneratorQueue]], [[GeneratorBrand]] »).
 * 3. Set generator.[[GeneratorBrand]] to empty.
 * 4. Perform AsyncGeneratorStart(generator, FunctionBody).
 * 5. Return Completion Record { [[Type]]: return, [[Value]]: generator, [[Target]]: empty }.
 */
export function* EvaluateAsyncGeneratorBody(
  this: OrdinaryFunction,
  $: VM,
  _thisArg: Val,
  argumentsList: Val[],
): ECR<Obj /*never*/> {
  const functionObject = this;
  const instantiation =
    yield* FunctionDeclarationInstantiation($, functionObject, argumentsList);
  if (IsAbrupt(instantiation)) return instantiation;
  const generator = yield* OrdinaryCreateFromConstructor(
    $, functionObject, '%AsyncGeneratorFunction.prototype.prototype%', {
      AsyncGeneratorState: undefined,
      AsyncGeneratorContext: undefined,
      AsyncGeneratorQueue: undefined,
      GeneratorBrand: EMPTY,
      InternalName: `${this.InternalName}()`, // for debugging
    });
  if (IsAbrupt(generator)) return generator;
  Assert(this.ECMAScriptCode.type === 'BlockStatement');
  yield* AsyncGeneratorStart($, generator, this.ECMAScriptCode /* FunctionBody */);
  return ReturnCompletion(generator);
}

/**
 * 15.6.3 Runtime Semantics: InstantiateAsyncGeneratorFunctionObject
 * 
 * The syntax-directed operation
 * InstantiateAsyncGeneratorFunctionObject takes arguments env (an
 * Environment Record) and privateEnv (a PrivateEnvironment Record or
 * null) and returns a function object. It is defined piecewise over
 * the following productions:
 * 
 * AsyncGeneratorDeclaration :
 *   async function * BindingIdentifier ( FormalParameters ) { AsyncGeneratorBody }
 * 1. Let name be StringValue of BindingIdentifier.
 * 2. Let sourceText be the source text matched by AsyncGeneratorDeclaration.
 * 3. Let F be OrdinaryFunctionCreate(%AsyncGeneratorFunction.prototype%,
 *    sourceText, FormalParameters, AsyncGeneratorBody, non-lexical-this, env, privateEnv).
 * 4. Perform SetFunctionName(F, name).
 * 5. Let prototype be OrdinaryObjectCreate(%AsyncGeneratorFunction.prototype.prototype%).
 * 6. Perform ! DefinePropertyOrThrow(F, "prototype",
 *    PropertyDescriptor { [[Value]]: prototype, [[Writable]]: true,
 *    [[Enumerable]]: false, [[Configurable]]: false }).
 * 7. Return F.
 * 
 * AsyncGeneratorDeclaration : async function * ( FormalParameters ) { AsyncGeneratorBody }
 * 1. Let sourceText be the source text matched by AsyncGeneratorDeclaration.
 * 2. Let F be
 *    OrdinaryFunctionCreate(%AsyncGeneratorFunction.prototype%,
 *    sourceText, FormalParameters, AsyncGeneratorBody, non-lexical-this,
 *    env, privateEnv).
 * 3. Perform SetFunctionName(F, "default").
 * 4. Let prototype be OrdinaryObjectCreate(%AsyncGeneratorFunction.prototype.prototype%).
 * 5. Perform ! DefinePropertyOrThrow(F, "prototype",
 *    PropertyDescriptor { [[Value]]: prototype, [[Writable]]: true,
 *    [[Enumerable]]: false, [[Configurable]]: false }).
 * 6. Return F.
 * 
 * NOTE: An anonymous AsyncGeneratorDeclaration can only occur as part
 * of an export default declaration.
 */
export function InstantiateAsyncGeneratorFunctionObject(
  $: VM,
  node: ESTree.FunctionDeclaration|ESTree.FunctionExpression,
  env: EnvironmentRecord,
  privateEnv: PrivateEnvironmentRecord|null,
): Func {
  const name = node.id?.name ?? 'default';
  const sourceText = GetSourceText(node);
  const F = OrdinaryFunctionCreate(
    $, $.getIntrinsic('%AsyncGeneratorFunction.prototype%'),
    sourceText, node.params, node.body,
    NON_LEXICAL_THIS, env, privateEnv);
  SetFunctionName(F, name);
  const prototype = OrdinaryObjectCreate(
    $.getIntrinsic('%AsyncGeneratorFunction.prototype.prototype%'));
  F.OwnProps.set('prototype', propW(prototype));
  F.EvaluateBody = EvaluateAsyncGeneratorBody;
  return F;
}

/**
 * 15.6.4 Runtime Semantics: InstantiateAsyncGeneratorFunctionExpression
 * 
 * The syntax-directed operation
 * InstantiateAsyncGeneratorFunctionExpression takes optional argument
 * name (a property key or a Private Name) and returns a function
 * object. It is defined piecewise over the following productions:
 * 
 * AsyncGeneratorExpression : async function * ( FormalParameters ) { AsyncGeneratorBody }
 * 1. If name is not present, set name to "".
 * 2. Let env be the LexicalEnvironment of the running execution context.
 * 3. Let privateEnv be the running execution context's PrivateEnvironment.
 * 4. Let sourceText be the source text matched by AsyncGeneratorExpression.
 * 5. Let closure be OrdinaryFunctionCreate(%AsyncGeneratorFunction.prototype%,
 *    sourceText, FormalParameters, AsyncGeneratorBody, non-lexical-this, env, privateEnv).
 * 6. Perform SetFunctionName(closure, name).
 * 7. Let prototype be OrdinaryObjectCreate(%AsyncGeneratorFunction.prototype.prototype%).
 * 8. Perform ! DefinePropertyOrThrow(closure, "prototype",
 *    PropertyDescriptor { [[Value]]: prototype, [[Writable]]: true,
 *    [[Enumerable]]: false, [[Configurable]]: false }).
 * 9. Return closure.
 * 
 * AsyncGeneratorExpression :
 *   async function * BindingIdentifier ( FormalParameters ) { AsyncGeneratorBody }
 * 1. Assert: name is not present.
 * 2. Set name to StringValue of BindingIdentifier.
 * 3. Let outerEnv be the running execution context's LexicalEnvironment.
 * 4. Let funcEnv be NewDeclarativeEnvironment(outerEnv).
 * 5. Perform ! funcEnv.CreateImmutableBinding(name, false).
 * 6. Let privateEnv be the running execution context's PrivateEnvironment.
 * 7. Let sourceText be the source text matched by AsyncGeneratorExpression.
 * 8. Let closure be OrdinaryFunctionCreate(%AsyncGeneratorFunction.prototype%,
 *    sourceText, FormalParameters, AsyncGeneratorBody, non-lexical-this, funcEnv, privateEnv).
 * 9. Perform SetFunctionName(closure, name).
 * 10. Let prototype be OrdinaryObjectCreate(%AsyncGeneratorFunction.prototype.prototype%).
 * 11. Perform ! DefinePropertyOrThrow(closure, "prototype",
 *     PropertyDescriptor { [[Value]]: prototype, [[Writable]]: true,
 *     [[Enumerable]]: false, [[Configurable]]: false }).
 * 12. Perform ! funcEnv.InitializeBinding(name, closure).
 * 13. Return closure.
 * 
 * NOTE: The BindingIdentifier in an AsyncGeneratorExpression can be
 * referenced from inside the AsyncGeneratorExpression's
 * AsyncGeneratorBody to allow the generator code to call itself
 * recursively. However, unlike in an AsyncGeneratorDeclaration, the
 * BindingIdentifier in an AsyncGeneratorExpression cannot be
 * referenced from and does not affect the scope enclosing the
 * AsyncGeneratorExpression.
 */
export function InstantiateAsyncGeneratorFunctionExpression(
  $: VM,
  node: ESTree.FunctionExpression,
  name?: PropertyKey|PrivateName,
): Func {
  const closure =
    InstantiateOrdinaryFunctionExpression(
      $, node, name, '%AsyncGeneratorFunction.prototype%');
  const prototype = OrdinaryObjectCreate(
    $.getIntrinsic('%AsyncGeneratorFunction.prototype.prototype%'));
  closure.OwnProps.set('prototype', propW(prototype));
  closure.EvaluateBody = EvaluateAsyncGeneratorBody;
  return closure;
}

/**
 * 27.4.1.1 AsyncGeneratorFunction ( ...parameterArgs, bodyArg )
 * 
 * The last argument (if any) specifies the body (executable code)
 * of an async generator function; any preceding arguments specify
 * formal parameters.
 * 
 * This function performs the following steps when called:
 * 
 * 1. Let C be the active function object.
 * 2. If bodyArg is not present, set bodyArg to the empty String.
 * 3. Return ? CreateDynamicFunction(C, NewTarget, asyncGenerator, parameterArgs, bodyArg).
 * 
 * NOTE: See NOTE for 20.2.1.1.
 * 
 */
export function AsyncGeneratorFunctionConstructor(
  $: VM,
  NewTarget: Func|undefined,
  ...args: Val[]
): ECR<Val> {
  const bodyArg = args.pop() || '';
  const parameterArgs = args;
  const C = $.getActiveFunctionObject()!;
  return CreateDynamicFunction($, C, NewTarget, 'asyncGenerator', parameterArgs, bodyArg);
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
export function* AsyncYield(
  $: VM,
  value: Val,
): ECR<Val> {
  Assert(GetGeneratorKind($) === ASYNC);
  const awaited = yield* Await($, value);
  if (IsAbrupt(awaited)) return awaited;
  return yield* AsyncGeneratorYield($, awaited);
}

/**
 * 27.6.1.2 AsyncGenerator.prototype.next ( value )
 * 
 * 1. Let generator be the this value.
 * 2. Let promiseCapability be ! NewPromiseCapability(%Promise%).
 * 3. Let result be Completion(AsyncGeneratorValidate(generator, empty)).
 * 4. IfAbruptRejectPromise(result, promiseCapability).
 * 5. Let state be generator.[[AsyncGeneratorState]].
 * 6. If state is completed, then
 *     a. Let iteratorResult be CreateIterResultObject(undefined, true).
 *     b. Perform ! Call(promiseCapability.[[Resolve]], undefined, « iteratorResult »).
 *     c. Return promiseCapability.[[Promise]].
 * 7. Let completion be NormalCompletion(value).
 * 8. Perform AsyncGeneratorEnqueue(generator, completion, promiseCapability).
 * 9. If state is either suspendedStart or suspendedYield, then
 *     a. Perform AsyncGeneratorResume(generator, completion).
 * 10. Else,
 *     a. Assert: state is either executing or awaiting-return.
 * 11. Return promiseCapability.[[Promise]].
 */
export function* AsyncGeneratorPrototypeNext(
  $: VM,
  generator: Obj,
  value: Val,
): ECR<Val> {
  const promiseCapability = CastNotAbrupt(yield* NewPromiseCapability($, $.getIntrinsic('%Promise%')));
  const result = AsyncGeneratorValidate($, generator);
  if (IsAbrupt(result)) return yield* RejectAndReturnPromise($, result, promiseCapability);
  Assert(IsAsyncGen(generator));
  // 5.
  const state = generator.AsyncGeneratorState;
  if (state === AsyncGeneratorState.completed) {
    const iteratorResult = CreateIterResultObject($, undefined, true);
    CastNotAbrupt(yield* Call($, promiseCapability.Resolve, undefined, [iteratorResult]));
    return promiseCapability.Promise;
  }
  AsyncGeneratorEnqueue(generator, value, promiseCapability);
  if (state === AsyncGeneratorState.suspendedStart || state === AsyncGeneratorState.suspendedYield) {
    yield* AsyncGeneratorResume($, generator, value);
  }
  return promiseCapability.Promise;
}

/**
 * 27.6.1.3 AsyncGenerator.prototype.return ( value )
 * 
 * 1. Let generator be the this value.
 * 2. Let promiseCapability be ! NewPromiseCapability(%Promise%).
 * 3. Let result be Completion(AsyncGeneratorValidate(generator, empty)).
 * 4. IfAbruptRejectPromise(result, promiseCapability).
 * 5. Let completion be Completion Record { [[Type]]: return,
 *    [[Value]]: value, [[Target]]: empty }.
 * 6. Perform AsyncGeneratorEnqueue(generator, completion, promiseCapability).
 * 7. Let state be generator.[[AsyncGeneratorState]].
 * 8. If state is either suspendedStart or completed, then
 *     a. Set generator.[[AsyncGeneratorState]] to awaiting-return.
 *     b. Perform ! AsyncGeneratorAwaitReturn(generator).
 * 9. Else if state is suspendedYield, then
 *     a. Perform AsyncGeneratorResume(generator, completion).
 * 10. Else,
 *     a. Assert: state is either executing or awaiting-return.
 * 11. Return promiseCapability.[[Promise]].
 */
export function* AsyncGeneratorPrototypeReturn(
  $: VM,
  generator: Obj,
  value: Val,
): ECR<Val> {
  const promiseCapability = CastNotAbrupt(yield* NewPromiseCapability($, $.getIntrinsic('%Promise%')));
  const result = AsyncGeneratorValidate($, generator);
  if (IsAbrupt(result)) return yield* RejectAndReturnPromise($, result, promiseCapability);
  Assert(IsAsyncGen(generator));
  // 5.
  const completion = ReturnCompletion(value);
  AsyncGeneratorEnqueue(generator, completion, promiseCapability);
  const state = generator.AsyncGeneratorState;
  if (state === AsyncGeneratorState.suspendedStart || state === AsyncGeneratorState.completed) {
    generator.AsyncGeneratorState = AsyncGeneratorState.awaitingReturn;
    CastNotAbrupt(yield* AsyncGeneratorAwaitReturn($, generator));
  } else if (state === AsyncGeneratorState.suspendedYield) {
    yield* AsyncGeneratorResume($, generator, completion);
  }
  return promiseCapability.Promise;
}

/**
 * 27.6.1.4 AsyncGenerator.prototype.throw ( exception )
 * 
 * 1. Let generator be the this value.
 * 2. Let promiseCapability be ! NewPromiseCapability(%Promise%).
 * 3. Let result be Completion(AsyncGeneratorValidate(generator, empty)).
 * 4. IfAbruptRejectPromise(result, promiseCapability).
 * 5. Let state be generator.[[AsyncGeneratorState]].
 * 6. If state is suspendedStart, then
 *     a. Set generator.[[AsyncGeneratorState]] to completed.
 *     b. Set state to completed.
 * 7. If state is completed, then
 *     a. Perform ! Call(promiseCapability.[[Reject]], undefined, « exception »).
 *     b. Return promiseCapability.[[Promise]].
 * 8. Let completion be ThrowCompletion(exception).
 * 9. Perform AsyncGeneratorEnqueue(generator, completion, promiseCapability).
 * 10. If state is suspendedYield, then
 *     a. Perform AsyncGeneratorResume(generator, completion).
 * 11. Else,
 *     a. Assert: state is either executing or awaiting-return.
 * 12. Return promiseCapability.[[Promise]].
 */
export function* AsyncGeneratorPrototypeThrow(
  $: VM,
  generator: Obj,
  exception: Val,
): ECR<Val> {
  const promiseCapability = CastNotAbrupt(yield* NewPromiseCapability($, $.getIntrinsic('%Promise%')));
  const result = AsyncGeneratorValidate($, generator);
  if (IsAbrupt(result)) return yield* RejectAndReturnPromise($, result, promiseCapability);
  Assert(IsAsyncGen(generator));
  // 5.
  let state = generator.AsyncGeneratorState;
  if (state === AsyncGeneratorState.suspendedStart) {
    state = generator.AsyncGeneratorState = AsyncGeneratorState.completed;
  }
  if (state === AsyncGeneratorState.completed) {
    CastNotAbrupt(yield* Call($, promiseCapability.Reject, undefined, [exception]));
    return promiseCapability.Promise;
  }
  const completion = ThrowCompletion(exception);
  AsyncGeneratorEnqueue(generator, completion, promiseCapability);
  if (state === AsyncGeneratorState.suspendedYield) {
    yield* AsyncGeneratorResume($, generator, completion);
  } else {
    Assert(state === AsyncGeneratorState.executing || state === AsyncGeneratorState.awaitingReturn);
  }
  return promiseCapability.Promise;
}

/**
 * 27.6.2 Properties of AsyncGenerator Instances
 * 
 * AsyncGenerator instances are initially created with the internal
 * slots described below:
 * 
 * Table 83: Internal Slots of AsyncGenerator Instances
 * [[AsyncGeneratorState]], undefined, suspendedStart, suspendedYield,
 * executing, awaiting-return, or completed - The current execution
 * state of the async generator.
 * 
 * [[AsyncGeneratorContext]], an execution context - The execution
 * context that is used when executing the code of this async
 * generator.
 * 
 * [[AsyncGeneratorQueue]], a List of AsyncGeneratorRequest Records -
 * Records which represent requests to resume the async
 * generator. Except during state transitions, it is non-empty if and
 * only if [[AsyncGeneratorState]] is either executing or
 * awaiting-return.
 * 
 * [[GeneratorBrand]], a String or empty - A brand used to distinguish
 * different kinds of async generators. The [[GeneratorBrand]] of
 * async generators declared by ECMAScript source text is always
 * empty.
 */
interface AsyncGeneratorSlots {
  AsyncGeneratorState: AsyncGeneratorState;
  AsyncGeneratorContext: ExecutionContext;
  AsyncGeneratorQueue: AsyncGeneratorRequest[];
  GeneratorBrand: string|EMPTY;
}
export type AsyncGen = Obj & AsyncGeneratorSlots;
export function IsAsyncGen(generator: Obj|undefined): generator is AsyncGen {
  return generator?.AsyncGeneratorState != null;
}

declare global {
  interface ObjectSlots extends Partial<AsyncGeneratorSlots> {}
}

enum AsyncGeneratorState {
  suspendedStart = 1,
  suspendedYield = 2,
  executing = 3,
  completed = 4,
  awaitingReturn = 5,
}

// 27.6.3 AsyncGenerator Abstract Operations

/**
 * 27.6.3.1 AsyncGeneratorRequest Records
 * 
 * An AsyncGeneratorRequest is a Record value used to store
 * information about how an async generator should be resumed and
 * contains capabilities for fulfilling or rejecting the corresponding
 * promise.
 * 
 * They have the following fields:
 * 
 * Table 84: AsyncGeneratorRequest Record Fields
 * [[Completion]], a Completion Record - The Completion Record which
 * should be used to resume the async generator.
 * [[Capability]], a PromiseCapability Record - The promise
 * capabilities associated with this request.
 */
export class AsyncGeneratorRequest {
  constructor(
    readonly Completion: CR<Val>,
    readonly Capability: PromiseCapability,
  ) {}
}

/**
 * 27.6.3.2 AsyncGeneratorStart ( generator, generatorBody )
 * 
 * The abstract operation AsyncGeneratorStart takes arguments
 * generator (an AsyncGenerator) and generatorBody (a FunctionBody
 * Parse Node or an Abstract Closure with no parameters) and returns
 * unused. It performs the following steps when called:
 * 
 * 1. Assert: generator.[[AsyncGeneratorState]] is undefined.
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
 *         ii. Let result be Completion(generatorBody()).
 *     e. Assert: If we return here, the async generator either threw
 *        an exception or performed either an implicit or explicit
 *        return.
 *     f. Remove acGenContext from the execution context stack and
 *        restore the execution context that is at the top of the
 *        execution context stack as the running execution context.
 *     g. Set acGenerator.[[AsyncGeneratorState]] to completed.
 *     h. If result.[[Type]] is normal, set result to NormalCompletion(undefined).
 *         i. If result.[[Type]] is return, set result to NormalCompletion(result.[[Value]]).
 *     j. Perform AsyncGeneratorCompleteStep(acGenerator, result, true).
 *     k. Perform AsyncGeneratorDrainQueue(acGenerator).
 *     l. Return undefined.
 * 5. Set the code evaluation state of genContext such that when
 *    evaluation is resumed for that execution context, closure will be
 *    called with no arguments.
 * 6. Set generator.[[AsyncGeneratorContext]] to genContext.
 * 7. Set generator.[[AsyncGeneratorState]] to suspendedStart.
 * 8. Set generator.[[AsyncGeneratorQueue]] to a new empty List.
 * 9. Return unused.
 */
export function* AsyncGeneratorStart(
  $: VM,
  generator: Obj,
  generatorBody: BlockLike|(() => ECR<Val>),
): ECR<UNUSED> {
  Assert(generator.AsyncGeneratorState === undefined);
  const genContext = $.getRunningContext();
  genContext.Generator = generator;
  function* closure(): ECR<UNUSED> {
    const acGenContext = $.getRunningContext();
    const acGenerator = acGenContext.Generator;
    Assert(IsAsyncGen(acGenerator));
    const isClosure = typeof generatorBody === 'function';
    let result = yield* (isClosure ? generatorBody() : $.evaluateValue(generatorBody));
    $.popContext(acGenContext);
    acGenerator.AsyncGeneratorState = AsyncGeneratorState.completed;
    if (!IsAbrupt(result)) {
      result = undefined;
    } else if (IsReturnCompletion(result)) {
      result = result.Value;
    }
    yield* AsyncGeneratorCompleteStep($, acGenerator, result, true);
    yield* AsyncGeneratorDrainQueue($, acGenerator);
    return UNUSED;
  };
  genContext.CodeEvaluationState = closure();
  generator.AsyncGeneratorContext = genContext;
  generator.AsyncGeneratorState = AsyncGeneratorState.suspendedStart;
  generator.AsyncGeneratorQueue = [];
  return UNUSED;
}

/**
 * 27.6.3.3 AsyncGeneratorValidate ( generator, generatorBrand )
 * 
 * The abstract operation AsyncGeneratorValidate takes arguments
 * generator (an ECMAScript language value) and generatorBrand (a
 * String or empty) and returns either a normal completion containing
 * unused or a throw completion. It performs the following steps when
 * called:
 * 
 * 1. Perform ? RequireInternalSlot(generator, [[AsyncGeneratorContext]]).
 * 2. Perform ? RequireInternalSlot(generator, [[AsyncGeneratorState]]).
 * 3. Perform ? RequireInternalSlot(generator, [[AsyncGeneratorQueue]]).
 * 4. If generator.[[GeneratorBrand]] is not generatorBrand, throw a TypeError exception.
 * 5. Return unused.
 */
export function AsyncGeneratorValidate(
  $: VM,
  generator: Obj,
  generatorBrand: string|EMPTY = EMPTY,
): CR<UNUSED> {
  if (
    !generator.AsyncGeneratorContext
      || !generator.AsyncGeneratorState
      || !generator.AsyncGeneratorQueue
  ) {
    return $.throw('TypeError', 'not an async generator');
  }
  if (generator.GeneratorBrand !== generatorBrand) {
    return $.throw('TypeError', 'bad brand: got ${generator.GeneratorBrand}, expected ${generatorBrand}');
  }
  return UNUSED;
}

/**
 * 27.6.3.4 AsyncGeneratorEnqueue ( generator, completion, promiseCapability )
 * 
 * The abstract operation AsyncGeneratorEnqueue takes arguments
 * generator (an AsyncGenerator), completion (a Completion Record),
 * and promiseCapability (a PromiseCapability Record) and returns
 * unused. It performs the following steps when called:
 * 
 * 1. Let request be AsyncGeneratorRequest { [[Completion]]:
 *    completion, [[Capability]]: promiseCapability }.
 * 2. Append request to generator.[[AsyncGeneratorQueue]].
 * 3. Return unused.
 */
export function AsyncGeneratorEnqueue(
  generator: AsyncGen,
  completion: CR<Val>,
  promiseCapability: PromiseCapability,
): UNUSED {
  const request = new AsyncGeneratorRequest(completion, promiseCapability);
  generator.AsyncGeneratorQueue.push(request);
  return UNUSED;
}

/**
 * 27.6.3.5 AsyncGeneratorCompleteStep ( generator, completion, done [ , realm ] )
 * 
 * The abstract operation AsyncGeneratorCompleteStep takes arguments
 * generator (an AsyncGenerator), completion (a Completion Record),
 * and done (a Boolean) and optional argument realm (a Realm Record)
 * and returns unused. It performs the following steps when called:
 * 
 * 1. Assert: generator.[[AsyncGeneratorQueue]] is not empty.
 * 2. Let next be the first element of generator.[[AsyncGeneratorQueue]].
 * 3. Remove the first element from generator.[[AsyncGeneratorQueue]].
 * 4. Let promiseCapability be next.[[Capability]].
 * 5. Let value be completion.[[Value]].
 * 6. If completion.[[Type]] is throw, then
 *     a. Perform ! Call(promiseCapability.[[Reject]], undefined, « value »).
 * 7. Else,
 *     a. Assert: completion.[[Type]] is normal.
 *     b. If realm is present, then
 *         i. Let oldRealm be the running execution context's Realm.
 *         ii. Set the running execution context's Realm to realm.
 *         iii. Let iteratorResult be CreateIterResultObject(value, done).
 *         iv. Set the running execution context's Realm to oldRealm.
 *     c. Else,
 *         i. Let iteratorResult be CreateIterResultObject(value, done).
 *     d. Perform ! Call(promiseCapability.[[Resolve]], undefined, « iteratorResult »).
 * 8. Return unused.
 */
export function* AsyncGeneratorCompleteStep(
  $: VM,
  generator: AsyncGen,
  completion: CR<Val>,
  done: boolean,
  realm?: RealmRecord,
): EvalGen<UNUSED> {
  Assert(generator.AsyncGeneratorQueue.length > 0);
  const next = generator.AsyncGeneratorQueue.shift()!;
  const promiseCapability = next.Capability;
  if (IsThrowCompletion(completion)) {
    yield* Call($, promiseCapability.Reject, undefined, [completion.Value]);
  } else {
    Assert(IsNormalCompletion(completion));
    let iteratorResult: Obj;
    if (realm) {
      const oldRealm = $.getRunningContext().Realm;
      $.getRunningContext().Realm = realm;
      iteratorResult = CreateIterResultObject($, completion, done);
      $.getRunningContext().Realm = oldRealm;
    } else {
      iteratorResult = CreateIterResultObject($, completion, done);
    }
    CastNotAbrupt(yield* Call($, promiseCapability.Resolve, undefined, [iteratorResult]));
  }
  return UNUSED;
}

/**
 * 27.6.3.6 AsyncGeneratorResume ( generator, completion )
 * 
 * The abstract operation AsyncGeneratorResume takes arguments
 * generator (an AsyncGenerator) and completion (a Completion Record)
 * and returns unused. It performs the following steps when called:
 * 
 * 1. Assert: generator.[[AsyncGeneratorState]] is either suspendedStart or suspendedYield.
 * 2. Let genContext be generator.[[AsyncGeneratorContext]].
 * 3. Let callerContext be the running execution context.
 * 4. Suspend callerContext.
 * 5. Set generator.[[AsyncGeneratorState]] to executing.
 * 6. Push genContext onto the execution context stack; genContext is now the running execution context.
 * 7. Resume the suspended evaluation of genContext using completion
 *    as the result of the operation that suspended it. Let result be the
 *    Completion Record returned by the resumed computation.
 * 8. Assert: result is never an abrupt completion.
 * 9. Assert: When we return here, genContext has already been removed
 *    from the execution context stack and callerContext is the currently
 *    running execution context.
 * 10. Return unused.
 */
export function* AsyncGeneratorResume(
  $: VM,
  generator: AsyncGen,
  completion: CR<Val>,
): EvalGen<UNUSED> {
  Assert(generator.AsyncGeneratorState === AsyncGeneratorState.suspendedStart
    || generator.AsyncGeneratorState === AsyncGeneratorState.suspendedYield);
  const genContext = generator.AsyncGeneratorContext;
  const callerContext = $.getRunningContext();
  callerContext.suspend(); // TODO - do this somewhere else??
  generator.AsyncGeneratorState = AsyncGeneratorState.executing;

  // yield* $.resumeContext(genContext, completion);

  const iter = genContext.CodeEvaluationState!;
  yield* proceed(completion);

  function* proceed(cr: CR<Val>): ECR<Val> {
    $.enterContext(genContext);
    let iterResult = iter.next(cr);
    while (!iterResult.done && !iterResult.value) {
      yield;
      iterResult = iter.next();
    }
    if (iterResult.done) {
      Assert(UNUSED.is(iterResult.value));
      return;
    }
    // await or yield - find out which
    Assert(iterResult.value);
    //Assert($.getRunningContext() === callerContext);
    if (iterResult.value.type === 'yield') {
      //Assert(generator.AsyncGeneratorState === AsyncGeneratorState.executing);
      Assert(iterResult.value.yield === undefined); // not propagated here
      return;
    }
    Assert(iterResult.value.type === 'await');
    const promise = iterResult.value.await;
    const onFulfilled = CreateBuiltinFunctionFromClosure(function*(v) {
      //$.popContext(); // HACK - was below??
      // const prevContext = $.getRunningContext();
      // prevContext.suspend();
      return yield* proceed(v);
    }, 1, '', {$});
    const onRejected = CreateBuiltinFunctionFromClosure(function*(reason) {
      //$.popContext(); // HACK - was below??
      // const prevContext = $.getRunningContext();
      // prevContext.suspend();
      return yield* proceed(ThrowCompletion(reason));
    }, 1, '', {$});
    PerformPromiseThen($, promise, onFulfilled, onRejected);
    //$.popContext(callerContext);
    $.popContext(genContext);  // ???? was above

    // Assert: When we return here, genContext has already been removed
    // from the execution context stack and callerContext is the currently
    // running execution context.
    return undefined;
  }

  return UNUSED;

  // // TODO - step through an iterator???
  // const result = yield* $.resumeContext(genContext, completion);



  // Assert(!IsAbrupt(result));
  // // Assert: When we return here, genContext has already been removed
  // // from the execution context stack and callerContext is the currently
  // // running execution context.
  // return UNUSED;
}

/**
 * 27.6.3.7 AsyncGeneratorUnwrapYieldResumption ( resumptionValue )
 * 
 * The abstract operation AsyncGeneratorUnwrapYieldResumption takes
 * argument resumptionValue (a Completion Record) and returns either a
 * normal completion containing an ECMAScript language value or an
 * abrupt completion. It performs the following steps when called:
 * 
 * 1. If resumptionValue.[[Type]] is not return, return ? resumptionValue.
 * 2. Let awaited be Completion(Await(resumptionValue.[[Value]])).
 * 3. If awaited.[[Type]] is throw, return ? awaited.
 * 4. Assert: awaited.[[Type]] is normal.
 * 5. Return Completion Record { [[Type]]: return, [[Value]]:
 *    awaited.[[Value]], [[Target]]: empty }.
 */
export function* AsyncGeneratorUnwrapYieldResumption(
  $: VM,
  resumptionValue: CR<Val>,
): ECR<Val> {
  if (!IsReturnCompletion(resumptionValue)) return resumptionValue;
  const awaited = yield* Await($, resumptionValue.Value);
  if (IsThrowCompletion(awaited)) return awaited;
  Assert(IsNormalCompletion(awaited));
  return ReturnCompletion(awaited);
}

/**
 * 27.6.3.8 AsyncGeneratorYield ( value )
 * 
 * The abstract operation AsyncGeneratorYield takes argument value (an
 * ECMAScript language value) and returns either a normal completion
 * containing an ECMAScript language value or an abrupt completion. It
 * performs the following steps when called:
 * 
 * 1. Let genContext be the running execution context.
 * 2. Assert: genContext is the execution context of a generator.
 * 3. Let generator be the value of the Generator component of genContext.
 * 4. Assert: GetGeneratorKind() is async.
 * 5. Let completion be NormalCompletion(value).
 * 6. Assert: The execution context stack has at least two elements.
 * 7. Let previousContext be the second to top element of the execution context stack.
 * 8. Let previousRealm be previousContext's Realm.
 * 9. Perform AsyncGeneratorCompleteStep(generator, completion, false, previousRealm).
 * 10. Let queue be generator.[[AsyncGeneratorQueue]].
 * 11. If queue is not empty, then
 *     a. NOTE: Execution continues without suspending the generator.
 *     b. Let toYield be the first element of queue.
 *     c. Let resumptionValue be Completion(toYield.[[Completion]]).
 *     d. Return ? AsyncGeneratorUnwrapYieldResumption(resumptionValue).
 * 12. Else,
 *     a. Set generator.[[AsyncGeneratorState]] to suspendedYield.
 *     b. Remove genContext from the execution context stack and
 *        restore the execution context that is at the top of the
 *        execution context stack as the running execution context.
 *     c. Let callerContext be the running execution context.
 *     d. Resume callerContext passing undefined. If genContext is
 *        ever resumed again, let resumptionValue be the Completion
 *        Record with which it is resumed.
 *     e. Assert: If control reaches here, then genContext is the running execution context again.
 *     f. Return ? AsyncGeneratorUnwrapYieldResumption(resumptionValue).
 */
export function* AsyncGeneratorYield(
  $: VM,
  value: Val,
): ECR<Val> {
  const genContext = $.getRunningContext();
  const generator = genContext.Generator;
  Assert(IsAsyncGen(generator));
  const previousRealm = $.getRunningContext(-2).Realm;
  yield* AsyncGeneratorCompleteStep($, generator, value, false, previousRealm);
  const queue = generator.AsyncGeneratorQueue;
  if (queue.length > 0) {
    // NOTE: Execution continues without suspending the generator.
    const toYield = queue[0];
    const resumptionValue = toYield.Completion;
    return yield* AsyncGeneratorUnwrapYieldResumption($, resumptionValue);
  }
  generator.AsyncGeneratorState = AsyncGeneratorState.suspendedYield;
  $.popContext(genContext);

  const resumptionValue = yield {yield: undefined, type: 'yield'};

  // const callerContext = $.getRunningContext();
  // const resumptionValue = yield* $.resumeContext(callerContext, undefined);

  // Assert: If control reaches here, then genContext is
  // the running execution context again.
  return yield* AsyncGeneratorUnwrapYieldResumption($, resumptionValue);
}

/**
 * 27.6.3.9 AsyncGeneratorAwaitReturn ( generator )
 * 
 * The abstract operation AsyncGeneratorAwaitReturn takes argument
 * generator (an AsyncGenerator) and returns either a normal
 * completion containing unused or a throw completion. It performs the
 * following steps when called:
 * 
 * 1. Let queue be generator.[[AsyncGeneratorQueue]].
 * 2. Assert: queue is not empty.
 * 3. Let next be the first element of queue.
 * 4. Let completion be Completion(next.[[Completion]]).
 * 5. Assert: completion.[[Type]] is return.
 * 6. Let promise be ? PromiseResolve(%Promise%, completion.[[Value]]).
 * 7. Let fulfilledClosure be a new Abstract Closure with parameters
 *    (value) that captures generator and performs the following steps
 *    when called:
 *     a. Set generator.[[AsyncGeneratorState]] to completed.
 *     b. Let result be NormalCompletion(value).
 *     c. Perform AsyncGeneratorCompleteStep(generator, result, true).
 *     d. Perform AsyncGeneratorDrainQueue(generator).
 *     e. Return undefined.
 * 8. Let onFulfilled be CreateBuiltinFunction(fulfilledClosure, 1, "", « »).
 * 9. Let rejectedClosure be a new Abstract Closure with parameters
 *    (reason) that captures generator and performs the following steps
 *    when called:
 *     a. Set generator.[[AsyncGeneratorState]] to completed.
 *     b. Let result be ThrowCompletion(reason).
 *     c. Perform AsyncGeneratorCompleteStep(generator, result, true).
 *     d. Perform AsyncGeneratorDrainQueue(generator).
 *     e. Return undefined.
 * 10. Let onRejected be CreateBuiltinFunction(rejectedClosure, 1, "", « »).
 * 11. Perform PerformPromiseThen(promise, onFulfilled, onRejected).
 * 12. Return unused.
 */
export function* AsyncGeneratorAwaitReturn(
  $: VM,
  generator: AsyncGen,
): ECR<UNUSED> {
  const queue = generator.AsyncGeneratorQueue;
  Assert(queue.length > 0);
  const next = queue[0];
  const completion = next.Completion;
  Assert(IsReturnCompletion(completion));
  const promise = yield* PromiseResolve($, $.getIntrinsic('%Promise%'), completion.Value);
  if (IsAbrupt(promise)) return promise;
  const fulfilledClosure = function*(value: Val): ECR<undefined> {
    generator.AsyncGeneratorState = AsyncGeneratorState.completed;
    yield* AsyncGeneratorCompleteStep($, generator, value, true);
    yield* AsyncGeneratorDrainQueue($, generator);
    return;
  };
  const onFulfilled = CreateBuiltinFunctionFromClosure(fulfilledClosure, 1, '', {$});
  const rejectedClosure = function*(reason: Val): ECR<undefined> {
    generator.AsyncGeneratorState = AsyncGeneratorState.completed;
    yield* AsyncGeneratorCompleteStep($, generator, ThrowCompletion(reason), true);
    yield* AsyncGeneratorDrainQueue($, generator);
    return;
  };
  const onRejected = CreateBuiltinFunctionFromClosure(rejectedClosure, 1, '', {$});
  PerformPromiseThen($, promise, onFulfilled, onRejected);
  return UNUSED;
}

/**
 * 27.6.3.10 AsyncGeneratorDrainQueue ( generator )
 * 
 * The abstract operation AsyncGeneratorDrainQueue takes argument
 * generator (an AsyncGenerator) and returns unused. It drains the
 * generator's AsyncGeneratorQueue until it encounters an
 * AsyncGeneratorRequest which holds a return completion. It performs
 * the following steps when called:
 * 
 * 1. Assert: generator.[[AsyncGeneratorState]] is completed.
 * 2. Let queue be generator.[[AsyncGeneratorQueue]].
 * 3. If queue is empty, return unused.
 * 4. Let done be false.
 * 5. Repeat, while done is false,
 *     a. Let next be the first element of queue.
 *     b. Let completion be Completion(next.[[Completion]]).
 *     c. If completion.[[Type]] is return, then
 *         i. Set generator.[[AsyncGeneratorState]] to awaiting-return.
 *         ii. Perform ! AsyncGeneratorAwaitReturn(generator).
 *         iii. Set done to true.
 *     d. Else,
 *         i. If completion.[[Type]] is normal, then
 *             1. Set completion to NormalCompletion(undefined).
 *         ii. Perform AsyncGeneratorCompleteStep(generator, completion, true).
 *         iii. If queue is empty, set done to true.
 * 6. Return unused.
 */
export function* AsyncGeneratorDrainQueue(
  $: VM,
  generator: AsyncGen,
): EvalGen<UNUSED> {
  Assert(generator.AsyncGeneratorState === AsyncGeneratorState.completed);
  const queue = generator.AsyncGeneratorQueue;
  while (queue.length) {
    const next = queue[0];
    let completion = next.Completion;
    if (IsReturnCompletion(completion)) {
      generator.AsyncGeneratorState = AsyncGeneratorState.awaitingReturn;
      CastNotAbrupt(yield* AsyncGeneratorAwaitReturn($, generator));
      return UNUSED;
    } else {
      if (IsNormalCompletion(completion)) {
        completion = undefined;
      }
      yield* AsyncGeneratorCompleteStep($, generator, completion, true); // NOTE: shifts queue.
    }
  }
  return UNUSED;
}

/**
 * 27.6.3.11 CreateAsyncIteratorFromClosure ( closure, generatorBrand, generatorPrototype )
 * 
 * The abstract operation CreateAsyncIteratorFromClosure takes
 * arguments closure (an Abstract Closure with no parameters),
 * generatorBrand (a String or empty), and generatorPrototype (an
 * Object) and returns an AsyncGenerator. It performs the following
 * steps when called:
 * 
 * 1. NOTE: closure can contain uses of the Await operation and uses
 *    of the Yield operation to yield an IteratorResult object.
 * 2. Let internalSlotsList be « [[AsyncGeneratorState]],
 *    [[AsyncGeneratorContext]], [[AsyncGeneratorQueue]],
 *    [[GeneratorBrand]] ».
 * 3. Let generator be OrdinaryObjectCreate(generatorPrototype, internalSlotsList).
 * 4. Set generator.[[GeneratorBrand]] to generatorBrand.
 * 5. Set generator.[[AsyncGeneratorState]] to undefined.
 * 6. Let callerContext be the running execution context.
 * 7. Let calleeContext be a new execution context.
 * 8. Set the Function of calleeContext to null.
 * 9. Set the Realm of calleeContext to the current Realm Record.
 * 10. Set the ScriptOrModule of calleeContext to callerContext's ScriptOrModule.
 * 11. If callerContext is not already suspended, suspend callerContext.
 * 12. Push calleeContext onto the execution context stack;
 *     calleeContext is now the running execution context.
 * 13. Perform AsyncGeneratorStart(generator, closure).
 * 14. Remove calleeContext from the execution context stack and
 *     restore callerContext as the running execution context.
 * 15. Return generator.
 */
export function CreateAsyncIteratorFromClosure(
  $: VM,
  closure: () => ECR<Val>,
  generatorBrand: string|EMPTY,
  generatorPrototype: Obj,
): AsyncGen {
  const generator = OrdinaryObjectCreate({
    Prototype: generatorPrototype,
    AsyncGeneratorState: undefined,
    AsyncGeneratorContext: undefined,
    AsyncGeneratorQueue: [],
    GeneratorBrand: generatorBrand,
  });
  const callerContext = $.getRunningContext();
  const calleeContext =
    new AsyncIteratorExecutionContext(
      callerContext.ScriptOrModule, null, callerContext.Realm, null);
  callerContext.suspend();
  $.enterContext(calleeContext);
  AsyncGeneratorStart($, generator, closure);
  $.popContext(calleeContext);
  Assert(IsAsyncGen(generator));
  return generator;
}

class AsyncIteratorExecutionContext extends ExecutionContext {}
