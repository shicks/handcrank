import { Assert } from './assert';
import { CR, IsAbrupt, Throw } from './completion_record';
import { UNUSED } from './enums';
import { RecordFor, makeRecord } from './record';
import { IsUndefined, Obj, UNDEFINED, Val, Void } from './values';
import { VM } from './vm';

declare const OrdinaryCreateObject: any;
declare const OBJECT_PROTOTYPE: any;
declare const CreateDataPropertyOrThrow: any;
declare const HasProperty: any;
declare const Get: any;
declare const Set: any;
declare const ToBoolean: any;
declare const IsCallable: any;

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
export interface PropertyDescriptor extends RecordFor<{
  Enumerable?: boolean;
  Configurable?: boolean;
  Writable?: boolean
  Value?: Val;
  Get?: Obj|Void;
  Set?: Obj|Void;
}> {}
export const PropertyDescriptor = makeRecord<PropertyDescriptor>('PropertyDescriptor');

/**
 * 6.2.6.1 IsAccessorDescriptor ( Desc )
 *
 * The abstract operation IsAccessorDescriptor takes argument Desc (a
 * Property Descriptor or undefined) and returns a Boolean. It
 * performs the following steps when called:
 */
export function IsAccessorDescriptor(Desc: PropertyDescriptor|undefined): boolean {
  return Boolean(Desc && (Desc.Get || Desc.Set));
}

/**
 * 6.2.6.2 IsDataDescriptor ( Desc )
 *
 * The abstract operation IsDataDescriptor takes argument Desc (a
 * Property Descriptor or undefined) and returns a Boolean. It
 * performs the following steps when called:
 */
export function IsDataDescriptor(Desc: PropertyDescriptor|undefined): boolean {
  return Boolean(Desc && (Desc.Value != null || Desc.Writable != null));
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
 */
export function FromPropertyDescriptor($: VM, Desc: PropertyDescriptor|undefined): Obj|undefined {
  if (Desc == null) return Desc;
  const obj = OrdinaryCreateObject($, OBJECT_PROTOTYPE); // ???? $.Get('Object.prototype') ???
  Assert(obj.IsExtensible() && obj.IsOrdinary() && obj.OwnPropertyKeys().length === 0);
  if (Desc.Value != null) {
    Assert(!IsAbrupt(CreateDataPropertyOrThrow($, obj, 'value', Desc.Value)));
  }
  if (Desc.Writable != null) {
    Assert(!IsAbrupt(CreateDataPropertyOrThrow($, obj, 'writable', Desc.Writable)));
  }
  if (Desc.Get != null) {
    Assert(!IsAbrupt(CreateDataPropertyOrThrow($, obj, 'get', Desc.Get)));
  }
  if (Desc.Set != null) {
    Assert(!IsAbrupt(CreateDataPropertyOrThrow($, obj, 'set', Desc.Set)));
  }
  if (Desc.Enumerable != null) {
    Assert(!IsAbrupt(CreateDataPropertyOrThrow($, obj, 'enumerable', Desc.Enumerable)));
  }
  if (Desc.Configurable != null) {
    Assert(!IsAbrupt(CreateDataPropertyOrThrow($, obj, 'configurable', Desc.Configurable)));
  }
  return obj;
}

/**
 * 6.2.6.5 ToPropertyDescriptor ( Obj )
 *
 * The abstract operation ToPropertyDescriptor takes argument Obj (an
 * ECMAScript language value) and returns either a normal completion
 * containing a Property Descriptor or a throw completion. It performs
 * the following steps when called:
 */
export function ToPropertyDescriptor($: VM, obj: Val): CR<PropertyDescriptor> {
  if (!(obj instanceof Obj)) return Throw('TypeError');
  const desc = PropertyDescriptor({});
  const hasEnumerable = HasProperty($, obj, 'enumerable');
  if (IsAbrupt(hasEnumerable)) return hasEnumerable;
  if (hasEnumerable) {
    const enumerable = Get($, obj, 'enumerable');
    if (IsAbrupt(enumerable)) return enumerable;
    desc.Enumerable = ToBoolean($, enumerable);
  }
  const hasConfigurable = HasProperty($, obj, 'configurable');
  if (IsAbrupt(hasConfigurable)) return hasConfigurable;
  if (hasConfigurable) {
    const configurable = Get($, obj, 'configurable');
    if (IsAbrupt(configurable)) return configurable;
    desc.Configurable = ToBoolean($, configurable);
  }
  const hasValue = HasProperty($, obj, 'value');
  if (IsAbrupt(hasValue)) return hasValue;
  if (hasValue) {
    const value = Get($, obj, 'value');
    if (IsAbrupt(value)) return value;
    desc.Value = value;
  }
  const hasWritable = HasProperty($, obj, 'writable');
  if (IsAbrupt(hasWritable)) return hasWritable;
  if (hasWritable) {
    const writable = Get($, obj, 'writable');
    if (IsAbrupt(writable)) return writable;
    desc.Writable = ToBoolean($, writable);
  }
  const hasGet = HasProperty($, obj, 'get');
  if (IsAbrupt(hasGet)) return hasGet;
  if (hasGet) {
    const getter = Get($, obj, 'get');
    if (IsAbrupt(getter)) return getter;
    if (!IsCallable(getter) && !IsUndefined(getter)) return Throw('TypeError');
    desc.Get = getter;
  }
  const hasSet = HasProperty($, obj, 'set');
  if (IsAbrupt(hasSet)) return hasSet;
  if (hasSet) {
    const setter = Set($, obj, 'set');
    if (IsAbrupt(setter)) return setter;
    if (!IsCallable(setter) && !IsUndefined(setter)) return Throw('TypeError');
    desc.Set = setter;
  }
  if (desc.Get || desc.Set) {
    if (desc.Value || desc.Writable) return Throw('TypeError');
  }
  return desc;
}

/**
 * 6.2.6.6 CompletePropertyDescriptor ( Desc )
 *
 * The abstract operation CompletePropertyDescriptor takes argument
 * Desc (a Property Descriptor) and returns unused. It performs the
 * following steps when called:
 */
export function CompletePropertyDescriptor($: VM, Desc: PropertyDescriptor): UNUSED {
  if (IsGenericDescriptor(Desc) || IsDataDescriptor(Desc)) {
    if (!Desc.Value) Desc.Value = UNDEFINED;
    if (!Desc.Writable) Desc.Writable = false;
  } else {
    if (!Desc.Get) Desc.Get = UNDEFINED;
    if (!Desc.Set) Desc.Set = UNDEFINED;
  }
  if (!Desc.Enumerable) Desc.Enumerable = false;
  if (!Desc.Configurable) Desc.Configurable = false;
  return UNUSED;
}
