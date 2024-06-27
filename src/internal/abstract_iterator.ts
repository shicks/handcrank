import { ToBoolean } from './abstract_conversion';
import { Call, Get, GetMethod, GetV } from './abstract_object';
import { Assert } from './assert';
import { CR, IsAbrupt, IsThrowCompletion, NotGen } from './completion_record';
import { ASYNC, EMPTY, SYNC, UNUSED } from './enums';
import { Func, IsFunc } from './func';
import { CreateIteratorFromClosure, GeneratorYield } from './generator';
import { Obj, OrdinaryObjectCreate } from './obj';
import { propWEC } from './property_descriptor';
import { Val } from './val';
import { ECR, VM } from './vm';

declare const Await: any;
declare const CreateAsyncFromSyncIterator: any;

/**
 * 7.4.1 Iterator Records
 *
 * An Iterator Record is a Record value used to encapsulate an
 * Iterator or AsyncIterator along with the next method.
 *
 * Iterator Records have the fields listed below:
 *
 * [[Iterator]], an Object - An object that conforms to the
 * Iterator or AsyncIterator interface.
 *
 * [[NextMethod]], a function object - The next method of
 * the [[Iterator]] object.
 *
 * [[Done]], a Boolean - Whether the iterator has been closed.
 */
export class IteratorRecord {
  constructor(
    readonly Iterator: Obj,
    readonly NextMethod: Func,
    public Done: boolean,
  ) {}
}

/**
 * 7.4.2 GetIteratorFromMethod ( obj, method )
 * 
 * The abstract operation GetIteratorFromMethod takes arguments obj
 * (an ECMAScript language value) and method (a function object) and
 * returns either a normal completion containing an Iterator Record or
 * a throw completion. It performs the following steps when called:
 * 
 * 1. Let iterator be ? Call(method, obj).
 * 2. If iterator is not an Object, throw a TypeError exception.
 * 3. Let nextMethod be ? GetV(iterator, "next").
 * 4. Let iteratorRecord be the Iterator Record { [[Iterator]]:
 *    iterator, [[NextMethod]]: nextMethod, [[Done]]: false }.
 * 5. Return iteratorRecord.
 */
export function* GetIteratorFromMethod(
  $: VM,
  obj: Val,
  method: Func,
): ECR<IteratorRecord> {
  const iterator = yield* Call($, method, obj);
  if (IsAbrupt(iterator)) return iterator;
  if (!(iterator instanceof Obj)) {
    return $.throw('TypeError', 'not an object');
  }
  const nextMethod = yield* GetV($, iterator, 'next');
  if (IsAbrupt(nextMethod)) return nextMethod;
  Assert(IsFunc(nextMethod));
  return new IteratorRecord(iterator, nextMethod, false);
}

/**
 * 7.4.3 GetIterator ( obj, kind )
 * 
 * The abstract operation GetIterator takes arguments obj (an
 * ECMAScript language value) and kind (sync or async) and returns
 * either a normal completion containing an Iterator Record or a throw
 * completion. It performs the following steps when called:
 * 
 * 1. If kind is async, then
 *     a. Let method be ? GetMethod(obj, @@asyncIterator).
 *     b. If method is undefined, then
 *         i. Let syncMethod be ? GetMethod(obj, @@iterator).
 *         ii. If syncMethod is undefined, throw a TypeError exception.
 *         iii. Let syncIteratorRecord be ? GetIteratorFromMethod(obj, syncMethod).
 *         iv. Return CreateAsyncFromSyncIterator(syncIteratorRecord).
 * 2. Otherwise, let method be ? GetMethod(obj, @@iterator).
 * 3. If method is undefined, throw a TypeError exception.
 * 4. Return ? GetIteratorFromMethod(obj, method).
 */
export function* GetIterator(
  $: VM,
  obj: Val,
  kind: SYNC|ASYNC,
): ECR<IteratorRecord> {
  let method;
  if (ASYNC.is(kind)) {
    method = yield* GetMethod($, obj, Symbol.asyncIterator);
    if (IsAbrupt(method)) return method;
    if (method === undefined) {
      const syncMethod = yield* GetMethod($, obj, Symbol.iterator);
      if (IsAbrupt(syncMethod)) return syncMethod;
      if (!IsFunc(syncMethod)) {
        return $.throw('TypeError', 'not iterable');
      }
      const syncIteratorRecord = yield* GetIteratorFromMethod($, obj, syncMethod);
      if (IsAbrupt(syncIteratorRecord)) return syncIteratorRecord;
      return CreateAsyncFromSyncIterator($, syncIteratorRecord);
    }
  } else {
    method = yield* GetMethod($, obj, Symbol.iterator);
    if (IsAbrupt(method)) return method;
  }
  if (!IsFunc(method)) {
    return $.throw('TypeError', 'not iterable');
  }
  return yield* GetIteratorFromMethod($, obj, method);
}

/**
 * 7.4.4 IteratorNext ( iteratorRecord [ , value ] )
 * 
 * The abstract operation IteratorNext takes argument iteratorRecord
 * (an Iterator Record) and optional argument value (an ECMAScript
 * language value) and returns either a normal completion containing
 * an Object or a throw completion. It performs the following steps
 * when called:
 * 
 * 1. If value is not present, then
 *     a. Let result be ? Call(iteratorRecord.[[NextMethod]],
 *     iteratorRecord.[[Iterator]]).
 * 2. Else,
 *     a. Let result be ? Call(iteratorRecord.[[NextMethod]],
 *     iteratorRecord.[[Iterator]], « value »).
 * 3. If result is not an Object, throw a TypeError exception.
 * 4. Return result.
 */
export function* IteratorNext(
  $: VM,
  iteratorRecord: IteratorRecord,
  value?: Val,
): ECR<Obj> {
  const result = yield* Call(
    $, iteratorRecord.NextMethod, iteratorRecord.Iterator,
    value !== undefined ? [value] : []);
  if (IsAbrupt(result)) return result;
  if (!(result instanceof Obj)) {
    return $.throw('TypeError', 'not an object');
  }
  return result;
}

/**
 * 7.4.5 IteratorComplete ( iterResult )
 * 
 * The abstract operation IteratorComplete takes argument iterResult
 * (an Object) and returns either a normal completion containing a
 * Boolean or a throw completion. It performs the following steps when
 * called:
 * 
 * 1. Return ToBoolean(? Get(iterResult, "done")).
 */
export function* IteratorComplete(
  $: VM,
  iterResult: Obj,
): ECR<boolean> {
  const result = yield* Get($, iterResult, 'done');
  if (IsAbrupt(result)) return result;
  return ToBoolean(result);
}

/**
 * 7.4.6 IteratorValue ( iterResult )
 * 
 * The abstract operation IteratorValue takes argument iterResult (an
 * Object) and returns either a normal completion containing an
 * ECMAScript language value or a throw completion. It performs the
 * following steps when called:
 * 
 * 1. Return ? Get(iterResult, "value").
 */
export function* IteratorValue(
  $: VM,
  iterResult: Obj,
): ECR<Val> {
  return yield* Get($, iterResult, 'value');
}

/**
 * 7.4.7 IteratorStep ( iteratorRecord )
 * 
 * The abstract operation IteratorStep takes argument iteratorRecord
 * (an Iterator Record) and returns either a normal completion
 * containing either an Object or false, or a throw completion. It
 * requests the next value from iteratorRecord.[[Iterator]] by calling
 * iteratorRecord.[[NextMethod]] and returns either false indicating
 * that the iterator has reached its end or the IteratorResult object
 * if a next value is available. It performs the following steps when
 * called:
 * 
 * 1. Let result be ? IteratorNext(iteratorRecord).
 * 2. Let done be ? IteratorComplete(result).
 * 3. If done is true, return false.
 * 4. Return result.
 */
export function* IteratorStep(
  $: VM,
  iteratorRecord: IteratorRecord,
): ECR<Obj|false> {
  const result = yield* IteratorNext($, iteratorRecord);
  if (IsAbrupt(result)) return result;
  const done = yield* IteratorComplete($, result);
  if (IsAbrupt(done)) return done;
  if (done) return false;
  return result;
}

/**
 * 7.4.8 IteratorClose ( iteratorRecord, completion )
 * 
 * The abstract operation IteratorClose takes arguments iteratorRecord
 * (an Iterator Record) and completion (a Completion Record) and
 * returns a Completion Record. It is used to notify an iterator that
 * it should perform any actions it would normally perform when it has
 * reached its completed state. It performs the following steps when
 * called:
 * 
 * 1. Assert: iteratorRecord.[[Iterator]] is an Object.
 * 2. Let iterator be iteratorRecord.[[Iterator]].
 * 3. Let innerResult be Completion(GetMethod(iterator, "return")).
 * 4. If innerResult.[[Type]] is normal, then
 *     a. Let return be innerResult.[[Value]].
 *     b. If return is undefined, return ? completion.
 *     c. Set innerResult to Completion(Call(return, iterator)).
 * 5. If completion.[[Type]] is throw, return ? completion.
 * 6. If innerResult.[[Type]] is throw, return ? innerResult.
 * 7. If innerResult.[[Value]] is not an Object, throw a TypeError exception.
 * 8. Return ? completion.
 */
export function* IteratorClose<T>(
  $: VM,
  iteratorRecord: IteratorRecord,
  completion: CR<T>,
  ...rest: NotGen<T>
): ECR<T> {
  Assert(iteratorRecord.Iterator instanceof Obj);
  const iterator = iteratorRecord.Iterator;
  let innerResult = yield* GetMethod($, iterator, 'return');
  if (!IsAbrupt(innerResult)) {
    if (innerResult === undefined) return completion;
    innerResult = yield* Call($, innerResult, iterator);
  }
  if (IsThrowCompletion(completion, ...rest)) return completion;
  if (IsThrowCompletion(innerResult)) return innerResult;
  if (!(innerResult instanceof Obj)) return $.throw('TypeError', 'not an object');
  return completion;
}

/**
 * 7.4.9 IfAbruptCloseIterator ( value, iteratorRecord )
 * 
 * IfAbruptCloseIterator is a shorthand for a sequence of algorithm
 * steps that use an Iterator Record. An algorithm step of the form:
 * 
 * 1. IfAbruptCloseIterator(value, iteratorRecord).
 * 
 * means the same thing as:
 * 
 * 1. Assert: value is a Completion Record.
 * 2. If value is an abrupt completion, return ? IteratorClose(iteratorRecord, value).
 * 3. Else, set value to value.[[Value]].
 */

/**
 * 7.4.10 AsyncIteratorClose ( iteratorRecord, completion )
 * 
 * The abstract operation AsyncIteratorClose takes arguments
 * iteratorRecord (an Iterator Record) and completion (a Completion
 * Record) and returns a Completion Record. It is used to notify an
 * async iterator that it should perform any actions it would normally
 * perform when it has reached its completed state. It performs the
 * following steps when called:
 * 
 * 1. Assert: iteratorRecord.[[Iterator]] is an Object.
 * 2. Let iterator be iteratorRecord.[[Iterator]].
 * 3. Let innerResult be Completion(GetMethod(iterator, "return")).
 * 4. If innerResult.[[Type]] is normal, then
 *     a. Let return be innerResult.[[Value]].
 *     b. If return is undefined, return ? completion.
 *     c. Set innerResult to Completion(Call(return, iterator)).
 *     d. If innerResult.[[Type]] is normal, set innerResult to
 *        Completion(Await(innerResult.[[Value]])).
 * 5. If completion.[[Type]] is throw, return ? completion.
 * 6. If innerResult.[[Type]] is throw, return ? innerResult.
 * 7. If innerResult.[[Value]] is not an Object, throw a TypeError exception.
 * 8. Return ? completion.
 */
export function* AsyncIteratorClose(
  $: VM,
  iteratorRecord: IteratorRecord,
  completion: CR<Val|EMPTY>,
): ECR<Val|EMPTY> {
  Assert(iteratorRecord.Iterator instanceof Obj);
  const iterator = iteratorRecord.Iterator;
  let innerResult = yield* GetMethod($, iterator, 'return');
  if (!IsAbrupt(innerResult)) {
    if (innerResult === undefined) return completion;
    innerResult = yield* Call($, innerResult, iterator);
    if (!IsAbrupt(innerResult)) {
      innerResult = yield* Await($, innerResult);
    }
  }
  if (IsThrowCompletion(completion)) return completion;
  if (IsThrowCompletion(innerResult)) return innerResult;
  if (!(innerResult instanceof Obj)) return $.throw('TypeError', 'not an object');
  return completion;
}

/**
 * 7.4.11 CreateIterResultObject ( value, done )
 * 
 * The abstract operation CreateIterResultObject takes arguments value
 * (an ECMAScript language value) and done (a Boolean) and returns an
 * Object that conforms to the IteratorResult interface. It creates an
 * object that conforms to the IteratorResult interface. It performs
 * the following steps when called:
 * 
 * 1. Let obj be OrdinaryObjectCreate(%Object.prototype%).
 * 2. Perform ! CreateDataPropertyOrThrow(obj, "value", value).
 * 3. Perform ! CreateDataPropertyOrThrow(obj, "done", done).
 * 4. Return obj.
 */
export function CreateIterResultObject(
  $: VM,
  value: Val,
  done: boolean,
): Obj {
  return OrdinaryObjectCreate({
    Prototype: $.getIntrinsic('%Object.prototype%')!,
  }, {
    value: propWEC(value),
    done: propWEC(done),
  });
}

/**
 * 7.4.12 CreateListIteratorRecord ( list )
 *
 * The abstract operation CreateListIteratorRecord takes argument list
 * (a List of ECMAScript language values) and returns an Iterator
 * Record. It creates an Iterator (27.1.1.2) object record whose next
 * method returns the successive elements of list. It performs the
 * following steps when called:
 *
 * 1. Let closure be a new Abstract Closure with no parameters that
 *    captures list and performs the following steps when called:
 *     a. For each element E of list, do
 *         i. Perform ? GeneratorYield(CreateIterResultObject(E, false)).
 *     b. Return NormalCompletion(undefined).
 * 2. Let iterator be CreateIteratorFromClosure(closure, empty, %IteratorPrototype%).
 * 3. Return the Iterator Record { [[Iterator]]: iterator,
 *    [[NextMethod]]: %GeneratorFunction.prototype.prototype.next%,
 *    [[Done]]: false }.
 *
 * NOTE: The list iterator object is never directly accessible to ECMAScript code.
 */
export function CreateListIteratorRecord($: VM, list: Val[]): IteratorRecord {
  // TODO - we can probably simplify this a whole bunch
  function* closure(): ECR<undefined> {
    for (const value of list) {
      yield* GeneratorYield($, CreateIterResultObject($, value, false));
    }
    return undefined;
  }
  const iterator =
    CreateIteratorFromClosure($, closure, EMPTY, $.getIntrinsic('%IteratorPrototype%')!);
  return new IteratorRecord(
    iterator,
    $.getIntrinsic('%GeneratorFunction.prototype.prototype.next%')! as Func,
    false);
}

/**
 * 7.4.13 IteratorToList ( iteratorRecord )
 * 
 * The abstract operation IteratorToList takes argument iteratorRecord
 * (an Iterator Record) and returns either a normal completion
 * containing a List of ECMAScript language values or a throw
 * completion. It performs the following steps when called:
 * 
 * 1. Let values be a new empty List.
 * 2. Let next be true.
 * 3. Repeat, while next is not false,
 *     a. Set next to ? IteratorStep(iteratorRecord).
 *     b. If next is not false, then
 *         i. Let nextValue be ? IteratorValue(next).
 *         ii. Append nextValue to values.
 * 4. Return values.
 */
export function* IteratorToList(
  $: VM,
  iteratorRecord: IteratorRecord,
): ECR<Val[]> {
  const values: Val[] = [];
  let next: CR<boolean|Obj> = true;
  while (next !== false) {
    next = yield* IteratorStep($, iteratorRecord);
    if (IsAbrupt(next)) return next;
    if (next !== false) {
      const nextValue = yield* IteratorValue($, next);
      if (IsAbrupt(nextValue)) return nextValue;
      values.push(nextValue);
    }
  }
  return values;
}

/**
 * 24.1.1.2 AddEntriesFromIterable ( target, iterable, adder )
 * 
 * The abstract operation AddEntriesFromIterable takes arguments
 * target (an Object), iterable (an ECMAScript language value, but not
 * undefined or null), and adder (a function object) and returns
 * either a normal completion containing an ECMAScript language value
 * or a throw completion. adder will be invoked, with target as the
 * receiver. It performs the following steps when called:
 * 
 * 1. Let iteratorRecord be ? GetIterator(iterable, sync).
 * 2. Repeat,
 *     a. Let next be ? IteratorStep(iteratorRecord).
 *     b. If next is false, return target.
 *     c. Let nextItem be ? IteratorValue(next).
 *     d. If nextItem is not an Object, then
 *         i. Let error be ThrowCompletion(a newly created TypeError object).
 *         ii. Return ? IteratorClose(iteratorRecord, error).
 *     e. Let k be Completion(Get(nextItem, "0")).
 *     f. IfAbruptCloseIterator(k, iteratorRecord).
 *     g. Let v be Completion(Get(nextItem, "1")).
 *     h. IfAbruptCloseIterator(v, iteratorRecord).
 *         i. Let status be Completion(Call(adder, target, « k, v »)).
 * j. j. IfAbruptCloseIterator(status, iteratorRecord).
 * 
 * NOTE: The parameter iterable is expected to be an object that
 * implements an @@iterator method that returns an iterator object
 * that produces a two element array-like object whose first element
 * is a value that will be used as a Map key and whose second element
 * is the value to associate with that key.
 */
export function* AddEntriesFromIterable(
  $: VM,
  iterable: Val,
  adder: (k: Val, v: Val) => ECR<void>,
): ECR<unknown> {
  const iteratorRecord = yield* GetIterator($, iterable, SYNC);
  if (IsAbrupt(iteratorRecord)) return iteratorRecord;
  while (true) {
    const next = yield* IteratorStep($, iteratorRecord);
    if (IsAbrupt(next)) return next;
    if (next === false) return UNUSED;
    const nextItem = yield* IteratorValue($, next);
    if (IsAbrupt(nextItem)) return nextItem;
    if (!(nextItem instanceof Obj)) {
      return yield* IteratorClose($, iteratorRecord,
                                  $.throw('TypeError', 'not an object'));
    }
    let k = yield* Get($, nextItem, '0');
    if (IsAbrupt(k)) return IteratorClose($, iteratorRecord, k);
    let v = yield* Get($, nextItem, '1');
    if (IsAbrupt(v)) return IteratorClose($, iteratorRecord, v);
    const status = yield* adder(k, v);
    if (IsAbrupt(status)) return IteratorClose($, iteratorRecord, status);
  }
}
