import { IsCallable } from './abstract_compare';
import { CreateIterResultObject, GetIterator, IteratorClose, IteratorStep, IteratorValue } from './abstract_iterator';
import { Call, CreateArrayFromList, Get } from './abstract_object';
import { Assert } from './assert';
import { CR, IsAbrupt } from './completion_record';
import { SYNC } from './enums';
import { CreateBuiltinFunction, IsFunc, getter, method, methodO } from './func';
import { CreateIteratorFromClosure, GeneratorResume, GeneratorYield } from './generator';
import { iterators } from './iterators';
import { Obj, OrdinaryCreateFromConstructor, OrdinaryObjectCreate } from './obj';
import { prelude } from './prelude';
import { PropertyDescriptor, prop0, propC, propWC } from './property_descriptor';
import { RealmRecord, defineProperties } from './realm_record';
import { Val } from './val';
import { ECR, Plugin, VM } from './vm';

/**
 * 24.2 Set Objects
 * 
 * Set objects are collections of ECMAScript language values. A
 * distinct value may only occur once as an element of a Set's
 * collection. Distinct values are discriminated using the
 * SameValueZero comparison algorithm.
 * 
 * Set objects must be implemented using either hash tables or other
 * mechanisms that, on average, provide access times that are
 * sublinear on the number of elements in the collection. The data
 * structure used in this specification is only intended to describe
 * the required observable semantics of Set objects. It is not
 * intended to be a viable implementation model.
 */
export const set: Plugin = {
  id: 'set',
  deps: () => [prelude, iterators],
  realm: {CreateIntrinsics},
};

export function CreateIntrinsics(
  realm: RealmRecord,
  stagedGlobals: Map<string, PropertyDescriptor>,
) {
  /**
   * 24.2.1 The Set Constructor
   * 
   * The Set constructor:
   *   - is %Set%.
   *   - is the initial value of the "Set" property of the global object.
   *   - creates and initializes a new Set object when called as a constructor.
   *   - is not intended to be called as a function and will throw an
   *     exception when called in that manner.
   *   - may be used as the value in an extends clause of a class
   *     definition. Subclass constructors that intend to inherit the
   *     specified Set behaviour must include a super call to the Set
   *     constructor to create and initialize the subclass instance with
   *     the internal state necessary to support the Set.prototype
   *     built-in methods.
   * 
   * ---
   * 
   * 24.2.2 Properties of the Set Constructor
   * 
   * The Set constructor:
   *   - has a [[Prototype]] internal slot whose value is %Function.prototype%.
   *   - has the following properties:
   */
  const setCtor = CreateBuiltinFunction({Construct: SetConstructor}, 0, 'Set', {Realm: realm});

  /**
   * 24.2.3 Properties of the Set Prototype Object
   * 
   * The Set prototype object:
   *   - is %Set.prototype%.
   *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
   *   - is an ordinary object.
   *   - does not have a [[SetData]] internal slot.
   */
  const setPrototype = OrdinaryObjectCreate({
    Prototype: realm.Intrinsics.get('%Object.prototype%')!,
  }, {
    /**
     * 24.2.3.3 Set.prototype.constructor
     * 
     * The initial value of Set.prototype.constructor is %Set%.
     */
    'constructor': propWC(setCtor),
  });

  defineProperties(realm, setCtor, {
    /**
     * 24.2.2.1 Set.prototype
     * 
     * The initial value of Set.prototype is the Set prototype object.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: false }.
     */
    'prototype': prop0(setPrototype),

    /** 
     * 24.2.2.2 get Set [ @@species ]
     * 
     * Set[@@species] is an accessor property whose set accessor
     * function is undefined. Its get accessor function performs the
     * following steps when called:
     * 
     * 1. Return the this value.
     * 
     * The value of the "name" property of this function is "get [Symbol.species]".
     * 
     * NOTE: Methods that create derived collection objects should
     * call @@species to determine the constructor to use to create
     * the derived objects. Subclass constructor may over-ride
     * @@species to change the default constructor assignment.
     */
    [Symbol.species]: getter(function*(_$, thisValue) { return thisValue; }),
  });

  const setPrototypeValues =
    CreateBuiltinFunction({Call: SetPrototypeValues}, 0, 'values', {Realm: realm});

  defineProperties(realm, setPrototype, {
    /** 24.2.3.1 Set.prototype.add ( ) */
    'add': method(SetPrototypeAdd),
    /** 24.2.3.2 Set.prototype.clear ( ) */
    'clear': method(SetPrototypeClear),
    /** 24.2.3.4 Set.prototype.delete ( key ) */
    'delete': method(SetPrototypeDelete),
    /** 24.2.3.5 Set.prototype.entries ( ) */
    'entries': method(SetPrototypeEntries),
    /** 24.2.3.6 SEt.prototype.forEach ( callbackfn [ , thisArg ] ) */
    'forEach': method(SetPrototypeForEach),
    /** 24.2.3.7 Set.prototype.has ( key ) */
    'has': method(SetPrototypeHas),
    /**
     * 24.2.3.8 Set.prototype.keys ( )
     * 
     * The initial value of the "keys" property is %Set.prototype.values%,
     * defined in 24.2.3.10.
     * 
     * NOTE: For iteration purposes, a Set appears similar to a Map where
     * each entry has the same value for its key and value.
     */
    'keys': propWC(setPrototypeValues),
    /** 24.1.3.9 get Set.prototype.size */
    'size': getter(SetPrototypeGetSize),
    /** 24.1.3.10 Set.prototype.values ( ) */
    'values': propWC(setPrototypeValues),

    /**
     * 24.2.3.11 Set.prototype [ @@iterator ] ( )
     * 
     * The initial value of the @@iterator property is
     * %Set.prototype.values%, defined in 24.2.3.10.
     */
    [Symbol.iterator]: propWC(setPrototypeValues),

    /**
     * 24.2.3.12 Set.prototype [ @@toStringTag ]
     * 
     * The initial value of the @@toStringTag property is the String value "Set".
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    [Symbol.toStringTag]: propC('Set'),
  });

  realm.Intrinsics.set('%Set%', setCtor);
  realm.Intrinsics.set('%Set.prototype%', setPrototype);
  stagedGlobals.set('Set', propWC(setCtor));

  /**
   * 24.2.5.2 The %SetIteratorPrototype% Object
   * 
   * The %SetIteratorPrototype% object:
   *   - has properties that are inherited by all Set Iterator Objects.
   *   - is an ordinary object.
   *   - has a [[Prototype]] internal slot whose value is %IteratorPrototype%.
   *   - has the following properties:
   */
  const setIteratorPrototype = OrdinaryObjectCreate({
    Prototype: realm.Intrinsics.get('%IteratorPrototype%')!,
  });

  defineProperties(realm, setIteratorPrototype, {
    /**
     * 24.2.5.2.1 %SetIteratorPrototype%.next ( )
     * 
     * 1. Return ? GeneratorResume(this value, empty, "%SetIteratorPrototype%").
     */
    'next': methodO(function*($, thisValue) {
      return yield* GeneratorResume(
        $, thisValue, undefined /*EMPTY*/, '%SetIteratorPrototype%');
    }),

    /**
     * 24.2.5.2.2 %SetIteratorPrototype% [ @@toStringTag ]
     * 
     * The initial value of the @@toStringTag property is the String value "Set Iterator".
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    [Symbol.toStringTag]: propC('Set Iterator'),
  });
  realm.Intrinsics.set('%SetIteratorPrototype%', setIteratorPrototype);
}

/**
 * 24.2.1.1 Set ( [ iterable ] )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If NewTarget is undefined, throw a TypeError exception.
 * 2. Let set be ? OrdinaryCreateFromConstructor(NewTarget,
 *    "%Set.prototype%", « [[SetData]] »).
 * 3. Set set.[[SetData]] to a new empty List.
 * 4. If iterable is either undefined or null, return set.
 * 5. Let adder be ? Get(set, "add").
 * 6. If IsCallable(adder) is false, throw a TypeError exception.
 * 7. Let iteratorRecord be ? GetIterator(iterable, sync).
 * 8. Repeat,
 *     a. Let next be ? IteratorStep(iteratorRecord).
 *     b. If next is false, return set.
 *     c. Let nextValue be ? IteratorValue(next).
 *     d. Let status be Completion(Call(adder, set, « nextValue »)).
 *     e. IfAbruptCloseIterator(status, iteratorRecord).
 */
export function* SetConstructor($: VM, [iterable]: Val[], NewTarget: Val): ECR<Obj> {
  if (!NewTarget) return $.throw('TypeError', 'Set must be called with new');
  Assert(IsFunc(NewTarget));
  const set = yield* OrdinaryCreateFromConstructor($, NewTarget, '%Set.prototype%', {
    SetData: new Set(),
  });
  if (IsAbrupt(set)) return set;
  if (iterable == null) return set;
  const adder = yield* Get($, set, 'add');
  if (IsAbrupt(adder)) return adder;
  if (!IsCallable(adder)) return $.throw('TypeError', 'Set add method is not callable');
  const iteratorRecord = yield* GetIterator($, iterable, SYNC);
  if (IsAbrupt(iteratorRecord)) return iteratorRecord;
  while (true) {
    const next = yield* IteratorStep($, iteratorRecord);
    if (IsAbrupt(next)) return yield* IteratorClose($, iteratorRecord, next);
    if (!next) return set;
    const nextValue = yield* IteratorValue($, next);
    if (IsAbrupt(nextValue)) return yield* IteratorClose($, iteratorRecord, nextValue);
    const status = yield* Call($, adder, set, [nextValue]);
    if (IsAbrupt(status)) return yield* IteratorClose($, iteratorRecord, status);
  }
}

/**
 * 24.2.3.1 Set.prototype.add ( value )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let S be the this value.
 * 2. Perform ? RequireInternalSlot(S, [[SetData]]).
 * 3. For each element e of S.[[SetData]], do
 *     a. If e is not empty and SameValueZero(e, value) is true, then
 *         i. Return S.
 * 4. If value is -0𝔽, set value to +0𝔽.
 * 5. Append value to S.[[SetData]].
 * 6. Return S.
 */
export function* SetPrototypeAdd($: VM, thisArg: Val, value: Val): ECR<Val> {
  const setData = RequireInternalSetDataSlot($, thisArg);
  if (IsAbrupt(setData)) return setData;
  setData.add(value);
  return thisArg;
}

/**
 * 24.2.3.2 Set.prototype.clear ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let S be the this value.
 * 2. Perform ? RequireInternalSlot(S, [[SetData]]).
 * 3. For each element e of S.[[SetData]], do
 *     a. Replace the element of S.[[SetData]] whose value is e with an element whose value is empty.
 * 4. Return undefined.
 * 
 * NOTE: The existing [[SetData]] List is preserved because there may
 * be existing Set Iterator objects that are suspended midway through
 * iterating over that List.
 */
export function* SetPrototypeClear($: VM, thisArg: Val): ECR<Val> {
  const setData = RequireInternalSetDataSlot($, thisArg);
  if (IsAbrupt(setData)) return setData;
  setData.clear();
  return undefined;
}

/**
 * 24.2.3.4 Set.prototype.delete ( value )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let S be the this value.
 * 2. Perform ? RequireInternalSlot(S, [[SetData]]).
 * 3. For each element e of S.[[SetData]], do
 *     a. If e is not empty and SameValueZero(e, value) is true, then
 *         i. Replace the element of S.[[SetData]] whose value is e with an element whose value is empty.
 *         ii. Return true.
 * 4. Return false.
 * 
 * NOTE: The value empty is used as a specification device to indicate
 * that an entry has been deleted. Actual implementations may take
 * other actions such as physically removing the entry from internal
 * data structures.
 */
export function* SetPrototypeDelete($: VM, thisArg: Val, value: Val): ECR<Val> {
  const setData = RequireInternalSetDataSlot($, thisArg);
  if (IsAbrupt(setData)) return setData;
  return setData.delete(value);
}

/**
 * 24.2.3.5 Set.prototype.entries ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let S be the this value.
 * 2. Return ? CreateSetIterator(S, key+value).
 * 
 * NOTE: For iteration purposes, a Set appears similar to a Map where
 * each entry has the same value for its key and value.
 */
export function SetPrototypeEntries($: VM, thisArg: Val): ECR<Val> {
  return CreateSetIterator($, thisArg, 'key+value');
}

/**
 * 24.2.3.6 Set.prototype.forEach ( callbackfn [ , thisArg ] )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let S be the this value.
 * 2. Perform ? RequireInternalSlot(S, [[SetData]]).
 * 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
 * 4. Let entries be S.[[SetData]].
 * 5. Let numEntries be the number of elements in entries.
 * 6. Let index be 0.
 * 7. Repeat, while index < numEntries,
 *     a. Let e be entries[index].
 *     b. Set index to index + 1.
 *     c. If e is not empty, then
 *         i. Perform ? Call(callbackfn, thisArg, « e, e, S »).
 *         ii. NOTE: The number of elements in entries may have increased during execution of callbackfn.
 *         iii. Set numEntries to the number of elements in entries.
 * 8. Return undefined.
 * 
 * NOTE: callbackfn should be a function that accepts three
 * arguments. forEach calls callbackfn once for each value present in
 * the Set object, in value insertion order. callbackfn is called only
 * for values of the Set which actually exist; it is not called for
 * keys that have been deleted from the set.
 * 
 * If a thisArg parameter is provided, it will be used as the this
 * value for each invocation of callbackfn. If it is not provided,
 * undefined is used instead.
 * 
 * callbackfn is called with three arguments: the first two arguments
 * are a value contained in the Set. The same value is passed for both
 * arguments. The Set object being traversed is passed as the third
 * argument.
 * 
 * The callbackfn is called with three arguments to be consistent with
 * the call back functions used by forEach methods for Map and
 * Array. For Sets, each item value is considered to be both the key
 * and the value.
 * 
 * forEach does not directly mutate the object on which it is called
 * but the object may be mutated by the calls to callbackfn.
 * 
 * Each value is normally visited only once. However, a value will be
 * revisited if it is deleted after it has been visited and then
 * re-added before the forEach call completes. Values that are deleted
 * after the call to forEach begins and before being visited are not
 * visited unless the value is added again before the forEach call
 * completes. New values added after the call to forEach begins are
 * visited.
 */
export function* SetPrototypeForEach(
  $: VM,
  thisArg: Val,
  callbackfn: Val,
): ECR<Val> {
  const setData = RequireInternalSetDataSlot($, thisArg);
  if (IsAbrupt(setData)) return setData;
  if (!IsCallable(callbackfn)) return $.throw('TypeError', 'not a function');
  for (const value of setData) {
    yield* Call($, callbackfn, thisArg, [value, value, thisArg]);
  }
  return undefined;
}

/**
 * 24.2.3.7 Set.prototype.has ( value )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let S be the this value.
 * 2. Perform ? RequireInternalSlot(S, [[SetData]]).
 * 3. For each element e of S.[[SetData]], do
 *     a. If e is not empty and SameValueZero(e, value) is true, return true.
 * 4. Return false.
 */
export function* SetPrototypeHas($: VM, thisArg: Val, value: Val): ECR<Val> {
  const setData = RequireInternalSetDataSlot($, thisArg);
  if (IsAbrupt(setData)) return setData;
  return setData.has(value);
}

/**
 * 24.2.3.9 get Set.prototype.size
 * 
 * Set.prototype.size is an accessor property whose set accessor
 * function is undefined. Its get accessor function performs the
 * following steps when called:
 * 
 * 1. Let S be the this value.
 * 2. Perform ? RequireInternalSlot(S, [[SetData]]).
 * 3. Let count be 0.
 * 4. For each element e of S.[[SetData]], do
 *     a. If e is not empty, set count to count + 1.
 * 5. Return 𝔽(count).
 */
export function* SetPrototypeGetSize($: VM, thisArg: Val): ECR<Val> {
  const setData = RequireInternalSetDataSlot($, thisArg);
  if (IsAbrupt(setData)) return setData;
  return setData.size;
}

/**
 * 24.2.3.10 Set.prototype.values ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let S be the this value.
 * 2. Return ? CreateSetIterator(S, value).
 */
export function SetPrototypeValues($: VM, thisArg: Val): ECR<Val> {
  return CreateSetIterator($, thisArg, 'value');
}

/**
 * 24.2.4 Properties of Set Instances
 * 
 * Set instances are ordinary objects that inherit properties from the
 * Set prototype. Set instances also have a [[SetData]] internal slot.
 */
export interface SetSlots {
  SetData: Set<Val>;
}
declare global {
  interface ObjectSlots extends Partial<SetSlots> {}
}
export function RequireInternalSetDataSlot($: VM, set: Val): CR<Set<Val>> {
  if (!(set instanceof Obj)) return $.throw('TypeError', 'not an object');
  if (!set.SetData) return $.throw('TypeError', 'not a Set');
  return set.SetData;
}

/**
 * 24.2.5 Set Iterator Objects
 * 
 * A Set Iterator is an ordinary object, with the structure defined
 * below, that represents a specific iteration over some specific Set
 * instance object. There is not a named constructor for Set Iterator
 * objects. Instead, set iterator objects are created by calling
 * certain methods of Set instance objects.
 */

/**
 * 24.2.5.1 CreateSetIterator ( set, kind )
 * 
 * The abstract operation CreateSetIterator takes arguments set (an
 * ECMAScript language value) and kind (key+value or value) and
 * returns either a normal completion containing a Generator or a
 * throw completion. It is used to create iterator objects for Set
 * methods that return such iterators. It performs the following steps
 * when called:
 * 
 * 1. Perform ? RequireInternalSlot(set, [[SetData]]).
 * 2. Let closure be a new Abstract Closure with no parameters that
 *    captures set and kind and performs the following steps when called:
 *     a. Let index be 0.
 *     b. Let entries be set.[[SetData]].
 *     c. Let numEntries be the number of elements in entries.
 *     d. Repeat, while index < numEntries,
 *         i. Let e be entries[index].
 *         ii. Set index to index + 1.
 *         iii. If e is not empty, then
 *             1. If kind is key+value, then
 *                 a. Let result be CreateArrayFromList(« e, e »).
 *                 b. Perform ? GeneratorYield(CreateIterResultObject(result, false)).
 *             2. Else,
 *                 a. Assert: kind is value.
 *                 b. Perform ? GeneratorYield(CreateIterResultObject(e, false)).
 *             3. NOTE: The number of elements in entries may have
 *                increased while execution of this abstract operation
 *                was paused by Yield.
 *             4. Set numEntries to the number of elements in entries.
 *     e. Return undefined.
 * 3. Return CreateIteratorFromClosure(closure, "%SetIteratorPrototype%",
 *    %SetIteratorPrototype%).
 */
export function* CreateSetIterator($: VM, set: Val, kind: 'key+value'|'value'): ECR<Val> {
  const setData = RequireInternalSetDataSlot($, set);
  if (IsAbrupt(setData)) return setData;
  return CreateIteratorFromClosure($, function*(): ECR<undefined> {
    for (const value of setData) {
      let result: Val;
      if (kind === 'key+value') {
        result = CreateArrayFromList($, [value, value]);
      } else {
        result = value;
      }
      yield* GeneratorYield($, CreateIterResultObject($, result, false));
    }
    return;
  }, '%SetIteratorPrototype%', $.getIntrinsic('%SetIteratorPrototype%'));
}
