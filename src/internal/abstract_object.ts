/**
 * @fileoverview
 * 7.3 Operations on Objects
 */

import { IsCallable, IsConstructor, IsPropertyKey } from './abstract_compare';
import { ToLength, ToObject } from './abstract_conversion';
import { Assert } from './assert';
import { InstanceofOperator } from './arithmetic';
import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { ACCESSOR, EMPTY, FIELD, FROZEN, METHOD, SEALED, UNUSED } from './enums';
import { Func } from './func';
import { Obj } from './obj';
import { IsAccessorDescriptor, IsDataDescriptor, PropertyDescriptor, propW, propWC, propWEC } from './property_descriptor';
import { RealmRecord } from './realm_record';
import { PropertyKey, Type, Val } from './val';
import { DebugString, ECR, VM, just } from './vm';
import { ArrayCreate } from './exotic_array';
import { IsPrivateElementAccessor, IsPrivateElementField, IsPrivateElementMethod, PrivateElement, PrivateName } from './private_environment_record';
import { ClassFieldDefinitionRecord } from './class';

declare const ValidateNonRevokedProxy: any;
declare global {
  interface ObjectSlots {
    ProxyHandler?: unknown;
    ProxyTarget?: unknown;
  }
}

/**
 * 7.3.1 MakeBasicObject ( internalSlotsList )
 *
 * The abstract operation MakeBasicObject takes argument
 * internalSlotsList (a List of internal slot names) and returns an
 * Object. It is the source of all ECMAScript objects that are created
 * algorithmically, including both ordinary objects and exotic
 * objects. It factors out common steps used in creating all objects,
 * and centralizes object creation. It performs the following steps
 * when called:
 *
 * 1. Let obj be a newly created object with an internal slot for each name in internalSlotsList.
 * 2. Set obj's essential internal methods to the default ordinary
 *    object definitions specified in 10.1.
 * 3. Assert: If the caller will not be overriding both obj's
 *    [[GetPrototypeOf]] and [[SetPrototypeOf]] essential internal
 *    methods, then internalSlotsList contains [[Prototype]].
 * 4. Assert: If the caller will not be overriding all of obj's
 *    [[SetPrototypeOf]], [[IsExtensible]], and [[PreventExtensions]]
 *    essential internal methods, then internalSlotsList contains
 *    [[Extensible]].
 * 5. If internalSlotsList contains [[Extensible]], set obj.[[Extensible]] to true.
 * 6. Return obj.
 *
 * NOTE: Within this specification, exotic objects are created in
 * abstract operations such as ArrayCreate and BoundFunctionCreate by
 * first calling MakeBasicObject to obtain a basic, foundational
 * object, and then overriding some or all of that object's internal
 * methods. In order to encapsulate exotic object creation, the
 * object's essential internal methods are never modified outside
 * those operations.
 */
// export function MakeBasicObject(_$: VM, internalSlotsList: Array<keyof Obj>): Obj {
//   const obj = new OrdinaryObject();
//   for (const slot of internalSlotsList) {
//     obj[slot] ??= undefined;
//   }
//   Assert(
// }

/**
 * 7.3.2 Get ( O, P )
 *
 * The abstract operation Get takes arguments O (an Object) and P (a
 * property key) and returns either a normal completion containing an
 * ECMAScript language value or a throw completion. It is used to
 * retrieve the value of a specific property of an object. It performs
 * the following steps when called:
 *
 * 1. Return ? O.[[Get]](P, O).
 */
export function Get($: VM, O: Obj, P: PropertyKey): ECR<Val> {
  return O.Get($, P, O);
}

/**
 * 7.3.3 GetV ( V, P )
 *
 * The abstract operation GetV takes arguments V (an ECMAScript
 * language value) and P (a property key) and returns either a normal
 * completion containing an ECMAScript language value or a throw
 * completion. It is used to retrieve the value of a specific property
 * of an ECMAScript language value. If the value is not an object, the
 * property lookup is performed using a wrapper object appropriate for
 * the type of the value. It performs the following steps when called:
 *
 * 1. Let O be ? ToObject(V).
 * 2. Return ? O.[[Get]](P, V).
 */
export function* GetV($: VM, V: Val, P: PropertyKey): ECR<Val> {
  const O = ToObject($, V);
  if (IsAbrupt(O)) return O;
  return yield* O.Get($, P, O);
}

/**
 * 7.3.4 Set ( O, P, V, Throw )
 *
 * The abstract operation Set takes arguments O (an Object), P (a
 * property key), V (an ECMAScript language value), and Throw (a
 * Boolean) and returns either a normal completion containing unused
 * or a throw completion. It is used to set the value of a specific
 * property of an object. V is the new value for the property. It
 * performs the following steps when called:
 *
 * 1. Let success be ? O.[[Set]](P, V, O).
 * 2. If success is false and Throw is true, throw a TypeError exception.
 * 3. Return unused.
 */
export function* Set(
  $: VM,
  O: Obj,
  P: PropertyKey,
  V: Val,
  ShouldThrow: boolean,
): ECR<UNUSED> {
  const success = yield* O.Set($, P, V, O);
  if (IsAbrupt(success)) return success;
  if (!success && ShouldThrow) return $.throw('TypeError');
  return UNUSED;
}

/**
 * 7.3.5 CreateDataProperty ( O, P, V )
 *
 * The abstract operation CreateDataProperty takes arguments O (an
 * Object), P (a property key), and V (an ECMAScript language value)
 * and returns either a normal completion containing a Boolean or a
 * throw completion. It is used to create a new own property of an
 * object. It performs the following steps when called:
 *
 * 1. Let newDesc be the PropertyDescriptor { [[Value]]: V,
 *    [[Writable]]: true, [[Enumerable]]: true, [[Configurable]]: true }.
 * 2. Return ? O.[[DefineOwnProperty]](P, newDesc).
 *
 * NOTE: This abstract operation creates a property whose attributes
 * are set to the same defaults used for properties created by the
 * ECMAScript language assignment operator. Normally, the property
 * will not already exist. If it does exist and is not configurable or
 * if O is not extensible, [[DefineOwnProperty]] will return false.
 */
export function CreateDataProperty($: VM, O: Obj, P: PropertyKey, V: Val): CR<boolean> {
  const newDesc = propWEC(V);
  return O.DefineOwnProperty($, P, newDesc);
}

/**
 * 7.3.6 CreateMethodProperty ( O, P, V )
 *
 * The abstract operation CreateMethodProperty takes arguments O (an
 * Object), P (a property key), and V (an ECMAScript language value)
 * and returns unused. It is used to create a new own property of an
 * ordinary object. It performs the following steps when called:
 *
 * 1. Assert: O is an ordinary, extensible object with no
 *    non-configurable properties.
 * 2. Let newDesc be the PropertyDescriptor { [[Value]]: V,
 *    [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true}.
 * 3. Perform ! DefinePropertyOrThrow(O, P, newDesc).
 * 4. Return unused.
 *
 * NOTE: This abstract operation creates a property whose attributes
 * are set to the same defaults used for built-in methods and methods
 * defined using class declaration syntax. Normally, the property will
 * not already exist. If it does exist, DefinePropertyOrThrow is
 * guaranteed to complete normally.
 */
export function CreateMethodProperty(
  $: VM,
  O: Obj,
  P: PropertyKey,
  V: Val,
): UNUSED {
  Assert(O.Extensible);
  const newDesc = propWC(V);
  return CastNotAbrupt(DefinePropertyOrThrow($, O, P, newDesc));
}

/**
 * 7.3.7 CreateDataPropertyOrThrow ( O, P, V )
 * 
 * The abstract operation CreateDataPropertyOrThrow takes arguments O
 * (an Object), P (a property key), and V (an ECMAScript language
 * value) and returns either a normal completion containing unused or
 * a throw completion. It is used to create a new own property of an
 * object. It throws a TypeError exception if the requested property
 * update cannot be performed. It performs the following steps when
 * called:
 * 
 * 1. Let success be ? CreateDataProperty(O, P, V).
 * 2. If success is false, throw a TypeError exception.
 * 3. Return unused.
 * 
 * NOTE: This abstract operation creates a property whose attributes
 * are set to the same defaults used for properties created by the
 * ECMAScript language assignment operator. Normally, the property
 * will not already exist. If it does exist and is not configurable or
 * if O is not extensible, [[DefineOwnProperty]] will return false
 * causing this operation to throw a TypeError exception.
 */
export function CreateDataPropertyOrThrow(
  $: VM,
  O: Obj,
  P: PropertyKey,
  V: Val,
): CR<UNUSED> {
  const success = CreateDataProperty($, O, P, V);
  if (IsAbrupt(success)) return success;
  if (!success) return $.throw('TypeError');
  return UNUSED;
}

/**
 * 7.3.8 CreateNonEnumerableDataPropertyOrThrow ( O, P, V )
 * 
 * The abstract operation CreateNonEnumerableDataPropertyOrThrow takes
 * arguments O (an Object), P (a property key), and V (an ECMAScript
 * language value) and returns unused. It is used to create a new
 * non-enumerable own property of an ordinary object. It performs the
 * following steps when called:
 * 
 * 1. Assert: O is an ordinary, extensible object with no
 *    non-configurable properties.
 * 2. Let newDesc be the PropertyDescriptor {
 *    [[Value]]: V, [[Writable]]: true,
 *    [[Enumerable]]: false, [[Configurable]]: true}.
 * 3. Perform ! DefinePropertyOrThrow(O, P, newDesc).
 * 4. Return unused.
 * 
 * NOTE: This abstract operation creates a property whose attributes
 * are set to the same defaults used for properties created by the
 * ECMAScript language assignment operator except it is not
 * enumerable. Normally, the property will not already exist. If it
 * does exist, DefinePropertyOrThrow is guaranteed to complete
 * normally.
 */
export function CreateNonEnumerableDataPropertyOrThrow(
  $: VM,
  O: Obj,
  P: PropertyKey,
  V: Val,
): UNUSED {
  Assert(O.Extensible);
  const newDesc = propWC(V);
  return CastNotAbrupt(DefinePropertyOrThrow($, O, P, newDesc));
}

/**
 * 7.3.9 DefinePropertyOrThrow ( O, P, desc )
 * 
 * The abstract operation DefinePropertyOrThrow takes arguments O (an
 * Object), P (a property key), and desc (a Property Descriptor) and
 * returns either a normal completion containing unused or a throw
 * completion. It is used to call the [[DefineOwnProperty]] internal
 * method of an object in a manner that will throw a TypeError
 * exception if the requested property update cannot be performed. It
 * performs the following steps when called:
 *
 * 1. Let success be ? O.[[DefineOwnProperty]](P, desc).
 * 2. If success is false, throw a TypeError exception.
 * 3. Return unused.
 */
export function DefinePropertyOrThrow($: VM, O: Obj, P: PropertyKey,
                                      desc: PropertyDescriptor): CR<UNUSED> {
  const success = O.DefineOwnProperty($, P, desc);
  if (IsAbrupt(success)) return success;
  if (!success) {
    return $.throw('TypeError', `Cannot define property ${DebugString(P)} on ${DebugString(O)}`);
  }
  return UNUSED;
}

/**
 * 7.3.10 DeletePropertyOrThrow ( O, P )
 *
 * The abstract operation DeletePropertyOrThrow takes arguments O (an
 * Object) and P (a property key) and returns either a normal
 * completion containing unused or a throw completion. It is used to
 * remove a specific own property of an object. It throws an exception
 * if the property is not configurable. It performs the following
 * steps when called:
 * 
 * 1. Let success be ? O.[[Delete]](P).
 * 2. If success is false, throw a TypeError exception.
 * 3. Return unused.
 */
export function DeletePropertyOrThrow($: VM, O: Obj, P: PropertyKey): CR<UNUSED> {
  const success = O.Delete($, P);
  if (IsAbrupt(success)) return success;
  if (!success) return $.throw('TypeError');
  return UNUSED;
}

/**
 * 7.3.11 GetMethod ( V, P )
 *
 * The abstract operation GetMethod takes arguments V (an ECMAScript
 * language value) and P (a property key) and returns either a normal
 * completion containing either a function object or undefined, or a
 * throw completion. It is used to get the value of a specific
 * property of an ECMAScript language value when the value of the
 * property is expected to be a function. It performs the following
 * steps when called:
 * 
 * 1. Let func be ? GetV(V, P).
 * 2. If func is either undefined or null, return undefined.
 * 3. If IsCallable(func) is false, throw a TypeError exception.
 * 4. Return func.
 */
export function* GetMethod($: VM, V: Val, P: PropertyKey): ECR<Val> {
  const func = yield* GetV($, V, P);
  if (IsAbrupt(func)) return func;
  if (func == null) return undefined;
  if (!IsCallable(func)) return $.throw('TypeError');
  return func;
}

/**
 * 7.3.12 HasProperty ( O, P )
 *
 * The abstract operation HasProperty takes arguments O (an Object)
 * and P (a property key) and returns either a normal completion
 * containing a Boolean or a throw completion. It is used to determine
 * whether an object has a property with the specified property
 * key. The property may be either own or inherited. It performs the
 * following steps when called:
 *
 * 1. Return ? O.[[HasProperty]](P).
 */
export function HasProperty($: VM, O: Obj, P: PropertyKey): CR<boolean> {
  return O.HasProperty($, P);
}

/**
 * 7.3.13 HasOwnProperty ( O, P )
 *
 * The abstract operation HasOwnProperty takes arguments O (an Object)
 * and P (a property key) and returns either a normal completion
 * containing a Boolean or a throw completion. It is used to determine
 * whether an object has an own property with the specified property
 * key. It performs the following steps when called:
 * 
 * 1. Let desc be ? O.[[GetOwnProperty]](P).
 * 2. If desc is undefined, return false.
 * 3. Return true.
 */
export function HasOwnProperty($: VM, O: Obj, P: PropertyKey): CR<boolean> {
  const desc = O.GetOwnProperty($, P);
  if (IsAbrupt(desc)) return desc;
  return desc != null;
}

/**
 * 7.3.14 Call ( F, V [ , argumentsList ] )
 * 
 * The abstract operation Call takes arguments F (an ECMAScript
 * language value) and V (an ECMAScript language value) and optional
 * argument argumentsList (a List of ECMAScript language values) and
 * returns either a normal completion containing an ECMAScript
 * language value or a throw completion. It is used to call the
 * [[Call]] internal method of a function object. F is the function
 * object, V is an ECMAScript language value that is the this value of
 * the [[Call]], and argumentsList is the value passed to the
 * corresponding argument of the internal method. If argumentsList is
 * not present, a new empty List is used as its value. It performs the
 * following steps when called:
 * 
 * 1. If argumentsList is not present, set argumentsList to a new empty List.
 * 2. If IsCallable(F) is false, throw a TypeError exception.
 * 3. Return ? F.[[Call]](V, argumentsList).
 */
export function Call($: VM, F: Val, V: Val, argumentsList: Val[] = []): ECR<Val> {
  if (!IsCallable(F)) {
    return just($.throw('TypeError', `${DebugString(F)} is not a function`));
  }
  return (F as Func).Call!($, V, argumentsList);
}

/**
 * 7.3.15 Construct ( F [ , argumentsList [ , newTarget ] ] )
 *
 * The abstract operation Construct takes argument F (a constructor)
 * and optional arguments argumentsList (a List of ECMAScript language
 * values) and newTarget (a constructor) and returns either a normal
 * completion containing an Object or a throw completion. It is used
 * to call the [[Construct]] internal method of a function
 * object. argumentsList and newTarget are the values to be passed as
 * the corresponding arguments of the internal method. If
 * argumentsList is not present, a new empty List is used as its
 * value. If newTarget is not present, F is used as its value. It
 * performs the following steps when called:
 * 
 * 1. If newTarget is not present, set newTarget to F.
 * 2. If argumentsList is not present, set argumentsList to a new empty List.
 * 3. Return ? F.[[Construct]](argumentsList, newTarget).
 *
 * NOTE: If newTarget is not present, this operation is equivalent to:
 * new F(...argumentsList)
 */
export function Construct(
  $: VM,
  F: Func,
  argumentsList: Val[] = [],
  newTarget: Func = F,
): ECR<Obj> {
  return F.Construct!($, argumentsList, newTarget);
}

/**
 * 7.3.16 SetIntegrityLevel ( O, level )
 * 
 * The abstract operation SetIntegrityLevel takes arguments O (an
 * Object) and level (sealed or frozen) and returns either a normal
 * completion containing a Boolean or a throw completion. It is used
 * to fix the set of own properties of an object. It performs the
 * following steps when called:
 * 
 * 1. Let status be ? O.[[PreventExtensions]]().
 * 2. If status is false, return false.
 * 3. Let keys be ? O.[[OwnPropertyKeys]]().
 * 4. If level is sealed, then
 *     a. For each element k of keys, do
 *         i. Perform ? DefinePropertyOrThrow(O, k, PropertyDescriptor
 *            { [[Configurable]]: false }).
 * 5. Else,
 *     a. Assert: level is frozen.
 *     b. For each element k of keys, do
 *         i. Let currentDesc be ? O.[[GetOwnProperty]](k).
 *         ii. If currentDesc is not undefined, then
 *             1. If IsAccessorDescriptor(currentDesc) is true, then
 *                 a. Let desc be the PropertyDescriptor {
 *                    [[Configurable]]: false }.
 *             2. Else,
 *                 a. Let desc be the PropertyDescriptor {
 *                    [[Configurable]]: false, [[Writable]]: false }.
 *             3. Perform ? DefinePropertyOrThrow(O, k, desc).
 * 6. Return true.
 */
export function SetIntegrityLevel($: VM, O: Obj, level: SEALED|FROZEN): CR<boolean> {
  const status = O.PreventExtensions($);
  if (IsAbrupt(status)) return status;
  if (!status) return false;
  const keys = O.OwnPropertyKeys($);
  if (IsAbrupt(keys)) return keys;
  if (SEALED.is(level)) {
    for (const k of keys) {
      const success = DefinePropertyOrThrow($, O, k, {Configurable: false});
      if (IsAbrupt(success)) return success;
    }
  } else {
    Assert(FROZEN.is(level));
    for (const k of keys) {
      const currentDesc = O.GetOwnProperty($, k);
      if (IsAbrupt(currentDesc)) return currentDesc;
      if (currentDesc == null) continue;
      const desc = IsAccessorDescriptor(currentDesc) ?
        {Configurable: false} :
        {Configurable: false, Writable: false};
      const success = DefinePropertyOrThrow($, O, k, desc);
      if (IsAbrupt(success)) return success;
    }
  }
  return true;
}

/**
 * 7.3.17 TestIntegrityLevel ( O, level )
 * 
 * The abstract operation TestIntegrityLevel takes arguments O (an
 * Object) and level (sealed or frozen) and returns either a normal
 * completion containing a Boolean or a throw completion. It is used
 * to determine if the set of own properties of an object are
 * fixed. It performs the following steps when called:
 * 
 * 1. Let extensible be ? IsExtensible(O).
 * 2. If extensible is true, return false.
 * 3. NOTE: If the object is extensible, none of its properties are examined.
 * 4. Let keys be ? O.[[OwnPropertyKeys]]().
 * 5. For each element k of keys, do
 *     a. Let currentDesc be ? O.[[GetOwnProperty]](k).
 *     b. If currentDesc is not undefined, then
 *         i. If currentDesc.[[Configurable]] is true, return false.
 *         ii. If level is frozen and IsDataDescriptor(currentDesc) is true, then
 *             1. If currentDesc.[[Writable]] is true, return false.
 * 6. Return true.
 */
export function TestIntegrityLevel($: VM, O: Obj, level: SEALED|FROZEN): CR<boolean> {
  const extensible = O.IsExtensible($);
  if (IsAbrupt(extensible)) return extensible;
  if (extensible) return false;
  const keys = O.OwnPropertyKeys($);
  if (IsAbrupt(keys)) return keys;
  for (const k of keys) {
    const currentDesc = O.GetOwnProperty($, k);
    if (IsAbrupt(currentDesc)) return currentDesc;
    if (currentDesc == null) continue;
    if (currentDesc.Configurable) return false;
    if (FROZEN.is(level) && IsDataDescriptor(currentDesc) && currentDesc.Writable) {
      return false;
    }
  }
  return true;
}

/**
 * 7.3.18 CreateArrayFromList ( elements )
 * 
 * The abstract operation CreateArrayFromList takes argument elements
 * (a List of ECMAScript language values) and returns an Array. It is
 * used to create an Array whose elements are provided by elements. It
 * performs the following steps when called:
 * 
 * 1. Let array be ! ArrayCreate(0).
 * 2. Let n be 0.
 * 3. For each element e of elements, do
 *     a. Perform ! CreateDataPropertyOrThrow(array, ! ToString(𝔽(n)), e).
 *     b. Set n to n + 1.
 * 4. Return array.
 */
export function CreateArrayFromList($: VM, elements: Val[]): Obj {
  const array = CastNotAbrupt(ArrayCreate($, 0));
  for (let n = 0; n < elements.length; n++) {
    array.OwnProps.set(String(n), propWEC(elements[n]));
  }
  array.OwnProps.set('length', propW(elements.length));
  return array;
}

/**
 * 7.3.19 LengthOfArrayLike ( obj )
 * 
 * The abstract operation LengthOfArrayLike takes argument obj (an
 * Object) and returns either a normal completion containing a
 * non-negative integer or a throw completion. It returns the value of
 * the "length" property of an array-like object. It performs the
 * following steps when called:
 * 
 * 1. Return ℝ(? ToLength(? Get(obj, "length"))).
 * 
 * An array-like object is any object for which this operation returns
 * a normal completion.
 * 
 * NOTE 1: Typically, an array-like object would also have some
 * properties with integer index names. However, that is not a
 * requirement of this definition.
 *
 * NOTE 2: Arrays and String objects are examples of array-like objects.
 */
export function* LengthOfArrayLike($: VM, obj: Obj): ECR<number> {
  const length = yield* Get($, obj, 'length');
  if (IsAbrupt(length)) return length;
  return yield* ToLength($, length);
}

/**
 * 7.3.20 CreateListFromArrayLike ( obj [ , elementTypes ] )
 * 
 * The abstract operation CreateListFromArrayLike takes argument obj
 * (an ECMAScript language value) and optional argument elementTypes
 * (a List of names of ECMAScript Language Types) and returns either a
 * normal completion containing a List of ECMAScript language values
 * or a throw completion. It is used to create a List value whose
 * elements are provided by the indexed properties of
 * obj. elementTypes contains the names of ECMAScript Language Types
 * that are allowed for element values of the List that is created. It
 * performs the following steps when called:
 * 
 * 1. If elementTypes is not present, set elementTypes to « Undefined,
 *    Null, Boolean, String, Symbol, Number, BigInt, Object ».
 * 2. If obj is not an Object, throw a TypeError exception.
 * 3. Let len be ? LengthOfArrayLike(obj).
 * 4. Let list be a new empty List.
 * 5. Let index be 0.
 * 6. Repeat, while index < len,
 *     a. Let indexName be ! ToString(𝔽(index)).
 *     b. Let next be ? Get(obj, indexName).
 *     c. If elementTypes does not contain Type(next), throw a
 *        TypeError exception.
 *     d. Append next to list.
 *     e. Set index to index + 1.
 * 7. Return list.
 */
export function* CreateListFromArrayLike(
  $: VM,
  obj: Val,
  elementTypes?: Set<Type>,
): ECR<Val[]> {
  if (!(obj instanceof Obj)) return $.throw('TypeError', 'Not an array-like object');
  const len = yield* LengthOfArrayLike($, obj);
  if (IsAbrupt(len)) return len;
  const list: Val[] = [];
  for (let index = 0; index < len; index++) {
    const indexName = String(index);
    const next = yield* Get($, obj, indexName);
    if (IsAbrupt(next)) return next;
    if (elementTypes && !elementTypes.has(Type(next))) {
      return $.throw('TypeError', `At index ${index}: ${Type(next)} not allowed`);
    }
    list.push(next);
  }
  return list;
}

/**
 * 7.3.21 Invoke ( V, P [ , argumentsList ] )
 *
 * The abstract operation Invoke takes arguments V (an ECMAScript
 * language value) and P (a property key) and optional argument
 * argumentsList (a List of ECMAScript language values) and returns
 * either a normal completion containing an ECMAScript language value
 * or a throw completion. It is used to call a method property of an
 * ECMAScript language value. V serves as both the lookup point for
 * the property and the this value of the call. argumentsList is the
 * list of arguments values passed to the method. If argumentsList is
 * not present, a new empty List is used as its value. It performs the
 * following steps when called:
 * 
 * 1. If argumentsList is not present, set argumentsList to a new empty List.
 * 2. Let func be ? GetV(V, P).
 * 3. Return ? Call(func, V, argumentsList).
 */
export function* Invoke(
  $: VM,
  V: Val,
  P: PropertyKey,
  argumentsList: Val[] = [],
): ECR<Val> {
  const func = yield* GetV($, V, P);
  if (IsAbrupt(func)) return func;
  return yield* Call($, func, V, argumentsList);
}

/**
 * 7.3.22 OrdinaryHasInstance ( C, O )
 *
 * The abstract operation OrdinaryHasInstance takes arguments C (an
 * ECMAScript language value) and O (an ECMAScript language value) and
 * returns either a normal completion containing a Boolean or a throw
 * completion. It implements the default algorithm for determining if
 * O inherits from the instance object inheritance path provided by
 * C. It performs the following steps when called:
 *
 * 1. If IsCallable(C) is false, return false.
 * 2. If C has a [[BoundTargetFunction]] internal slot, then
 *     a. Let BC be C.[[BoundTargetFunction]].
 *     b. Return ? InstanceofOperator(O, BC).
 * 3. If O is not an Object, return false.
 * 4. Let P be ? Get(C, "prototype").
 * 5. If P is not an Object, throw a TypeError exception.
 * 6. Repeat,
 *     a. Set O to ? O.[[GetPrototypeOf]]().
 *     b. If O is null, return false.
 *     c. If SameValue(P, O) is true, return true.
 */
export function* OrdinaryHasInstance($: VM, C: Val, O: Val): ECR<boolean> {
  if (!IsCallable(C)) return false;
  Assert(C instanceof Obj);
  if (C.BoundTargetFunction != null) {
    const BC = C.BoundTargetFunction;
    return yield* InstanceofOperator($, O, BC);
  }
  if (!(O instanceof Obj)) return false;
  const P = yield* Get($, C, 'prototype');
  if (IsAbrupt(P)) return P;
  if (!(P instanceof Obj)) return $.throw('TypeError');
  while (true) {
    Assert(O instanceof Obj);
    const next = O.GetPrototypeOf($);
    if (IsAbrupt(next)) return next;
    if (next == null) return false;
    if (P === next) return true;
    O = next;
  }
}

/**
 * 7.3.23 SpeciesConstructor ( O, defaultConstructor )
 * 
 * The abstract operation SpeciesConstructor takes arguments O (an
 * Object) and defaultConstructor (a constructor) and returns either a
 * normal completion containing a constructor or a throw
 * completion. It is used to retrieve the constructor that should be
 * used to create new objects that are derived from
 * O. defaultConstructor is the constructor to use if a constructor
 * @@species property cannot be found starting from O. It performs the
 * following steps when called:
 * 
 * 1. Let C be ? Get(O, "constructor").
 * 2. If C is undefined, return defaultConstructor.
 * 3. If C is not an Object, throw a TypeError exception.
 * 4. Let S be ? Get(C, @@species).
 * 5. If S is either undefined or null, return defaultConstructor.
 * 6. If IsConstructor(S) is true, return S.
 * 7. Throw a TypeError exception.
 */
export function* SpeciesConstructor(
  $: VM,
  O: Obj,
  defaultConstructor: Func,
): ECR<Func> {
  const C = yield* Get($, O, 'constructor');
  if (IsAbrupt(C)) return C;
  if (C == null) return defaultConstructor;
  if (!(C instanceof Obj)) return $.throw('TypeError', 'not an object');
  const S = yield* Get($, C, Symbol.species);
  if (IsAbrupt(S)) return S;
  if (S == null) return defaultConstructor;
  if (!IsConstructor(S)) return $.throw('TypeError', 'not a constructor');
  return S;
}

/**
 * 7.3.24 EnumerableOwnProperties ( O, kind )
 * 
 * The abstract operation EnumerableOwnProperties takes arguments O
 * (an Object) and kind (key, value, or key+value) and returns either
 * a normal completion containing a List of ECMAScript language values
 * or a throw completion. It performs the following steps when called:
 * 
 * 1. Let ownKeys be ? O.[[OwnPropertyKeys]]().
 * 2. Let results be a new empty List.
 * 3. For each element key of ownKeys, do
 *     a. If key is a String, then
 *         i. Let desc be ? O.[[GetOwnProperty]](key).
 *         ii. If desc is not undefined and desc.[[Enumerable]] is true, then
 *             1. If kind is key, append key to results.
 *             2. Else,
 *                 a. Let value be ? Get(O, key).
 *                 b. If kind is value, append value to results.
 *                 c. Else,
 *                     i. Assert: kind is key+value.
 *                     ii. Let entry be CreateArrayFromList(« key, value »).
 *                     iii. Append entry to results.
 * 4. Return results.
 */
export function EnumerableOwnProperties($: VM, O: Obj, kind: 'key'): ECR<PropertyKey[]>;
export function EnumerableOwnProperties($: VM, O: Obj, kind: 'value'): ECR<Val[]>;
export function EnumerableOwnProperties($: VM, O: Obj, kind: 'key+value'): ECR<Val[]>;
export function* EnumerableOwnProperties(
  $: VM,
  O: Obj,
  kind: 'key'|'value'|'key+value',
): ECR<unknown[]> {
  const ownKeys = O.OwnPropertyKeys($);
  if (IsAbrupt(ownKeys)) return ownKeys;
  const results: any[] = [];
  for (const key of ownKeys) {
    if (typeof key !== 'string') continue;
    const desc = O.GetOwnProperty($, key);
    if (IsAbrupt(desc)) return desc;
    if (desc == null || !desc.Enumerable) continue;
    if (kind === 'key') {
      results.push(key);
    } else {
      const value = yield* Get($, O, key);
      if (IsAbrupt(value)) return value;
      if (kind === 'value') {
        results.push(value);
      } else {
        results.push(CreateArrayFromList($, [key, value]));
      }
    }
  }
  return results;
}

/**
 * 7.3.25 GetFunctionRealm ( obj )
 *
 * The abstract operation GetFunctionRealm takes argument obj (a
 * function object) and returns either a normal completion containing
 * a Realm Record or a throw completion. It performs the following
 * steps when called:
 * 
 * 1. If obj has a [[Realm]] internal slot, then
 *     a. Return obj.[[Realm]].
 * 2. If obj is a bound function exotic object, then
 *     a. Let boundTargetFunction be obj.[[BoundTargetFunction]].
 *     b. Return ? GetFunctionRealm(boundTargetFunction).
 * 3. If obj is a Proxy exotic object, then
 *     a. Perform ? ValidateNonRevokedProxy(obj).
 *     b. Let proxyTarget be obj.[[ProxyTarget]].
 *     c. Return ? GetFunctionRealm(proxyTarget).
 * 4. Return the current Realm Record.
 *
 * NOTE: Step 4 will only be reached if obj is a non-standard function
 * exotic object that does not have a [[Realm]] internal slot.
 */
export function GetFunctionRealm($: VM, obj: Func): CR<RealmRecord> {
  if (obj.Realm != null) return obj.Realm;
  if (obj.BoundTargetFunction != null) {
    return GetFunctionRealm($, obj.BoundTargetFunction);
  }
  if (obj.ProxyTarget != null) {
    const result = ValidateNonRevokedProxy($, obj);
    if (IsAbrupt(result)) return result;
    return GetFunctionRealm($, obj.ProxyTarget as Func);
  }
  return $.getRealm()!;
}

/**
 * 7.3.26 CopyDataProperties ( target, source, excludedItems )
 * 
 * The abstract operation CopyDataProperties takes arguments target
 * (an Object), source (an ECMAScript language value), and
 * excludedItems (a List of property keys) and returns either a normal
 * completion containing unused or a throw completion. It performs the
 * following steps when called:
 * 
 * 1. If source is either undefined or null, return unused.
 * 2. Let from be ! ToObject(source).
 * 3. Let keys be ? from.[[OwnPropertyKeys]]().
 * 4. For each element nextKey of keys, do
 *     a. Let excluded be false.
 *     b. For each element e of excludedItems, do
 *         i. If SameValue(e, nextKey) is true, then
 *             1. Set excluded to true.
 *     c. If excluded is false, then
 *         i. Let desc be ? from.[[GetOwnProperty]](nextKey).
 *         ii. If desc is not undefined and desc.[[Enumerable]] is true, then
 *             1. Let propValue be ? Get(from, nextKey).
 *             2. Perform ! CreateDataPropertyOrThrow(target, nextKey, propValue).
 * 5. Return unused.
 * 
 * NOTE: The target passed in here is always a newly created object
 * which is not directly accessible in case of an error being thrown.
 */
export function* CopyDataProperties(
  $: VM,
  target: Obj,
  source: Val,
  excludedItems?: Set<PropertyKey>,
): ECR<UNUSED> {
  if (source == null) return UNUSED;
  const from = CastNotAbrupt(ToObject($, source));
  const keys = from.OwnPropertyKeys($);
  if (IsAbrupt(keys)) return keys;
  for (const nextKey of keys) {
    if (excludedItems?.has(nextKey)) continue;
    const desc = from.GetOwnProperty($, nextKey);
    if (IsAbrupt(desc)) return desc;
    if (desc != null && desc.Enumerable) {
      const propValue = yield* Get($, from, nextKey);
      if (IsAbrupt(propValue)) return propValue;
      // TODO - we could probably optimize this with a direct set?
      CastNotAbrupt(CreateDataPropertyOrThrow($, target, nextKey, propValue));
    }
  }
  return UNUSED;
}

/**
 * 7.3.27 PrivateElementFind ( O, P )
 * 
 * The abstract operation PrivateElementFind takes arguments O (an
 * Object) and P (a Private Name) and returns a PrivateElement or
 * empty. It performs the following steps when called:
 * 
 * 1. If O.[[PrivateElements]] contains a PrivateElement pe such that
 *    pe.[[Key]] is P, then
 *     a. Return pe.
 * 2. Return empty.
 */
export function PrivateElementFind(O: Obj, P: PrivateName): PrivateElement|EMPTY {
  if (!O.PrivateElements.has(P)) return EMPTY
  return O.PrivateElements.get(P)!;
}

/**
 * 7.3.28 PrivateFieldAdd ( O, P, value )
 * 
 * The abstract operation PrivateFieldAdd takes arguments O (an
 * Object), P (a Private Name), and value (an ECMAScript language
 * value) and returns either a normal completion containing unused
 * or a throw completion. It performs the following steps when called:
 * 
 * 1. If the host is a web browser, then
 *     a. Perform ? HostEnsureCanAddPrivateElement(O).
 * 2. Let entry be PrivateElementFind(O, P).
 * 3. If entry is not empty, throw a TypeError exception.
 * 4. Append PrivateElement { [[Key]]: P, [[Kind]]: field,
 *    [[Value]]: value } to O.[[PrivateElements]].
 * 5. Return unused.
 */
export function PrivateFieldAdd($: VM, O: Obj, P: PrivateName, value: Val): CR<UNUSED> {
  const status = HostEnsureCanAddPrivateElement($, O);
  if (IsAbrupt(status)) return status;
  if (O.PrivateElements.has(P)) {
    return $.throw('TypeError', `Identifier '${P}' has already been declared`);
  }
  O.PrivateElements.set(P, {Key: P, Kind: FIELD, Value: value});
  return UNUSED;
}

/**
 * 7.3.29 PrivateMethodOrAccessorAdd ( O, method )
 * 
 * The abstract operation PrivateMethodOrAccessorAdd takes arguments O
 * (an Object) and method (a PrivateElement) and returns either a
 * normal completion containing unused or a throw completion. It
 * performs the following steps when called:
 * 
 * 1. Assert: method.[[Kind]] is either method or accessor.
 * 2. If the host is a web browser, then
 *     a. Perform ? HostEnsureCanAddPrivateElement(O).
 * 3. Let entry be PrivateElementFind(O, method.[[Key]]).
 * 4. If entry is not empty, throw a TypeError exception.
 * 5. Append method to O.[[PrivateElements]].
 * 6. Return unused.
 * 
 * NOTE: The values for private methods and accessors are shared
 * across instances. This operation does not create a new copy of the
 * method or accessor.
 */
export function PrivateMethodOrAccessorAdd($: VM, O: Obj, method: PrivateElement): CR<UNUSED> {
  Assert(METHOD.is(method.Kind) || ACCESSOR.is(method.Kind));
  const status = HostEnsureCanAddPrivateElement($, O);
  if (IsAbrupt(status)) return status;
  if (O.PrivateElements.has(method.Key)) {
    return $.throw('TypeError', `Identifier '${method.Key}' has already been declared`);
  }
  O.PrivateElements.set(method.Key, method);
  return UNUSED;
}

/**
 * 7.3.30 HostEnsureCanAddPrivateElement ( O )
 * 
 * The host-defined abstract operation HostEnsureCanAddPrivateElement
 * takes argument O (an Object) and returns either a normal completion
 * containing unused or a throw completion. It allows host
 * environments to prevent the addition of private elements to
 * particular host-defined exotic objects.
 * 
 * An implementation of HostEnsureCanAddPrivateElement must conform to
 * the following requirements:
 * 
 * If O is not a host-defined exotic object, this abstract operation
 * must return NormalCompletion(unused) and perform no other steps.
 * 
 * Any two calls of this abstract operation with the same argument
 * must return the same kind of Completion Record.
 * 
 * The default implementation of HostEnsureCanAddPrivateElement is to
 * return NormalCompletion(unused).
 * 
 * This abstract operation is only invoked by ECMAScript hosts that
 * are web browsers.
 */
export function HostEnsureCanAddPrivateElement($: VM, O: Obj): CR<UNUSED> {
  // TODO - allow hosts to override?
  return UNUSED;
}

/**
 * 7.3.31 PrivateGet ( O, P )
 * 
 * The abstract operation PrivateGet takes arguments O (an Object) and
 * P (a Private Name) and returns either a normal completion
 * containing an ECMAScript language value or a throw completion. It
 * performs the following steps when called:
 * 
 * 1. Let entry be PrivateElementFind(O, P).
 * 2. If entry is empty, throw a TypeError exception.
 * 3. If entry.[[Kind]] is either field or method, then
 *     a. Return entry.[[Value]].
 * 4. Assert: entry.[[Kind]] is accessor.
 * 5. If entry.[[Get]] is undefined, throw a TypeError exception.
 * 6. Let getter be entry.[[Get]].
 * 7. Return ? Call(getter, O).
 */
export function* PrivateGet($: VM, O: Obj, P: PrivateName): ECR<Val> {
  const entry = PrivateElementFind(O, P);
  if (EMPTY.is(entry)) {
    return $.throw('TypeError',
                   `Cannot read private member ${P
                    } from an object whose class did not declare it`);
  }
  if (!IsPrivateElementAccessor(entry)) {
    return entry.Value;
  }
  if (entry.Get == null) return $.throw('TypeError', `'${P}' was defined without a getter`);
  return yield* Call($, entry.Get, O);
}

/**
 * 7.3.32 PrivateSet ( O, P, value )
 * 
 * The abstract operation PrivateSet takes arguments O (an Object), P
 * (a Private Name), and value (an ECMAScript language value) and
 * returns either a normal completion containing unused or a throw
 * completion. It performs the following steps when called:
 * 
 * 1. Let entry be PrivateElementFind(O, P).
 * 2. If entry is empty, throw a TypeError exception.
 * 3. If entry.[[Kind]] is field, then
 *     a. Set entry.[[Value]] to value.
 * 4. Else if entry.[[Kind]] is method, then
 *     a. Throw a TypeError exception.
 * 5. Else,
 *     a. Assert: entry.[[Kind]] is accessor.
 *     b. If entry.[[Set]] is undefined, throw a TypeError exception.
 *     c. Let setter be entry.[[Set]].
 *     d. Perform ? Call(setter, O, « value »).
 * 6. Return unused.
 */
export function* PrivateSet($: VM, O: Obj, P: PrivateName, value: Val): ECR<UNUSED> {
  const entry = PrivateElementFind(O, P);
  if (EMPTY.is(entry)) {
    return $.throw('TypeError',
                   `Cannot write private member ${P
                    } to an object whose class did not declare it`);
  }
  if (IsPrivateElementField(entry)) {
    entry.Value = value;
  } else if (IsPrivateElementMethod(entry)) {
    return $.throw('TypeError', `Private method ${P} is not writable`);
  } else {
    if (entry.Set == null) return $.throw('TypeError', `'${P}' was defined without a setter`);
    const status = yield* Call($, entry.Set, O, [value]);
    if (IsAbrupt(status)) return status;
  }
  return UNUSED;
}

/**
 * 7.3.33 DefineField ( receiver, fieldRecord )
 * 
 * The abstract operation DefineField takes arguments receiver (an
 * Object) and fieldRecord (a ClassFieldDefinition Record) and returns
 * either a normal completion containing unused or a throw
 * completion. It performs the following steps when called:
 * 
 * 1. Let fieldName be fieldRecord.[[Name]].
 * 2. Let initializer be fieldRecord.[[Initializer]].
 * 3. If initializer is not empty, then
 *     a. Let initValue be ? Call(initializer, receiver).
 * 4. Else, let initValue be undefined.
 * 5. If fieldName is a Private Name, then
 *     a. Perform ? PrivateFieldAdd(receiver, fieldName, initValue).
 * 6. Else,
 *     a. Assert: IsPropertyKey(fieldName) is true.
 *     b. Perform ? CreateDataPropertyOrThrow(receiver, fieldName, initValue).
 * 7. Return unused.
 */
export function* DefineField($: VM, receiver: Obj, fieldRecord: ClassFieldDefinitionRecord): ECR<UNUSED> {
  const fieldName = fieldRecord.Name;
  const initializer = fieldRecord.Initializer;
  let initValue: CR<Val>;
  if (!EMPTY.is(initializer)) {
    initValue = yield* Call($, initializer, receiver);
    if (IsAbrupt(initValue)) return initValue;
  } else {
    initValue = undefined;
  }
  if (fieldName instanceof PrivateName) {
    const status = PrivateFieldAdd($, receiver, fieldName, initValue);
    if (IsAbrupt(status)) return status;
  } else {
    Assert(IsPropertyKey(fieldName));
    const status = CreateDataPropertyOrThrow($, receiver, fieldName, initValue);
    if (IsAbrupt(status)) return status;
  }
  return UNUSED;
}

/**
 * 7.3.34 InitializeInstanceElements ( O, constructor )
 * 
 * The abstract operation InitializeInstanceElements takes arguments O
 * (an Object) and constructor (an ECMAScript function object) and
 * returns either a normal completion containing unused or a throw
 * completion. It performs the following steps when called:
 * 
 * 1. Let methods be the value of constructor.[[PrivateMethods]].
 * 2. For each PrivateElement method of methods, do
 *     a. Perform ? PrivateMethodOrAccessorAdd(O, method).
 * 3. Let fields be the value of constructor.[[Fields]].
 * 4. For each element fieldRecord of fields, do
 *     a. Perform ? DefineField(O, fieldRecord).
 * 5. Return unused.
 */
export function* InitializeInstanceElements($: VM, O: Obj, constructor: Func): ECR<UNUSED> {
  const methods = constructor.PrivateMethods;
  for (const [,method] of methods || []) {
    const success = PrivateMethodOrAccessorAdd($, O, method);
    if (IsAbrupt(success)) return success;
  }
  const fields = constructor.Fields;
  for (const fieldRecord of fields || []) {
    const success = yield* DefineField($, O, fieldRecord);
    if (IsAbrupt(success)) return success;
  }
  return UNUSED;
}
