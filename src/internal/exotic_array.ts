import { IsArray, IsArrayIndex, IsCallable, IsConstructor, IsIntegralNumber, SameValue, SameValueZero } from './abstract_compare';
import { ToNumber, ToObject, ToUint32 } from './abstract_conversion';
import { Call, Construct, CreateDataPropertyOrThrow, Get, GetMethod, LengthOfArrayLike, Set } from './abstract_object';
import { Assert } from './assert';
import { Abrupt, CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { CreateBuiltinFunction, callOrConstruct, method } from './func';
import { objectAndFunctionPrototype } from './fundamental';
import { GetPrototypeFromConstructor, Obj, OrdinaryDefineOwnProperty, OrdinaryGetOwnProperty, OrdinaryObject } from './obj';
import { HasValueField, IsDataDescriptor, PropertyDescriptor, prop0, propW, propWC, propWEC } from './property_descriptor';
import { RealmRecord, defineProperties } from './realm_record';
import { memoize } from './slots';
import { PropertyKey } from './val';
import { DebugString, ECR, Plugin, VM, run } from './vm';

declare const GetIteratorFromMethod: any;
declare const IteratorStep: any;
declare const IteratorClose: any;
declare const IteratorValue: any;

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
const {} = {ArraySpeciesCreate};
 function* ArraySpeciesCreate($: VM, originalArray: Obj, length: number): ECR<Obj> {
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

  // TODO - DefinePropertyDescriptor -> generator???
  debugger;

  const newLen = run(ToUint32($, Desc.Value));
  if (IsAbrupt(newLen)) return newLen;
  const numberLen = run(ToNumber($, Desc.Value));
  if (IsAbrupt(numberLen)) return numberLen;
  if (!SameValueZero(newLen, numberLen)) return $.throw('RangeError', 'Invalid array length');
  const newLenDesc = {...Desc, Value: newLen};
  const oldLenDesc = OrdinaryGetOwnProperty(A, 'length');
  Assert(IsDataDescriptor(oldLenDesc));
  Assert(!oldLenDesc.Configurable);
  const oldLen = oldLenDesc.Value;
  Assert(typeof oldLen === 'number');
  if (newLen >= oldLen) return CastNotAbrupt(OrdinaryDefineOwnProperty($, A, 'length', newLenDesc));
  if (!oldLenDesc.Writable) return false;
  const succeeded = CastNotAbrupt(OrdinaryDefineOwnProperty($, A, 'length', newLenDesc));
  if (!succeeded) return false;
  const toDelete = findKeysAbove(CastNotAbrupt(A.OwnPropertyKeys($)), newLen);
  while (toDelete.length) {
    const P = toDelete.pop()!;
    const deleteSucceeded = CastNotAbrupt(A.Delete($, P));
    if (!deleteSucceeded) {
      newLenDesc.Value = Number(P) + 1;
      return false;
    }
  }
  return true;
}

/**
 * 23.1.1 The Array Constructor
 *
 * The Array constructor:
 * 
 *   - is %Array%.
 *   - is the initial value of the "Array" property of the global object.
 *   - creates and initializes a new Array when called as a constructor.
 *   - also creates and initializes a new Array when called as a
 *     function rather than as a constructor. Thus the function call
 *     Array(…) is equivalent to the object creation expression new
 *     Array(…) with the same arguments.
 *   - is a function whose behaviour differs based upon the number and
 *     types of its arguments.
 *   - may be used as the value of an extends clause of a class
 *     definition. Subclass constructors that intend to inherit the
 *     exotic Array behaviour must include a super call to the Array
 *     constructor to initialize subclass instances that are Array
 *     exotic objects. However, most of the Array.prototype methods
 *     are generic methods that are not dependent upon their this
 *     value being an Array exotic object.
 *   - has a "length" property whose value is 1𝔽.
 */
export const arrayObject: Plugin = {
  id: 'arrayObject',
  deps: [objectAndFunctionPrototype],
  realm: {
    CreateIntrinsics(realm: RealmRecord, stagedGlobals: Map<string, PropertyDescriptor>) {
      
      /**
       * 23.1.3 Properties of the Array Prototype Object
       * 
       * The Array prototype object:
       *   - is %Array.prototype%.
       *   - is an Array exotic object and has the internal methods
       *     specified for such objects.
       *   - has a "length" property whose initial value is +0𝔽 and
       *     whose attributes are { [[Writable]]: true, [[Enumerable]]:
       *     false, [[Configurable]]: false }.
       *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
       * 
       * NOTE: The Array prototype object is specified to be an Array
       * exotic object to ensure compatibility with ECMAScript code
       * that was created prior to the ECMAScript 2015 specification.
       */
      const arrayPrototype = new (ArrayExoticObject())({
        Prototype: realm.Intrinsics.get('%Object.prototype%')!,
      }, {
        'length': propW(0),
      });
      realm.Intrinsics.set('%Array.prototype%', arrayPrototype);

      /**
       * 23.1.1.1 Array ( ...values )
       * 
       * This function performs the following steps when called:
       * 
       * 1. If NewTarget is undefined, let newTarget be the active
       *    function object; else let newTarget be NewTarget.
       * 2. Let proto be ? GetPrototypeFromConstructor(newTarget,
       *    "%Array.prototype%").
       * 3. Let numberOfArgs be the number of elements in values.
       * 4. If numberOfArgs = 0, then
       *     a. Return ! ArrayCreate(0, proto).
       * 5. Else if numberOfArgs = 1, then
       *     a. Let len be values[0].
       *     b. Let array be ! ArrayCreate(0, proto).
       *     c. If len is not a Number, then
       *         i. Perform ! CreateDataPropertyOrThrow(array, "0", len).
       *         ii. Let intLen be 1𝔽.
       *     d. Else,
       *         i. Let intLen be ! ToUint32(len).
       *         ii. If SameValueZero(intLen, len) is false, throw a
       *             RangeError exception.
       *     e. Perform ! Set(array, "length", intLen, true).
       *     f. Return array.
       * 6. Else,
       *     a. Assert: numberOfArgs ≥ 2.
       *     b. Let array be ? ArrayCreate(numberOfArgs, proto).
       *     c. Let k be 0.
       *     d. Repeat, while k < numberOfArgs,
       *         i. Let Pk be ! ToString(𝔽(k)).
       *         ii. Let itemK be values[k].
       *         iii. Perform ! CreateDataPropertyOrThrow(array, Pk, itemK).
       *         iv. Set k to k + 1.
       *     e. Assert: The mathematical value of array's "length"
       *        property is numberOfArgs.
       *     f. Return array.
       */
      const arrayCtor = CreateBuiltinFunction(
        callOrConstruct(function*($, values, NewTarget) {
          if (NewTarget == null) NewTarget = $.getActiveFunctionObject()!;
          const proto = yield* GetPrototypeFromConstructor($, NewTarget, '%Array.prototype%');
          if (IsAbrupt(proto)) return proto;
          const numberOfArgs = values.length;
          if (numberOfArgs === 0) return CastNotAbrupt(ArrayCreate($, 0, proto));

          if (numberOfArgs === 1) {
            const len = values[0];
            const array = CastNotAbrupt(ArrayCreate($, 0, proto));
            let intLen: number;
            if (typeof len !== 'number') {
              array.OwnProps.set('0', propWEC(len));
              intLen = 1;
            } else {
              intLen = len >>> 0;
              if (IsAbrupt(intLen)) return intLen;
              if (!SameValueZero(intLen, len)) {
                return $.throw('RangeError', 'Invalid array length');
              }
            }
            array.OwnProps.set('length', propW(intLen));
            return array;
          }

          const array = ArrayCreate($, numberOfArgs, proto);
          if (IsAbrupt(array)) return array;
          for (let k = 0; k < numberOfArgs; k++) {
            array.OwnProps.set(String(k), propWEC(values[k]));
          }
          array.OwnProps.set('length', propW(numberOfArgs));
          return array;
        }), 1, 'Array', realm, realm.Intrinsics.get('%Function.prototype%')!);
      arrayPrototype.OwnProps.set('constructor', propWC(arrayCtor));
      arrayCtor.OwnProps.set('prototype', prop0(arrayPrototype));
      realm.Intrinsics.set('%Array%', arrayCtor);
      stagedGlobals.set('Array', propWC(arrayCtor));

      defineProperties(realm, arrayCtor, {
        /**
         * 23.1.2.1 Array.from ( items [ , mapfn [ , thisArg ] ] )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let C be the this value.
         * 2. If mapfn is undefined, let mapping be false.
         * 3. Else,
         *     a. If IsCallable(mapfn) is false, throw a TypeError exception.
         *     b. Let mapping be true.
         * 4. Let usingIterator be ? GetMethod(items, @@iterator).
         * 5. If usingIterator is not undefined, then
         *     a. If IsConstructor(C) is true, then
         *         i. Let A be ? Construct(C).
         *     b. Else,
         *         i. Let A be ! ArrayCreate(0).
         *     c. Let iteratorRecord be ? GetIteratorFromMethod(items, usingIterator).
         *     d. Let k be 0.
         *     e. Repeat,
         *         i. If k ≥ 253 - 1, then
         *             1. Let error be ThrowCompletion(a newly created TypeError object).
         *             2. Return ? IteratorClose(iteratorRecord, error).
         *         ii. Let Pk be ! ToString(𝔽(k)).
         *         iii. Let next be ? IteratorStep(iteratorRecord).
         *         iv. If next is false, then
         *             1. Perform ? Set(A, "length", 𝔽(k), true).
         *             2. Return A.
         *         v. Let nextValue be ? IteratorValue(next).
         *         vi. If mapping is true, then
         *             1. Let mappedValue be Completion(Call(mapfn,
         *                thisArg, « nextValue, 𝔽(k) »)).
         *             2. IfAbruptCloseIterator(mappedValue, iteratorRecord).
         *         vii. Else, let mappedValue be nextValue.
         *         viii. Let defineStatus be
         *               Completion(CreateDataPropertyOrThrow(A, Pk,
         *               mappedValue)).
         *         ix. IfAbruptCloseIterator(defineStatus, iteratorRecord).
         *         x. Set k to k + 1.
         * 6. NOTE: items is not an Iterable so assume it is an array-like object.
         * 7. Let arrayLike be ! ToObject(items).
         * 8. Let len be ? LengthOfArrayLike(arrayLike).
         * 9. If IsConstructor(C) is true, then
         *     a. Let A be ? Construct(C, « 𝔽(len) »).
         * 10. Else,
         *     a. Let A be ? ArrayCreate(len).
         * 11. Let k be 0.
         * 12. Repeat, while k < len,
         *     a. Let Pk be ! ToString(𝔽(k)).
         *     b. Let kValue be ? Get(arrayLike, Pk).
         *     c. If mapping is true, then
         *         i. Let mappedValue be ? Call(mapfn, thisArg, « kValue, 𝔽(k) »).
         *     d. Else, let mappedValue be kValue.
         *     e. Perform ? CreateDataPropertyOrThrow(A, Pk, mappedValue).
         *     f. Set k to k + 1.
         * 13. Perform ? Set(A, "length", 𝔽(len), true).
         * 14. Return A.
         * 
         * NOTE: This method is an intentionally generic factory method;
         * it does not require that its this value be the Array
         * constructor. Therefore it can be transferred to or inherited
         * by any other constructors that may be called with a single numeric argument.
         */
        'from': method(function*($, thisValue, items, mapfn = undefined, thisArg = undefined) {
          const C = thisValue;
          const mapping = mapfn != null;
          if (mapping && !IsCallable(mapfn)) {
            return $.throw('TypeError', `${DebugString(mapfn)} is not a function`);
          }
          const usingIterator = yield* GetMethod($, items, Symbol.iterator);
          if (usingIterator != null) {
            const A = IsConstructor(C) ? yield* Construct($, C) : ArrayCreate($, 0);
            if (IsAbrupt(A)) return A;
            const iteratorRecord = yield* GetIteratorFromMethod($, items, usingIterator);
            for (let k = 0;; k++) {
              if (k >= Number.MAX_SAFE_INTEGER) {
                const error = $.throw('TypeError', 'Too many items');
                return IteratorClose(iteratorRecord, error);
              }
              const next = IteratorStep(iteratorRecord);
              if (IsAbrupt(next)) return next;
              if (!next) {
                const result = Set($, A, 'length', k, true);
                if (IsAbrupt(result)) return result;
                return A;
              }
              const nextValue = IteratorValue(next);
              if (IsAbrupt(nextValue)) return nextValue;
              const mappedValue =
                mapping ? yield* Call($, mapfn, thisArg, [nextValue, k]) : nextValue;
              if (IsAbrupt(mappedValue)) {
                return CloseIteratorWhenAbrupt(mappedValue, iteratorRecord);
              }
              const defineStatus = CreateDataPropertyOrThrow($, A, String(k), mappedValue);
              if (IsAbrupt(defineStatus)) {
                return CloseIteratorWhenAbrupt(defineStatus, iteratorRecord);
              }
            }
          }
          // 6. NOTE: `items` is not an iterable, so assume it's array-like.
          const arrayLike = ToObject($, items);
          if (IsAbrupt(arrayLike)) return arrayLike;
          const len = yield* LengthOfArrayLike($, arrayLike);
          if (IsAbrupt(len)) return len;
          const A = IsConstructor(C) ?
            yield* Construct($, C, [len]) :
            ArrayCreate($, len);
          if (IsAbrupt(A)) return A;
          for (let k = 0; k < len; k++) {
            const Pk = String(k);
            const kValue = yield* Get($, arrayLike, Pk);
            if (IsAbrupt(kValue)) return kValue;
            const mappedValue = mapping ? yield* Call($, mapfn, thisArg, [kValue, k]) : kValue;
            if (IsAbrupt(mappedValue)) return mappedValue;
            const defineStatus = CreateDataPropertyOrThrow($, A, Pk, mappedValue);
            if (IsAbrupt(defineStatus)) return defineStatus;
          }
          const result = Set($, A, 'length', len, true);
          if (IsAbrupt(result)) return result;
          return A;
        }),
      });

    },
  },
};

type IteratorRecord = unknown;
// TODO - move to iterator.ts
export function CloseIteratorWhenAbrupt(ab: Abrupt, it: IteratorRecord): Abrupt {
  return ab;
  // const result = IteratorClose(it);
  // return IsAbrupt(result) ? result : ab;
}

/**
 * Do a double-binary search to find the range of keys that are array
 * indices and need to be deleted.
 */
function findKeysAbove(keys: PropertyKey[], len: number): PropertyKey[] {
  let a = 0;
  let c = keys.length;
  // We have three ranges in the input:
  //  1. [0, first) are array indexes less than len
  //  2. [first, end) are array indexes greater than or equal to len
  //  3. [end, keys.length) are non-array indexes
  // To do this binary search, we maintain the following invariant:
  //  a < first < b < end < c
  // We therefore need to start by finding a valid b:
  let b;
  while (a < c) {
    const m = (a + c) >>> 1;
    const v = keys[m];
    const n = (v as any) >>> 0;
    if (v !== String(n)) {
      // not an array index: m >= end, so move c left to (m)
      c = m;
    } else if (n < len) {
      // valid index to not delete: m < first, so move a right to (m + 1)
      a = m + 1;
    } else {
      // m >= first: we've found a valid b, so break
      b = m;
      break;
    }
  }
  if (b == null) {
    // We didn't find anything, so return an empty range.
    return [];
  }
  // Now narrow between a and b to find first.
  let first = b;
  while (a < first) {
    const m: number = (a + first) >>> 1;
    const v = keys[m];
    if (Number(v) < len) {
      // don't delete: move a right to (m + 1)
      a = m + 1;
    } else {
      // delete: move first left to (m)
      first = m;
    }
  }
  // Now narrow between b and c to find end.
  let end = c;
  while (b < end) {
    const m: number = (b + end) >>> 1;
    const v = keys[m];
    if (v === String((v as any) >>> 0)) {
      // array index: move b right to (m + 1)
      b = m + 1;
    } else {
      // not an array: move end left to (m)
      end = m;
    }
  }
  return keys.slice(first, end);
}
