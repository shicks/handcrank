/**
 * @fileoverview
 * 7.3 Operations on Objects
 */

import { CR, IsAbrupt, Throw } from "./completion_record";
import { UNUSED } from "./enums";
import { OrdinaryObject } from "./obj";
import { PropertyDescriptor } from "./property_descriptor";
import { Obj, PropertyKey, Val } from "./values";
import { VM } from "./vm";

declare const ToObject: any;

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
export function Get($: VM, O: Obj, P: PropertyKey): CR<Val> {
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
export function GetV($: VM, V: Val, P: PropertyKey): CR<Val> {
  const O = ToObject($, V);
  if (IsAbrupt(O)) return O;
  return O.Get($, P, O);
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
export function Set($: VM, O: Obj, P: PropertyKey, V: Val, Throw$: boolean): CR<UNUSED> {
  const success = O.Set($, P, V, O);
  if (IsAbrupt(success)) return success;
  if (!success && Throw$) return Throw('TypeError');
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
  const newDesc = PropertyDescriptor({
    Value: V,
    Writable: true,
    Enumerable: true,
    Configurable: true,
  });
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
  if (!success) return Throw('TypeError');
  return UNUSED;
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
