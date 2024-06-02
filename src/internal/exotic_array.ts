import { IsArray, IsArrayIndex, IsConstructor, IsIntegralNumber, SameValue, SameValueZero } from './abstract_compare';
import { CanonicalNumericIndexString, ToIntegerOrInfinityInternal, ToNumber, ToUint32 } from './abstract_conversion';
import { Construct, Get } from './abstract_object';
import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { IsCompatiblePropertyDescriptor, Obj, OrdinaryDefineOwnProperty, OrdinaryGetOwnProperty, OrdinaryObject } from './obj';
import { HasValueField, IsDataDescriptor, PropertyDescriptor, PropertyRecord, prop0, propE } from './property_descriptor';
import { memoize } from './slots';
import { PropertyKey, Val } from './val';
import { VM, run } from './vm';

/**
 * 10.4.2 Array Exotic Objects
 * 
 * An Array is an exotic object that gives special treatment to array
 * index property keys (see 6.1.7). A property whose property name is
 * an array index is also called an element. Every Array has a
 * non-configurable "length" property whose value is always a
 * non-negative integral Number whose mathematical value is strictly
 * less than 232. The value of the "length" property is numerically
 * greater than the name of every own property whose name is an array
 * index; whenever an own property of an Array is created or changed,
 * other properties are adjusted as necessary to maintain this
 * invariant. Specifically, whenever an own property is added whose
 * name is an array index, the value of the "length" property is
 * changed, if necessary, to be one more than the numeric value of
 * that array index; and whenever the value of the "length" property
 * is changed, every own property whose name is an array index whose
 * value is not smaller than the new length is deleted. This
 * constraint applies only to own properties of an Array and is
 * unaffected by "length" or array index properties that may be
 * inherited from its prototypes.
 * 
 * NOTE: A String property name P is an array index if and only if
 * ToString(ToUint32(P)) is P and ToUint32(P) is not 𝔽(232 - 1).
 * 
 * An object is an Array exotic object (or simply, an Array) if its
 * [[DefineOwnProperty]] internal method uses the following
 * implementation, and its other essential internal methods use the
 * definitions found in 10.1. These methods are installed in
 * ArrayCreate.
 */
export type ArrayExoticObject = InstanceType<ReturnType<typeof ArrayExoticObject>>;
export const ArrayExoticObject = memoize(() => class ArrayExoticObject extends OrdinaryObject() {

  /**
   * 10.4.2.1 [[DefineOwnProperty]] ( P, Desc )
   * 
   * The [[DefineOwnProperty]] internal method of an Array exotic
   * object A takes arguments P (a property key) and Desc (a Property
   * Descriptor) and returns either a normal completion containing a
   * Boolean or a throw completion. It performs the following steps
   * when called:
   * 
   * 1. If P is "length", then
   *     a. Return ? ArraySetLength(A, Desc).
   * 2. Else if P is an array index, then
   *     a. Let lengthDesc be OrdinaryGetOwnProperty(A, "length").
   *     b. Assert: IsDataDescriptor(lengthDesc) is true.
   *     c. Assert: lengthDesc.[[Configurable]] is false.
   *     d. Let length be lengthDesc.[[Value]].
   *     e. Assert: length is a non-negative integral Number.
   *     f. Let index be ! ToUint32(P).
   *     g. If index ≥ length and lengthDesc.[[Writable]] is false, return false.
   *     h. Let succeeded be ! OrdinaryDefineOwnProperty(A, P, Desc).
   *     i. If succeeded is false, return false.
   *     j. If index ≥ length, then
   *         i. Set lengthDesc.[[Value]] to index + 1𝔽.
   *         ii. Set succeeded to ! OrdinaryDefineOwnProperty(A, "length", lengthDesc).
   *         iii. Assert: succeeded is true.
   *     k. Return true.
   * 3. Return ? OrdinaryDefineOwnProperty(A, P, Desc).
   */
  override DefineOwnProperty($: VM, P: PropertyKey, Desc: PropertyDescriptor): CR<boolean> {
    if (P === 'length') return ArraySetLength($, this, Desc);
    if (IsArrayIndex(P)) {
      const lengthDesc = OrdinaryGetOwnProperty(this, 'length');
      Assert(lengthDesc != undefined);
      Assert(!lengthDesc.Configurable);
      const length = lengthDesc.Value;
      Assert(typeof length === 'number' && IsIntegralNumber(length) && length >= 0);
      const index = (P as any) >>> 0;
      if (index >= length && lengthDesc.Writable === false) return false;
      const succeeded = CastNotAbrupt(OrdinaryDefineOwnProperty($, this, P, Desc));
      if (!succeeded) return false;
      if (index >= length) {
        // TODO - we could probably just update the object in place, but I worry
        // about if any refs to it might be shared elsewhere?  It's safer to
        // just copy the whole thing.
        const newLengthDesc = {...lengthDesc, Value: index + 1};
        const succeeded = OrdinaryDefineOwnProperty($, this, 'length', newLengthDesc);
        Assert(succeeded);
      }
      return true;
    }
    return OrdinaryDefineOwnProperty($, this, P, Desc);
  }
});


/** 
 * 10.4.2.2 ArrayCreate ( length [ , proto ] )
 * 
 * The abstract operation ArrayCreate takes argument length (a
 * non-negative integer) and optional argument proto (an Object) and
 * returns either a normal completion containing an Array exotic
 * object or a throw completion. It is used to specify the creation of
 * new Arrays. It performs the following steps when called:
 * 
 * 1. If length > 232 - 1, throw a RangeError exception.
 * 2. If proto is not present, set proto to %Array.prototype%.
 * 3. Let A be MakeBasicObject(« [[Prototype]], [[Extensible]] »).
 * 4. Set A.[[Prototype]] to proto.
 * 5. Set A.[[DefineOwnProperty]] as specified in 10.4.2.1.
 * 6. Perform ! OrdinaryDefineOwnProperty(A, "length",
 *    PropertyDescriptor { [[Value]]: 𝔽(length), [[Writable]]: true,
 *    [[Enumerable]]: false, [[Configurable]]: false }).
 * 7. Return A.
 */
export function ArrayCreate($: VM, length: number, proto?: Obj): CR<ArrayExoticObject> {
  if (length > 0xFFFFFFFF) return $.throw('RangeError', 'Invalid array length');
  if (!proto) proto = $.getIntrinsic('%Array.prototype%');
  return new (ArrayExoticObject())({
    Prototype: proto,
  }, {
    'length': {
      Value: length,
      Writable: true,
      Enumerable: false,
      Configurable: false,
    }
  });
}

/** 
 * 10.4.2.3 ArraySpeciesCreate ( originalArray, length )
 * 
 * The abstract operation ArraySpeciesCreate takes arguments
 * originalArray (an Object) and length (a non-negative integer) and
 * returns either a normal completion containing an Object or a throw
 * completion. It is used to specify the creation of a new Array or
 * similar object using a constructor function that is derived from
 * originalArray. It does not enforce that the constructor function
 * returns an Array. It performs the following steps when called:
 * 
 * 1. Let isArray be ? IsArray(originalArray).
 * 2. If isArray is false, return ? ArrayCreate(length).
 * 3. Let C be ? Get(originalArray, "constructor").
 * 4. If IsConstructor(C) is true, then
 *     a. Let thisRealm be the current Realm Record.
 *     b. Let realmC be ? GetFunctionRealm(C).
 *     c. If thisRealm and realmC are not the same Realm Record, then
 *         i. If SameValue(C, realmC.[[Intrinsics]].[[%Array%]]) is
 *            true, set C to undefined.
 * 5. If C is an Object, then
 *     a. Set C to ? Get(C, @@species).
 *     b. If C is null, set C to undefined.
 * 6. If C is undefined, return ? ArrayCreate(length).
 * 7. If IsConstructor(C) is false, throw a TypeError exception.
 * 8. Return ? Construct(C, « 𝔽(length) »).
 * 
 * NOTE: If originalArray was created using the standard built-in
 * Array constructor for a realm that is not the realm of the running
 * execution context, then a new Array is created using the realm of
 * the running execution context. This maintains compatibility with
 * Web browsers that have historically had that behaviour for the
 * Array.prototype methods that now are defined using
 * ArraySpeciesCreate.
 */
function* ArraySpeciesCreate($: VM, originalArray: Obj, length: number): CR<Obj> {
  const isArray = IsArray($, originalArray);
  if (IsAbrupt(isArray)) return isArray;
  if (!isArray) return ArrayCreate($, length);
  let C = yield* Get($, originalArray, 'constructor');
  if (IsAbrupt(C)) return C;
  if (IsConstructor(C)) {
    const thisRealm = $.getRealm();
    const realmC = C.Realm;
    if (thisRealm !== realmC) {
      if (SameValue(C, realmC.Intrinsics.get('%Array%'))) {
        C = undefined;
      }
    }
  }
  if (C instanceof Obj) {
    C = yield* Get($, C, Symbol.species);
    if (IsAbrupt(C)) return C;
  }
  Assert(!IsAbrupt(C));
  if (C == null) return ArrayCreate($, length);
  if (!IsConstructor(C)) return $.throw('TypeError', 'Invalid constructor');
  return yield* Construct($, C, [length]);
}

/** 
 * 10.4.2.4 ArraySetLength ( A, Desc )
 * 
 * The abstract operation ArraySetLength takes arguments A (an Array)
 * and Desc (a Property Descriptor) and returns either a normal
 * completion containing a Boolean or a throw completion. It performs
 * the following steps when called:
 * 
 * 1. If Desc does not have a [[Value]] field, then
 *     a. Return ! OrdinaryDefineOwnProperty(A, "length", Desc).
 * 2. Let newLenDesc be a copy of Desc.
 * 3. Let newLen be ? ToUint32(Desc.[[Value]]).
 * 4. Let numberLen be ? ToNumber(Desc.[[Value]]).
 * 5. If SameValueZero(newLen, numberLen) is false, throw a RangeError exception.
 * 6. Set newLenDesc.[[Value]] to newLen.
 * 7. Let oldLenDesc be OrdinaryGetOwnProperty(A, "length").
 * 8. Assert: IsDataDescriptor(oldLenDesc) is true.
 * 9. Assert: oldLenDesc.[[Configurable]] is false.
 * 10. Let oldLen be oldLenDesc.[[Value]].
 * 11. If newLen ≥ oldLen, then
 *     a. Return ! OrdinaryDefineOwnProperty(A, "length", newLenDesc).
 * 12. If oldLenDesc.[[Writable]] is false, return false.
 * 13. If newLenDesc does not have a [[Writable]] field or
 *     newLenDesc.[[Writable]] is true, let newWritable be true.
 * 14. Else,
 *     a. NOTE: Setting the [[Writable]] attribute to false is
 *        deferred in case any elements cannot be deleted.
 *     b. Let newWritable be false.
 *     c. Set newLenDesc.[[Writable]] to true.
 * 15. Let succeeded be ! OrdinaryDefineOwnProperty(A, "length", newLenDesc).
 * 16. If succeeded is false, return false.
 * 17. For each own property key P of A such that P is an array index
 *     and ! ToUint32(P) ≥ newLen, in descending numeric index order, do
 *     a. Let deleteSucceeded be ! A.[[Delete]](P).
 *     b. If deleteSucceeded is false, then
 *         i. Set newLenDesc.[[Value]] to ! ToUint32(P) + 1𝔽.
 *         ii. If newWritable is false, set newLenDesc.[[Writable]] to false.
 *         iii. Perform ! OrdinaryDefineOwnProperty(A, "length", newLenDesc).
 *         iv. Return false.
 * 18. If newWritable is false, then
 *     a. Set succeeded to ! OrdinaryDefineOwnProperty(A, "length",
 *        PropertyDescriptor { [[Writable]]: false }).
 *     b. Assert: succeeded is true.
 * 19. Return true.
 * 
 * NOTE: In steps 3 and 4, if Desc.[[Value]] is an object then its
 * valueOf method is called twice. This is legacy behaviour that was
 * specified with this effect starting with the 2nd Edition of this
 * specification.
 */
function ArraySetLength($: VM, A: ArrayExoticObject, Desc: PropertyDescriptor): CR<boolean> {
  if (!HasValueField(Desc)) return OrdinaryDefineOwnProperty($, A, 'length', Desc);
  const newLenDesc = {...Desc};

  // TODO - DefinePropertyDescriptor -> generator???

  const newLen = run(ToUint32($, Desc.Value));
  if (IsAbrupt(newLen)) return newLen;
  const numberLen = run(ToNumber($, Desc.Value));
  if (!SameValueZero(newLen, numberLen)) return $.throw('RangeError', 'Invalid array length');
  newLenDesc.Value = newLen;
  const oldLenDesc = OrdinaryGetOwnProperty(A, 'length');
  Assert(IsDataDescriptor(oldLenDesc));
  Assert(!oldLenDesc.Configurable);
  const oldLen = oldLenDesc.Value;
  Assert(typeof oldLen === 'number');
  if (newLen >= oldLen) return CastNotAbrupt(OrdinaryDefineOwnProperty($, A, 'length', newLenDesc));
  if (!oldLenDesc.Writable) return false;
  let newWritable: boolean;
  if (!('Writable' in newLenDesc) || newLenDesc.Writable) {
    newWritable = true;
  } else {
    newWritable = false;
    newLenDesc.Writable = true;
  }
  const succeeded = OrdinaryDefineOwnProperty($, A, 'length', newLenDesc);
  if (!succeeded) return false;
  for (let i = oldLen - 1; i >= newLen; i--) {
    const P = CanonicalNumericIndexString(i);
    const deleteSucceeded = A.Delete(P);
    if (!deleteSucceeded) {
      newLenDesc.Value = i + 1;
      if (!newWritable) newLenDesc.Writable = false;
      const succeeded = OrdinaryDefineOwnProperty($, A, 'length', newLenDesc);
      if (!succeeded) return false;
    }
  }
  if (!newWritable) {
    const succeeded = OrdinaryDefineOwnProperty($, A, 'length', {Writable: false});
    Assert(succeeded);
  }
  return true;
}
