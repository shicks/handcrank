import { IsCallable } from './abstract_compare';
import { ToBoolean } from './abstract_conversion';
import { Get, HasProperty } from './abstract_object';
import { IsAbrupt } from './completion_record';
import { UNUSED } from './enums';
import { Obj, OrdinaryObjectCreate } from './obj';
import { slots } from './slots';
import { PropertyKey, Val } from './val';
import { ECR, VM } from './vm';

export type PropertyRecord = Record<PropertyKey, PropertyDescriptor>;

// TODO - we could make this a privately-constructable class
// if we really need to be able to distinguish it from other
// types.  But `PropertyDescriptor|Value` is already distinguishable
// with `instanceof Obj`, so it may still be fine as-is, and keeping
// it an interface should be more performant.

/**
 * 6.2.6 The Property Descriptor Specification Type
 *
 * The Property Descriptor type is used to explain the manipulation
 * and reification of Object property attributes. A Property
 * Descriptor is a Record with zero or more fields, where each
 * field's name is an attribute name and its value is a corresponding
 * attribute value as specified in 6.1.7.1. The schema name used
 * within this specification to tag literal descriptions of Property
 * Descriptor records is “PropertyDescriptor”.
 *
 * Property Descriptor values may be further classified as data
 * Property Descriptors and accessor Property Descriptors based upon
 * the existence or use of certain fields. A data Property Descriptor
 * is one that includes any fields named either [[Value]] or
 * [[Writable]]. An accessor Property Descriptor is one that includes
 * any fields named either [[Get]] or [[Set]]. Any Property Descriptor
 * may have fields named [[Enumerable]] and [[Configurable]]. A
 * Property Descriptor value may not be both a data Property
 * Descriptor and an accessor Property Descriptor; however, it may be
 * neither (in which case it is a generic Property Descriptor). A
 * fully populated Property Descriptor is one that is either an
 * accessor Property Descriptor or a data Property Descriptor and that
 * has all of the corresponding fields defined in Table 3.
 */
export interface PropertyDescriptor {
  Enumerable?: boolean;
  Configurable?: boolean;
  Writable?: boolean;
  Value?: Val;
  Get?: Obj;
  Set?: Obj;
}
const PropertyDescriptorSlots = slots({Value: true});

interface DataDescriptor extends PropertyDescriptor {
  Get?: undefined;
  Set?: undefined;
}
interface AccessorDescriptor extends PropertyDescriptor {
  Writable?: undefined;
  Value?: undefined;
}

/**
 * 6.2.6.1 IsAccessorDescriptor ( Desc )
 *
 * The abstract operation IsAccessorDescriptor takes argument Desc (a
 * Property Descriptor or undefined) and returns a Boolean. It
 * performs the following steps when called:
 */
export function IsAccessorDescriptor(
  Desc: PropertyDescriptor|undefined,
): Desc is AccessorDescriptor {
  return Boolean(Desc && (Desc.Get || Desc.Set));
}

export function HasValueField(Desc: PropertyDescriptor): boolean {
  return PropertyDescriptorSlots.Value in Desc;
}

/**
 * 6.2.6.2 IsDataDescriptor ( Desc )
 *
 * The abstract operation IsDataDescriptor takes argument Desc (a
 * Property Descriptor or undefined) and returns a Boolean. It
 * performs the following steps when called:
 */
export function IsDataDescriptor(Desc: PropertyDescriptor|undefined): Desc is DataDescriptor {
  return Boolean(Desc && (HasValueField(Desc) || Desc.Writable != null));
}

/**
 * 6.2.6.3 IsGenericDescriptor ( Desc )
 *
 * The abstract operation IsGenericDescriptor takes argument Desc (a
 * Property Descriptor or undefined) and returns a Boolean. It
 * performs the following steps when called:
 */
export function IsGenericDescriptor(Desc: PropertyDescriptor|undefined): boolean {
  return Boolean(Desc && !IsAccessorDescriptor(Desc) && !IsDataDescriptor(Desc));
}

/**
 * 6.2.6.4 FromPropertyDescriptor ( Desc )
 *
 * The abstract operation FromPropertyDescriptor takes argument Desc
 * (a Property Descriptor or undefined) and returns an Object or
 * undefined. It performs the following steps when called:
 * 
 * 1. If Desc is undefined, return undefined.
 * 2. Let obj be OrdinaryObjectCreate(%Object.prototype%).
 * 3. Assert: obj is an extensible ordinary object with no own properties.
 * 4. If Desc has a [[Value]] field, then
 * a. Perform ! CreateDataPropertyOrThrow(obj, "value", Desc.[[Value]]).
 * 5. If Desc has a [[Writable]] field, then
 * a. Perform ! CreateDataPropertyOrThrow(obj, "writable", Desc.[[Writable]]).
 * 6. If Desc has a [[Get]] field, then
 * a. Perform ! CreateDataPropertyOrThrow(obj, "get", Desc.[[Get]]).
 * 7. If Desc has a [[Set]] field, then
 * a. Perform ! CreateDataPropertyOrThrow(obj, "set", Desc.[[Set]]).
 * 8. If Desc has an [[Enumerable]] field, then
 * a. Perform ! CreateDataPropertyOrThrow(obj, "enumerable", Desc.[[Enumerable]]).
 * 9. If Desc has a [[Configurable]] field, then
 * a. Perform ! CreateDataPropertyOrThrow(obj, "configurable", Desc.[[Configurable]]).
 * 10. Return obj.
 */
export function FromPropertyDescriptor(
  $: VM,
  Desc: PropertyDescriptor|undefined,
): Obj|undefined {
  if (Desc == null) return Desc;
  const props: PropertyRecord = {};
  if (PropertyDescriptorSlots.Value in Desc) props.Value = propWEC(Desc.Value);
  if (Desc.Writable != null) props.Writable = propWEC(Desc.Writable);
  if (Desc.Get != null) props.Get = propWEC(Desc.Get);
  if (Desc.Set != null) props.Set = propWEC(Desc.Set);
  if (Desc.Enumerable != null) props.Enumerable = propWEC(Desc.Enumerable);
  if (Desc.Configurable != null) props.Configurable = propWEC(Desc.Configurable);
  return OrdinaryObjectCreate({Prototype: $.getIntrinsic('%Object.prototype%')}, props);
}

/**
 * 6.2.6.5 ToPropertyDescriptor ( Obj )
 *
 * The abstract operation ToPropertyDescriptor takes argument Obj (an
 * ECMAScript language value) and returns either a normal completion
 * containing a Property Descriptor or a throw completion. It performs
 * the following steps when called:
 */
export function* ToPropertyDescriptor($: VM, obj: Val): ECR<PropertyDescriptor> {
  if (!(obj instanceof Obj)) return $.throw('TypeError');
  const desc: PropertyDescriptor = {};
  const hasEnumerable = HasProperty($, obj, 'enumerable');
  if (IsAbrupt(hasEnumerable)) return hasEnumerable;
  if (hasEnumerable) {
    const enumerable = yield* Get($, obj, 'enumerable');
    if (IsAbrupt(enumerable)) return enumerable;
    desc.Enumerable = ToBoolean(enumerable);
  }
  const hasConfigurable = HasProperty($, obj, 'configurable');
  if (IsAbrupt(hasConfigurable)) return hasConfigurable;
  if (hasConfigurable) {
    const configurable = yield* Get($, obj, 'configurable');
    if (IsAbrupt(configurable)) return configurable;
    desc.Configurable = ToBoolean(configurable);
  }
  const hasValue = HasProperty($, obj, 'value');
  if (IsAbrupt(hasValue)) return hasValue;
  if (hasValue) {
    const value = yield* Get($, obj, 'value');
    if (IsAbrupt(value)) return value;
    desc.Value = value;
  }
  const hasWritable = HasProperty($, obj, 'writable');
  if (IsAbrupt(hasWritable)) return hasWritable;
  if (hasWritable) {
    const writable = yield* Get($, obj, 'writable');
    if (IsAbrupt(writable)) return writable;
    desc.Writable = ToBoolean(writable);
  }
  const hasGet = HasProperty($, obj, 'get');
  if (IsAbrupt(hasGet)) return hasGet;
  if (hasGet) {
    const getter = yield* Get($, obj, 'get');
    if (IsAbrupt(getter)) return getter;
    if (!IsCallable(getter) && getter != undefined) return $.throw('TypeError');
    desc.Get = getter as Obj;
  }
  const hasSet = HasProperty($, obj, 'set');
  if (IsAbrupt(hasSet)) return hasSet;
  if (hasSet) {
    const setter = yield* Get($, obj, 'set');
    if (IsAbrupt(setter)) return setter;
    if (!IsCallable(setter) && setter != undefined) return $.throw('TypeError');
    desc.Set = setter as Obj;
  }
  if ((desc.Get || desc.Set) && (desc.Value || desc.Writable)) return $.throw('TypeError');
  return desc;
}

/**
 * 6.2.6.6 CompletePropertyDescriptor ( Desc )
 *
 * The abstract operation CompletePropertyDescriptor takes argument
 * Desc (a Property Descriptor) and returns unused. It performs the
 * following steps when called:
 */
export function CompletePropertyDescriptor(_$: VM, Desc: PropertyDescriptor): UNUSED {
  if (IsGenericDescriptor(Desc) || IsDataDescriptor(Desc)) {
    if (!Desc.Value) Desc.Value = undefined;
    if (!Desc.Writable) Desc.Writable = false;
  } else {
    if (!Desc.Get) Desc.Get = undefined;
    if (!Desc.Set) Desc.Set = undefined;
  }
  if (!Desc.Enumerable) Desc.Enumerable = false;
  if (!Desc.Configurable) Desc.Configurable = false;
  return UNUSED;
}

/** Returns a writabe, enumerable, and configurable property descriptor. */
export function propWEC(v: Val): PropertyDescriptor {
  return {
    Value: v,
    Writable: true,
    Enumerable: true,
    Configurable: true,
  };
}

/** Returns a writabe and configurable property descriptor. */
export function propWC(v: Val): PropertyDescriptor {
  return {
    Value: v,
    Writable: true,
    Enumerable: false,
    Configurable: true,
  };
}

/** Returns configurable but not writable property descriptor. */
export function propC(v: Val): PropertyDescriptor {
  return {
    Value: v,
    Writable: false,
    Enumerable: false,
    Configurable: true,
  };
}

/** Returns frozen enumerable property descriptor. */
export function propE(v: Val): PropertyDescriptor {
  return {
    Value: v,
    Writable: false,
    Enumerable: true,
    Configurable: false,
  };
}

/** Returns configurable but not writable property descriptor. */
export function propW(v: Val): PropertyDescriptor {
  return {
    Value: v,
    Writable: true,
    Enumerable: false,
    Configurable: false,
  };
}

/** Returns a non-enumerable frozen property descriptor. */
export function prop0(v: Val): PropertyDescriptor {
  return {
    Value: v,
    Writable: false,
    Enumerable: false,
    Configurable: false,
  };
}

export function methodName(k: PropertyKey): string {
  return typeof k === 'symbol' ? `[${k.description}]` : k
}
