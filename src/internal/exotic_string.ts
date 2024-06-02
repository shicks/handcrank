import { IsArrayIndex, IsIntegralNumber } from './abstract_compare';
import { CanonicalNumericIndexString, ToIntegerOrInfinityInternal } from './abstract_conversion';
import { Assert } from './assert';
import { CR, CastNotAbrupt } from './completion_record';
import { IsCompatiblePropertyDescriptor, Obj, OrdinaryDefineOwnProperty, OrdinaryGetOwnProperty, OrdinaryObject } from './obj';
import { PropertyDescriptor, PropertyRecord, prop0, propE } from './property_descriptor';
import { memoize } from './slots';
import { PropertyKey } from './val';
import { VM } from './vm';


// abstract class CachedPropsExoticObject extends Obj {
//   cachedProps: Map<string, PropertyDesciptor>|undefined = undefined;

//   abstract buildOwnProps(): Map<string, PropertyDesciptor>;

//   get OwnProps(): Map<string, PropertyDesciptor> {
//     if (!this.cachedProps) {
//       this.cachedProps = this.buildOwnProps();
//     }
//     return this.cachedProps;
//   }
// }

  // // TODO - do we need this?!?
  // override buildOwnProps() {
  //   const str = this.StringData!;
  //   const props = new Map<string, PropertyDesciptor>()
  //   for (let i = 0; i < str.length; i++) {
  //     props.set(String(i), propE(str[i]));
  //   }
  //   props.set('length', prop0(str.length));
  //   return props;
  // }


// TODO - decouple this into a function???

/**
 * 10.4.3 String Exotic Objects
 *
 * A String object is an exotic object that encapsulates a String
 * value and exposes virtual integer-indexed data properties
 * corresponding to the individual code unit elements of the String
 * value. String exotic objects always have a data property named
 * "length" whose value is the length of the encapsulated String
 * value. Both the code unit data properties and the "length" property
 * are non-writable and non-configurable.
 *
 * An object is a String exotic object (or simply, a String object) if
 * its [[GetOwnProperty]], [[DefineOwnProperty]], and
 * [[OwnPropertyKeys]] internal methods use the following
 * implementations, and its other essential internal methods use the
 * definitions found in 10.1. These methods are installed in
 * StringCreate.
 *
 * String exotic objects have the same internal slots as ordinary
 * objects. They also have a [[StringData]] internal slot.
 */
export type StringExoticObject = InstanceType<ReturnType<typeof StringExoticObject>>;
const StringExoticObject = memoize(() => class StringExoticObject extends OrdinaryObject() {

  declare StringData: string;

  constructor(
    StringData: string,
    Prototype: Obj,
    slots: ObjectSlots,
    props: PropertyRecord,
  ) {
    super({Prototype, StringData, ...slots}, {length: prop0(StringData.length)});
  }

  /**
   * 10.4.3.1 [[GetOwnProperty]] ( P )
   *
   * The [[GetOwnProperty]] internal method of a String exotic object
   * S takes argument P (a property key) and returns a normal
   * completion containing either a Property Descriptor or
   * undefined. It performs the following steps when called:
   * 
   * 1. Let desc be OrdinaryGetOwnProperty(S, P).
   * 2. If desc is not undefined, return desc.
   * 3. Return StringGetOwnProperty(S, P).
   */
  override GetOwnProperty(_$: VM, P: PropertyKey): PropertyDescriptor | undefined {
    const desc = OrdinaryGetOwnProperty(this, P);
    if (desc != undefined) return desc;
    return StringGetOwnProperty(this, P);
  }

  /**
   * 10.4.3.2 [[DefineOwnProperty]] ( P, Desc )
   *
   * The [[DefineOwnProperty]] internal method of a String exotic
   * object S takes arguments P (a property key) and Desc (a Property
   * Descriptor) and returns a normal completion containing a
   * Boolean. It performs the following steps when called:
   * 
   * 1. Let stringDesc be StringGetOwnProperty(S, P).
   * 2. If stringDesc is not undefined, then
   *     a. Let extensible be S.[[Extensible]].
   *     b. Return IsCompatiblePropertyDescriptor(extensible, Desc, stringDesc).
   * 3. Return ! OrdinaryDefineOwnProperty(S, P, Desc).
   */
  override DefineOwnProperty($: VM, P: PropertyKey, Desc: PropertyDescriptor): boolean {
    const stringDesc = StringGetOwnProperty(this, P);
    if (stringDesc !== undefined) {
      const extensible = this.Extensible;
      return IsCompatiblePropertyDescriptor(extensible, Desc, stringDesc);
    }
    return CastNotAbrupt(OrdinaryDefineOwnProperty($, this, P, Desc));
  }

  /**
   * 10.4.3.3 [[OwnPropertyKeys]] ( )
   *
   * The [[OwnPropertyKeys]] internal method of a String exotic object
   * O takes no arguments and returns a normal completion containing a
   * List of property keys. It performs the following steps when
   * called:
   * 
   * 1. Let keys be a new empty List.
   * 2. Let str be O.[[StringData]].
   * 3. Assert: str is a String.
   * 4. Let len be the length of str.
   * 5. For each integer i such that 0 ≤ i < len, in ascending order, do
   *     a. Append ! ToString(𝔽(i)) to keys.
   * 6. For each own property key P of O such that P is an array index
   *    and ! ToIntegerOrInfinity(P) ≥ len, in ascending numeric index
   *    order, do
   *     a. Append P to keys.
   * 7. For each own property key P of O such that P is a String and P
   *    is not an array index, in ascending chronological order of
   *    property creation, do
   *     a. Append P to keys.
   * 8. For each own property key P of O such that P is a Symbol, in
   *    ascending chronological order of property creation, do
   *     a. Append P to keys.
   * 9. Return keys.
   */
  override OwnPropertyKeys(): CR<PropertyKey[]> {
    const keys: PropertyKey[] = [];
    const str = this.StringData;
    const len = str.length;
    for (let i = 0; i < len; i++) {
      keys.push(String(i));
    }
    for (const P of this.OwnProps.keys()) {
      if (IsArrayIndex(P) && Number(P) < len) continue;
      keys.push(P);
    }
    return keys;
  }
});

/**
 * 10.4.3.4 StringCreate ( value, prototype )
 *
 * The abstract operation StringCreate takes arguments value (a String) and prototype (an Object) and returns a String exotic object. It is used to specify the creation of new String exotic objects. It performs the following steps when called:
 * 
 * 1. Let S be MakeBasicObject(« [[Prototype]], [[Extensible]], [[StringData]] »).
 * 2. Set S.[[Prototype]] to prototype.
 * 3. Set S.[[StringData]] to value.
 * 4. Set S.[[GetOwnProperty]] as specified in 10.4.3.1.
 * 5. Set S.[[DefineOwnProperty]] as specified in 10.4.3.2.
 * 6. Set S.[[OwnPropertyKeys]] as specified in 10.4.3.3.
 * 7. Let length be the length of value.
 * 8. Perform ! DefinePropertyOrThrow(S, "length", PropertyDescriptor { [[Value]]: 𝔽(length), [[Writable]]: false, [[Enumerable]]: false, [[Configurable]]: false }).
 * 9. Return S.
 */
export function StringCreate(value: string, prototype: Obj): StringExoticObject {
  const S = new (StringExoticObject())(value, prototype, {
    Extensible: true, // TODO - is this correct?
  }, {
    length: prop0(value.length),
  });
  return S;
}

/**
 * 10.4.3.5 StringGetOwnProperty ( S, P )
 *
 * The abstract operation StringGetOwnProperty takes arguments S (an
 * Object that has a [[StringData]] internal slot) and P (a property
 * key) and returns a Property Descriptor or undefined. It performs
 * the following steps when called:
 * 
 * 1. If P is not a String, return undefined.
 * 2. Let index be CanonicalNumericIndexString(P).
 * 3. If index is undefined, return undefined.
 * 4. If IsIntegralNumber(index) is false, return undefined.
 * 5. If index is -0𝔽, return undefined.
 * 6. Let str be S.[[StringData]].
 * 7. Assert: str is a String.
 * 8. Let len be the length of str.
 * 9. If ℝ(index) < 0 or len ≤ ℝ(index), return undefined.
 * 10. Let resultStr be the substring of str from ℝ(index) to ℝ(index) + 1.
 * 11. Return the PropertyDescriptor { [[Value]]: resultStr, [[Writable]]: false, [[Enumerable]]: true, [[Configurable]]: false }.
 */
function StringGetOwnProperty(S: Obj, P: PropertyKey): PropertyDescriptor | undefined {
  if (typeof P !== 'string') return undefined;
  const index = CanonicalNumericIndexString(P);
  if (index == undefined) return undefined;
  if (!IsIntegralNumber(index)) return undefined;
  if (Object.is(index, -0)) return undefined;
  const str = S.StringData;
  Assert(typeof str === 'string');
  const len = str.length;
  if (index < 0 || len <= index) return undefined;
  const resultStr = str[index];
  return propE(resultStr);
}
