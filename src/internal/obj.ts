import { IsExtensible, IsPropertyKey, SameValue } from './abstract_compare';
import { ToPropertyKey } from './abstract_conversion';
import { Call, CopyDataProperties, CreateDataProperty, Get, GetFunctionRealm } from './abstract_object';
import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { UNUSED } from './enums';
import { IsFunc, SetFunctionName, type Func } from './func';
import { PrivateElement, PrivateName, ResolvePrivateIdentifier } from './private_environment_record';
import { HasValueField, IsAccessorDescriptor, IsDataDescriptor, IsGenericDescriptor, PropertyDescriptor, methodName, propWEC } from './property_descriptor';
import { Slots, hasAnyFields, memoize } from './slots';
import { GetSourceText, IsAnonymousFunctionDefinition } from './static/functions';
import { PropertyLike } from './tree';
import { PropertyKey, Val } from './val';
import { DebugString, DebugStringContext, ECR, VM } from './vm';
import * as ESTree from 'estree';

const {} = {DebugString};

declare global {
  /**
   * Global interface for defining slots on Obj.  Should be
   * augmented by other modules as needed.  All properties
   * should be optional and mutable.
   */
  interface ObjectSlots {
    // Standard slots for all objects
    Prototype?: Obj|null;
    Extensible?: boolean;
    DebugString?(ctx: DebugStringContext): string;
  }
}

export type RequiredSlots<K extends keyof ObjectSlots>
  = {[T in K]-?: ObjectSlots[T]&({}|null)} & ObjectSlots;

export abstract class Obj extends Slots<ObjectSlots>() {

  // Implementation details not in spec
  abstract OwnProps: PropertyMap;
  PrivateElements = new Map<PrivateName, PrivateElement>();

  // Required internal methods for all objects

  /**
   * 10.1.1 [[GetPrototypeOf]] ( )
   *
   * The [[GetPrototypeOf]] internal method of an ordinary object O
   * takes no arguments and returns a normal completion containing
   * either an Object or null. It performs the following steps when
   * called:
   *
   * 1. Return OrdinaryGetPrototypeOf(O).
   */
  GetPrototypeOf(_$: VM): CR<Obj|null> {
    return OrdinaryGetPrototypeOf(this);
  }

  /**
   * 10.1.2 [[SetPrototypeOf]] ( V )
   *
   * The [[SetPrototypeOf]] internal method of an ordinary object O
   * takes argument V (an Object or null) and returns a normal
   * completion containing a Boolean. It performs the following steps
   * when called:
   *
   * 1. Return OrdinarySetPrototypeOf(O, V).
   */
  SetPrototypeOf(_$: VM, V: Obj|null): CR<boolean> {
    return OrdinarySetPrototypeOf(this, V);
  }

  /**
   * 10.1.3 [[IsExtensible]] ( )
   *
   * The [[IsExtensible]] internal method of an ordinary object O
   * takes no arguments and returns a normal completion containing a
   * Boolean. It performs the following steps when called:
   *
   * 1. Return OrdinaryIsExtensible(O).
   */
  IsExtensible(_$: VM): CR<boolean> {
    return OrdinaryIsExtensible(this);
  }

  /**
   * 10.1.4 [[PreventExtensions]] ( )
   *
   * The [[PreventExtensions]] internal method of an ordinary object O
   * takes no arguments and returns a normal completion containing
   * true. It performs the following steps when called:
   *
   * 1. Return OrdinaryPreventExtensions(O).
   */
  PreventExtensions(_$: VM): CR<boolean> {
    return OrdinaryPreventExtensions(this);
  }

  /**
   * 10.1.5 [[GetOwnProperty]] ( P )
   *
   * The [[GetOwnProperty]] internal method of an ordinary object O
   * takes argument P (a property key) and returns a normal completion
   * containing either a Property Descriptor or undefined. It performs
   * the following steps when called:
   *
   * 1. Return OrdinaryGetOwnProperty(O, P).
   */
  GetOwnProperty(_$: VM, P: PropertyKey): CR<PropertyDescriptor|undefined> {
    return OrdinaryGetOwnProperty(this, P);
  }

  /**
   * 10.1.6 [[DefineOwnProperty]] ( P, Desc )
   *
   * The [[DefineOwnProperty]] internal method of an ordinary object O
   * takes arguments P (a property key) and Desc (a Property
   * Descriptor) and returns either a normal completion containing a
   * Boolean or a throw completion. It performs the following steps
   * when called:
   *
   * 1. Return ? OrdinaryDefineOwnProperty(O, P, Desc).
   */
  DefineOwnProperty($: VM, P: PropertyKey, Desc: PropertyDescriptor): CR<boolean> {
    return OrdinaryDefineOwnProperty($, this, P, Desc);
  }

  /**
   * 10.1.7 [[HasProperty]] ( P )
   *
   * The [[HasProperty]] internal method of an ordinary object O takes
   * argument P (a property key) and returns either a normal
   * completion containing a Boolean or a throw completion. It
   * performs the following steps when called:
   *
   * 1. Return ? OrdinaryHasProperty(O, P).
   */
  HasProperty($: VM, P: PropertyKey): CR<boolean> {
    return OrdinaryHasProperty($, this, P);
  }

  /**
   * 10.1.8 [[Get]] ( P, Receiver )
   *
   * The [[Get]] internal method of an ordinary object O takes
   * arguments P (a property key) and Receiver (an ECMAScript language
   * value) and returns either a normal completion containing an
   * ECMAScript language value or a throw completion. It performs the
   * following steps when called:
   *
   * 1. Return ? OrdinaryGet(O, P, Receiver).
   */
  Get($: VM, P: PropertyKey, Receiver: Val): ECR<Val> {
    return OrdinaryGet($, this, P, Receiver);
  };

  /**
   * 10.1.9 [[Set]] ( P, V, Receiver )
   *
   * The [[Set]] internal method of an ordinary object O takes
   * arguments P (a property key), V (an ECMAScript language value),
   * and Receiver (an ECMAScript language value) and returns either a
   * normal completion containing a Boolean or a throw completion. It
   * performs the following steps when called:
   *
   * 1. Return ? OrdinarySet(O, P, V, Receiver).
   */
  Set($: VM, P: PropertyKey, V: Val, Receiver: Val): ECR<boolean> {
    return OrdinarySet($, this, P, V, Receiver);
  }

  /**
   * 10.1.10 [[Delete]] ( P )
   *
   * The [[Delete]] internal method of an ordinary object O takes
   * argument P (a property key) and returns either a normal
   * completion containing a Boolean or a throw completion. It
   * performs the following steps when called:
   *
   * 1. Return ? OrdinaryDelete(O, P).
   */
  Delete($: VM, P: PropertyKey): CR<boolean> {
    return OrdinaryDelete($, this, P);
  }

  /**
   * 10.1.11 [[OwnPropertyKeys]] ( )
   *
   * The [[OwnPropertyKeys]] internal method of an ordinary object O
   * takes no arguments and returns a normal completion containing a
   * List of property keys. It performs the following steps when
   * called:
   *
   * 1. Return OrdinaryOwnPropertyKeys(O).
   */
  OwnPropertyKeys(_$: VM): CR<PropertyKey[]> {
    return OrdinaryOwnPropertyKeys(this);
  }
}

/**
 * 10.1 Ordinary Object Internal Methods and Internal Slots
 *
 * All ordinary objects have an internal slot called
 * [[Prototype]]. The value of this internal slot is either null or an
 * object and is used for implementing inheritance. Assume a property
 * named P is missing from an ordinary object O but exists on its
 * [[Prototype]] object. If P refers to a data property on the
 * [[Prototype]] object, O inherits it for get access, making it
 * behave as if P was a property of O. If P refers to a writable data
 * property on the [[Prototype]] object, set access of P on O creates
 * a new data property named P on O. If P refers to a non-writable
 * data property on the [[Prototype]] object, set access of P on O
 * fails. If P refers to an accessor property on the [[Prototype]]
 * object, the accessor is inherited by O for both get access and set
 * access.
 *
 * Every ordinary object has a Boolean-valued [[Extensible]] internal
 * slot which is used to fulfill the extensibility-related internal
 * method invariants specified in 6.1.7.3. Namely, once the value of
 * an object's [[Extensible]] internal slot has been set to false, it
 * is no longer possible to add properties to the object, to modify
 * the value of the object's [[Prototype]] internal slot, or to
 * subsequently change the value of [[Extensible]] to true.
 *
 * In the following algorithm descriptions, assume O is an ordinary
 * object, P is a property key value, V is any ECMAScript language
 * value, and Desc is a Property Descriptor record.
 *
 * Each ordinary object internal method delegates to a similarly-named
 * abstract operation. If such an abstract operation depends on
 * another internal method, then the internal method is invoked on O
 * rather than calling the similarly-named abstract operation
 * directly. These semantics ensure that exotic objects have their
 * overridden internal methods invoked when ordinary object internal
 * methods are applied to them.
 *
 * NOTE: This definition is a base class shell.  It is critical that
 * this file have no value imports to avoid cycles, since it must
 * always be imported BEFORE any concrete `Obj` subclasses.
 */
export type OrdinaryObject = InstanceType<ReturnType<typeof OrdinaryObject>>;
export const OrdinaryObject = memoize(() => class OrdinaryObject extends Obj {
  override OwnProps = new SimplePropertyMap();

  declare Extensible: boolean;
  declare Prototype: Obj|null;

  constructor(
    slots: ObjectSlots = {},
    props: Record<PropertyKey, PropertyDescriptor> = {},
  ) {
    super();
    for (const [k, v] of Object.entries(slots)) {
      (this as any)[k] = v;
    }
    for (const k of Reflect.ownKeys(props)) {
      const v = props[k];
      this.OwnProps.set(k as PropertyKey, v);
    }
    this.Extensible ??= true;
    this.Prototype ??= null;
  }
});


/**
 * 10.1.1.1 OrdinaryGetPrototypeOf ( O )
 *
 * The abstract operation OrdinaryGetPrototypeOf takes argument O (an
 * Object) and returns an Object or null. It performs the following
 * steps when called:
 *
 * 1. Return O.[[Prototype]].
 */
export function OrdinaryGetPrototypeOf(O: Obj): Obj|null {
  return (O as OrdinaryObject).Prototype;
}

/**
 * 10.1.2.1 OrdinarySetPrototypeOf ( O, V )
 *
 * The abstract operation OrdinarySetPrototypeOf takes arguments O (an
 * Object) and V (an Object or null) and returns a Boolean. It
 * performs the following steps when called:
 *
 * 1. Let current be O.[[Prototype]].
 * 2. If SameValue(V, current) is true, return true.
 * 3. Let extensible be O.[[Extensible]].
 * 4. If extensible is false, return false.
 * 5. Let p be V.
 * 6. Let done be false.
 * 7. Repeat, while done is false,
 *     a. If p is null, set done to true.
 *     b. Else if SameValue(p, O) is true, return false.
 *     c. Else,
 *         i. If p.[[GetPrototypeOf]] is not the ordinary object
 *            internal method defined in 10.1.1, set done to true.
 *         ii. Else, set p to p.[[Prototype]].
 * 8. Set O.[[Prototype]] to V.
 * 9. Return true.
 *
 * NOTE: The loop in step 7 guarantees that there will be no
 * circularities in any prototype chain that only includes objects
 * that use the ordinary object definitions for [[GetPrototypeOf]] and
 * [[SetPrototypeOf]].
 */
export function OrdinarySetPrototypeOf(O: Obj, V: Obj|null): boolean {
  const current = O.Prototype;
  if (SameValue(V, current)) return true;
  const extensible = O.Extensible;
  if (!extensible) return false;
  let p = V;
  let done = false;
  while (!done) {
    if (p == null) {
      done = true;
    } else if (SameValue(p, O)) {
      return false;
    } else {
      if (p.GetPrototypeOf !== Obj.prototype.GetPrototypeOf) {
        done = true;
      } else {
        p = p.Prototype ?? null;
      }
    }
  }
  O.Prototype = V;
  return true;
}

/**
 * 10.1.3.1 OrdinaryIsExtensible ( O )
 *
 * The abstract operation OrdinaryIsExtensible takes argument O (an
 * Object) and returns a Boolean. It performs the following steps when
 * called:
 *
 * 1. Return O.[[Extensible]].
 */
export function OrdinaryIsExtensible(O: Obj): boolean {
  Assert(O.Extensible != null);
  return O.Extensible;
}

/**
 * 10.1.4.1 OrdinaryPreventExtensions ( O )
 *
 * The abstract operation OrdinaryPreventExtensions takes argument O
 * (an Object) and returns true. It performs the following steps when
 * called:
 *
 * 1. Set O.[[Extensible]] to false.
 * 2. Return true.
 */
export function OrdinaryPreventExtensions(O: Obj): true {
  Assert(O.Extensible != null);
  O.Extensible = false;
  return true;
}

/**
 * 10.1.5.1 OrdinaryGetOwnProperty ( O, P )
 *
 * The abstract operation OrdinaryGetOwnProperty takes arguments O (an
 * Object) and P (a property key) and returns a Property Descriptor or
 * undefined. It performs the following steps when called:
 *
 * 1. If O does not have an own property with key P, return undefined.
 * 2. Let D be a newly created Property Descriptor with no fields.
 * 3. Let X be O's own property whose key is P.
 * 4. If X is a data property, then
 *     a. Set D.[[Value]] to the value of X's [[Value]] attribute.
 *     b. Set D.[[Writable]] to the value of X's [[Writable]] attribute.
 * 5. Else,
 *     a. Assert: X is an accessor property.
 *     b. Set D.[[Get]] to the value of X's [[Get]] attribute.
 *     c. Set D.[[Set]] to the value of X's [[Set]] attribute.
 * 6. Set D.[[Enumerable]] to the value of X's [[Enumerable]] attribute.
 * 7. Set D.[[Configurable]] to the value of X's [[Configurable]] attribute.
 * 8. Return D.
 */
export function OrdinaryGetOwnProperty(O: Obj, P: PropertyKey):
    PropertyDescriptor|undefined {
  const X = O.OwnProps.get(P);
  return X && {...O.OwnProps.get(P)};
}

/**
 * 10.1.6.1 OrdinaryDefineOwnProperty ( O, P, Desc )
 *
 * The abstract operation OrdinaryDefineOwnProperty takes arguments O
 * (an Object), P (a property key), and Desc (a Property Descriptor)
 * and returns either a normal completion containing a Boolean or a
 * throw completion. It performs the following steps when called:
 *
 * 1. Let current be ? O.[[GetOwnProperty]](P).
 * 2. Let extensible be ? IsExtensible(O).
 * 3. Return ValidateAndApplyPropertyDescriptor(O, P, extensible, Desc, current).
 */
export function OrdinaryDefineOwnProperty($: VM, O: Obj, P: PropertyKey,
                                          Desc: PropertyDescriptor): CR<boolean> {
  const current = O.GetOwnProperty($, P);
  if (IsAbrupt(current)) return current;
  const extensible = IsExtensible($, O);
  if (IsAbrupt(extensible)) return extensible;
  return ValidateAndApplyPropertyDescriptor(O, P, extensible, Desc, current);
}

/**
 * 10.1.6.2 IsCompatiblePropertyDescriptor ( Extensible, Desc, Current )
 *
 * The abstract operation IsCompatiblePropertyDescriptor takes
 * arguments Extensible (a Boolean), Desc (a Property Descriptor), and
 * Current (a Property Descriptor) and returns a Boolean. It performs
 * the following steps when called:
 *
 * 1. Return ValidateAndApplyPropertyDescriptor(undefined, "",
 *    Extensible, Desc, Current).
 */
export function IsCompatiblePropertyDescriptor(Extensible: boolean, Desc: PropertyDescriptor, Current: PropertyDescriptor): boolean {
  return ValidateAndApplyPropertyDescriptor(undefined, '', Extensible, Desc, Current);
}

/**
 * 10.1.6.3 ValidateAndApplyPropertyDescriptor ( O, P, extensible, Desc, current )
 *
 * The abstract operation ValidateAndApplyPropertyDescriptor takes
 * arguments O (an Object or undefined), P (a property key),
 * extensible (a Boolean), Desc (a Property Descriptor), and current
 * (a Property Descriptor or undefined) and returns a Boolean. It
 * returns true if and only if Desc can be applied as the property of
 * an object with specified extensibility and current property current
 * while upholding invariants. When such application is possible and O
 * is not undefined, it is performed for the property named P (which
 * is created if necessary). It performs the following steps when
 * called:
 */
export function ValidateAndApplyPropertyDescriptor(
  O: Obj|undefined,
  P: PropertyKey,
  extensible: boolean,
  Desc: PropertyDescriptor,
  current: PropertyDescriptor|undefined,
): boolean {
  // 1. Assert: IsPropertyKey(P) is true.
  Assert(IsPropertyKey(P));
  // 2. If current is undefined, then
  if (current == undefined) {
    //   a. If extensible is false, return false.
    if (!extensible) return false;
    //   b. If O is undefined, return true.
    if (O == undefined) return true;
    //   c. If IsAccessorDescriptor(Desc) is true, then
    if (IsAccessorDescriptor(Desc)) {
      //     i. Create an own accessor property named P of object O
      //        whose [[Get]], [[Set]], [[Enumerable]], and
      //        [[Configurable]] attributes are set to the value of the
      //        corresponding field in Desc if Desc has that field, or to
      //        the attribute's default value otherwise.
      O.OwnProps.set(P, {
        Get: Desc.Get,
        Set: Desc.Set,
        Enumerable: Desc.Enumerable ?? false,
        Configurable: Desc.Configurable ?? false,
      });
    } 
    //   d. Else,
    else {
      //     i. Create an own data property named P of object O whose
      //        [[Value]], [[Writable]], [[Enumerable]], and
      //        [[Configurable]] attributes are set to the value of the
      //        corresponding field in Desc if Desc has that field, or to
      //        the attribute's default value otherwise.
      O.OwnProps.set(P, {
        Value: Desc.Value,
        Writable: Desc.Writable ?? false,
        Enumerable: Desc.Enumerable ?? false,
        Configurable: Desc.Configurable ?? false,
      });
    }
    //   e. Return true.
    return true;
  }

  // 3. Assert current is a fully populated Property Descriptor.
  Assert(IsDataDescriptor(current) || IsAccessorDescriptor(current));
  // 4. If Desc does not have any fields, return true.
  if (!hasAnyFields(Desc)) return true;
  
  // 5. If current.[[Configurable]] is false, then
  if (!current.Configurable) {
    //     a. If Desc has a [[Configurable]] field and
    //        Desc.[[Configurable]] is true, return false.
    if (Desc.Configurable) return false;
    //     b. If Desc has an [[Enumerable]] field and
    //        SameValue(Desc.[[Enumerable]], current.[[Enumerable]]) is
    //        false, return false.
    if (Desc.Enumerable != null &&
        Desc.Enumerable !== current.Enumerable) {
      return false;
    }
    //     c. If IsGenericDescriptor(Desc) is false and
    //        SameValue(IsAccessorDescriptor(Desc),
    //        IsAccessorDescriptor(current)) is false, return false.
    if (!IsGenericDescriptor(Desc) &&
        IsAccessorDescriptor(Desc) !== IsAccessorDescriptor(current)) {
      return false;
    }
    //     d. If IsAccessorDescriptor(current) is true, then
    if (IsAccessorDescriptor(current)) {
      //       i. If Desc has a [[Get]] field and SameValue(Desc.[[Get]],
      //          current.[[Get]]) is false, return false.
      //       ii. If Desc has a [[Set]] field and SameValue(Desc.[[Set]],
      //           current.[[Set]]) is false, return false.
      if (Desc.Get && Desc.Get !== current.Get) return false;
      if (Desc.Set && Desc.Set !== current.Set) return false;
    } 
    //     e. Else if current.[[Writable]] is false, then
    else if (!current.Writable) {
      //       i. If Desc has a [[Writable]] field and Desc.[[Writable]]
      //          is true, return false.
      //       ii. If Desc has a [[Value]] field and
      //           SameValue(Desc.[[Value]], current.[[Value]]) is false,
      //           return false.
      if (Desc.Writable === true) return false;
      if (HasValueField(Desc) && !SameValue(Desc.Value, current.Value)) return false;
    }
  }
  // 6. If O is not undefined, then
  if (O !== undefined) {
    //   a. If IsDataDescriptor(current) is true and
    //      IsAccessorDescriptor(Desc) is true, then
    if (IsDataDescriptor(current) && IsAccessorDescriptor(Desc)) {
      //     i. If Desc has a [[Configurable]] field, let configurable
      //        be Desc.[[Configurable]]; else let configurable be
      //        current.[[Configurable]].
      const configurable = Desc.Configurable ?? current.Configurable;
      //     ii. If Desc has a [[Enumerable]] field, let enumerable be
      //         Desc.[[Enumerable]]; else let enumerable be
      //         current.[[Enumerable]].
      const enumerable = Desc.Enumerable ?? current.Enumerable;
      //     iii. Replace the property named P of object O with an
      //          accessor property whose [[Configurable]] and [[Enumerable]]
      //          attributes are set to configurable and enumerable,
      //          respectively, and whose [[Get]] and [[Set]] attributes are
      //          set to the value of the corresponding field in Desc if Desc
      //          has that field, or to the attribute's default value
      //          otherwise.
      O.OwnProps.set(P, {
        Configurable: configurable,
        Enumerable: enumerable,
        Get: Desc.Get,
        Set: Desc.Set,
      });
      // (7. Return true.)
      return true;
    }
    //   b. Else if IsAccessorDescriptor(current) is true and
    //      IsDataDescriptor(Desc) is true, then
    if (IsAccessorDescriptor(current) && IsDataDescriptor(Desc)) {
      //     i. If Desc has a [[Configurable]] field, let configurable
      //        be Desc.[[Configurable]]; else let configurable be
      //        current.[[Configurable]].
      const configurable = Desc.Configurable ?? current.Configurable;
      //     ii. If Desc has a [[Enumerable]] field, let enumerable be
      //         Desc.[[Enumerable]]; else let enumerable be
      //         current.[[Enumerable]].
      const enumerable = Desc.Enumerable ?? current.Enumerable;
      //     iii. Replace the property named P of object O with a data
      //          property whose [[Configurable]] and [[Enumerable]]
      //          attributes are set to configurable and enumerable,
      //          respectively, and whose [[Value]] and [[Writable]]
      //          attributes are set to the value of the corresponding field
      //          in Desc if Desc has that field, or to the attribute's
      //          default value otherwise.
      O.OwnProps.set(P, {
        Configurable: configurable,
        Enumerable: enumerable,
        Value: Desc.Value,
        Writable: Desc.Writable,
      });
      // (7. Return true.)
      return true;
    }
    //   c. Else,
    //       i. For each field of Desc, set the corresponding attribute
    //           of the property named P of object O to the value of the
    //           field.
    const p = {...current};
    if (HasValueField(Desc)) p.Value = Desc.Value;
    if (Desc.Writable != undefined) p.Writable = Desc.Writable;
    if (Desc.Enumerable != undefined) p.Enumerable = Desc.Enumerable;
    if (Desc.Configurable != undefined) p.Configurable = Desc.Configurable;
    if (Desc.Get) p.Get = Desc.Get;
    if (Desc.Set) p.Set = Desc.Set;
    O.OwnProps.set(P, p);
  }
  // 7. Return true.
  return true;
}

/**
 * 10.1.7.1 OrdinaryHasProperty ( O, P )
 *
 * The abstract operation OrdinaryHasProperty takes arguments O (an
 * Object) and P (a property key) and returns either a normal
 * completion containing a Boolean or a throw completion. It performs
 * the following steps when called:
 *
 * 1. Let hasOwn be ? O.[[GetOwnProperty]](P).
 * 2. If hasOwn is not undefined, return true.
 * 3. Let parent be ? O.[[GetPrototypeOf]]().
 * 4. If parent is not null, then
 *     a. Return ? parent.[[HasProperty]](P).
 * 5. Return false.
 */
export function OrdinaryHasProperty($: VM, O: Obj, P: PropertyKey): CR<boolean> {
  const hasOwn = O.GetOwnProperty($, P);
  if (IsAbrupt(hasOwn)) return hasOwn;
  if (hasOwn != undefined) return true;
  const parent = O.GetPrototypeOf($);
  if (IsAbrupt(parent)) return parent;
  if (parent != null) return parent.HasProperty($, P);
  return false;
}

/**
 * 10.1.8.1 OrdinaryGet ( O, P, Receiver )
 *
 * The abstract operation OrdinaryGet takes arguments O (an Object), P
lue) and
 * returns either a normal completion containing an ECMAScript
 * language value or a throw completion. It performs the following
 * steps when called:
 *
 * 1. Let desc be ? O.[[GetOwnProperty]](P).
 * 2. If desc is undefined, then
 *     a. Let parent be ? O.[[GetPrototypeOf]]().
 *     b. If parent is null, return undefined.
 *     c. Return ? parent.[[Get]](P, Receiver).
 * 3. If IsDataDescriptor(desc) is true, return desc.[[Value]].
 * 4. Assert: IsAccessorDescriptor(desc) is true.
 * 5. Let getter be desc.[[Get]].
 * 6. If getter is undefined, return undefined.
 * 7. Return ? Call(getter, Receiver).
 */
export function* OrdinaryGet($: VM, O: Obj, P: PropertyKey, Receiver: Val): ECR<Val> {
  const desc = O.GetOwnProperty($, P);
  if (IsAbrupt(desc)) return desc;
  if (desc == undefined) {
    const parent = O.GetPrototypeOf($);
    if (IsAbrupt(parent)) return parent;
    if (parent == null) return undefined;
    return yield* parent.Get($, P, Receiver);
  }
  if (IsDataDescriptor(desc)) return desc.Value;
  Assert(IsAccessorDescriptor(desc));
  const getter = desc.Get;
  if (getter == undefined) return undefined;
  return yield* Call($, getter, Receiver);
}

/**
 * 10.1.9.1 OrdinarySet ( O, P, V, Receiver )
 *
 * The abstract operation OrdinarySet takes arguments O (an Object), P
 * (a property key), V (an ECMAScript language value), and Receiver
 * (an ECMAScript language value) and returns either a normal
 * completion containing a Boolean or a throw completion. It performs
 * the following steps when called:
 *
 * 1. Let ownDesc be ? O.[[GetOwnProperty]](P).
 * 2. Return ? OrdinarySetWithOwnDescriptor(O, P, V, Receiver, ownDesc).
 */
export function* OrdinarySet(
  $: VM,
  O: Obj,
  P: PropertyKey,
  V: Val,
  Receiver: Val,
): ECR<boolean> {
  const ownDesc = O.GetOwnProperty($, P);
  if (IsAbrupt(ownDesc)) return ownDesc;
  return yield* OrdinarySetWithOwnDescriptor($, O, P, V, Receiver, ownDesc);
}

/**
 * 10.1.9.2 OrdinarySetWithOwnDescriptor ( O, P, V, Receiver, ownDesc )
 *
 * The abstract operation OrdinarySetWithOwnDescriptor takes arguments
 * O (an Object), P (a property key), V (an ECMAScript language
 * value), Receiver (an ECMAScript language value), and ownDesc (a
 * Property Descriptor or undefined) and returns either a normal
 * completion containing a Boolean or a throw completion. It performs
 * the following steps when called:
 */
export function* OrdinarySetWithOwnDescriptor(
  $: VM,
  O: Obj,
  P: PropertyKey,
  V: Val,
  Receiver: Val,
  ownDesc: PropertyDescriptor|undefined,
): ECR<boolean> {
  // 1. If ownDesc is undefined, then
  if (ownDesc == undefined) {
    //   a. Let parent be ? O.[[GetPrototypeOf]]().
    const parent = O.GetPrototypeOf($);
    if (IsAbrupt(parent)) return parent;
    //   b. If parent is not null, then
    //       i. Return ? parent.[[Set]](P, V, Receiver).
    if (parent != null) return yield* parent.Set($, P, V, Receiver);
    //   c. Else,
    //       i. Set ownDesc to the PropertyDescriptor { [[Value]]:
    //          undefined, [[Writable]]: true, [[Enumerable]]: true,
    //          [[Configurable]]: true }.
    ownDesc = propWEC(undefined);
  }
  // 2. If IsDataDescriptor(ownDesc) is true, then
  if (IsDataDescriptor(ownDesc)) {
    //   a. If ownDesc.[[Writable]] is false, return false.
    if (!ownDesc.Writable) return false;
    //   b. If Receiver is not an Object, return false.
    if (!(Receiver instanceof Obj)) return false;
    //   c. Let existingDescriptor be ? Receiver.[[GetOwnProperty]](P).
    const existingDescriptor = Receiver.GetOwnProperty($, P);
    if (IsAbrupt(existingDescriptor)) return existingDescriptor;
    //   d. If existingDescriptor is not undefined, then
    if (existingDescriptor != undefined) {
      //     i. If IsAccessorDescriptor(existingDescriptor) is true,
      //        return false.
      if (IsAccessorDescriptor(existingDescriptor)) return false;
      //     ii. If existingDescriptor.[[Writable]] is false, return false.
      if (!existingDescriptor.Writable) return false;
      //     iii. Let valueDesc be the PropertyDescriptor { [[Value]]: V }.
      const valueDesc = {Value: V};
      //     iv. Return ? Receiver.[[DefineOwnProperty]](P, valueDesc).
      return Receiver.DefineOwnProperty($, P, valueDesc);
    }
    //   e. Else,
    //       i. Assert: Receiver does not currently have a property P.
    Assert(!Receiver.OwnProps.has(P));
    //       ii. Return ? CreateDataProperty(Receiver, P, V).
    return CreateDataProperty($, Receiver, P, V);
  }
  // 3. Assert: IsAccessorDescriptor(ownDesc) is true.
  Assert(IsAccessorDescriptor(ownDesc));
  // 4. Let setter be ownDesc.[[Set]].
  const setter = ownDesc.Set;
  // 5. If setter is undefined, return false.
  if (!setter) return false;
  // 6. Perform ? Call(setter, Receiver, « V »).
  const result = yield* Call($, setter, Receiver, [V]);
  if (IsAbrupt(result)) return result;
  // 7. Return true.
  return true;
}


/**
 * 10.1.10.1 OrdinaryDelete ( O, P )
 *
 * The abstract operation OrdinaryDelete takes arguments O (an Object)
 * and P (a property key) and returns either a normal completion
 * containing a Boolean or a throw completion. It performs the
 * following steps when called:
 *
 * 1. Let desc be ? O.[[GetOwnProperty]](P).
 * 2. If desc is undefined, return true.
 * 3. If desc.[[Configurable]] is true, then
 *     a. Remove the own property with name P from O.
 *     b. Return true.
 * 4. Return false.
 */
export function OrdinaryDelete($: VM, O: Obj, P: PropertyKey): CR<boolean> {
  const desc = O.GetOwnProperty($, P);
  if (IsAbrupt(desc)) return desc;
  if (desc == undefined) return true;
  if (desc.Configurable) {
    O.OwnProps.delete(P);
    return true;
  }
  return false;
}

/**
 * 10.1.11.1 OrdinaryOwnPropertyKeys ( O )
 *
 * The abstract operation OrdinaryOwnPropertyKeys takes argument O (an
 * Object) and returns a List of property keys. It performs the
 * following steps when called:
 *
 * 1. Let keys be a new empty List.
 * 2. For each own property key P of O such that P is an array index, in ascending numeric index order, do
 *     a. Append P to keys.
 * 3. For each own property key P of O such that P is a String and P is not an array index, in ascending chronological order of property creation, do
 *     a. Append P to keys.
 * 4. For each own property key P of O such that P is a Symbol, in ascending chronological order of property creation, do
 *     a. Append P to keys.
 * 5. Return keys.
 */
export function OrdinaryOwnPropertyKeys(O: Obj): PropertyKey[] {
  return O.OwnProps.keys();
}

/**
 * 10.1.12 OrdinaryObjectCreate ( proto [ , additionalInternalSlotsList ] )
 *
 * The abstract operation OrdinaryObjectCreate takes argument proto
 * (an Object or null) and optional argument
 * additionalInternalSlotsList (a List of names of internal slots) and
 * returns an Object. It is used to specify the runtime creation of
 * new ordinary objects. additionalInternalSlotsList contains the
 * names of additional internal slots that must be defined as part of
 * the object, beyond [[Prototype]] and [[Extensible]]. If
 * additionalInternalSlotsList is not provided, a new empty List is
 * used. It performs the following steps when called:
 *
 * 1. Let internalSlotsList be « [[Prototype]], [[Extensible]] ».
 * 2. If additionalInternalSlotsList is present, set internalSlotsList
 *    to the list-concatenation of internalSlotsList and
 *    additionalInternalSlotsList.
 * 3. Let O be MakeBasicObject(internalSlotsList).
 * 4. Set O.[[Prototype]] to proto.
 * 5. Return O.
 *
 * NOTE: Although OrdinaryObjectCreate does little more than call
 * MakeBasicObject, its use communicates the intention to create an
 * ordinary object, and not an exotic one. Thus, within this
 * specification, it is not called by any algorithm that subsequently
 * modifies the internal methods of the object in ways that would make
 * the result non-ordinary. Operations that create exotic objects
 * invoke MakeBasicObject directly.
 */
export function OrdinaryObjectCreate(
  slots?: ObjectSlots,
  props?: Record<PropertyKey, PropertyDescriptor>,
): OrdinaryObject {
  //const internalSlotsList = ['Prototype', 'Extensible', ...(additionalInternalSlotsList || [])];
  // const O = MakeBasicObject(internalSlotsList);
  // O.Prototype = proto;
  // return O;
  //return new OrdinaryObject(proto);
  return new (OrdinaryObject())(slots, props);
}

/**
 * 10.1.13 OrdinaryCreateFromConstructor ( constructor,
 *         intrinsicDefaultProto [ , internalSlotsList ] )
 * 
 * The abstract operation OrdinaryCreateFromConstructor takes
 * arguments constructor (a constructor) and intrinsicDefaultProto (a
 * String) and optional argument internalSlotsList (a List of names of
 * internal slots) and returns either a normal completion containing
 * an Object or a throw completion. It creates an ordinary object
 * whose [[Prototype]] value is retrieved from a constructor\'s
 * "prototype" property, if it exists. Otherwise the intrinsic named
 * by intrinsicDefaultProto is used for
 * [[Prototype]]. internalSlotsList contains the names of additional
 * internal slots that must be defined as part of the object. If
 * internalSlotsList is not provided, a new empty List is used. It
 * performs the following steps when called:
 * 
 * 1. Assert: intrinsicDefaultProto is this specification\'s name of
 *    an intrinsic object. The corresponding object must be an intrinsic
 *    that is intended to be used as the [[Prototype]] value of an
 *    object.
 * 2. Let proto be ? GetPrototypeFromConstructor(constructor, intrinsicDefaultProto).
 * 3. If internalSlotsList is present, let slotsList be internalSlotsList.
 * 4. Else, let slotsList be a new empty List.
 * 5. Return OrdinaryObjectCreate(proto, slotsList).
 */
export function* OrdinaryCreateFromConstructor(
  $: VM,
  constructor: Func,
  intrinsicDefaultProto: string,
  slots?: ObjectSlots,
): ECR<Obj> {
  const proto = yield* GetPrototypeFromConstructor($, constructor, intrinsicDefaultProto);
  if (IsAbrupt(proto)) return proto;
  return OrdinaryObjectCreate({...slots, Prototype: proto});
}

/**
 * 10.1.14 GetPrototypeFromConstructor ( constructor, intrinsicDefaultProto )
 *
 * The abstract operation GetPrototypeFromConstructor takes arguments
 * constructor (a function object) and intrinsicDefaultProto (a
 * String) and returns either a normal completion containing an Object
 * or a throw completion. It determines the [[Prototype]] value that
 * should be used to create an object corresponding to a specific
 * constructor. The value is retrieved from the constructor's
 * "prototype" property, if it exists. Otherwise the intrinsic named
 * by intrinsicDefaultProto is used for [[Prototype]]. It performs the
 * following steps when called:
 * 
 * 1. Assert: intrinsicDefaultProto is this specification's name of an
 *    intrinsic object. The corresponding object must be an intrinsic
 *    that is intended to be used as the [[Prototype]] value of an
 *    object.
 * 2. Let proto be ? Get(constructor, "prototype").
 * 3. If proto is not an Object, then
 *     a. Let realm be ? GetFunctionRealm(constructor).
 *     b. Set proto to realm's intrinsic object named intrinsicDefaultProto.
 * 4. Return proto.
 * 
 * NOTE: If constructor does not supply a [[Prototype]] value, the
 * default value that is used is obtained from the realm of the
 * constructor function rather than from the running execution context.
 */
export function* GetPrototypeFromConstructor(
  $: VM,
  constructor: Func,
  intrinsicDefaultProto: string,
): ECR<Obj> {
  const proto = yield* Get($, constructor, 'prototype');
  if (IsAbrupt(proto)) return proto;
  if (!(proto instanceof Obj)) {
    const realm = GetFunctionRealm($, constructor);
    if (IsAbrupt(realm)) return realm;
    return realm.Intrinsics.get(intrinsicDefaultProto)!;
  }
  return proto;
}

/**
 * 10.1.15 RequireInternalSlot ( O, internalSlot )
 * 
 * The abstract operation RequireInternalSlot takes arguments O (an
 * ECMAScript language value) and internalSlot (an internal slot name)
 * and returns either a normal completion containing unused or a throw
 * completion. It throws an exception unless O is an Object and has
 * the given internal slot. It performs the following steps when
 * called:
 * 
 * 1. If O is not an Object, throw a TypeError exception.
 * 2. If O does not have an internalSlot internal slot, throw a TypeError exception.
 * 3. Return unused.
 */
export function RequireInternalSlot(
  $: VM,
  O: Val,
  slots: {[K in keyof ObjectSlots]: true},
): CR<UNUSED> {
  if (!(O instanceof Obj)) return $.throw('TypeError', 'not an object');
  for (const s in slots) {
    if (!(s in O)) return $.throw('TypeError', 'missing slot');
  }
  return UNUSED;
}

/**
 * 13.2.5.4 Runtime Semantics: Evaluation
 *
 * ObjectLiteral : { }
 * 1. Return OrdinaryObjectCreate(%Object.prototype%).
 * 
 * ObjectLiteral :
 *   { PropertyDefinitionList }
 *   { PropertyDefinitionList , }
 * 1. Let obj be OrdinaryObjectCreate(%Object.prototype%).
 * 2. Perform ? PropertyDefinitionEvaluation of PropertyDefinitionList
 *    with argument obj.
 * 3. Return obj.
 * 
 * LiteralPropertyName : IdentifierName
 * 1. Return StringValue of IdentifierName.
 * 
 * LiteralPropertyName : StringLiteral
 * 1. Return the SV of StringLiteral.
 * 
 * LiteralPropertyName : NumericLiteral
 * 1. Let nbr be the NumericValue of NumericLiteral.
 * 2. Return ! ToString(nbr).
 * 
 * ComputedPropertyName : [ AssignmentExpression ]
 * 1. Let exprValue be ? Evaluation of AssignmentExpression.
 * 2. Let propName be ? GetValue(exprValue).
 * 3. Return ? ToPropertyKey(propName).
 * 
 * 13.2.5.5 Runtime Semantics: PropertyDefinitionEvaluation
 * 
 * The syntax-directed operation PropertyDefinitionEvaluation takes
 * argument object (an Object) and returns either a normal completion
 * containing unused or an abrupt completion. It is defined piecewise
 * over the following productions:
 * 
 * PropertyDefinitionList : PropertyDefinitionList , PropertyDefinition
 * 1. Perform ? PropertyDefinitionEvaluation of PropertyDefinitionList
 *    with argument object.
 * 2. Perform ? PropertyDefinitionEvaluation of PropertyDefinition
 *    with argument object.
 * 3. Return unused.
 * 
 * PropertyDefinition : ... AssignmentExpression
 * 1. Let exprValue be ? Evaluation of AssignmentExpression.
 * 2. Let fromValue be ? GetValue(exprValue).
 * 3. Let excludedNames be a new empty List.
 * 4. Perform ? CopyDataProperties(object, fromValue, excludedNames).
 * 5. Return unused.
 * 
 * PropertyDefinition : IdentifierReference
 * 1. Let propName be StringValue of IdentifierReference.
 * 2. Let exprValue be ? Evaluation of IdentifierReference.
 * 3. Let propValue be ? GetValue(exprValue).
 * 4. Assert: object is an ordinary, extensible object with no
 *    non-configurable properties.
 * 5. Perform ! CreateDataPropertyOrThrow(object, propName, propValue).
 * 6. Return unused.
 * 
 * PropertyDefinition : PropertyName : AssignmentExpression
 * 1. Let propKey be ? Evaluation of PropertyName.
 * 2. If this PropertyDefinition is contained within a Script that is
 *    being evaluated for JSON.parse (see step 7 of JSON.parse), then
 *     a. Let isProtoSetter be false.
 * 3. Else if propKey is "__proto__" and IsComputedPropertyKey of
 *    PropertyName is false, then
 *     a. Let isProtoSetter be true.
 * 4. Else,
 *     a. Let isProtoSetter be false.
 * 5. If IsAnonymousFunctionDefinition(AssignmentExpression) is true
 *    and isProtoSetter is false, then
 *     a. Let propValue be ? NamedEvaluation of AssignmentExpression
 *     with argument propKey.
 * 6. Else,
 *     a. Let exprValueRef be ? Evaluation of AssignmentExpression.
 *     b. Let propValue be ? GetValue(exprValueRef).
 * 7. If isProtoSetter is true, then
 *     a. If propValue is an Object or propValue is null, then
 *         i. Perform ! object.[[SetPrototypeOf]](propValue).
 *     b. Return unused.
 * 8. Assert: object is an ordinary, extensible object with no
 *    non-configurable properties.
 * 9. Perform ! CreateDataPropertyOrThrow(object, propKey, propValue).
 * 10. Return unused.
 * 
 * PropertyDefinition : MethodDefinition
 * 1. Perform ? MethodDefinitionEvaluation of MethodDefinition (15.4.5)
 *    with arguments object and true.
 * 2. Return unused.
 */
export function* Evaluation_ObjectExpression($: VM, n: ESTree.ObjectExpression): ECR<Obj> {
  const obj = OrdinaryObjectCreate({Prototype: $.getIntrinsic('%Object.prototype%')});
  for (const prop of n.properties) {
    if (prop.type === 'Property') {
      // Property includes computed, short-hand, etc
      const key = yield* EvaluatePropertyKey($, prop);
      Assert(!(key instanceof PrivateName));
      if (IsAbrupt(key)) return key;
      const isProtoSetter = !prop.computed && key === '__proto__' && !$.isJsonParse();
      const namedEval =
        !prop.computed && IsAnonymousFunctionDefinition(prop.value) && !isProtoSetter;
      const propValue = yield* (
        namedEval ?
          $.NamedEvaluation(prop.value, key as string) :
          $.evaluateValue(prop.value));
      if (IsAbrupt(propValue)) return propValue;
      if (prop.method || prop.kind === 'get' || prop.kind === 'set') {
        Assert(IsFunc(propValue));
        propValue.SourceText = GetSourceText(prop); // fix source text
        if (prop.kind === 'get') {
          SetFunctionName(propValue, methodName(key), 'get');
          Assert(!propValue.FormalParameters?.length);
          const desc = obj.OwnProps.get(key);
          if (IsAccessorDescriptor(desc)) {
            obj.OwnProps.set(key, {...desc, Get: propValue});
          } else {
            obj.OwnProps.set(key, {Get: propValue, Enumerable: true, Configurable: true});
          }
          continue;
        } else if (prop.kind === 'set') {
          SetFunctionName(propValue, methodName(key), 'set');
          Assert(propValue.FormalParameters!.length === 1);
          const desc = obj.OwnProps.get(key);
          if (IsAccessorDescriptor(desc)) {
            obj.OwnProps.set(key, {...desc, Set: propValue});
          } else {
            obj.OwnProps.set(key, {Set: propValue, Enumerable: true, Configurable: true});
          }
          continue;
        } else {
          SetFunctionName(propValue, methodName(key));
        }
      } else if (isProtoSetter) {
        if (propValue instanceof Obj || propValue === null) {
          CastNotAbrupt(obj.SetPrototypeOf($, propValue));
        }
        continue;
      }
      obj.OwnProps.set(key, propWEC(propValue));
    } else if (prop.type === 'SpreadElement') {
      // Spread element
      const fromValue = yield* $.evaluateValue(prop.argument);
      if (IsAbrupt(fromValue)) return fromValue;
      const result = yield* CopyDataProperties($, obj, fromValue);
      if (IsAbrupt(result)) return result;
    } else {
      throw new Error(`unknown property type: ${(prop as any).type}`);
    }
  }
  return obj;
}

/** Non-spec helper to normalize computed and literal property keys. */
export function* EvaluatePropertyKey($: VM, prop: PropertyLike|ESTree.MemberExpression): ECR<PropertyKey|PrivateName> {
  const key = prop.type === 'MemberExpression' ? prop.property : prop.key;
  if (prop.computed) {
    const result = yield* $.evaluateValue(key);
    if (IsAbrupt(result)) return result;
    return yield* ToPropertyKey($, result);
  }
  if (key.type === 'Identifier') {
    return key.name;
  } else if (key.type === 'Literal') {
    return String(key.value);
  } else if (key.type === 'PrivateIdentifier') {
    return ResolvePrivateIdentifier($.getRunningContext().PrivateEnvironment!, key.name);
  } else {
    throw new Error(`bad key type for non-computed property: ${key.type}`);
  }
}

// Superinterface of Map<PropertyKey, PropertyDescriptor>
// We add a guarantee that the keys iterate in the correct order
// (array indices first in numerical order, then string keys in
// order of creation, then symbols in order of creation)
export interface PropertyMap {
  set(key: PropertyKey, value: PropertyDescriptor): void;
  get(key: PropertyKey): PropertyDescriptor|undefined;
  has(key: PropertyKey): boolean;
  delete(key: PropertyKey): void;
  keys(): PropertyKey[];
  [Symbol.iterator](): IterableIterator<[PropertyKey, PropertyDescriptor]>;
}

class SimplePropertyMap implements PropertyMap {
  obj: Record<PropertyKey, PropertyDescriptor> = Object.create(null);
  set(key: PropertyKey, value: PropertyDescriptor) {
    this.obj[key] = value;
  }
  get(key: PropertyKey) {
    return this.obj[key];
  }
  has(key: PropertyKey) {
    return key in this.obj;
  }
  delete(key: PropertyKey) {
    delete this.obj[key];
  }
  keys() {
    return Reflect.ownKeys(this.obj);
  }
  [Symbol.iterator]() {
    type E = [PropertyKey, PropertyDescriptor];
    return Reflect.ownKeys(this.obj).map(k => [k, this.obj[k]] as E)[Symbol.iterator]();
  }
}

export function peekProp(o: Obj, key: PropertyKey): PropertyDescriptor|undefined {
  while (o) {
    const desc = o.OwnProps.get(key);
    if (desc) return desc;
    o = o.Prototype!;
  }
  return undefined;
}

export function peekCtorName(v: Obj): string|undefined {
  const ctor = peekProp(v, 'constructor')?.Value as unknown as Obj;
  const name = ctor instanceof Obj ? peekProp(ctor, 'name')?.Value : undefined;
  return typeof name === 'string' ? name : undefined;
}
