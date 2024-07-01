import { IsCallable, IsConstructor, SameValue } from './abstract_compare';
import { GetIterator, IteratorClose, IteratorRecord, IteratorStep, IteratorValue } from './abstract_iterator';
import { Call, Construct, CreateArrayFromList, Get, GetFunctionRealm, Invoke, SpeciesConstructor } from './abstract_object';
import { Assert } from './assert';
import { Abrupt, CR, IsAbrupt, ThrowCompletion } from './completion_record';
import { EMPTY, SYNC } from './enums';
import { CreateBuiltinFunction, Func, method } from './func';
import { objectAndFunctionPrototype } from './fundamental';
import { iterators } from './iterators';
import { HostCallJobCallback, HostEnqueuePromiseJob, HostMakeJobCallback, JobCallback } from './job';
import { Obj, OrdinaryCreateFromConstructor, OrdinaryObjectCreate } from './obj';
import { prop0, propWC } from './property_descriptor';
import { RealmRecord, defineProperties } from './realm_record';
import { Val } from './val';
import { DebugString, ECR, Plugin, VM } from './vm';

/**
 * 27.2 Promise Objects
 * 
 * A Promise is an object that is used as a placeholder for the
 * eventual results of a deferred (and possibly asynchronous)
 * computation.
 * 
 * Any Promise is in one of three mutually exclusive states:
 * fulfilled, rejected, and pending:
 * 
 *   - A promise p is fulfilled if p.then(f, r) will immediately enqueue a
 *     Job to call the function f.
 *   - A promise p is rejected if p.then(f, r) will immediately enqueue a
 *     Job to call the function r.
 *   - A promise is pending if it is neither fulfilled nor rejected.
 * 
 * A promise is said to be settled if it is not pending, i.e. if it is
 * either fulfilled or rejected.
 * 
 * A promise is resolved if it is settled or if it has been “locked
 * in” to match the state of another promise. Attempting to resolve or
 * reject a resolved promise has no effect. A promise is unresolved if
 * it is not resolved. An unresolved promise is always in the pending
 * state. A resolved promise may be pending, fulfilled or rejected.
 */
export const promises: Plugin = {
  id: 'promises',
  // TODO - make the iterators dep optional (and remove Promise.all, etc?)
  deps: () => [objectAndFunctionPrototype, iterators],
  realm: {
    CreateIntrinsics(realm, stagedGlobals) {
      const promiseCtor = CreateBuiltinFunction(
        {Construct: PromiseConstructor}, 1, 'Promise', {Realm: realm});

      const promisePrototype =
        OrdinaryObjectCreate({
          Prototype: realm.Intrinsics.get('%Object.prototype%')!,
        });

      realm.Intrinsics.set('%Promise%', promiseCtor);
      realm.Intrinsics.set('%Promise.prototype%', promisePrototype);
      stagedGlobals.set('Promise', propWC(promiseCtor));

      defineProperties(realm, promiseCtor, {
        'all': method(PromiseCtorAll, 1),
        'prototype': prop0(promisePrototype),
      });

      defineProperties(realm, promisePrototype, {
        'constructor': propWC(promiseCtor),
        'then': method(PromisePrototypeThen),
      });
    },
  },
};

// 27.2.1 Promise Abstract Operations

/**
 * 27.2.1.1 PromiseCapability Records
 * 
 * A PromiseCapability Record is a Record value used to encapsulate a
 * Promise or promise-like object along with the functions that are
 * capable of resolving or rejecting that promise. PromiseCapability
 * Records are produced by the NewPromiseCapability abstract
 * operation.
 * 
 * PromiseCapability Records have the fields listed in Table 79.
 * 
 * [[Promise]], an Object - An object that is usable as a promise.
 * [[Resolve]], a function object - The function that is used to
 * resolve the given promise.
 * [[Reject]], a function object - The function that is used to
 * reject the given promise.
 */
export class PromiseCapability {
  constructor(
    readonly Promise: Prom,
    readonly Resolve: Func,
    readonly Reject: Func,
  ) {}
}

/**
 * 27.2.1.1.1 IfAbruptRejectPromise ( value, capability )
 * 
 * IfAbruptRejectPromise is a shorthand for a sequence of algorithm
 * steps that use a PromiseCapability Record. An algorithm step of the
 * form:
 * 
 * 1. IfAbruptRejectPromise(value, capability).
 * 
 * means the same thing as:
 * 
 * 1. Assert: value is a Completion Record.
 * 2. If value is an abrupt completion, then
 *     a. Perform ? Call(capability.[[Reject]], undefined, « value.[[Value]] »).
 *     b. Return capability.[[Promise]].
 * 3. Else, set value to value.[[Value]].
 */
export function* RejectAndReturnPromise(
  $: VM,
  value: Abrupt,
  capability: PromiseCapability,
): ECR<Obj> {
  Assert(!EMPTY.is(value.Value));
  yield* Call($, capability.Reject, undefined, [value.Value]);
  return capability.Promise;
}

/**
 * 27.2.1.2 PromiseReaction Records
 * 
 * The PromiseReaction is a Record value used to store information
 * about how a promise should react when it becomes resolved or
 * rejected with a given value. PromiseReaction records are created by
 * the PerformPromiseThen abstract operation, and are used by the
 * Abstract Closure returned by NewPromiseReactionJob.
 * 
 * PromiseReaction records have the fields listed in Table 80.
 * 
 * [[Capability]], a PromiseCapability Record or undefined - The
 * capabilities of the promise for which this record provides a
 * reaction handler.
 * [[Type]], Fulfill or Reject - The [[Type]] is used when [[Handler]]
 * is empty to allow for behaviour specific to the settlement type.
 * [[Handler]], a JobCallback Record or empty - The function that
 * should be applied to the incoming value, and whose return value
 * will govern what happens to the derived promise. If [[Handler]] is
 * empty, a function that depends on the value of [[Type]] will be
 * used instead.
 */
export class PromiseReaction {
  constructor(
    readonly Capability: PromiseCapability|undefined,
    readonly Type: 'fulfill'|'reject',
    readonly Handler: JobCallback|EMPTY,
  ) {}
}

/**
 * 27.2.1.3 CreateResolvingFunctions ( promise )
 * 
 * The abstract operation CreateResolvingFunctions takes argument
 * promise (a Promise) and returns a Record with fields [[Resolve]] (a
 * function object) and [[Reject]] (a function object). It performs
 * the following steps when called:
 * 
 * 1. Let alreadyResolved be the Record { [[Value]]: false }.
 * 2. Let stepsResolve be the algorithm steps defined in Promise
 *    Resolve Functions.
 * 3. Let lengthResolve be the number of non-optional parameters of
 *    the function definition in Promise Resolve Functions.
 * 4. Let resolve be CreateBuiltinFunction(stepsResolve,
 *    lengthResolve, "", « [[Promise]], [[AlreadyResolved]] »).
 * 5. Set resolve.[[Promise]] to promise.
 * 6. Set resolve.[[AlreadyResolved]] to alreadyResolved.
 * 7. Let stepsReject be the algorithm steps defined in Promise Reject Functions.
 * 8. Let lengthReject be the number of non-optional parameters of the
 *    function definition in Promise Reject Functions.
 * 9. Let reject be CreateBuiltinFunction(stepsReject, lengthReject,
 *    "", « [[Promise]], [[AlreadyResolved]] »).
 * 10. Set reject.[[Promise]] to promise.
 * 11. Set reject.[[AlreadyResolved]] to alreadyResolved.
 * 12. Return the Record { [[Resolve]]: resolve, [[Reject]]: reject }.
 */
export function* CreateResolvingFunctions($: VM, promise: Prom) {
  const alreadyResolved = {Value: false};
  const resolve = CreateBuiltinFunction(
    {Call: PromiseResolveSteps}, 1, '', {$, Promise: promise, AlreadyResolved: alreadyResolved});
  const reject = CreateBuiltinFunction(
    {Call: PromiseRejectSteps}, 1, '', {$, Promise: promise, AlreadyResolved: alreadyResolved});
  return {Resolve: resolve, Reject: reject};
}

interface PromiseResolveSlots {
  Promise: Prom;
  AlreadyResolved: {Value: Val};
}
declare global {
  interface ObjectSlots extends Partial<PromiseResolveSlots> {}
}

/**
 * 27.2.1.3.1 Promise Reject Functions
 * 
 * A promise reject function is an anonymous built-in function that
 * has [[Promise]] and [[AlreadyResolved]] internal slots.
 * 
 * When a promise reject function is called with argument reason, the
 * following steps are taken:
 * 
 * 1. Let F be the active function object.
 * 2. Assert: F has a [[Promise]] internal slot whose value is an Object.
 * 3. Let promise be F.[[Promise]].
 * 4. Let alreadyResolved be F.[[AlreadyResolved]].
 * 5. If alreadyResolved.[[Value]] is true, return undefined.
 * 6. Set alreadyResolved.[[Value]] to true.
 * 7. Perform RejectPromise(promise, reason).
 * 8. Return undefined.
 * 
 * The "length" property of a promise reject function is 1𝔽.
 */
export function* PromiseRejectSteps($: VM, _: Val, [reason]: Val[]): ECR<undefined> {
  const F = $.getActiveFunctionObject();
  Assert(F && F.Promise instanceof Obj);
  const promise = F.Promise;
  const alreadyResolved = F.AlreadyResolved!;
  if (alreadyResolved.Value) return;
  alreadyResolved.Value = true;
  yield* RejectPromise($, promise, reason);
  return;
}

/**
 * 27.2.1.3.2 Promise Resolve Functions
 * 
 * A promise resolve function is an anonymous built-in function that
 * has [[Promise]] and [[AlreadyResolved]] internal slots.
 * 
 * When a promise resolve function is called with argument resolution,
 * the following steps are taken:
 * 
 * 1. Let F be the active function object.
 * 2. Assert: F has a [[Promise]] internal slot whose value is an Object.
 * 3. Let promise be F.[[Promise]].
 * 4. Let alreadyResolved be F.[[AlreadyResolved]].
 * 5. If alreadyResolved.[[Value]] is true, return undefined.
 * 6. Set alreadyResolved.[[Value]] to true.
 * 7. If SameValue(resolution, promise) is true, then
 *     a. Let selfResolutionError be a newly created TypeError object.
 *     b. Perform RejectPromise(promise, selfResolutionError).
 *     c. Return undefined.
 * 8. If resolution is not an Object, then
 *     a. Perform FulfillPromise(promise, resolution).
 *     b. Return undefined.
 * 9. Let then be Completion(Get(resolution, "then")).
 * 10. If then is an abrupt completion, then
 *     a. Perform RejectPromise(promise, then.[[Value]]).
 *     b. Return undefined.
 * 11. Let thenAction be then.[[Value]].
 * 12. If IsCallable(thenAction) is false, then
 *     a. Perform FulfillPromise(promise, resolution).
 *     b. Return undefined.
 * 13. Let thenJobCallback be HostMakeJobCallback(thenAction).
 * 14. Let job be NewPromiseResolveThenableJob(promise, resolution,
 *     thenJobCallback).
 * 15. Perform HostEnqueuePromiseJob(job.[[Job]], job.[[Realm]]).
 * 16. Return undefined.
 * 
 * The "length" property of a promise resolve function is 1𝔽.
 */
export function* PromiseResolveSteps(
  $: VM,
  _thisArg: Val,
  [resolution]: Val[],
): ECR<undefined> {
  const F = $.getActiveFunctionObject();
  Assert(F && F.Promise instanceof Obj);
  const promise = F.Promise;
  const alreadyResolved = F.AlreadyResolved!;
  if (alreadyResolved.Value) return;
  alreadyResolved.Value = true;
  if (SameValue(resolution, promise)) {
    yield* RejectPromise(
      $, promise, $.makeError('TypeError', 'Chaining cycle detected for promise'));
    return;
  } else if (!(resolution instanceof Obj)) {
    yield* FulfillPromise($, promise, resolution);
    return;
  }
  const then = yield* Get($, resolution, 'then');
  if (IsAbrupt(then)) {
    Assert(!EMPTY.is(then.Value));
    yield* RejectPromise($, promise, then.Value);
    return;
  } else if (!IsCallable(then)) {
    yield* FulfillPromise($, promise, resolution);
    return;
  }
  const thenJobCallback = HostMakeJobCallback(then);
  const job = NewPromiseResolveThenableJob($, promise, resolution, thenJobCallback);
  HostEnqueuePromiseJob($, job.Job, job.Realm);
  return;
}

/**
 * 27.2.1.4 FulfillPromise ( promise, value )
 * 
 * The abstract operation FulfillPromise takes arguments promise (a
 * Promise) and value (an ECMAScript language value) and returns
 * unused. It performs the following steps when called:
 * 
 * 1. Assert: The value of promise.[[PromiseState]] is pending.
 * 2. Let reactions be promise.[[PromiseFulfillReactions]].
 * 3. Set promise.[[PromiseResult]] to value.
 * 4. Set promise.[[PromiseFulfillReactions]] to undefined.
 * 5. Set promise.[[PromiseRejectReactions]] to undefined.
 * 6. Set promise.[[PromiseState]] to fulfilled.
 * 7. Perform TriggerPromiseReactions(reactions, value).
 * 8. Return unused.
 */
export function* FulfillPromise($: VM, promise: Prom, value: Val): ECR<undefined> {
  Assert(promise.PromiseState === 'pending');
  const reactions = promise.PromiseFulfillReactions!;
  promise.PromiseResult = value;
  promise.PromiseFulfillReactions = undefined!;
  promise.PromiseRejectReactions = undefined!;
  promise.PromiseState = 'fulfilled';
  TriggerPromiseReactions($, reactions, value);
  return;
}

/**
 * 27.2.1.5 NewPromiseCapability ( C )
 * 
 * The abstract operation NewPromiseCapability takes argument C (an
 * ECMAScript language value) and returns either a normal completion
 * containing a PromiseCapability Record or a throw completion. It
 * attempts to use C as a constructor in the fashion of the built-in
 * Promise constructor to create a promise and extract its resolve and
 * reject functions. The promise plus the resolve and reject functions
 * are used to initialize a new PromiseCapability Record. It performs
 * the following steps when called:
 * 
 * 1. If IsConstructor(C) is false, throw a TypeError exception.
 * 2. NOTE: C is assumed to be a constructor function that supports
 *    the parameter conventions of the Promise constructor (see
 *    27.2.3.1).
 * 3. Let resolvingFunctions be the Record { [[Resolve]]: undefined,
 *    [[Reject]]: undefined }.
 * 4. Let executorClosure be a new Abstract Closure with parameters
 *    (resolve, reject) that captures resolvingFunctions and performs the
 *    following steps when called:
 *     a. If resolvingFunctions.[[Resolve]] is not undefined, throw a
 *        TypeError exception.
 *     b. If resolvingFunctions.[[Reject]] is not undefined, throw a
 *        TypeError exception.
 *     c. Set resolvingFunctions.[[Resolve]] to resolve.
 *     d. Set resolvingFunctions.[[Reject]] to reject.
 *     e. Return undefined.
 * 5. Let executor be CreateBuiltinFunction(executorClosure, 2, "", « »).
 * 6. Let promise be ? Construct(C, « executor »).
 * 7. If IsCallable(resolvingFunctions.[[Resolve]]) is false, throw a
 *    TypeError exception.
 * 8. If IsCallable(resolvingFunctions.[[Reject]]) is false, throw a
 *    TypeError exception.
 * 9. Return the PromiseCapability Record { [[Promise]]: promise,
 *    [[Resolve]]: resolvingFunctions.[[Resolve]], [[Reject]]:
 *    resolvingFunctions.[[Reject]] }.
 * 
 * NOTE: This abstract operation supports Promise subclassing, as it
 * is generic on any constructor that calls a passed executor function
 * argument in the same way as the Promise constructor. It is used to
 * generalize static methods of the Promise constructor to any
 * subclass.
 */
export function* NewPromiseCapability($: VM, C: Val): ECR<PromiseCapability> {
  if (!IsCallable(C)) {
    return $.throw('TypeError', 'NewPromiseCapability: C is not a constructor');
  }
  const resolvingFunctions: ResolvingFunctions = {Resolve: undefined, Reject: undefined};
  const executor = CreateBuiltinFunction({
    * Call($, _, [resolve, reject]) {
      if (resolvingFunctions.Resolve !== undefined || resolvingFunctions.Reject !== undefined) {
        return $.throw(
          'TypeError',
          'Promise executor has already been invoked with non-undefined arguments');
      }
      resolvingFunctions.Resolve = resolve;
      resolvingFunctions.Reject = reject;
      return;
    },
  }, 2, '', {$});
  const promise = yield* Construct($, C, [executor]);
  if (IsAbrupt(promise)) return promise;
  Assert(IsPromise(promise));
  if (!IsCallable(resolvingFunctions.Resolve) || !IsCallable(resolvingFunctions.Reject)) {
    return $.throw('TypeError', 'not a function');
  }
  return new PromiseCapability(promise, resolvingFunctions.Resolve, resolvingFunctions.Reject);
}

interface ResolvingFunctions {
  Resolve: Val;
  Reject: Val;
}

/**
 * 27.2.1.6 IsPromise ( x )
 * 
 * The abstract operation IsPromise takes argument x (an ECMAScript
 * language value) and returns a Boolean. It checks for the promise
 * brand on an object. It performs the following steps when called:
 * 
 * 1. If x is not an Object, return false.
 * 2. If x does not have a [[PromiseState]] internal slot, return false.
 * 3. Return true.
 */
export function IsPromise(x: Val): x is Prom {
  return Boolean(x instanceof Obj && x.PromiseState);
}
type Prom = Obj & PromiseSlots;

/**
 * 27.2.1.7 RejectPromise ( promise, reason )
 * 
 * The abstract operation RejectPromise takes arguments promise (a
 * Promise) and reason (an ECMAScript language value) and returns
 * unused. It performs the following steps when called:
 * 
 * 1. Assert: The value of promise.[[PromiseState]] is pending.
 * 2. Let reactions be promise.[[PromiseRejectReactions]].
 * 3. Set promise.[[PromiseResult]] to reason.
 * 4. Set promise.[[PromiseFulfillReactions]] to undefined.
 * 5. Set promise.[[PromiseRejectReactions]] to undefined.
 * 6. Set promise.[[PromiseState]] to rejected.
 * 7. If promise.[[PromiseIsHandled]] is false, perform
 *    HostPromiseRejectionTracker(promise, "reject").
 * 8. Perform TriggerPromiseReactions(reactions, reason).
 * 9. Return unused.
 */
export function* RejectPromise($: VM, promise: Prom, reason: Val): ECR<undefined> {
  Assert(promise.PromiseState === 'pending');
  const reactions = promise.PromiseRejectReactions;
  promise.PromiseResult = reason;
  promise.PromiseFulfillReactions = undefined!;
  promise.PromiseRejectReactions = undefined!;
  promise.PromiseState = 'rejected';
  if (!promise.PromiseIsHandled) {
    yield* HostPromiseRejectionTracker($, promise, 'reject');
  }
  TriggerPromiseReactions($, reactions, reason);
  return;
}

/**
 * 27.2.1.8 TriggerPromiseReactions ( reactions, argument )
 * 
 * The abstract operation TriggerPromiseReactions takes arguments
 * reactions (a List of PromiseReaction Records) and argument (an
 * ECMAScript language value) and returns unused. It enqueues a new
 * Job for each record in reactions. Each such Job processes the
 * [[Type]] and [[Handler]] of the PromiseReaction Record, and if the
 * [[Handler]] is not empty, calls it passing the given argument. If
 * the [[Handler]] is empty, the behaviour is determined by the
 * [[Type]]. It performs the following steps when called:
 * 
 * 1. For each element reaction of reactions, do
 *     a. Let job be NewPromiseReactionJob(reaction, argument).
 *     b. Perform HostEnqueuePromiseJob(job.[[Job]], job.[[Realm]]).
 * 2. Return unused.
 */
export function TriggerPromiseReactions($: VM, reactions: PromiseReaction[], argument: Val) {
  for (const reaction of reactions) {
    const job = NewPromiseReactionJob(reaction, argument);
    HostEnqueuePromiseJob($, job.Job, job.Realm);
  }
  return;
}

/**
 * 27.2.1.9 HostPromiseRejectionTracker ( promise, operation )
 * 
 * The host-defined abstract operation HostPromiseRejectionTracker
 * takes arguments promise (a Promise) and operation ("reject" or
 * "handle") and returns unused. It allows host environments to track
 * promise rejections.
 * 
 * An implementation of HostPromiseRejectionTracker must conform to
 * the following requirements:
 * 
 * It must complete normally (i.e. not return an abrupt completion).
 * 
 * The default implementation of HostPromiseRejectionTracker is to
 * return unused.
 * 
 * NOTE 1: HostPromiseRejectionTracker is called in two scenarios:
 *   - When a promise is rejected without any handlers, it is called
 *     with its operation argument set to "reject".
 *   - When a handler is added to a rejected promise for the first time,
 *     it is called with its operation argument set to "handle".
 * 
 * A typical implementation of HostPromiseRejectionTracker might try
 * to notify developers of unhandled rejections, while also being
 * careful to notify them if such previous notifications are later
 * invalidated by new handlers being attached.
 * 
 * NOTE 2: If operation is "handle", an implementation should not hold
 * a reference to promise in a way that would interfere with garbage
 * collection. An implementation may hold a reference to promise if
 * operation is "reject", since it is expected that rejections will 
 * be rare and not on hot code paths.
 */
export function* HostPromiseRejectionTracker(_$: VM, _promise: Prom, _operation: 'reject'|'handle') {
  // TODO - track unhandled rejections
}

////////////////////////////////////////////////////////////////
// 27.2.2 Promise Jobs

/**
 * 27.2.2.1 NewPromiseReactionJob ( reaction, argument )
 * 
 * The abstract operation NewPromiseReactionJob takes arguments
 * reaction (a PromiseReaction Record) and argument (an ECMAScript
 * language value) and returns a Record with fields [[Job]] (a Job
 * Abstract Closure) and [[Realm]] (a Realm Record or null). It
 * returns a new Job Abstract Closure that applies the appropriate
 * handler to the incoming value, and uses the handler's return value
 * to resolve or reject the derived promise associated with that
 * handler. It performs the following steps when called:
 * 
 * 1. Let job be a new Job Abstract Closure with no parameters that
 *    captures reaction and argument and performs the following steps
 *    when called:
 *     a. Let promiseCapability be reaction.[[Capability]].
 *     b. Let type be reaction.[[Type]].
 *     c. Let handler be reaction.[[Handler]].
 *     d. If handler is empty, then
 *         i. If type is Fulfill, let handlerResult be NormalCompletion(argument).
 *         ii. Else,
 *             1. Assert: type is Reject.
 *             2. Let handlerResult be ThrowCompletion(argument).
 *     e. Else, let handlerResult be Completion(HostCallJobCallback(handler, undefined, « argument »)).
 *     f. If promiseCapability is undefined, then
 *         i. Assert: handlerResult is not an abrupt completion.
 *         ii. Return empty.
 *     g. Assert: promiseCapability is a PromiseCapability Record.
 *     h. If handlerResult is an abrupt completion, then
 *         i. Return ? Call(promiseCapability.[[Reject]], undefined, « handlerResult.[[Value]] »).
 *     i. Else,
 *         i. Return ? Call(promiseCapability.[[Resolve]], undefined, « handlerResult.[[Value]] »).
 * 2. Let handlerRealm be null.
 * 3. If reaction.[[Handler]] is not empty, then
 *     a. Let getHandlerRealmResult be Completion(GetFunctionRealm(reaction.[[Handler]].[[Callback]])).
 *     b. If getHandlerRealmResult is a normal completion, set
 *        handlerRealm to getHandlerRealmResult.[[Value]].
 *     c. Else, set handlerRealm to the current Realm Record.
 *     d. NOTE: handlerRealm is never null unless the handler is
 *        undefined. When the handler is a revoked Proxy and no
 *        ECMAScript code runs, handlerRealm is used to create error
 *        objects.
 * 4. Return the Record { [[Job]]: job, [[Realm]]: handlerRealm }.
 */
export function NewPromiseReactionJob(reaction: PromiseReaction, argument: Val): JobRecord {
  function* job($: VM): ECR<void> {
    const promiseCapability = reaction.Capability;
    const type = reaction.Type;
    const handler = reaction.Handler;
    let handlerResult: CR<Val>;
    if (EMPTY.is(handler)) {
      if (type === 'fulfill') {
        handlerResult = argument;
      } else {
        Assert(type === 'reject');
        handlerResult = ThrowCompletion(argument);
      }
    } else {
      handlerResult = yield* HostCallJobCallback($, handler, undefined, [argument]);
    }
    if (promiseCapability === undefined) return;
    Assert(promiseCapability instanceof PromiseCapability);
    let status;
    if (IsAbrupt(handlerResult)) {
      Assert(!EMPTY.is(handlerResult.Value));
      status = yield* Call($, promiseCapability.Reject, undefined, [handlerResult.Value]);
    } else {
      status = yield* Call($, promiseCapability.Resolve, undefined, [handlerResult]);
    }
    if (IsAbrupt(status)) return status;
    return;
  }
  return {Job: job, Realm: null};
}

interface JobRecord {
  Job: ($: VM) => ECR<void>;
  Realm: RealmRecord|null;
}

/**
 * 27.2.2.2 NewPromiseResolveThenableJob ( promiseToResolve, thenable, then )
 * 
 * The abstract operation NewPromiseResolveThenableJob takes arguments
 * promiseToResolve (a Promise), thenable (an Object), and then (a
 * JobCallback Record) and returns a Record with fields [[Job]] (a Job
 * Abstract Closure) and [[Realm]] (a Realm Record). It performs the
 * following steps when called:
 * 
 * 1. Let job be a new Job Abstract Closure with no parameters that
 *    captures promiseToResolve, thenable, and then and performs the
 *    following steps when called:
 *     a. Let resolvingFunctions be CreateResolvingFunctions(promiseToResolve).
 *     b. Let thenCallResult be Completion(HostCallJobCallback(then,
 *        thenable, « resolvingFunctions.[[Resolve]],
 *        resolvingFunctions.[[Reject]] »)).
 *     c. If thenCallResult is an abrupt completion, then
 *         i. Return ? Call(resolvingFunctions.[[Reject]], undefined,
 *            « thenCallResult.[[Value]] »).
 *     d. Return ? thenCallResult.
 * 2. Let getThenRealmResult be Completion(GetFunctionRealm(then.[[Callback]])).
 * 3. If getThenRealmResult is a normal completion, let thenRealm be
 *    getThenRealmResult.[[Value]].
 * 4. Else, let thenRealm be the current Realm Record.
 * 5. NOTE: thenRealm is never null. When then.[[Callback]] is a
 *    revoked Proxy and no code runs, thenRealm is used to create error
 *    objects.
 * 6. Return the Record { [[Job]]: job, [[Realm]]: thenRealm }.
 * 
 * NOTE: This Job uses the supplied thenable and its then method to
 * resolve the given promise. This process must take place as a Job to
 * ensure that the evaluation of the then method occurs after
 * evaluation of any surrounding code has completed.
 */
export function NewPromiseResolveThenableJob(
  $: VM, promiseToResolve: Prom, thenable: Obj, then: JobCallback,
): JobRecord {
  function* job($: VM): ECR<void> {
    const resolvingFunctions = yield* CreateResolvingFunctions($, promiseToResolve);
    const thenCallResult = yield* HostCallJobCallback(
      $, then, thenable, [resolvingFunctions.Resolve, resolvingFunctions.Reject]);
    if (IsAbrupt(thenCallResult)) {
      Assert(!EMPTY.is(thenCallResult.Value));
      const status = yield* Call($, resolvingFunctions.Reject, undefined, [thenCallResult.Value]);
      return IsAbrupt(status) ? status : undefined;
    }
    return thenCallResult as unknown as void; // TODO !!! ???
  }
  const getThenRealmResult = GetFunctionRealm($, then.Callback);
  const thenRealm = IsAbrupt(getThenRealmResult) ? $.getRealm()! : getThenRealmResult;
  return {Job: job, Realm: thenRealm};
}

/**
 * 27.2.3 The Promise Constructor
 * 
 * The Promise constructor:
 *   - is %Promise%.
 *   -  is the initial value of the "Promise" property of the global object.
 *   - creates and initializes a new Promise when called as a constructor.
 *   - is not intended to be called as a function and will throw an
 *     exception when called in that manner.
 *   - may be used as the value in an extends clause of a class
 *     definition. Subclass constructors that intend to inherit the
 *     specified Promise behaviour must include a super call to the
 *     Promise constructor to create and initialize the subclass
 *     instance with the internal state necessary to support the
 *     Promise and Promise.prototype built-in methods.
 * 
 * ---
 * 
 * 27.2.3.1 Promise ( executor )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If NewTarget is undefined, throw a TypeError exception.
 * 2. If IsCallable(executor) is false, throw a TypeError exception.
 * 3. Let promise be ? OrdinaryCreateFromConstructor(NewTarget,
 *    "%Promise.prototype%", « [[PromiseState]], [[PromiseResult]],
 *    [[PromiseFulfillReactions]], [[PromiseRejectReactions]],
 *    [[PromiseIsHandled]] »).
 * 4. Set promise.[[PromiseState]] to pending.
 * 5. Set promise.[[PromiseFulfillReactions]] to a new empty List.
 * 6. Set promise.[[PromiseRejectReactions]] to a new empty List.
 * 7. Set promise.[[PromiseIsHandled]] to false.
 * 8. Let resolvingFunctions be CreateResolvingFunctions(promise).
 * 9. Let completion be Completion(Call(executor, undefined, «
 *    resolvingFunctions.[[Resolve]], resolvingFunctions.[[Reject]] »)).
 * 10. If completion is an abrupt completion, then
 *     a. Perform ? Call(resolvingFunctions.[[Reject]], undefined,
 *        « completion.[[Value]] »).
 * 11. Return promise.
 * 
 * NOTE: The executor argument must be a function object. It is called
 * for initiating and reporting completion of the possibly deferred
 * action represented by this Promise. The executor is called with two
 * arguments: resolve and reject. These are functions that may be used
 * by the executor function to report eventual completion or failure
 * of the deferred computation. Returning from the executor function
 * does not mean that the deferred action has been completed but only
 * that the request to eventually perform the deferred action has been
 * accepted.
 * 
 * The resolve function that is passed to an executor function accepts
 * a single argument. The executor code may eventually call the
 * resolve function to indicate that it wishes to resolve the
 * associated Promise. The argument passed to the resolve function
 * represents the eventual value of the deferred action and can be
 * either the actual fulfillment value or another promise which will
 * provide the value if it is fulfilled.
 * 
 * The reject function that is passed to an executor function accepts
 * a single argument. The executor code may eventually call the reject
 * function to indicate that the associated Promise is rejected and
 * will never be fulfilled. The argument passed to the reject function
 * is used as the rejection value of the promise. Typically it will be
 * an Error object.
 * 
 * The resolve and reject functions passed to an executor function by
 * the Promise constructor have the capability to actually resolve and
 * reject the associated promise. Subclasses may have different constructor
 * behaviour that passes in customized values for resolve and reject.
 */
export function* PromiseConstructor($: VM, [executor]: Val[], NewTarget: Val): ECR<Obj> {
  if (NewTarget === undefined) {
    return $.throw('TypeError', 'Promise constructor must be called with new');
  }
  if (!IsCallable(executor)) {
    return $.throw('TypeError', 'Promise executor must be callable');
  }
  Assert(IsConstructor(NewTarget));
  const promise = yield* OrdinaryCreateFromConstructor($, NewTarget, '%Promise.prototype%', {
    PromiseState: 'pending',
    PromiseResult: undefined,
    PromiseFulfillReactions: [],
    PromiseRejectReactions: [],
    PromiseIsHandled: false,
  });
  if (IsAbrupt(promise)) return promise;
  Assert(IsPromise(promise));
  const resolvingFunctions = yield* CreateResolvingFunctions($, promise);
  const completion = yield* Call(
    $, executor, undefined, [resolvingFunctions.Resolve, resolvingFunctions.Reject]);
  if (IsAbrupt(completion)) {
    Assert(!EMPTY.is(completion.Value));
    yield* Call($, resolvingFunctions.Reject, undefined, [completion.Value]);
  }
  return promise;
}

/**
 * 27.2.4 Properties of the Promise Constructor
 * 
 * The Promise constructor:
 *   - has a [[Prototype]] internal slot whose value is %Function.prototype%.
 *   - has the following properties:
 */

/**
 * 27.2.4.1 Promise.all ( iterable )
 * 
 * This function returns a new promise which is fulfilled with an
 * array of fulfillment values for the passed promises, or rejects
 * with the reason of the first passed promise that rejects. It
 * resolves all elements of the passed iterable to promises as it runs
 * this algorithm.
 * 
 * 1. Let C be the this value.
 * 2. Let promiseCapability be ? NewPromiseCapability(C).
 * 3. Let promiseResolve be Completion(GetPromiseResolve(C)).
 * 4. IfAbruptRejectPromise(promiseResolve, promiseCapability).
 * 5. Let iteratorRecord be Completion(GetIterator(iterable, sync)).
 * 6. IfAbruptRejectPromise(iteratorRecord, promiseCapability).
 * 7. Let result be Completion(PerformPromiseAll(iteratorRecord, C,
 *    promiseCapability, promiseResolve)).
 * 8. If result is an abrupt completion, then
 *     a. If iteratorRecord.[[Done]] is false, set result to
 *        Completion(IteratorClose(iteratorRecord, result)).
 *     b. IfAbruptRejectPromise(result, promiseCapability).
 * 9. Return ? result.
 * 
 * NOTE: This function requires its this value to be a constructor
 * function that supports the parameter conventions of the Promise constructor.
 */
export function* PromiseCtorAll($: VM, C: Val, iterable: Val): ECR<Val> {
  const promiseCapability = yield* NewPromiseCapability($, C);
  if (IsAbrupt(promiseCapability)) return promiseCapability;
  Assert(C instanceof Obj);
  const promiseResolve = yield* GetPromiseResolve($, C);
  if (IsAbrupt(promiseResolve)) {
    return yield* RejectAndReturnPromise($, promiseResolve, promiseCapability);
  }
  const iteratorRecord = yield* GetIterator($, iterable, SYNC);
  if (IsAbrupt(iteratorRecord)) {
    return yield* RejectAndReturnPromise($, iteratorRecord, promiseCapability);
  }
  // 7.
  let result = yield* PerformPromiseAll($, iteratorRecord, C, promiseCapability, promiseResolve);
  if (IsAbrupt(result)) {
    if (!iteratorRecord.Done) {
      result = yield* IteratorClose($, iteratorRecord, result);
    }
    if (IsAbrupt(result)) return yield* RejectAndReturnPromise($, result, promiseCapability);
  }
  return result;
}

/**
 * 27.2.4.1.1 GetPromiseResolve ( promiseConstructor )
 * 
 * The abstract operation GetPromiseResolve takes argument
 * promiseConstructor (a constructor) and returns either a normal
 * completion containing a function object or a throw completion. It
 * performs the following steps when called:
 * 
 * 1. Let promiseResolve be ? Get(promiseConstructor, "resolve").
 * 2. If IsCallable(promiseResolve) is false, throw a TypeError exception.
 * 3. Return promiseResolve.
 */
export function* GetPromiseResolve($: VM, promiseConstructor: Obj): ECR<Val> {
  const promiseResolve = yield* Get($, promiseConstructor, 'resolve');
  if (IsAbrupt(promiseResolve)) return promiseResolve;
  if (!IsCallable(promiseResolve)) {
    return $.throw('TypeError', 'resolve is not a function');
  }
  return promiseResolve;
}

/**
 * 27.2.4.1.2 PerformPromiseAll ( iteratorRecord, constructor, resultCapability, promiseResolve )
 * 
 * The abstract operation PerformPromiseAll takes arguments
 * iteratorRecord (an Iterator Record), constructor (a constructor),
 * resultCapability (a PromiseCapability Record), and promiseResolve
 * (a function object) and returns either a normal completion
 * containing an ECMAScript language value or a throw completion. It
 * performs the following steps when called:
 * 
 * 1. Let values be a new empty List.
 * 2. Let remainingElementsCount be the Record { [[Value]]: 1 }.
 * 3. Let index be 0.
 * 4. Repeat,
 *     a. Let next be Completion(IteratorStep(iteratorRecord)).
 *     b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *     c. ReturnIfAbrupt(next).
 *     d. If next is false, then
 *         i. Set iteratorRecord.[[Done]] to true.
 *         ii. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
 *         iii. If remainingElementsCount.[[Value]] = 0, then
 *             1. Let valuesArray be CreateArrayFromList(values).
 *             2. Perform ? Call(resultCapability.[[Resolve]], undefined, « valuesArray »).
 *         iv. Return resultCapability.[[Promise]].
 *     e. Let nextValue be Completion(IteratorValue(next)).
 *     f. If nextValue is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *     g. ReturnIfAbrupt(nextValue).
 *     h. Append undefined to values.
 *     i. Let nextPromise be ? Call(promiseResolve, constructor, « nextValue »).
 *     j. Let steps be the algorithm steps defined in Promise.all
 *        Resolve Element Functions.
 *     k. Let length be the number of non-optional parameters of the
 *        function definition in Promise.all Resolve Element Functions.
 *     l. Let onFulfilled be CreateBuiltinFunction(steps, length, "",
 *        « [[AlreadyCalled]], [[Index]], [[Values]], [[Capability]],
 *        [[RemainingElements]] »).
 *     m. Set onFulfilled.[[AlreadyCalled]] to false.
 *     n. Set onFulfilled.[[Index]] to index.
 *     o. Set onFulfilled.[[Values]] to values.
 *     p. Set onFulfilled.[[Capability]] to resultCapability.
 *     q. Set onFulfilled.[[RemainingElements]] to remainingElementsCount.
 *     r. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] + 1.
 *     s. Perform ? Invoke(nextPromise, "then", « onFulfilled,
 *        resultCapability.[[Reject]] »).
 *     t. Set index to index + 1.
 */
export function* PerformPromiseAll(
  $: VM,
  iteratorRecord: IteratorRecord,
  constructor: Val,
  resultCapability: PromiseCapability,
  promiseResolve: Val,
): ECR<Val> {
  const values: Val[] = [];
  const remainingElementsCount = {Value: 1};
  let index = 0;
  while (true) {
    // 4.a
    const next = yield* IteratorStep($, iteratorRecord);
    if (IsAbrupt(next)) return (iteratorRecord.Done = true, next);
    if (!next) {
      iteratorRecord.Done = true;
      remainingElementsCount.Value--;
      if (remainingElementsCount.Value === 0) {
        const valuesArray = CreateArrayFromList($, values);
        const status = yield* Call($, resultCapability.Resolve, undefined, [valuesArray]);
        if (IsAbrupt(status)) return status;
      }
      return resultCapability.Promise;
    }
    const nextValue = yield* IteratorValue($, next);
    if (IsAbrupt(nextValue)) return (iteratorRecord.Done = true, nextValue);
    // 4.h
    values.push(undefined);
    const nextPromise = yield* Call($, promiseResolve, constructor, [nextValue]);
    if (IsAbrupt(nextPromise)) return nextPromise;
    const onFulfilled = CreateBuiltinFunction(
      {Call: PromiseAllResolveElement}, 1, '', {
        $,
        AlreadyCalled: false,
        Index: index,
        Values: values,
        Capability: resultCapability,
        RemainingElements: remainingElementsCount,
      });
    remainingElementsCount.Value++;
    const invokeStatus = yield* Invoke(
      $, nextPromise, 'then', [onFulfilled, resultCapability.Reject]);
    if (IsAbrupt(invokeStatus)) return invokeStatus;
    index++;
  }
}

interface PromiseAllElementSlots {
  AlreadyCalled: boolean;
  Index: number;
  Values: Val[];
  Capability: PromiseCapability;
  RemainingElements: {Value: number};
}
declare global {
  interface ObjectSlots extends Partial<PromiseAllElementSlots> {}
}

/**
 * 27.2.4.1.3 Promise.all Resolve Element Functions
 * 
 * A Promise.all resolve element function is an anonymous built-in
 * function that is used to resolve a specific Promise.all
 * element. Each Promise.all resolve element function has [[Index]],
 * [[Values]], [[Capability]], [[RemainingElements]], and
 * [[AlreadyCalled]] internal slots.
 * 
 * When a Promise.all resolve element function is called with argument x,
 * the following steps are taken:
 * 
 * 1. Let F be the active function object.
 * 2. If F.[[AlreadyCalled]] is true, return undefined.
 * 3. Set F.[[AlreadyCalled]] to true.
 * 4. Let index be F.[[Index]].
 * 5. Let values be F.[[Values]].
 * 6. Let promiseCapability be F.[[Capability]].
 * 7. Let remainingElementsCount be F.[[RemainingElements]].
 * 8. Set values[index] to x.
 * 9. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
 * 10. If remainingElementsCount.[[Value]] = 0, then
 *     a. Let valuesArray be CreateArrayFromList(values).
 *     b. Return ? Call(promiseCapability.[[Resolve]], undefined, « valuesArray »).
 * 11. Return undefined.
 * 
 * The "length" property of a Promise.all resolve element function is 1𝔽.
 */
export function* PromiseAllResolveElement($: VM, _: Val, [x]: Val[]): ECR<undefined> {
  const F = $.getActiveFunctionObject()! as PromiseAllElementSlots;
  if (F.AlreadyCalled) return;
  F.AlreadyCalled = true;
  F.Values[F.Index] = x;
  F.RemainingElements.Value--;
  if (F.RemainingElements.Value === 0) {
    const valuesArray = CreateArrayFromList($, F.Values);
    const status = yield* Call($, F.Capability.Resolve, undefined, [valuesArray]);
    if (IsAbrupt(status)) return status;
  }
  return;
}

// TODO - other Promise ctor methods, starting at
// 27.2.4.2 Promise.allSettled ( iterable )

/**
 * 27.2.4.7 Promise.resolve ( x )
 * 
 * This function returns either a new promise resolved with the passed
 * argument, or the argument itself if the argument is a promise
 * produced by this constructor.
 * 
 * 1. Let C be the this value.
 * 2. If C is not an Object, throw a TypeError exception.
 * 3. Return ? PromiseResolve(C, x).
 * 
 * NOTE: This function expects its this value to be a constructor
 * function that supports the parameter conventions of the Promise
 * constructor.
 */
export function* PromiseCtorResolve($: VM, C: Val, [x]: Val[]): ECR<Val> {
  if (!(C instanceof Obj)) {
    return $.throw('TypeError', 'Promise.resolve must be called with a constructor');
  }
  return yield* PromiseResolve($, C, x);
}

/**
 * 27.2.4.7.1 PromiseResolve ( C, x )
 * 
 * The abstract operation PromiseResolve takes arguments C (a
 * constructor) and x (an ECMAScript language value) and returns
 * either a normal completion containing an ECMAScript language value
 * or a throw completion. It returns a new promise resolved with x. It
 * performs the following steps when called:
 * 
 * 1. If IsPromise(x) is true, then
 *     a. Let xConstructor be ? Get(x, "constructor").
 *     b. If SameValue(xConstructor, C) is true, return x.
 * 2. Let promiseCapability be ? NewPromiseCapability(C).
 * 3. Perform ? Call(promiseCapability.[[Resolve]], undefined, « x »).
 * 4. Return promiseCapability.[[Promise]].
 */
export function* PromiseResolve($: VM, C: Val, x: Val): ECR<Prom> {
  if (IsPromise(x)) {
    const xConstructor = yield* Get($, x, 'constructor');
    if (IsAbrupt(xConstructor)) return xConstructor;
    if (SameValue(xConstructor, C)) return x;
  }
  const promiseCapability = yield* NewPromiseCapability($, C);
  if (IsAbrupt(promiseCapability)) return promiseCapability;
  const status = yield* Call($, promiseCapability.Resolve, undefined, [x]);
  if (IsAbrupt(status)) return status;
  return promiseCapability.Promise;
}

// TODO - more other Promise ctor methods, starting at
// 27.2.4.8 get Promise [ @@species ]

/**
 * 27.2.5 Properties of the Promise Prototype Object
 * 
 * The Promise prototype object:
 *   - is %Promise.prototype%.
 *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
 *   - is an ordinary object.
 *   - does not have a [[PromiseState]] internal slot or any of the
 *     other internal slots of Promise instances.
 */

/**
 * 27.2.5.4 Promise.prototype.then ( onFulfilled, onRejected )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let promise be the this value.
 * 2. If IsPromise(promise) is false, throw a TypeError exception.
 * 3. Let C be ? SpeciesConstructor(promise, %Promise%).
 * 4. Let resultCapability be ? NewPromiseCapability(C).
 * 5. Return PerformPromiseThen(promise, onFulfilled, onRejected, resultCapability).
 */
export function* PromisePrototypeThen(
  $: VM,
  thisArg: Val,
  onFulfilled: Val,
  onRejected: Val,
): ECR<Val> {
  if (!IsPromise(thisArg)) {
    return $.throw(
      'TypeError',
      `Promise.prototype.then called on incompatible receiver ${DebugString(thisArg)}`);
  }
  const C = yield* SpeciesConstructor($, thisArg, $.getIntrinsic('%Promise%') as Func);
  if (IsAbrupt(C)) return C;
  const resultCapability = yield* NewPromiseCapability($, C);
  if (IsAbrupt(resultCapability)) return resultCapability;
  return yield* PerformPromiseThen($, thisArg, onFulfilled, onRejected, resultCapability);
}

/**
 * 27.2.5.4.1 PerformPromiseThen ( promise, onFulfilled, onRejected [ , resultCapability ] )
 * 
 * The abstract operation PerformPromiseThen takes arguments promise
 * (a Promise), onFulfilled (an ECMAScript language value), and
 * onRejected (an ECMAScript language value) and optional argument
 * resultCapability (a PromiseCapability Record) and returns an
 * ECMAScript language value. It performs the “then” operation on
 * promise using onFulfilled and onRejected as its settlement
 * actions. If resultCapability is passed, the result is stored by
 * updating resultCapability's promise. If it is not passed, then
 * PerformPromiseThen is being called by a specification-internal
 * operation where the result does not matter. It performs the
 * following steps when called:
 * 
 * 1. Assert: IsPromise(promise) is true.
 * 2. If resultCapability is not present, then
 *     a. Set resultCapability to undefined.
 * 3. If IsCallable(onFulfilled) is false, then
 *     a. Let onFulfilledJobCallback be empty.
 * 4. Else,
 *     a. Let onFulfilledJobCallback be HostMakeJobCallback(onFulfilled).
 * 5. If IsCallable(onRejected) is false, then
 *     a. Let onRejectedJobCallback be empty.
 * 6. Else,
 *     a. Let onRejectedJobCallback be HostMakeJobCallback(onRejected).
 * 7. Let fulfillReaction be the PromiseReaction { [[Capability]]:
 *    resultCapability, [[Type]]: Fulfill, [[Handler]]:
 *    onFulfilledJobCallback }.
 * 8. Let rejectReaction be the PromiseReaction { [[Capability]]:
 *    resultCapability, [[Type]]: Reject, [[Handler]]:
 *    onRejectedJobCallback }.
 * 9. If promise.[[PromiseState]] is pending, then
 *     a. Append fulfillReaction to promise.[[PromiseFulfillReactions]].
 *     b. Append rejectReaction to promise.[[PromiseRejectReactions]].
 * 10. Else if promise.[[PromiseState]] is fulfilled, then
 *     a. Let value be promise.[[PromiseResult]].
 *     b. Let fulfillJob be NewPromiseReactionJob(fulfillReaction, value).
 *     c. Perform HostEnqueuePromiseJob(fulfillJob.[[Job]], fulfillJob.[[Realm]]).
 * 11. Else,
 *     a. Assert: The value of promise.[[PromiseState]] is rejected.
 *     b. Let reason be promise.[[PromiseResult]].
 *     c. If promise.[[PromiseIsHandled]] is false, perform
 *        HostPromiseRejectionTracker(promise, "handle").
 *     d. Let rejectJob be NewPromiseReactionJob(rejectReaction, reason).
 *     e. Perform HostEnqueuePromiseJob(rejectJob.[[Job]], rejectJob.[[Realm]]).
 * 12. Set promise.[[PromiseIsHandled]] to true.
 * 13. If resultCapability is undefined, then
 *     a. Return undefined.
 * 14. Else,
 *     a. Return resultCapability.[[Promise]].
 */
export function* PerformPromiseThen(
  $: VM,
  promise: Val,
  onFulfilled: Val,
  onRejected: Val,
  resultCapability?: PromiseCapability,
): ECR<Val> {
  Assert(IsPromise(promise));
  const onFulfilledJobCallback =
    IsCallable(onFulfilled) ? HostMakeJobCallback(onFulfilled) : EMPTY;
  const onRejectedJobCallback =
    IsCallable(onRejected) ? HostMakeJobCallback(onRejected) : EMPTY;
  const fulfillReaction: PromiseReaction = {
    Capability: resultCapability,
    Type: 'fulfill',
    Handler: onFulfilledJobCallback,
  };
  const rejectReaction: PromiseReaction = {
    Capability: resultCapability,
    Type: 'reject',
    Handler: onRejectedJobCallback,
  };
  // 8.
  if (promise.PromiseState === 'pending') {
    promise.PromiseFulfillReactions.push(fulfillReaction);
    promise.PromiseRejectReactions.push(rejectReaction);
  } else if (promise.PromiseState === 'fulfilled') {
    const value = promise.PromiseResult;
    const fulfillJob = NewPromiseReactionJob(fulfillReaction, value);
    HostEnqueuePromiseJob($, fulfillJob.Job, fulfillJob.Realm);
  } else {
    Assert(promise.PromiseState === 'rejected');
    const reason = promise.PromiseResult;
    if (!promise.PromiseIsHandled) {
      yield* HostPromiseRejectionTracker($, promise, 'handle');
    }
    const rejectJob = NewPromiseReactionJob(rejectReaction, reason);
    HostEnqueuePromiseJob($, rejectJob.Job, rejectJob.Realm);
  }
  // 12.
  promise.PromiseIsHandled = true;
  return resultCapability?.Promise;
}

/**
 * 27.2.6 Properties of Promise Instances
 * 
 * Promise instances are ordinary objects that inherit properties from
 * the Promise prototype object (the intrinsic,
 * %Promise.prototype%). Promise instances are initially created with
 * the internal slots described in Table 81.
 * 
 * [[PromiseState]], pending, fulfilled, or rejected - Governs how a
 * promise will react to incoming calls to its then method.
 * 
 * [[PromiseResult]], an ECMAScript language value - The value with
 * which the promise has been fulfilled or rejected, if any. Only
 * meaningful if [[PromiseState]] is not pending.
 * 
 * [[PromiseFulfillReactions]], a List of PromiseReaction Records -
 * Records to be processed when/if the promise transitions from the
 * pending state to the fulfilled state.
 * 
 * [[PromiseRejectReactions]] a List of PromiseReaction Records
 * Records to be processed when/if the promise transitions from the
 * pending state to the rejected state.
 * 
 * [[PromiseIsHandled]] a Boolean Indicates whether the promise has
 * ever had a fulfillment or rejection handler; used in unhandled
 * rejection tracking.
 */
interface PromiseSlots {
  PromiseState: 'pending'|'fulfilled'|'rejected';
  PromiseResult: Val;
  PromiseFulfillReactions: PromiseReaction[];
  PromiseRejectReactions: PromiseReaction[];
  PromiseIsHandled: boolean;
}
declare global {
  interface ObjectSlots extends Partial<PromiseSlots> {}
}

/**/
