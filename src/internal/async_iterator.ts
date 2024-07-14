import { CreateBuiltinFunctionFromClosure, IsFunc, method, methodO } from './func';
import { ECR, Plugin, VM, just } from './vm';
import { defineProperties } from './realm_record';
import { Obj, OrdinaryObjectCreate } from './obj';
import { CreateIterResultObject, IteratorComplete, IteratorNext, IteratorRecord, IteratorValue } from './abstract_iterator';
import { CastNotAbrupt, IsAbrupt } from './completion_record';
import { Call, Get, GetMethod } from './abstract_object';
import { Assert } from './assert';
import { Val } from './val';
import { NewPromiseCapability, PerformPromiseThen, PromiseCapability, PromiseResolve, RejectAndReturnPromise } from './promise';
import { prelude } from './prelude';

export const asyncIterators: Plugin = {
  id: 'asyncIterators',
  deps: () => [prelude],
  realm: {
    CreateIntrinsics(realm) {
      /**
       * 27.1.3 The %AsyncIteratorPrototype% Object
       * 
       * The %AsyncIteratorPrototype% object:
       *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
       *   - is an ordinary object.
       * 
       * NOTE: All objects defined in this specification that
       * implement the AsyncIterator interface also inherit from
       * %AsyncIteratorPrototype%. ECMAScript code may also define
       * objects that inherit from %AsyncIteratorPrototype%. The
       * %AsyncIteratorPrototype% object provides a place where
       * additional methods that are applicable to all async iterator
       * objects may be added.
       */
      const asyncIteratorPrototype = OrdinaryObjectCreate({
        Prototype: realm.Intrinsics.get('%Object.prototype%')!,
      });
      realm.Intrinsics.set('%AsyncIteratorPrototype%', asyncIteratorPrototype);

      defineProperties(realm, asyncIteratorPrototype, {
        /**
         * 27.1.3.1 %AsyncIteratorPrototype% [ @@asyncIterator ] ( )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Return the this value.
         * 
         * The value of the "name" property of this function is "[Symbol.asyncIterator]".
         */
        [Symbol.asyncIterator]: method((_$, thisValue) => just(thisValue)),
      });

      /**
       * 27.1.4.2 The %AsyncFromSyncIteratorPrototype% Object
       * 
       * The %AsyncFromSyncIteratorPrototype% object:
       *   - has properties that are inherited by all Async-from-Sync Iterator Objects.
       *   - is an ordinary object.
       *   - has a [[Prototype]] internal slot whose value is %AsyncIteratorPrototype%.
       *   - has the following properties:
       */
      const asyncFromSyncIteratorPrototype = OrdinaryObjectCreate({
        Prototype: asyncIteratorPrototype,
      });
      realm.Intrinsics.set('%AsyncFromSyncIteratorPrototype%', asyncFromSyncIteratorPrototype);

      defineProperties(realm, asyncFromSyncIteratorPrototype, {
        /** 27.1.4.2.1 %AsyncFromSyncIteratorPrototype%.next ( [ value ] ) */
        'next': methodO(AsyncFromSyncIteratorPrototypeNext),
        /** 27.1.4.2.2 %AsyncFromSyncIteratorPrototype%.return ( [ value ] ) */
        'return': methodO(AsyncFromSyncIteratorPrototypeReturn),
        /** 27.1.4.2.3 %AsyncFromSyncIteratorPrototype%.throw ( [ value ] ) */
        'throw': methodO(AsyncFromSyncIteratorPrototypeThrow),
      });
    },
  },
  abstract: {CreateAsyncFromSyncIterator},
};

/**
 * 27.1.4 Async-from-Sync Iterator Objects
 * 
 * An Async-from-Sync Iterator object is an async iterator that adapts
 * a specific synchronous iterator. There is not a named constructor
 * for Async-from-Sync Iterator objects. Instead, Async-from-Sync
 * iterator objects are created by the CreateAsyncFromSyncIterator
 * abstract operation as needed.
 * 
 * ---
 * 
 * 27.1.4.1 CreateAsyncFromSyncIterator ( syncIteratorRecord )
 * 
 * The abstract operation CreateAsyncFromSyncIterator takes argument
 * syncIteratorRecord (an Iterator Record) and returns an Iterator
 * Record. It is used to create an async Iterator Record from a
 * synchronous Iterator Record. It performs the following steps when
 * called:
 * 
 * 1. Let asyncIterator be OrdinaryObjectCreate(
 *    %AsyncFromSyncIteratorPrototype%, « [[SyncIteratorRecord]] »).
 * 2. Set asyncIterator.[[SyncIteratorRecord]] to syncIteratorRecord.
 * 3. Let nextMethod be ! Get(asyncIterator, "next").
 * 4. Let iteratorRecord be the Iterator Record { [[Iterator]]:
 *    asyncIterator, [[NextMethod]]: nextMethod, [[Done]]: false }.
 * 5. Return iteratorRecord.
 */
export function* CreateAsyncFromSyncIterator(
  $: VM,
  syncIteratorRecord: IteratorRecord,
): ECR<IteratorRecord> {
  const asyncIterator = OrdinaryObjectCreate({
    Prototype: $.getIntrinsic('%AsyncFromSyncIteratorPrototype%')!,
    SyncIteratorRecord: syncIteratorRecord,
  });
  const nextMethod = CastNotAbrupt(yield* Get($, asyncIterator, 'next'));
  Assert(IsFunc(nextMethod));
  return new IteratorRecord(asyncIterator, nextMethod, false);
}

/**
 * 27.1.4.2.1 %AsyncFromSyncIteratorPrototype%.next ( [ value ] )
 * 
 * 1. Let O be the this value.
 * 2. Assert: O is an Object that has a [[SyncIteratorRecord]] internal slot.
 * 3. Let promiseCapability be ! NewPromiseCapability(%Promise%).
 * 4. Let syncIteratorRecord be O.[[SyncIteratorRecord]].
 * 5. If value is present, then
 *     a. Let result be Completion(IteratorNext(syncIteratorRecord, value)).
 * 6. Else,
 *     a. Let result be Completion(IteratorNext(syncIteratorRecord)).
 * 7. IfAbruptRejectPromise(result, promiseCapability).
 * 8. Return AsyncFromSyncIteratorContinuation(result, promiseCapability).
 */
export function* AsyncFromSyncIteratorPrototypeNext(
  $: VM,
  O: Obj,
  value?: Val,
): ECR<Val> {
  Assert(O instanceof Obj && O.SyncIteratorRecord instanceof IteratorRecord);
  const promiseCapability = CastNotAbrupt(yield* NewPromiseCapability($, $.getIntrinsic('%Promise%')!));
  const syncIteratorRecord = O.SyncIteratorRecord;
  const result = yield* IteratorNext($, syncIteratorRecord, value);
  if (IsAbrupt(result)) return yield* RejectAndReturnPromise($, result, promiseCapability);
  return yield* AsyncFromSyncIteratorContinuation($, result, promiseCapability);
}

/**
 * 27.1.4.2.2 %AsyncFromSyncIteratorPrototype%.return ( [ value ] )
 * 
 * 1. Let O be the this value.
 * 2. Assert: O is an Object that has a [[SyncIteratorRecord]] internal slot.
 * 3. Let promiseCapability be ! NewPromiseCapability(%Promise%).
 * 4. Let syncIterator be O.[[SyncIteratorRecord]].[[Iterator]].
 * 5. Let return be Completion(GetMethod(syncIterator, "return")).
 * 6. IfAbruptRejectPromise(return, promiseCapability).
 * 7. If return is undefined, then
 *     a. Let iterResult be CreateIterResultObject(value, true).
 *     b. Perform ! Call(promiseCapability.[[Resolve]], undefined, « iterResult »).
 *     c. Return promiseCapability.[[Promise]].
 * 8. If value is present, then
 *     a. Let result be Completion(Call(return, syncIterator, « value »)).
 * 9. Else,
 *     a. Let result be Completion(Call(return, syncIterator)).
 * 10. IfAbruptRejectPromise(result, promiseCapability).
 * 11. If result is not an Object, then
 *     a. Perform ! Call(promiseCapability.[[Reject]], undefined, « a newly created TypeError object »).
 *     b. Return promiseCapability.[[Promise]].
 * 12. Return AsyncFromSyncIteratorContinuation(result, promiseCapability).
 */
export function* AsyncFromSyncIteratorPrototypeReturn(
  $: VM,
  O: Obj,
  value: Val,
): ECR<Val> {
  Assert(O instanceof Obj && O.SyncIteratorRecord instanceof IteratorRecord);
  const promiseCapability = CastNotAbrupt(yield* NewPromiseCapability($, $.getIntrinsic('%Promise%')!));
  const syncIterator = O.SyncIteratorRecord.Iterator;
  const returnMethod = CastNotAbrupt(yield* GetMethod($, syncIterator, 'return'));
  if (returnMethod === undefined) {
    // 7.a.
    const iterResult = CreateIterResultObject($, value, true);
    CastNotAbrupt(yield* Call($, promiseCapability.Resolve, undefined, [iterResult]));
    return promiseCapability.Promise;
  }
  // 8-9.
  const result = yield* Call($, returnMethod, syncIterator, arguments.length > 2 ? [value] : []);
  if (IsAbrupt(result)) return yield* RejectAndReturnPromise($, result, promiseCapability);
  // 11.
  if (!(result instanceof Obj)) {
    CastNotAbrupt(yield* Call(
      $, promiseCapability.Reject, undefined, [
        $.makeError('TypeError', 'iterator result ${DebugString(result)} is not an object'),
      ]));
    return promiseCapability.Promise;
  }
  return yield* AsyncFromSyncIteratorContinuation($, result, promiseCapability);
}

/**
 * 27.1.4.2.3 %AsyncFromSyncIteratorPrototype%.throw ( [ value ] )
 * 
 * NOTE: In this specification, value is always provided, but is left optional
 * for consistency with %AsyncFromSyncIteratorPrototype%.return ( [ value ] ).
 * 
 * 1. Let O be the this value.
 * 2. Assert: O is an Object that has a [[SyncIteratorRecord]] internal slot.
 * 3. Let promiseCapability be ! NewPromiseCapability(%Promise%).
 * 4. Let syncIterator be O.[[SyncIteratorRecord]].[[Iterator]].
 * 5. Let throw be Completion(GetMethod(syncIterator, "throw")).
 * 6. IfAbruptRejectPromise(throw, promiseCapability).
 * 7. If throw is undefined, then
 *     a. Perform ! Call(promiseCapability.[[Reject]], undefined, « value »).
 *     b. Return promiseCapability.[[Promise]].
 * 8. If value is present, then
 *     a. Let result be Completion(Call(throw, syncIterator, « value »)).
 * 9. Else,
 *     a. Let result be Completion(Call(throw, syncIterator)).
 * 10. IfAbruptRejectPromise(result, promiseCapability).
 * 11. If result is not an Object, then
 *     a. Perform ! Call(promiseCapability.[[Reject]], undefined, « a newly created TypeError object »).
 *     b. Return promiseCapability.[[Promise]].
 * 12. Return AsyncFromSyncIteratorContinuation(result, promiseCapability).
 */
export function* AsyncFromSyncIteratorPrototypeThrow(
  $: VM,
  O: Obj,
  value: Val,
): ECR<Val> {
  Assert(O instanceof Obj && O.SyncIteratorRecord instanceof IteratorRecord);
  const promiseCapability = CastNotAbrupt(yield* NewPromiseCapability($, $.getIntrinsic('%Promise%')!));
  const syncIterator = O.SyncIteratorRecord.Iterator;
  const throwMethod = CastNotAbrupt(yield* GetMethod($, syncIterator, 'throw'));
  if (throwMethod === undefined) {
    // NOTE: https://github.com/tc39/ecma262/pull/2600 will change this!
    CastNotAbrupt(yield* Call($, promiseCapability.Reject, undefined, [value]));
    return promiseCapability.Promise;
  }
  const result = yield* Call($, throwMethod, syncIterator, arguments.length > 2 ? [value] : []);
  if (IsAbrupt(result)) return yield* RejectAndReturnPromise($, result, promiseCapability);
  if (!(result instanceof Obj)) {
    CastNotAbrupt(yield* Call(
      $, promiseCapability.Reject, undefined, [
        $.makeError('TypeError', 'iterator result ${DebugString(result)} is not an object'),
      ]));
    return promiseCapability.Promise;
  }
  return yield* AsyncFromSyncIteratorContinuation($, result, promiseCapability);
}

/**
 * 27.1.4.3 Properties of Async-from-Sync Iterator Instances
 * 
 * Async-from-Sync Iterator instances are ordinary objects that
 * inherit properties from the %AsyncFromSyncIteratorPrototype%
 * intrinsic object. Async-from-Sync Iterator instances are initially
 * created with the internal slots listed in Table 78. Async-from-Sync
 * Iterator instances are not directly observable from ECMAScript
 * code.
 * 
 * Table 78: Internal Slots of Async-from-Sync Iterator Instances
 * [[SyncIteratorRecord]], an Iterator Record - Represents the
 * original synchronous iterator which is being adapted.
 */
interface AsyncFromSyncIteratorSlots {
  SyncIteratorRecord: IteratorRecord;
}
declare global {
  interface ObjectSlots extends Partial<AsyncFromSyncIteratorSlots> {}
}

/**
 * 27.1.4.4 AsyncFromSyncIteratorContinuation ( result, promiseCapability )
 * 
 * The abstract operation AsyncFromSyncIteratorContinuation takes
 * arguments result (an Object) and promiseCapability (a
 * PromiseCapability Record for an intrinsic %Promise%) and returns a
 * Promise. It performs the following steps when called:
 * 
 * 1. NOTE: Because promiseCapability is derived from the intrinsic
 *    %Promise%, the calls to promiseCapability.[[Reject]] entailed by
 *    the use IfAbruptRejectPromise below are guaranteed not to throw.
 * 2. Let done be Completion(IteratorComplete(result)).
 * 3. IfAbruptRejectPromise(done, promiseCapability).
 * 4. Let value be Completion(IteratorValue(result)).
 * 5. IfAbruptRejectPromise(value, promiseCapability).
 * 6. Let valueWrapper be Completion(PromiseResolve(%Promise%, value)).
 * 7. IfAbruptRejectPromise(valueWrapper, promiseCapability).
 * 8. Let unwrap be a new Abstract Closure with parameters (v) that
 *    captures done and performs the following steps when called:
 *     a. Return CreateIterResultObject(v, done).
 * 9. Let onFulfilled be CreateBuiltinFunction(unwrap, 1, "", « »).
 * 10. NOTE: onFulfilled is used when processing the "value" property
 *     of an IteratorResult object in order to wait for its value if
 *     it is a promise and re-package the result in a new "unwrapped"
 *     IteratorResult object.
 * 11. Perform PerformPromiseThen(valueWrapper, onFulfilled, undefined, promiseCapability).
 * 12. Return promiseCapability.[[Promise]].
 */
export function* AsyncFromSyncIteratorContinuation(
  $: VM,
  result: Obj,
  promiseCapability: PromiseCapability,
): ECR<Val> {
  const done = yield* IteratorComplete($, result);
  if (IsAbrupt(done)) return yield* RejectAndReturnPromise($, done, promiseCapability);
  const value = yield* IteratorValue($, result);
  if (IsAbrupt(value)) return yield* RejectAndReturnPromise($, value, promiseCapability);
  const valueWrapper = yield* PromiseResolve($, $.getIntrinsic('%Promise%')!, value);
  if (IsAbrupt(valueWrapper)) return yield* RejectAndReturnPromise($, valueWrapper, promiseCapability);
  const onFulfilled = CreateBuiltinFunctionFromClosure(function*(v: Val) {
    return CreateIterResultObject($, v, done);
  }, 1, '', {$});
  PerformPromiseThen($, valueWrapper, onFulfilled, undefined, promiseCapability);
  return promiseCapability.Promise;
}
