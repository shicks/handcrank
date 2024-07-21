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
 * 24.1 Map Objects
 * 
 * Maps are collections of key/value pairs where both the keys and
 * values may be arbitrary ECMAScript language values. A distinct key
 * value may only occur in one key/value pair within the Map's
 * collection. Distinct key values are discriminated using the
 * SameValueZero comparison algorithm.
 * 
 * Maps must be implemented using either hash tables or other
 * mechanisms that, on average, provide access times that are
 * sublinear on the number of elements in the collection. The data
 * structure used in this specification is only intended to describe
 * the required observable semantics of Maps. It is not intended to be
 * a viable implementation model.
 */
export const map: Plugin = {
  id: 'map',
  deps: () => [prelude, iterators],
  realm: {CreateIntrinsics},
};

export function CreateIntrinsics(
  realm: RealmRecord,
  stagedGlobals: Map<string, PropertyDescriptor>,
) {
  /**
   * 24.1.1 The Map Constructor
   * 
   * The Map constructor:
   *   - is %Map%.
   *   - is the initial value of the "Map" property of the global object.
   *   - creates and initializes a new Map when called as a constructor.
   *   - is not intended to be called as a function and will throw an
   *     exception when called in that manner.
   *   - may be used as the value in an extends clause of a class
   *     definition. Subclass constructors that intend to inherit the
   *     specified Map behaviour must include a super call to the Map
   *     constructor to create and initialize the subclass instance with
   *     the internal state necessary to support the Map.prototype
   *     built-in methods.
   * 
   * ---
   * 
   * 24.1.2 Properties of the Map Constructor
   * 
   * The Map constructor:
   *   - has a [[Prototype]] internal slot whose value is %Function.prototype%.
   *   - has the following properties:
   */
  const mapCtor = CreateBuiltinFunction({Construct: MapConstructor}, 0, 'Map', {Realm: realm});

  /**
   * 24.1.3 Properties of the Map Prototype Object
   * 
   * The Map prototype object:
   *   - is %Map.prototype%.
   *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
   *   - is an ordinary object.
   *   - does not have a [[MapData]] internal slot.
   */
  const mapPrototype = OrdinaryObjectCreate({
    Prototype: realm.Intrinsics.get('%Object.prototype%')!,
  }, {
    /**
     * 24.1.3.2 Map.prototype.constructor
     * 
     * The initial value of Map.prototype.constructor is %Map%.
     */
    'constructor': propWC(mapCtor),
  });

  defineProperties(realm, mapCtor, {
    /**
     * 24.1.2.1 Map.prototype
     * 
     * The initial value of Map.prototype is the Map prototype object.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: false }.
     */
    'prototype': prop0(mapPrototype),

    /**
     * 24.1.2.2 get Map [ @@species ]
     * 
     * Map[@@species] is an accessor property whose set accessor function
     * is undefined. Its get accessor function performs the following
     * steps when called:
     * 
     * 1. Return the this value.
     * 
     * The value of the "name" property of this function is "get [Symbol.species]".
     * 
     * NOTE: Methods that create derived collection objects should call
     * @@species to determine the constructor to use to create the derived
     * objects. Subclass constructor may over-ride @@species to change the
     * default constructor assignment.
     */
    [Symbol.species]: getter(function*(_$, thisValue) { return thisValue; }),
  });

  const mapPrototypeEntries =
    CreateBuiltinFunction({Call: MapPrototypeEntries}, 0, 'entries', {Realm: realm});

  defineProperties(realm, mapPrototype, {
    /** 24.1.3.1 Map.prototype.clear ( ) */
    'clear': method(MapPrototypeClear),
    /** 24.1.3.3 Map.prototype.delete ( key ) */
    'delete': method(MapPrototypeDelete),
    /** 24.1.3.4 Map.prototype.entries ( ) */
    'entries': propWC(mapPrototypeEntries),
    /** 24.1.3.5 Map.prototype.forEach ( callbackfn [ , thisArg ] ) */
    'forEach': method(MapPrototypeForEach),
    /** 24.1.3.6 Map.prototype.get ( key ) */
    'get': method(MapPrototypeGet),
    /** 24.1.3.7 Map.prototype.has ( key ) */
    'has': method(MapPrototypeHas),
    /** 24.1.3.8 Map.prototype.keys ( ) */
    'keys': method(MapPrototypeKeys),
    /** 24.1.3.9 Map.prototype.set ( key, value ) */
    'set': method(MapPrototypeSet),
    /** 24.1.3.10 get Map.prototype.size */
    'size': getter(MapPrototypeGetSize),
    /** 24.1.3.11 Map.prototype.values ( ) */
    'values': method(MapPrototypeValues),

    /**
     * 24.1.3.12 Map.prototype [ @@iterator ] ( )
     * 
     * The initial value of the @@iterator property is
     * %Map.prototype.entries%, defined in 24.1.3.4.
     */
    [Symbol.iterator]: propWC(mapPrototypeEntries),

    /**
     * 24.1.3.13 Map.prototype [ @@toStringTag ]
     * 
     * The initial value of the @@toStringTag property is the String value "Map".
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    [Symbol.toStringTag]: propC('Map'),
  });

  realm.Intrinsics.set('%Map%', mapCtor);
  realm.Intrinsics.set('%Map.prototype%', mapPrototype);
  stagedGlobals.set('Map', propWC(mapCtor));

  /**
   * 24.1.5.2 The %MapIteratorPrototype% Object
   * 
   * The %MapIteratorPrototype% object:
   *   - has properties that are inherited by all Map Iterator Objects.
   *   - is an ordinary object.
   *   - has a [[Prototype]] internal slot whose value is %IteratorPrototype%.
   *   - has the following properties:
   */
  const mapIteratorPrototype = OrdinaryObjectCreate({
    Prototype: realm.Intrinsics.get('%IteratorPrototype%')!,
  });

  defineProperties(realm, mapIteratorPrototype, {
    /**
     * 24.1.5.2.1 %MapIteratorPrototype%.next ( )
     * 
     * 1. Return ? GeneratorResume(this value, empty, "%MapIteratorPrototype%").
     */
    'next': methodO(function*($, thisValue) {
      return yield* GeneratorResume(
        $, thisValue, undefined /*EMPTY*/, '%MapIteratorPrototype%');
    }),

    /**
     * 24.1.5.2.2 %MapIteratorPrototype% [ @@toStringTag ]
     * 
     * The initial value of the @@toStringTag property is the String value "Map Iterator".
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    [Symbol.toStringTag]: propC('Map Iterator'),
  });
  realm.Intrinsics.set('%MapIteratorPrototype%', mapIteratorPrototype);
}

/**
 * 24.1.1.1 Map ( [ iterable ] )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If NewTarget is undefined, throw a TypeError exception.
 * 2. Let map be ? OrdinaryCreateFromConstructor(NewTarget,
 *    "%Map.prototype%", « [[MapData]] »).
 * 3. Set map.[[MapData]] to a new empty List.
 * 4. If iterable is either undefined or null, return map.
 * 5. Let adder be ? Get(map, "set").
 * 6. If IsCallable(adder) is false, throw a TypeError exception.
 * 7. Return ? AddEntriesFromIterable(map, iterable, adder).
 * 
 * NOTE: If the parameter iterable is present, it is expected to be an
 * object that implements an @@iterator method that returns an
 * iterator object that produces a two element array-like object whose
 * first element is a value that will be used as a Map key and whose
 * second element is the value to associate with that key.
 */
export function* MapConstructor($: VM, [iterable]: Val[], NewTarget: Val): ECR<Obj> {
  if (!NewTarget) return $.throw('TypeError', 'Map must be called with new');
  Assert(IsFunc(NewTarget));
  const map = yield* OrdinaryCreateFromConstructor($, NewTarget, '%Map.prototype%', {
    MapData: new Map(),
  });
  if (IsAbrupt(map)) return map;
  if (iterable == null) return map;
  const adder = yield* Get($, map, 'set');
  if (IsAbrupt(adder)) return adder;
  if (!IsCallable(adder)) return $.throw('TypeError', 'Map set method is not callable');
  return yield* AddEntriesFromIterable($, map, iterable, adder);
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
 *     i. Let status be Completion(Call(adder, target, « k, v »)).
 *     j. IfAbruptCloseIterator(status, iteratorRecord).
 * 
 * NOTE: The parameter iterable is expected to be an object that
 * implements an @@iterator method that returns an iterator object
 * that produces a two element array-like object whose first element
 * is a value that will be used as a Map key and whose second element
 * is the value to associate with that key.
 */
export function* AddEntriesFromIterable(
  $: VM,
  target: Obj,
  iterable: Val,
  adder: Val,
): ECR<Obj> {
  const iteratorRecord = yield* GetIterator($, iterable, SYNC);
  if (IsAbrupt(iteratorRecord)) return iteratorRecord;
  while (true) {
    const next = yield* IteratorStep($, iteratorRecord);
    if (IsAbrupt(next)) return yield* IteratorClose($, iteratorRecord, next);
    if (!next) return target;
    const nextItem = yield* IteratorValue($, next);
    if (!(nextItem instanceof Obj)) {
      return yield* IteratorClose($, iteratorRecord, $.makeError('TypeError', 'not an object'));
    }
    const k = yield* Get($, nextItem, '0');
    if (IsAbrupt(k)) return yield* IteratorClose($, iteratorRecord, k);
    const v = yield* Get($, nextItem, '1');
    if (IsAbrupt(v)) return yield* IteratorClose($, iteratorRecord, v);
    const status = yield* Call($, adder, target, [k, v]);
    if (IsAbrupt(status)) return yield* IteratorClose($, iteratorRecord, status);
  }
}

/**
 * 24.1.3.1 Map.prototype.clear ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let M be the this value.
 * 2. Perform ? RequireInternalSlot(M, [[MapData]]).
 * 3. For each Record { [[Key]], [[Value]] } p of M.[[MapData]], do
 *     a. Set p.[[Key]] to empty.
 *     b. Set p.[[Value]] to empty.
 * 4. Return undefined.
 * 
 * NOTE: The existing [[MapData]] List is preserved because there may
 * be existing Map Iterator objects that are suspended midway through
 * iterating over that List.
 */
export function* MapPrototypeClear($: VM, thisArg: Val): ECR<Val> {
  const mapData = RequireInternalMapDataSlot($, thisArg);
  if (IsAbrupt(mapData)) return $.throw('TypeError', 'not a Map');
  mapData.clear();
  return undefined;
}

/**
 * 24.1.3.3 Map.prototype.delete ( key )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let M be the this value.
 * 2. Perform ? RequireInternalSlot(M, [[MapData]]).
 * 3. For each Record { [[Key]], [[Value]] } p of M.[[MapData]], do
 *     a. If p.[[Key]] is not empty and SameValueZero(p.[[Key]], key) is true, then
 *         i. Set p.[[Key]] to empty.
 *         ii. Set p.[[Value]] to empty.
 *         iii. Return true.
 * 4. Return false.
 * 
 * NOTE: The value empty is used as a specification device to indicate
 * that an entry has been deleted. Actual implementations may take
 * other actions such as physically removing the entry from internal
 * data structures.
 */
export function* MapPrototypeDelete($: VM, thisArg: Val, key: Val): ECR<Val> {
  const mapData = RequireInternalMapDataSlot($, thisArg);
  if (IsAbrupt(mapData)) return $.throw('TypeError', 'not a Map');
  return mapData.delete(key);
}

/**
 * 24.1.3.4 Map.prototype.entries ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let M be the this value.
 * 2. Return ? CreateMapIterator(M, key+value).
 */
export function MapPrototypeEntries($: VM, thisArg: Val): ECR<Val> {
  return CreateMapIterator($, thisArg, 'key+value');
}

/**
 * 24.1.3.5 Map.prototype.forEach ( callbackfn [ , thisArg ] )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let M be the this value.
 * 2. Perform ? RequireInternalSlot(M, [[MapData]]).
 * 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
 * 4. Let entries be M.[[MapData]].
 * 5. Let numEntries be the number of elements in entries.
 * 6. Let index be 0.
 * 7. Repeat, while index < numEntries,
 *     a. Let e be entries[index].
 *     b. Set index to index + 1.
 *     c. If e.[[Key]] is not empty, then
 *         i. Perform ? Call(callbackfn, thisArg, « e.[[Value]], e.[[Key]], M »).
 *         ii. NOTE: The number of elements in entries may have increased during execution of callbackfn.
 *         iii. Set numEntries to the number of elements in entries.
 * 8. Return undefined.
 * 
 * NOTE: callbackfn should be a function that accepts three
 * arguments. forEach calls callbackfn once for each key/value pair
 * present in the Map, in key insertion order. callbackfn is called
 * only for keys of the Map which actually exist; it is not called for
 * keys that have been deleted from the Map.
 * 
 * If a thisArg parameter is provided, it will be used as the this
 * value for each invocation of callbackfn. If it is not provided,
 * undefined is used instead.
 * 
 * callbackfn is called with three arguments: the value of the item,
 * the key of the item, and the Map being traversed.
 * 
 * forEach does not directly mutate the object on which it is called
 * but the object may be mutated by the calls to callbackfn. Each
 * entry of a map's [[MapData]] is only visited once. New keys added
 * after the call to forEach begins are visited. A key will be
 * revisited if it is deleted after it has been visited and then
 * re-added before the forEach call completes. Keys that are deleted
 * after the call to forEach begins and before being visited are not
 * visited unless the key is added again before the forEach call
 * completes.
 */
export function* MapPrototypeForEach(
  $: VM,
  thisArg: Val,
  callbackfn: Val,
): ECR<Val> {
  const mapData = RequireInternalMapDataSlot($, thisArg);
  if (IsAbrupt(mapData)) return $.throw('TypeError', 'not a Map');
  if (!IsCallable(callbackfn)) return $.throw('TypeError', 'callback is not callable');
  for (const [key, value] of mapData) {
    yield* Call($, callbackfn, thisArg, [value, key, thisArg]);
  }
  return undefined;
}

/**
 * 24.1.3.6 Map.prototype.get ( key )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let M be the this value.
 * 2. Perform ? RequireInternalSlot(M, [[MapData]]).
 * 3. For each Record { [[Key]], [[Value]] } p of M.[[MapData]], do
 *     a. If p.[[Key]] is not empty and SameValueZero(p.[[Key]], key) is true, return p.[[Value]].
 * 4. Return undefined.
 */
export function* MapPrototypeGet($: VM, thisArg: Val, key: Val): ECR<Val> {
  const mapData = RequireInternalMapDataSlot($, thisArg);
  if (IsAbrupt(mapData)) return $.throw('TypeError', 'not a Map');
  if (!mapData) return $.throw('TypeError', 'not a Map');
  return mapData.get(key);
}

/**
 * 24.1.3.7 Map.prototype.has ( key )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let M be the this value.
 * 2. Perform ? RequireInternalSlot(M, [[MapData]]).
 * 3. For each Record { [[Key]], [[Value]] } p of M.[[MapData]], do
 *     a. If p.[[Key]] is not empty and SameValueZero(p.[[Key]], key) is true, return true.
 * 4. Return false.
 */
export function* MapPrototypeHas($: VM, thisArg: Val, key: Val): ECR<Val> {
  const mapData = RequireInternalMapDataSlot($, thisArg);
  if (IsAbrupt(mapData)) return $.throw('TypeError', 'not a Map');
  return mapData.has(key);
}

/**
 * 24.1.3.8 Map.prototype.keys ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let M be the this value.
 * 2. Return ? CreateMapIterator(M, key).
 */
export function MapPrototypeKeys($: VM, thisArg: Val): ECR<Val> {
  return CreateMapIterator($, thisArg, 'key');
}

/**
 * 24.1.3.9 Map.prototype.set ( key, value )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let M be the this value.
 * 2. Perform ? RequireInternalSlot(M, [[MapData]]).
 * 3. For each Record { [[Key]], [[Value]] } p of M.[[MapData]], do
 *     a. If p.[[Key]] is not empty and SameValueZero(p.[[Key]], key) is true, then
 *         i. Set p.[[Value]] to value.
 *         ii. Return M.
 * 4. If key is -0𝔽, set key to +0𝔽.
 * 5. Let p be the Record { [[Key]]: key, [[Value]]: value }.
 * 6. Append p to M.[[MapData]].
 * 7. Return M.
 */
export function* MapPrototypeSet($: VM, thisArg: Val, key: Val, value: Val): ECR<Val> {
  const mapData = RequireInternalMapDataSlot($, thisArg);
  if (IsAbrupt(mapData)) return $.throw('TypeError', 'not a Map');
  mapData.set(key, value);
  return thisArg;
}

/**
 * 24.1.3.10 get Map.prototype.size
 * 
 * Map.prototype.size is an accessor property whose set accessor
 * function is undefined. Its get accessor function performs the
 * following steps when called:
 * 
 * 1. Let M be the this value.
 * 2. Perform ? RequireInternalSlot(M, [[MapData]]).
 * 3. Let count be 0.
 * 4. For each Record { [[Key]], [[Value]] } p of M.[[MapData]], do
 *     a. If p.[[Key]] is not empty, set count to count + 1.
 * 5. Return 𝔽(count).
 */
export function* MapPrototypeGetSize($: VM, thisArg: Val): ECR<Val> {
  const mapData = RequireInternalMapDataSlot($, thisArg);
  if (IsAbrupt(mapData)) return $.throw('TypeError', 'not a Map');
  return mapData.size;
}

/**
 * 24.1.3.11 Map.prototype.values ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let M be the this value.
 * 2. Return ? CreateMapIterator(M, value).
 */
export function MapPrototypeValues($: VM, thisArg: Val): ECR<Val> {
  return CreateMapIterator($, thisArg, 'value');
}

/**
 * 24.1.4 Properties of Map Instances
 * 
 * Map instances are ordinary objects that inherit properties from the
 * Map prototype. Map instances also have a [[MapData]] internal slot.
 */
interface MapSlots {
  MapData: Map<Val, Val>;
}
declare global {
  interface ObjectSlots extends Partial<MapSlots> {}
}

/**
 * 24.1.5 Map Iterator Objects
 * 
 * A Map Iterator is an object, that represents a specific iteration
 * over some specific Map instance object. There is not a named
 * constructor for Map Iterator objects. Instead, map iterator objects
 * are created by calling certain methods of Map instance objects.
 * 
 * ---
 * 
 * 24.1.5.1 CreateMapIterator ( map, kind )
 * 
 * The abstract operation CreateMapIterator takes arguments map (an
 * ECMAScript language value) and kind (key+value, key, or value) and
 * returns either a normal completion containing a Generator or a
 * throw completion. It is used to create iterator objects for Map
 * methods that return such iterators. It performs the following steps
 * when called:
 * 
 * 1. Perform ? RequireInternalSlot(map, [[MapData]]).
 * 2. Let closure be a new Abstract Closure with no parameters that
 *    captures map and kind and performs the following steps when called:
 *     a. Let entries be map.[[MapData]].
 *     b. Let index be 0.
 *     c. Let numEntries be the number of elements in entries.
 *     d. Repeat, while index < numEntries,
 *         i. Let e be entries[index].
 *         ii. Set index to index + 1.
 *         iii. If e.[[Key]] is not empty, then
 *             1. If kind is key, let result be e.[[Key]].
 *             2. Else if kind is value, let result be e.[[Value]].
 *             3. Else,
 *                 a. Assert: kind is key+value.
 *                 b. Let result be CreateArrayFromList(« e.[[Key]], e.[[Value]] »).
 *             4. Perform ? GeneratorYield(CreateIterResultObject(result, false)).
 *             5. NOTE: The number of elements in entries may have increased while
 *                execution of this abstract operation was paused by Yield.
 *             6. Set numEntries to the number of elements in entries.
 *                 e. Return undefined.
 * 3. Return CreateIteratorFromClosure(closure,
 *    "%MapIteratorPrototype%", %MapIteratorPrototype%).
 */
export function* CreateMapIterator($: VM, map: Val, kind: 'key'|'value'|'key+value'): ECR<Val> {
  const mapData = RequireInternalMapDataSlot($, map);
  if (IsAbrupt(mapData)) return $.throw('TypeError', 'not a Map');
  return CreateIteratorFromClosure($, function*(): ECR<undefined> {
    for (const [key, value] of mapData) {
      let result: Val;
      if (kind === 'key') {
        result = CreateArrayFromList($, [key]);
      } else if (kind === 'value') {
        result = CreateArrayFromList($, [value]);
      } else {
        result = CreateArrayFromList($, [key, value]);
      }
      yield* GeneratorYield($, CreateIterResultObject($, result, false));
    }
    return;
  }, '%MapIteratorPrototype%', $.getIntrinsic('%MapIteratorPrototype%'));
}

export function RequireInternalMapDataSlot($: VM, map: Val): CR<Map<Val, Val>> {
  if (!(map instanceof Obj)) return $.throw('TypeError', 'not an object');
  if (!map.MapData) return $.throw('TypeError', 'not a Map');
  return map.MapData;
}
