/**
 * @fileoverview
 * 7.3 Operations on Objects
 */

import { IsCallable } from "./abstract_compare";
import { Assert } from "./assert";
import { InstanceofOperator } from "./binary_operators";
import { CR, IsAbrupt } from "./completion_record";
import { UNUSED } from "./enums";
import { Func } from "./func";
import { Obj } from "./obj";
import { PropertyDescriptor, propWEC } from "./property_descriptor";
import { RealmRecord } from "./realm_record";
import { PropertyKey, Val } from "./val";
import { DebugString, ECR, VM, just } from "./vm";

declare const ToObject: any;
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



////////



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
  const P = Get($, C, 'prototype');
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
