import { ArrayExpression } from 'estree';
import { IsArray, IsArrayIndex, IsCallable, IsConstructor, IsIntegralNumber, IsStrictlyEqual, SameValue, SameValueZero } from './abstract_compare';
import { ToBoolean, ToIntegerOrInfinity, ToNumber, ToObject, ToString, ToUint32 } from './abstract_conversion';
import { Call, Construct, CreateArrayFromList, CreateDataPropertyOrThrow, DeletePropertyOrThrow, Get, GetMethod, HasProperty, Invoke, LengthOfArrayLike, Set } from './abstract_object';
import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { CreateBuiltinFunction, callOrConstruct, method, methodO } from './func';
import { objectAndFunctionPrototype } from './fundamental';
import { GetPrototypeFromConstructor, Obj, OrdinaryDefineOwnProperty, OrdinaryGetOwnProperty, OrdinaryObject, OrdinaryObjectCreate } from './obj';
import { HasValueField, IsDataDescriptor, PropertyDescriptor, prop0, propC, propW, propWC, propWEC } from './property_descriptor';
import { RealmRecord, defineProperties } from './realm_record';
import { memoize } from './slots';
import { PropertyKey, Val } from './val';
import { DebugString, ECR, Plugin, VM, run } from './vm';
import { CreateIteratorFromClosure, GeneratorResume, GeneratorYield } from './generator';
import { CreateIterResultObject, GetIterator, IteratorClose, IteratorStep, IteratorValue } from './abstract_iterator';
import { iterators } from './iterators';
import { EMPTY, SYNC } from './enums';

declare const GetIteratorFromMethod: any;
declare const IsDetachedBuffer: any;

declare global {
  interface ObjectSlots {
    TypedArrayName?: never;
    ViewedArrayBuffer?: never;
    ArrayLength?: number;
  }
}

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
  deps: () => [objectAndFunctionPrototype, iterators],
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
        callOrConstruct(function*($, NewTarget, ...values) {
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
                return yield* IteratorClose($, iteratorRecord, error);
              }
              const next = yield* IteratorStep($, iteratorRecord);
              if (IsAbrupt(next)) return next;
              if (!next) {
                const result = yield* Set($, A, 'length', k, true);
                if (IsAbrupt(result)) return result;
                return A;
              }
              const nextValue = yield* IteratorValue($, next);
              if (IsAbrupt(nextValue)) return nextValue;
              const mappedValue =
                mapping ? yield* Call($, mapfn, thisArg, [nextValue, k]) : nextValue;
              if (IsAbrupt(mappedValue)) return yield* IteratorClose($, iteratorRecord, mappedValue);
              const defineStatus = CreateDataPropertyOrThrow($, A, String(k), mappedValue);
              if (IsAbrupt(defineStatus)) return yield* IteratorClose($, iteratorRecord, defineStatus);
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
          const result = yield* Set($, A, 'length', len, true);
          if (IsAbrupt(result)) return result;
          return A;
        }),

        /**
         * 23.1.2.2 Array.isArray ( arg )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Return ? IsArray(arg).
         */
        'isArray': method(function*($, _thisValue, arg) {
          return IsArray($, arg);
        }),

        /**
         * 23.1.2.3 Array.of ( ...items )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let len be the number of elements in items.
         * 2. Let lenNumber be 𝔽(len).
         * 3. Let C be the this value.
         * 4. If IsConstructor(C) is true, then
         *     a. Let A be ? Construct(C, « lenNumber »).
         * 5. Else,
         *     a. Let A be ? ArrayCreate(len).
         * 6. Let k be 0.
         * 7. Repeat, while k < len,
         *     a. Let kValue be items[k].
         *     b. Let Pk be ! ToString(𝔽(k)).
         *     c. Perform ? CreateDataPropertyOrThrow(A, Pk, kValue).
         *     d. Set k to k + 1.
         * 8. Perform ? Set(A, "length", lenNumber, true).
         * 9. Return A.
         * 
         * NOTE: This method is an intentionally generic factory
         * method; it does not require that its this value be the
         * Array constructor. Therefore it can be transferred to or
         * inherited by other constructors that may be called with a
         * single numeric argument.
         */
        'of': method(function*($, thisValue, ...items) {
          const len = items.length;
          const C = thisValue;
          const A = IsConstructor(C) ?
            yield* Construct($, C, [len]) :
            ArrayCreate($, len);
          if (IsAbrupt(A)) return A;
          for (let k = 0; k < len; k++) {
            const createStatus = CreateDataPropertyOrThrow($, A, String(k), items[k]);
            if (IsAbrupt(createStatus)) return createStatus;
          }
          const setStatus = yield* Set($, A, 'length', len, true);
          if (IsAbrupt(setStatus)) return setStatus;
          return A;
        }),

        // 23.1.2.4 Array.prototype

        /**
         * 23.1.2.5 get Array [ @@species ]
         * 
         * Array[@@species] is an accessor property whose set accessor
         * function is undefined. Its get accessor function performs
         * the following steps when called:
         * 
         * 1. Return the this value.
         * 
         * The value of the "name" property of this function is "get [Symbol.species]".
         * 
         * NOTE: Array prototype methods normally use their this
         * value's constructor to create a derived object. However, a
         * subclass constructor may over-ride that default behaviour
         * by redefining its @@species property.
         */
        [Symbol.species]: {
          Get: CreateBuiltinFunction(
            {
              *Call(_$, thisValue) {
                return thisValue;
              },
            }, 0, '[Symbol.species]', realm,
            realm.Intrinsics.get('%Function.prototype%')!, 'get'),
          Configurable: true,
          Enumerable: false,
        },
      });

      /**
       * 23.1.3.38 Array.prototype.values ( )
       * 
       * This method performs the following steps when called:
       * 
       * 1. Let O be ? ToObject(this value).
       * 2. Return CreateArrayIterator(O, value).
       */
      const arrayPrototypeValues = CreateBuiltinFunction(
        {
          *Call($, thisValue) {
            const O = ToObject($, thisValue);
            if (IsAbrupt(O)) return O;
            return CreateArrayIterator($, O, 'value');
          },
        }, 0, 'values', realm, realm.Intrinsics.get('%Function.prototype%')!);
      realm.Intrinsics.set('%Array.prototype.values%', arrayPrototypeValues);
      arrayPrototype.OwnProps.set('values', propWC(arrayPrototypeValues));
      arrayPrototype.OwnProps.set(Symbol.iterator, propWC(arrayPrototypeValues));

      defineProperties(realm, arrayPrototype, {
        /**
         * 23.1.3.1 Array.prototype.at ( index )
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let relativeIndex be ? ToIntegerOrInfinity(index).
         * 4. If relativeIndex ≥ 0, then
         *     a. Let k be relativeIndex.
         * 5. Else,
         *     a. Let k be len + relativeIndex.
         * 6. If k < 0 or k ≥ len, return undefined.
         * 7. Return ? Get(O, ! ToString(𝔽(k))).
         */
        'at': method(function*($, thisValue, index) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          const relativeIndex = yield* ToIntegerOrInfinity($, index);
          if (IsAbrupt(relativeIndex)) return relativeIndex;
          let k: number;
          if (relativeIndex >= 0) {
            k = relativeIndex;
          } else {
            k = len + relativeIndex;
          }
          if (k < 0 || k >= len) return undefined;
          return yield* Get($, O, String(k));
        }),

        /**
         * 23.1.3.2 Array.prototype.concat ( ...items )
         * 
         * This method returns an array containing the array elements
         * of the object followed by the array elements of each
         * argument.
         * 
         * It performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let A be ? ArraySpeciesCreate(O, 0).
         * 3. Let n be 0.
         * 4. Prepend O to items.
         * 5. For each element E of items, do
         *     a. Let spreadable be ? IsConcatSpreadable(E).
         *     b. If spreadable is true, then
         *         i. Let len be ? LengthOfArrayLike(E).
         *         ii. If n + len > 253 - 1, throw a TypeError exception.
         *         iii. Let k be 0.
         *         iv. Repeat, while k < len,
         *             1. Let P be ! ToString(𝔽(k)).
         *             2. Let exists be ? HasProperty(E, P).
         *             3. If exists is true, then
         *                 a. Let subElement be ? Get(E, P).
         *                 b. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(n)), subElement).
         *             4. Set n to n + 1.
         *             5. Set k to k + 1.
         *     c. Else,
         *         i. NOTE: E is added as a single item rather than spread.
         *         ii. If n ≥ 253 - 1, throw a TypeError exception.
         *         iii. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(n)), E).
         *         iv. Set n to n + 1.
         * 6. Perform ? Set(A, "length", 𝔽(n), true).
         * 7. Return A.
         * 
         * The "length" property of this method is 1𝔽.
         * 
         * NOTE 1: The explicit setting of the "length" property in step 6
         * is necessary to ensure that its value is correct in situations
         * where the trailing elements of the result Array are not present.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'concat': method(function*($, thisValue, ...items) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const A = yield* ArraySpeciesCreate($, O, 0);
          if (IsAbrupt(A)) return A;
          let n = 0;
          items.unshift(O);
          for (const E of items) {
            const spreadable = yield* IsConcatSpreadable($, E);
            if (spreadable) {
              Assert(E instanceof Obj);
              const len = yield* LengthOfArrayLike($, E);
              if (IsAbrupt(len)) return len;
              if (n + len > Number.MAX_SAFE_INTEGER) {
                return $.throw('TypeError', 'Too many items');
              }
              for (let k = 0; k < len; k++) {
                yield;
                const P = String(k);
                const exists = HasProperty($, E, P);
                if (IsAbrupt(exists)) return exists;
                if (exists) {
                  const subElement = yield* Get($, E, P);
                  if (IsAbrupt(subElement)) return subElement;
                  const createStatus = CreateDataPropertyOrThrow($, A, String(n), subElement);
                  if (IsAbrupt(createStatus)) return createStatus;
                }
                n++;
              }
            } else {
              if (n >= Number.MAX_SAFE_INTEGER) {
                return $.throw('TypeError', 'Too many items');
              }
              const createStatus = CreateDataPropertyOrThrow($, A, String(n), E);
              if (IsAbrupt(createStatus)) return createStatus;
              n++;
            }
          }
          const setStatus = yield* Set($, A, 'length', n, true);
          return IsAbrupt(setStatus) ? setStatus : A;
        }, 1),

        /**
         * 23.1.3.4 Array.prototype.copyWithin ( target, start [ , end ] )
         * 
         * NOTE 1: The end argument is optional. If it is not
         * provided, the length of the this value is used.
         * 
         * NOTE 2: If target is negative, it is treated as length +
         * target where length is the length of the array. If start is
         * negative, it is treated as length + start. If end is
         * negative, it is treated as length + end.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let relativeTarget be ? ToIntegerOrInfinity(target).
         * 4. If relativeTarget = -∞, let to be 0.
         * 5. Else if relativeTarget < 0, let to be max(len + relativeTarget, 0).
         * 6. Else, let to be min(relativeTarget, len).
         * 7. Let relativeStart be ? ToIntegerOrInfinity(start).
         * 8. If relativeStart = -∞, let from be 0.
         * 9. Else if relativeStart < 0, let from be max(len + relativeStart, 0).
         * 10. Else, let from be min(relativeStart, len).
         * 11. If end is undefined, let relativeEnd be len; else let
         *     relativeEnd be ? ToIntegerOrInfinity(end).
         * 12. If relativeEnd = -∞, let final be 0.
         * 13. Else if relativeEnd < 0, let final be max(len + relativeEnd, 0).
         * 14. Else, let final be min(relativeEnd, len).
         * 15. Let count be min(final - from, len - to).
         * 16. If from < to and to < from + count, then
         *     a. Let direction be -1.
         *     b. Set from to from + count - 1.
         *     c. Set to to to + count - 1.
         * 17. Else,
         *     a. Let direction be 1.
         * 18. Repeat, while count > 0,
         *     a. Let fromKey be ! ToString(𝔽(from)).
         *     b. Let toKey be ! ToString(𝔽(to)).
         *     c. Let fromPresent be ? HasProperty(O, fromKey).
         *     d. If fromPresent is true, then
         *         i. Let fromVal be ? Get(O, fromKey).
         *         ii. Perform ? Set(O, toKey, fromVal, true).
         *     e. Else,
         *         i. Assert: fromPresent is false.
         *         ii. Perform ? DeletePropertyOrThrow(O, toKey).
         *     f. Set from to from + direction.
         *     g. Set to to to + direction.
         *     h. Set count to count - 1.
         * 19. Return O.
         * 
         * NOTE 3: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'copyWithin': method(function*($, thisValue, target, start, end = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          let to = LengthRelative(yield* ToIntegerOrInfinity($, target), len);
          if (IsAbrupt(to)) return to;
          let from = LengthRelative(yield* ToIntegerOrInfinity($, start), len);
          if (IsAbrupt(from)) return from;
          let final = LengthRelative(
            end === undefined ? len : yield* ToIntegerOrInfinity($, end), len);
          if (IsAbrupt(final)) return final;
          let count = Math.min(final - from, len - to);
          let direction: -1 | 1 = 1;
          if (from < to && to < from + count) {
            direction = -1;
            from += count - 1;
            to += count - 1;
          }
          while (count-- > 0) {
            const fromKey = String(from);
            const toKey = String(to);
            const fromPresent = HasProperty($, O, fromKey);
            if (IsAbrupt(fromPresent)) return fromPresent;
            if (fromPresent) {
              const fromVal = yield* Get($, O, fromKey);
              if (IsAbrupt(fromVal)) return fromVal
              const setStatus = yield* Set($, O, toKey, fromVal, true);
              if (IsAbrupt(setStatus)) return setStatus;
            } else {
              const deleteStatus = DeletePropertyOrThrow($, O, toKey);
              if (IsAbrupt(deleteStatus)) return deleteStatus;
            }
            from += direction;
            to += direction;
          }
          return O;
        }),

        /**
         * 23.1.3.5 Array.prototype.entries ( )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Return CreateArrayIterator(O, key+value).
         */
        'entries': method(function*($, thisValue) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          return CreateArrayIterator($, O, 'key+value');
        }),

        /**
         * 23.1.3.6 Array.prototype.every ( callbackfn [ , thisArg ] )
         * 
         * NOTE 1: callbackfn should be a function that accepts three
         * arguments and returns a value that is coercible to a
         * Boolean value. every calls callbackfn once for each element
         * present in the array, in ascending order, until it finds
         * one where callbackfn returns false. If such an element is
         * found, every immediately returns false. Otherwise, if
         * callbackfn returned true for all elements, every will
         * return true. callbackfn is called only for elements of the
         * array which actually exist; it is not called for missing
         * elements of the array.
         * 
         * If a thisArg parameter is provided, it will be used as the
         * this value for each invocation of callbackfn. If it is not
         * provided, undefined is used instead.
         * 
         * callbackfn is called with three arguments: the value of the
         * element, the index of the element, and the object being
         * traversed.
         * 
         * every does not directly mutate the object on which it is
         * called but the object may be mutated by the calls to
         * callbackfn.
         * 
         * The range of elements processed by every is set before the
         * first call to callbackfn. Elements which are appended to
         * the array after the call to every begins will not be
         * visited by callbackfn. If existing elements of the array
         * are changed, their value as passed to callbackfn will be
         * the value at the time every visits them; elements that are
         * deleted after the call to every begins and before being
         * visited are not visited. every acts like the "for all"
         * quantifier in mathematics. In particular, for an empty
         * array, it returns true.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
         * 4. Let k be 0.
         * 5. Repeat, while k < len,
         *     a. Let Pk be ! ToString(𝔽(k)).
         *     b. Let kPresent be ? HasProperty(O, Pk).
         *     c. If kPresent is true, then
         *         i. Let kValue be ? Get(O, Pk).
         *         ii. Let testResult be ToBoolean(? Call(callbackfn,
         *             thisArg, « kValue, 𝔽(k), O »)).
         *         iii. If testResult is false, return false.
         *     d. Set k to k + 1.
         * 6. Return true.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'every': method(function*($, thisValue, callbackfn, thisArg = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          if (!IsCallable(callbackfn)) {
            return $.throw('TypeError', `${DebugString(callbackfn)} is not a function`);
          }
          for (let k = 0; k < len; k++) {
            const Pk = String(k);
            const kPresent = HasProperty($, O, Pk);
            if (IsAbrupt(kPresent)) return kPresent;
            if (kPresent) {
              const kValue = yield* Get($, O, Pk);
              if (IsAbrupt(kValue)) return kValue;
              const callResult = yield* Call($, callbackfn, thisArg, [kValue, k, O]);
              if (IsAbrupt(callResult)) return callResult;
              if (!ToBoolean(callResult)) return false;
            }
          }
          return true;
        }),

        /**
         * 23.1.3.7 Array.prototype.fill ( value [ , start [ , end ] ] )
         * 
         * NOTE 1: The start argument is optional. If it is not
         * provided, +0𝔽 is used.
         * 
         * The end argument is optional. If it is not provided, the
         * length of the this value is used.
         * 
         * NOTE 2: If start is negative, it is treated as length +
         * start where length is the length of the array. If end is
         * negative, it is treated as length + end.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let relativeStart be ? ToIntegerOrInfinity(start).
         * 4. If relativeStart = -∞, let k be 0.
         * 5. Else if relativeStart < 0, let k be max(len + relativeStart, 0).
         * 6. Else, let k be min(relativeStart, len).
         * 7. If end is undefined, let relativeEnd be len; else let
         *    relativeEnd be ? ToIntegerOrInfinity(end).
         * 8. If relativeEnd = -∞, let final be 0.
         * 9. Else if relativeEnd < 0, let final be max(len + relativeEnd, 0).
         * 10. Else, let final be min(relativeEnd, len).
         * 11. Repeat, while k < final,
         *     a. Let Pk be ! ToString(𝔽(k)).
         *     b. Perform ? Set(O, Pk, value, true).
         *     c. Set k to k + 1.
         * 12. Return O.
         * 
         * NOTE 3: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'fill': method(function*($, thisValue, value, start = 0, end = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          let k = LengthRelative(yield* ToIntegerOrInfinity($, start), len);
          if (IsAbrupt(k)) return k;
          let final = LengthRelative(
            end === undefined ? len : yield* ToIntegerOrInfinity($, end), len);
          if (IsAbrupt(final)) return final;
          while (k < final) {
            const Pk = String(k);
            const setStatus = yield* Set($, O, Pk, value, true);
            if (IsAbrupt(setStatus)) return setStatus;
            k++;
          }
          return O;
        }),

        /**
         * 23.1.3.8 Array.prototype.filter ( callbackfn [ , thisArg ] )
         * 
         * NOTE 1: callbackfn should be a function that accepts three
         * arguments and returns a value that is coercible to a
         * Boolean value. filter calls callbackfn once for each
         * element in the array, in ascending order, and constructs a
         * new array of all the values for which callbackfn returns
         * true. callbackfn is called only for elements of the array
         * which actually exist; it is not called for missing elements
         * of the array.
         * 
         * If a thisArg parameter is provided, it will be used as the
         * this value for each invocation of callbackfn. If it is not
         * provided, undefined is used instead.
         * 
         * callbackfn is called with three arguments: the value of the
         * element, the index of the element, and the object being
         * traversed.
         * 
         * filter does not directly mutate the object on which it is
         * called but the object may be mutated by the calls to
         * callbackfn.
         * 
         * The range of elements processed by filter is set before the
         * first call to callbackfn. Elements which are appended to
         * the array after the call to filter begins will not be
         * visited by callbackfn. If existing elements of the array
         * are changed their value as passed to callbackfn will be the
         * value at the time filter visits them; elements that are
         * deleted after the call to filter begins and before being
         * visited are not visited.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
         * 4. Let A be ? ArraySpeciesCreate(O, 0).
         * 5. Let k be 0.
         * 6. Let to be 0.
         * 7. Repeat, while k < len,
         *     a. Let Pk be ! ToString(𝔽(k)).
         *     b. Let kPresent be ? HasProperty(O, Pk).
         *     c. If kPresent is true, then
         *         i. Let kValue be ? Get(O, Pk).
         *         ii. Let selected be ToBoolean(? Call(callbackfn,
         *             thisArg, « kValue, 𝔽(k), O »)).
         *         iii. If selected is true, then
         *             1. Perform ? CreateDataPropertyOrThrow(A,
         *                ! ToString(𝔽(to)), kValue).
         *             2. Set to to to + 1.
         *     d. Set k to k + 1.
         * 8. Return A.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'filter': method(function*($, thisValue, callbackfn, thisArg = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          if (!IsCallable(callbackfn)) {
            return $.throw('TypeError', `${DebugString(callbackfn)} is not a function`);
          }
          const A = yield* ArraySpeciesCreate($, O, 0);
          if (IsAbrupt(A)) return A;
          for (let k = 0, to = 0; k < len; k++) {
            const Pk = String(k);
            const kPresent = HasProperty($, O, Pk);
            if (IsAbrupt(kPresent)) return kPresent;
            if (kPresent) {
              const kValue = yield* Get($, O, Pk);
              if (IsAbrupt(kValue)) return kValue;
              const callResult = yield* Call($, callbackfn, thisArg, [kValue, k, O]);
              if (IsAbrupt(callResult)) return callResult;
              if (ToBoolean(callResult)) {
                const createStatus = CreateDataPropertyOrThrow($, A, String(to++), kValue);
                if (IsAbrupt(createStatus)) return createStatus;
              }
            }
          }
          return A;
        }),

        /**
         * 23.1.3.9 Array.prototype.find ( predicate [ , thisArg ] )
         * 
         * NOTE 1: This method calls predicate once for each element
         * of the array, in ascending index order, until it finds one
         * where predicate returns a value that coerces to true. If
         * such an element is found, find immediately returns that
         * element value. Otherwise, find returns undefined.
         * 
         * See FindViaPredicate for additional information.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let findRec be ? FindViaPredicate(O, len, ascending, predicate, thisArg).
         * 4. Return findRec.[[Value]].
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'find': method(function($, thisValue, predicate, thisArg = undefined) {
          return FindViaPredicate_Array($, thisValue, false, predicate, thisArg, false);
        }),

        /**
         * 23.1.3.10 Array.prototype.findIndex ( predicate [ , thisArg ] )
         * 
         * NOTE 1: This method calls predicate once for each element
         * of the array, in ascending index order, until it finds one
         * where predicate returns a value that coerces to true. If
         * such an element is found, findIndex immediately returns the
         * index of that element value. Otherwise, findIndex returns
         * -1.
         * 
         * See FindViaPredicate for additional information.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let findRec be ? FindViaPredicate(O, len, ascending, predicate, thisArg).
         * 4. Return findRec.[[Index]].
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'findIndex': method(function($, thisValue, predicate, thisArg = undefined) {
          return FindViaPredicate_Array($, thisValue, false, predicate, thisArg, true);
        }),

        /**
         * 23.1.3.11 Array.prototype.findLast ( predicate [ , thisArg ] )
         * 
         * NOTE 1: This method calls predicate once for each element
         * of the array, in descending index order, until it finds one
         * where predicate returns a value that coerces to true. If
         * such an element is found, findLast immediately returns that
         * element value. Otherwise, findLast returns undefined.
         * 
         * See FindViaPredicate for additional information.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let findRec be ? FindViaPredicate(O, len, descending, predicate, thisArg).
         * 4. Return findRec.[[Value]].
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array object. Therefore
         * it can be transferred to other kinds of objects for use as
         * a method.
         */
        'findLast': method(function($, thisValue, predicate, thisArg = undefined) {
          return FindViaPredicate_Array($, thisValue, true, predicate, thisArg, false);
        }),

        /**
         * 23.1.3.12 Array.prototype.findLastIndex ( predicate [ , thisArg ] )
         * 
         * NOTE 1: This method calls predicate once for each element
         * of the array, in descending index order, until it finds one
         * where predicate returns a value that coerces to true. If
         * such an element is found, findLastIndex immediately returns
         * the index of that element value. Otherwise, findLastIndex
         * returns -1.
         * 
         * See FindViaPredicate for additional information.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let findRec be ? FindViaPredicate(O, len, descending, predicate, thisArg).
         * 4. Return findRec.[[Index]].
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array object. Therefore
         * it can be transferred to other kinds of objects for use as
         * a method.
         */
        'findLastIndex': method(function($, thisValue, predicate, thisArg = undefined) {
          return FindViaPredicate_Array($, thisValue, true, predicate, thisArg, true);
        }),

        /**
         * 23.1.3.13 Array.prototype.flat ( [ depth ] )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let sourceLen be ? LengthOfArrayLike(O).
         * 3. Let depthNum be 1.
         * 4. If depth is not undefined, then
         *     a. Set depthNum to ? ToIntegerOrInfinity(depth).
         *     b. If depthNum < 0, set depthNum to 0.
         * 5. Let A be ? ArraySpeciesCreate(O, 0).
         * 6. Perform ? FlattenIntoArray(A, O, sourceLen, 0, depthNum).
         * 7. Return A.
         */
        'flat': method(function*($, thisValue, depth = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const sourceLen = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(sourceLen)) return sourceLen;
          let depthNum: CR<number> = 1;
          if (depth !== undefined) {
            depthNum = yield* ToIntegerOrInfinity($, depth);
            if (IsAbrupt(depthNum)) return depthNum;
            if (depthNum < 0) depthNum = 0;
          }
          const A = yield* ArraySpeciesCreate($, O, 0);
          if (IsAbrupt(A)) return A;
          const flattenStatus = yield* FlattenIntoArray($, A, O, sourceLen, 0, depthNum);
          if (IsAbrupt(flattenStatus)) return flattenStatus;
          return A;
        }),

        /**
         * 23.1.3.14 Array.prototype.flatMap ( mapperFunction [ , thisArg ] )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let sourceLen be ? LengthOfArrayLike(O).
         * 3. If IsCallable(mapperFunction) is false, throw a TypeError exception.
         * 4. Let A be ? ArraySpeciesCreate(O, 0).
         * 5. Perform ? FlattenIntoArray(A, O, sourceLen, 0, 1, mapperFunction, thisArg).
         * 6. Return A.
         */
        'flatMap': method(function*($, thisValue, mapperFunction, thisArg = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const sourceLen = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(sourceLen)) return sourceLen;
          if (!IsCallable(mapperFunction)) {
            return $.throw('TypeError', `${DebugString(mapperFunction)} is not a function`);
          }
          const A = yield* ArraySpeciesCreate($, O, 0);
          if (IsAbrupt(A)) return A;
          const flattenStatus = yield* FlattenIntoArray(
            $, A, O, sourceLen, 0, 1, mapperFunction, thisArg);
          if (IsAbrupt(flattenStatus)) return flattenStatus;
          return A;
        }),

        /**
         * 23.1.3.15 Array.prototype.forEach ( callbackfn [ , thisArg ] )
         * 
         * NOTE 1: callbackfn should be a function that accepts three
         * arguments. forEach calls callbackfn once for each element
         * present in the array, in ascending order. callbackfn is
         * called only for elements of the array which actually exist;
         * it is not called for missing elements of the array.
         * 
         * If a thisArg parameter is provided, it will be used as the
         * this value for each invocation of callbackfn. If it is not
         * provided, undefined is used instead.
         * 
         * callbackfn is called with three arguments: the value of the
         * element, the index of the element, and the object being
         * traversed.
         * 
         * forEach does not directly mutate the object on which it is
         * called but the object may be mutated by the calls to
         * callbackfn.
         * 
         * The range of elements processed by forEach is set before
         * the first call to callbackfn. Elements which are appended
         * to the array after the call to forEach begins will not be
         * visited by callbackfn. If existing elements of the array
         * are changed, their value as passed to callbackfn will be
         * the value at the time forEach visits them; elements that
         * are deleted after the call to forEach begins and before
         * being visited are not visited.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
         * 4. Let k be 0.
         * 5. Repeat, while k < len,
         *     a. Let Pk be ! ToString(𝔽(k)).
         *     b. Let kPresent be ? HasProperty(O, Pk).
         *     c. If kPresent is true, then
         *         i. Let kValue be ? Get(O, Pk).
         *         ii. Perform ? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »).
         *     d. Set k to k + 1.
         * 6. Return undefined.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'forEach': method(function*($, thisValue, callbackfn, thisArg = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          if (!IsCallable(callbackfn)) {
            return $.throw('TypeError', `${DebugString(callbackfn)} is not a function`);
          }
          for (let k = 0; k < len; k++) {
            const Pk = String(k);
            const kPresent = HasProperty($, O, Pk);
            if (IsAbrupt(kPresent)) return kPresent;
            if (kPresent) {
              const kValue = yield* Get($, O, Pk);
              if (IsAbrupt(kValue)) return kValue;
              const callStatus = yield* Call($, callbackfn, thisArg, [kValue, k, O]);
              if (IsAbrupt(callStatus)) return callStatus;
            }
          }
          return undefined;
        }),

        /**
         * 23.1.3.16 Array.prototype.includes ( searchElement [ , fromIndex ] )
         * 
         * NOTE 1: This method compares searchElement to the elements
         * of the array, in ascending order, using the SameValueZero
         * algorithm, and if found at any position, returns true;
         * otherwise, it returns false.
         * 
         * The optional second argument fromIndex defaults to +0𝔽
         * (i.e. the whole array is searched). If it is greater than
         * or equal to the length of the array, false is returned,
         * i.e. the array will not be searched. If it is less than
         * -0𝔽, it is used as the offset from the end of the array to
         * compute fromIndex. If the computed index is less than or
         * equal to +0𝔽, the whole array will be searched.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. If len = 0, return false.
         * 4. Let n be ? ToIntegerOrInfinity(fromIndex).
         * 5. Assert: If fromIndex is undefined, then n is 0.
         * 6. If n = +∞, return false.
         * 7. Else if n = -∞, set n to 0.
         * 8. If n ≥ 0, then
         *     a. Let k be n.
         * 9. Else,
         *     a. Let k be len + n.
         *     b. If k < 0, set k to 0.
         * 10. Repeat, while k < len,
         *     a. Let elementK be ? Get(O, ! ToString(𝔽(k))).
         *     b. If SameValueZero(searchElement, elementK) is true, return true.
         *     c. Set k to k + 1.
         * 11. Return false.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         * 
         * NOTE 3: This method intentionally differs from the similar
         * indexOf method in two ways. First, it uses the
         * SameValueZero algorithm, instead of IsStrictlyEqual,
         * allowing it to detect NaN array elements. Second, it does
         * not skip missing array elements, instead treating them as
         * undefined.
         */
        'includes': method(function*($, thisValue, searchElement, fromIndex = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          if (!len) return false;
          let n = yield* ToIntegerOrInfinity($, fromIndex);
          if (IsAbrupt(n)) return n;
          Assert(fromIndex !== undefined || n === 0);
          for (let k = n >= 0 ? n : Math.max(len + n, 0); k < len; k++) {
            const elementK = yield* Get($, O, String(k));
            if (IsAbrupt(elementK)) return elementK;
            if (SameValueZero(searchElement, elementK)) return true;
          }
          return false;
        }),

        /**
         * 23.1.3.17 Array.prototype.indexOf ( searchElement [ , fromIndex ] )
         * 
         * This method compares searchElement to the elements of the
         * array, in ascending order, using the IsStrictlyEqual
         * algorithm, and if found at one or more indices, returns the
         * smallest such index; otherwise, it returns -1𝔽.
         * 
         * NOTE 1: The optional second argument fromIndex defaults to
         * +0𝔽 (i.e. the whole array is searched). If it is greater
         * than or equal to the length of the array, -1𝔽 is returned,
         * i.e. the array will not be searched. If it is less than -0𝔽,
         * it is used as the offset from the end of the array to
         * compute fromIndex. If the computed index is less than or
         * equal to +0𝔽, the whole array will be searched.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. If len = 0, return -1𝔽.
         * 4. Let n be ? ToIntegerOrInfinity(fromIndex).
         * 5. Assert: If fromIndex is undefined, then n is 0.
         * 6. If n = +∞, return -1𝔽.
         * 7. Else if n = -∞, set n to 0.
         * 8. If n ≥ 0, then
         *     a. Let k be n.
         * 9. Else,
         *     a. Let k be len + n.
         *     b. If k < 0, set k to 0.
         * 10. Repeat, while k < len,
         *     a. Let kPresent be ? HasProperty(O, ! ToString(𝔽(k))).
         *     b. If kPresent is true, then
         *         i. Let elementK be ? Get(O, ! ToString(𝔽(k))).
         *         ii. If IsStrictlyEqual(searchElement, elementK) is true, return 𝔽(k).
         *     c. Set k to k + 1.
         * 11. Return -1𝔽.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'indexOf': method(function*($, thisValue, searchElement, fromIndex = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          if (!len) return -1;
          let n = yield* ToIntegerOrInfinity($, fromIndex);
          if (IsAbrupt(n)) return n;
          Assert(fromIndex !== undefined || n === 0);
          for (let k = n >= 0 ? n : Math.max(len + n, 0); k < len; k++) {
            const kPresent = HasProperty($, O, String(k));
            if (IsAbrupt(kPresent)) return kPresent;
            if (kPresent) {
              const elementK = yield* Get($, O, String(k));
              if (IsAbrupt(elementK)) return elementK;
              if (IsStrictlyEqual(searchElement, elementK)) return k;
            }
          }
          return -1;
        }),

        /**
         * 23.1.3.18 Array.prototype.join ( separator )
         * 
         * This method converts the elements of the array to Strings,
         * and then concatenates these Strings, separated by
         * occurrences of the separator. If no separator is provided,
         * a single comma is used as the separator.
         * 
         * It performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. If separator is undefined, let sep be ",".
         * 4. Else, let sep be ? ToString(separator).
         * 5. Let R be the empty String.
         * 6. Let k be 0.
         * 7. Repeat, while k < len,
         *     a. If k > 0, set R to the string-concatenation of R and sep.
         *     b. Let element be ? Get(O, ! ToString(𝔽(k))).
         *     c. If element is either undefined or null, let next be
         *        the empty String; otherwise, let next be
         *        ? ToString(element).
         *     d. Set R to the string-concatenation of R and next.
         *     e. Set k to k + 1.
         * 8. Return R.
         * 
         * NOTE: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore, it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'join': method(function*($, thisValue, separator) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          const sep = separator === undefined ? ',' : yield* ToString($, separator);
          if (IsAbrupt(sep)) return sep;
          let R = '';
          for (let k = 0; k < len; k++) {
            if (k > 0) R += sep;
            const element = yield* Get($, O, String(k));
            if (IsAbrupt(element)) return element;
            const next = element == null ? '' : yield* ToString($, element);
            if (IsAbrupt(next)) return next;
            R += next;
          }
          return R;
        }),

        /**
         * 23.1.3.19 Array.prototype.keys ( )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Return CreateArrayIterator(O, key).
         */
        'keys': method(function*($, thisValue) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          return CreateArrayIterator($, O, 'key');
        }),

        /**
         * 23.1.3.20 Array.prototype.lastIndexOf ( searchElement [ , fromIndex ] )
         * 
         * NOTE 1: This method compares searchElement to the elements
         * of the array in descending order using the IsStrictlyEqual
         * algorithm, and if found at one or more indices, returns the
         * largest such index; otherwise, it returns -1𝔽.
         * 
         * The optional second argument fromIndex defaults to the
         * array\'s length minus one (i.e. the whole array is
         * searched). If it is greater than or equal to the length of
         * the array, the whole array will be searched. If it is less
         * than -0𝔽, it is used as the offset from the end of the
         * array to compute fromIndex. If the computed index is less
         * than or equal to +0𝔽, -1𝔽 is returned.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. If len = 0, return -1𝔽.
         * 4. If fromIndex is present, let n be
         *    ? ToIntegerOrInfinity(fromIndex); else let n be len - 1.
         * 5. If n = -∞, return -1𝔽.
         * 6. If n ≥ 0, then
         *     a. Let k be min(n, len - 1).
         * 7. Else,
         *     a. Let k be len + n.
         * 8. Repeat, while k ≥ 0,
         *     a. Let kPresent be ? HasProperty(O, ! ToString(𝔽(k))).
         *     b. If kPresent is true, then
         *         i. Let elementK be ? Get(O, ! ToString(𝔽(k))).
         *         ii. If IsStrictlyEqual(searchElement, elementK) is true, return 𝔽(k).
         *     c. Set k to k - 1.
         * 9. Return -1𝔽.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'lastIndexOf': method(function*($, thisValue, searchElement, fromIndex = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          if (!len) return -1;
          let n = fromIndex === undefined ? len - 1 :
            yield* ToIntegerOrInfinity($, fromIndex);
          if (IsAbrupt(n)) return n;
          for (let k = n >= 0 ? Math.min(n, len - 1) : len + n; k >= 0; k--) {
            const kPresent = HasProperty($, O, String(k));
            if (IsAbrupt(kPresent)) return kPresent;
            if (kPresent) {
              const elementK = yield* Get($, O, String(k));
              if (IsAbrupt(elementK)) return elementK;
              if (IsStrictlyEqual(searchElement, elementK)) return k;
            }
          }
          return -1;
        }),

        /**
         * 23.1.3.21 Array.prototype.map ( callbackfn [ , thisArg ] )
         * 
         * NOTE 1: callbackfn should be a function that accepts three
         * arguments. map calls callbackfn once for each element in
         * the array, in ascending order, and constructs a new Array
         * from the results. callbackfn is called only for elements of
         * the array which actually exist; it is not called for
         * missing elements of the array.
         * 
         * If a thisArg parameter is provided, it will be used as the
         * this value for each invocation of callbackfn. If it is not
         * provided, undefined is used instead.
         * 
         * callbackfn is called with three arguments: the value of the
         * element, the index of the element, and the object being
         * traversed.
         * 
         * map does not directly mutate the object on which it is
         * called but the object may be mutated by the calls to
         * callbackfn.
         * 
         * The range of elements processed by map is set before the
         * first call to callbackfn. Elements which are appended to
         * the array after the call to map begins will not be visited
         * by callbackfn. If existing elements of the array are
         * changed, their value as passed to callbackfn will be the
         * value at the time map visits them; elements that are
         * deleted after the call to map begins and before being
         * visited are not visited.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
         * 4. Let A be ? ArraySpeciesCreate(O, len).
         * 5. Let k be 0.
         * 6. Repeat, while k < len,
         *     a. Let Pk be ! ToString(𝔽(k)).
         *     b. Let kPresent be ? HasProperty(O, Pk).
         *     c. If kPresent is true, then
         *         i. Let kValue be ? Get(O, Pk).
         *         ii. Let mappedValue be ? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »).
         *         iii. Perform ? CreateDataPropertyOrThrow(A, Pk, mappedValue).
         *     d. Set k to k + 1.
         * 7. Return A.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'map': method(function*($, thisValue, callbackfn, thisArg = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          if (!IsCallable(callbackfn)) {
            return $.throw('TypeError', `${DebugString(callbackfn)} is not a function`);
          }
          const A = yield* ArraySpeciesCreate($, O, len);
          if (IsAbrupt(A)) return A;
          for (let k = 0; k < len; k++) {
            const Pk = String(k);
            const kPresent = HasProperty($, O, Pk);
            if (IsAbrupt(kPresent)) return kPresent;
            if (kPresent) {
              const kValue = yield* Get($, O, Pk);
              if (IsAbrupt(kValue)) return kValue;
              const mappedValue = yield* Call($, callbackfn, thisArg, [kValue, k, O]);
              if (IsAbrupt(mappedValue)) return mappedValue;
              const createStatus = CreateDataPropertyOrThrow($, A, Pk, mappedValue);
              if (IsAbrupt(createStatus)) return createStatus;
            }
          }
          return A;
        }),

        /**
         * 23.1.3.22 Array.prototype.pop ( )
         * 
         * NOTE 1: This method removes the last element of the array
         * and returns it.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. If len = 0, then
         *     a. Perform ? Set(O, "length", +0𝔽, true).
         *     b. Return undefined.
         * 4. Else,
         *     a. Assert: len > 0.
         *     b. Let newLen be 𝔽(len - 1).
         *     c. Let index be ! ToString(newLen).
         *     d. Let element be ? Get(O, index).
         *     e. Perform ? DeletePropertyOrThrow(O, index).
         *     f. Perform ? Set(O, "length", newLen, true).
         *     g. Return element.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'pop': method(function*($, thisValue) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          if (!len) {
            const setStatus = yield* Set($, O, 'length', 0, true);
            if (IsAbrupt(setStatus)) return setStatus;
            return undefined;
          }
          const newLen = len - 1;
          const index = String(newLen);
          const element = yield* Get($, O, index);
          if (IsAbrupt(element)) return element;
          const deleteStatus = DeletePropertyOrThrow($, O, index);
          if (IsAbrupt(deleteStatus)) return deleteStatus;
          const setStatus = yield* Set($, O, 'length', newLen, true);
          if (IsAbrupt(setStatus)) return setStatus;
          return element;
        }),

        /**
         * 23.1.3.23 Array.prototype.push ( ...items )
         * 
         * NOTE 1: This method appends the arguments to the end of the
         * array, in the order in which they appear. It returns the new
         * length of the array.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let argCount be the number of elements in items.
         * 4. If len + argCount > 253 - 1, throw a TypeError exception.
         * 5. For each element E of items, do
         *     a. Perform ? Set(O, ! ToString(𝔽(len)), E, true).
         *     b. Set len to len + 1.
         * 6. Perform ? Set(O, "length", 𝔽(len), true).
         * 7. Return 𝔽(len).
         * 
         * The "length" property of this method is 1𝔽.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can be
         * transferred to other kinds of objects for use as a method.
         */
        'push': method(function*($, thisValue, ...items) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          let len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          const argCount = items.length;
          if (len + argCount > Number.MAX_SAFE_INTEGER) {
            return $.throw('TypeError', 'Too many items');
          }
          for (const E of items) {
            const setStatus = yield* Set($, O, String(len), E, true);
            if (IsAbrupt(setStatus)) return setStatus;
            len++;
          }
          const setStatus = yield* Set($, O, 'length', len, true);
          if (IsAbrupt(setStatus)) return setStatus;
          return len;
        }),

        /**
         * 23.1.3.24 Array.prototype.reduce ( callbackfn [ , initialValue ] )
         * 
         * NOTE 1: callbackfn should be a function that takes four
         * arguments. reduce calls the callback, as a function, once
         * for each element after the first element present in the
         * array, in ascending order.
         * 
         * callbackfn is called with four arguments: the previousValue
         * (value from the previous call to callbackfn), the
         * currentValue (value of the current element), the
         * currentIndex, and the object being traversed. The first
         * time that callback is called, the previousValue and
         * currentValue can be one of two values. If an initialValue
         * was supplied in the call to reduce, then previousValue will
         * be initialValue and currentValue will be the first value in
         * the array. If no initialValue was supplied, then
         * previousValue will be the first value in the array and
         * currentValue will be the second. It is a TypeError if the
         * array contains no elements and initialValue is not
         * provided.
         * 
         * reduce does not directly mutate the object on which it is
         * called but the object may be mutated by the calls to
         * callbackfn.
         * 
         * The range of elements processed by reduce is set before the
         * first call to callbackfn. Elements that are appended to the
         * array after the call to reduce begins will not be visited
         * by callbackfn. If existing elements of the array are
         * changed, their value as passed to callbackfn will be the
         * value at the time reduce visits them; elements that are
         * deleted after the call to reduce begins and before being
         * visited are not visited.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
         * 4. If len = 0 and initialValue is not present, throw a TypeError exception.
         * 5. Let k be 0.
         * 6. Let accumulator be undefined.
         * 7. If initialValue is present, then
         *     a. Set accumulator to initialValue.
         * 8. Else,
         *     a. Let kPresent be false.
         *     b. Repeat, while kPresent is false and k < len,
         *         i. Let Pk be ! ToString(𝔽(k)).
         *         ii. Set kPresent to ? HasProperty(O, Pk).
         *         iii. If kPresent is true, then
         *             1. Set accumulator to ? Get(O, Pk).
         *         iv. Set k to k + 1.
         *     c. If kPresent is false, throw a TypeError exception.
         * 9. Repeat, while k < len,
         *     a. Let Pk be ! ToString(𝔽(k)).
         *     b. Let kPresent be ? HasProperty(O, Pk).
         *     c. If kPresent is true, then
         *         i. Let kValue be ? Get(O, Pk).
         *         ii. Set accumulator to ? Call(callbackfn,
         *             undefined, « accumulator, kValue, 𝔽(k), O »).
         *     d. Set k to k + 1.
         * 10. Return accumulator.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'reduce': method(function*($, thisValue, callbackfn, initialValue = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          if (!IsCallable(callbackfn)) {
            return $.throw('TypeError', `${DebugString(callbackfn)} is not a function`);
          }
          const initialValuePresent = arguments.length > 3;
          if (!len && !initialValuePresent) {
            return $.throw('TypeError', 'Reduce of empty array with no initial value');
          }
          let k = 0;
          let accumulator: CR<Val> = initialValue;
          if (!initialValuePresent) {
            let kPresent: CR<boolean> = false;
            for (; !kPresent && k < len; k++) {
              const Pk = String(k);
              kPresent = HasProperty($, O, Pk);
              if (IsAbrupt(kPresent)) return kPresent;
              if (!kPresent) continue;
              accumulator = yield* Get($, O, Pk);
              if (IsAbrupt(accumulator)) return accumulator;
            }
            if (!kPresent) {
              return $.throw('TypeError', 'Reduce of empty array with no initial value');
            }
          }
          for (; k < len; k++) {
            const Pk = String(k);
            const kPresent = HasProperty($, O, Pk);
            if (IsAbrupt(kPresent)) return kPresent;
            if (!kPresent) continue;
            const kValue = yield* Get($, O, Pk);
            if (IsAbrupt(kValue)) return kValue;
            accumulator = yield* Call($, callbackfn, undefined, [accumulator, kValue, k, O]);
            if (IsAbrupt(accumulator)) return accumulator;
          }
          return accumulator;
        }),

        /**
         * 23.1.3.25 Array.prototype.reduceRight ( callbackfn [ , initialValue ] )
         * 
         * NOTE 1: callbackfn should be a function that takes four
         * arguments. reduceRight calls the callback, as a function,
         * once for each element after the first element present in
         * the array, in descending order.
         * 
         * callbackfn is called with four arguments: the previousValue
         * (value from the previous call to callbackfn), the
         * currentValue (value of the current element), the
         * currentIndex, and the object being traversed. The first
         * time the function is called, the previousValue and
         * currentValue can be one of two values. If an initialValue
         * was supplied in the call to reduceRight, then previousValue
         * will be initialValue and currentValue will be the last
         * value in the array. If no initialValue was supplied, then
         * previousValue will be the last value in the array and
         * currentValue will be the second-to-last value. It is a
         * TypeError if the array contains no elements and
         * initialValue is not provided.
         * 
         * reduceRight does not directly mutate the object on which it
         * is called but the object may be mutated by the calls to
         * callbackfn.
         * 
         * The range of elements processed by reduceRight is set
         * before the first call to callbackfn. Elements that are
         * appended to the array after the call to reduceRight begins
         * will not be visited by callbackfn. If existing elements of
         * the array are changed by callbackfn, their value as passed
         * to callbackfn will be the value at the time reduceRight
         * visits them; elements that are deleted after the call to
         * reduceRight begins and before being visited are not
         * visited.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
         * 4. If len = 0 and initialValue is not present, throw a TypeError exception.
         * 5. Let k be len - 1.
         * 6. Let accumulator be undefined.
         * 7. If initialValue is present, then
         *     a. Set accumulator to initialValue.
         * 8. Else,
         *     a. Let kPresent be false.
         *     b. Repeat, while kPresent is false and k ≥ 0,
         *         i. Let Pk be ! ToString(𝔽(k)).
         *         ii. Set kPresent to ? HasProperty(O, Pk).
         *         iii. If kPresent is true, then
         *             1. Set accumulator to ? Get(O, Pk).
         *         iv. Set k to k - 1.
         *     c. If kPresent is false, throw a TypeError exception.
         * 9. Repeat, while k ≥ 0,
         *     a. Let Pk be ! ToString(𝔽(k)).
         *     b. Let kPresent be ? HasProperty(O, Pk).
         *     c. If kPresent is true, then
         *         i. Let kValue be ? Get(O, Pk).
         *         ii. Set accumulator to ? Call(callbackfn,
         *             undefined, « accumulator, kValue, 𝔽(k), O »).
         *     d. Set k to k - 1.
         * 10. Return accumulator.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'reduceRight': method(function*($, thisValue, callbackfn, initialValue = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          if (!IsCallable(callbackfn)) {
            return $.throw('TypeError', `${DebugString(callbackfn)} is not a function`);
          }
          const initialValuePresent = arguments.length > 3;
          if (!len && !initialValuePresent) {
            return $.throw('TypeError', 'Reduce of empty array with no initial value');
          }
          let k = len - 1;
          let accumulator: CR<Val> = initialValue;
          if (!initialValuePresent) {
            let kPresent: CR<boolean> = false;
            for (; !kPresent && k >= 0; k--) {
              const Pk = String(k);
              kPresent = HasProperty($, O, Pk);
              if (IsAbrupt(kPresent)) return kPresent;
              if (!kPresent) continue;
              accumulator = yield* Get($, O, Pk);
              if (IsAbrupt(accumulator)) return accumulator;
            }
            if (!kPresent) {
              return $.throw('TypeError', 'Reduce of empty array with no initial value');
            }
          }
          for (; k >= 0; k--) {
            const Pk = String(k);
            const kPresent = HasProperty($, O, Pk);
            if (IsAbrupt(kPresent)) return kPresent;
            if (!kPresent) continue;
            const kValue = yield* Get($, O, Pk);
            if (IsAbrupt(kValue)) return kValue;
            accumulator = yield* Call($, callbackfn, undefined, [accumulator, kValue, k, O]);
            if (IsAbrupt(accumulator)) return accumulator;
          }
          return accumulator;
        }),

        /**
         * 23.1.3.26 Array.prototype.reverse ( )
         * 
         * NOTE 1: This method rearranges the elements of the array so
         * as to reverse their order. It returns the object as the
         * result of the call.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let middle be floor(len / 2).
         * 4. Let lower be 0.
         * 5. Repeat, while lower ≠ middle,
         *     a. Let upper be len - lower - 1.
         *     b. Let upperP be ! ToString(𝔽(upper)).
         *     c. Let lowerP be ! ToString(𝔽(lower)).
         *     d. Let lowerExists be ? HasProperty(O, lowerP).
         *     e. If lowerExists is true, then
         *         i. Let lowerValue be ? Get(O, lowerP).
         *     f. Let upperExists be ? HasProperty(O, upperP).
         *     g. If upperExists is true, then
         *         i. Let upperValue be ? Get(O, upperP).
         *     h. If lowerExists is true and upperExists is true, then
         *         i. Perform ? Set(O, lowerP, upperValue, true).
         *         ii. Perform ? Set(O, upperP, lowerValue, true).
         *         i. Else if lowerExists is false and upperExists is true, then
         *         i. Perform ? Set(O, lowerP, upperValue, true).
         *         ii. Perform ? DeletePropertyOrThrow(O, upperP).
         *     j. Else if lowerExists is true and upperExists is false, then
         *         i. Perform ? DeletePropertyOrThrow(O, lowerP).
         *         ii. Perform ? Set(O, upperP, lowerValue, true).
         *     k. Else,
         *         i. Assert: lowerExists and upperExists are both false.
         *         ii. NOTE: No action is required.
         *     l. Set lower to lower + 1.
         * 6. Return O.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore, it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'reverse': method(function*($, thisValue) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          const middle = Math.floor(len / 2);
          let lower = 0;
          while (lower !== middle) {
            const upper = len - lower - 1;
            const upperP = String(upper);
            const lowerP = String(lower);
            const lowerExists = HasProperty($, O, lowerP);
            let lowerValue: Val;
            let upperValue: Val;
            if (IsAbrupt(lowerExists)) return lowerExists;
            if (lowerExists) {
              const v = yield* Get($, O, lowerP);
              if (IsAbrupt(v)) return v;
              lowerValue = v;
            }
            const upperExists = HasProperty($, O, upperP);
            if (IsAbrupt(upperExists)) return upperExists;
            if (upperExists) {
              const v = yield* Get($, O, upperP);
              if (IsAbrupt(v)) return v;
              upperValue = v;
            }
            if (lowerExists && upperExists) {
              let status = yield* Set($, O, lowerP, upperValue, true);
              if (IsAbrupt(status)) return status;
              status = yield* Set($, O, upperP, lowerValue, true);
              if (IsAbrupt(status)) return status;
            } else if (lowerExists && !upperExists) {
              let status = yield* Set($, O, upperP, lowerValue, true);
              if (IsAbrupt(status)) return status;
              status = DeletePropertyOrThrow($, O, lowerP);
              if (IsAbrupt(status)) return status;
            } else if (!lowerExists && upperExists) {
              let status = DeletePropertyOrThrow($, O, upperP);
              if (IsAbrupt(status)) return status;
              status = yield* Set($, O, lowerP, upperValue, true);
              if (IsAbrupt(status)) return status;
            }
            lower++;
          }
          return O;
        }),

        /**
         * 23.1.3.27 Array.prototype.shift ( )
         * 
         * This method removes the first element of the array and returns it.
         * 
         * It performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. If len = 0, then
         *     a. Perform ? Set(O, "length", +0𝔽, true).
         *     b. Return undefined.
         * 4. Let first be ? Get(O, "0").
         * 5. Let k be 1.
         * 6. Repeat, while k < len,
         *     a. Let from be ! ToString(𝔽(k)).
         *     b. Let to be ! ToString(𝔽(k - 1)).
         *     c. Let fromPresent be ? HasProperty(O, from).
         *     d. If fromPresent is true, then
         *         i. Let fromVal be ? Get(O, from).
         *         ii. Perform ? Set(O, to, fromVal, true).
         *     e. Else,
         *         i. Assert: fromPresent is false.
         *         ii. Perform ? DeletePropertyOrThrow(O, to).
         *     f. Set k to k + 1.
         * 7. Perform ? DeletePropertyOrThrow(O, ! ToString(𝔽(len - 1))).
         * 8. Perform ? Set(O, "length", 𝔽(len - 1), true).
         * 9. Return first.
         * 
         * NOTE: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'shift': method(function*($, thisValue) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          if (!len) {
            const setStatus = yield* Set($, O, 'length', 0, true);
            if (IsAbrupt(setStatus)) return setStatus;
            return undefined;
          }
          const first = yield* Get($, O, '0');
          if (IsAbrupt(first)) return first;
          let k = 1;
          while (k < len) {
            const from = String(k);
            const to = String(k - 1);
            const fromPresent = HasProperty($, O, from);
            if (IsAbrupt(fromPresent)) return fromPresent;
            if (fromPresent) {
              const fromVal = yield* Get($, O, from);
              if (IsAbrupt(fromVal)) return fromVal;
              const setStatus = yield* Set($, O, to, fromVal, true);
              if (IsAbrupt(setStatus)) return setStatus;
            } else {
              const deleteStatus = DeletePropertyOrThrow($, O, to);
              if (IsAbrupt(deleteStatus)) return deleteStatus;
            }
            k++;
          }
          const deleteStatus = DeletePropertyOrThrow($, O, String(len - 1));
          if (IsAbrupt(deleteStatus)) return deleteStatus;
          const setStatus = yield* Set($, O, 'length', len - 1, true);
          if (IsAbrupt(setStatus)) return setStatus;
          return first;
        }),

        /**
         * 23.1.3.28 Array.prototype.slice ( start, end )
         * 
         * This method returns an array containing the elements of the
         * array from element start up to, but not including, element
         * end (or through the end of the array if end is
         * undefined). If start is negative, it is treated as length +
         * start where length is the length of the array. If end is
         * negative, it is treated as length + end where length is the
         * length of the array.
         * 
         * It performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let relativeStart be ? ToIntegerOrInfinity(start).
         * 4. If relativeStart = -∞, let k be 0.
         * 5. Else if relativeStart < 0, let k be max(len + relativeStart, 0).
         * 6. Else, let k be min(relativeStart, len).
         * 7. If end is undefined, let relativeEnd be len; else let
         *    relativeEnd be ? ToIntegerOrInfinity(end).
         * 8. If relativeEnd = -∞, let final be 0.
         * 9. Else if relativeEnd < 0, let final be max(len + relativeEnd, 0).
         * 10. Else, let final be min(relativeEnd, len).
         * 11. Let count be max(final - k, 0).
         * 12. Let A be ? ArraySpeciesCreate(O, count).
         * 13. Let n be 0.
         * 14. Repeat, while k < final,
         *     a. Let Pk be ! ToString(𝔽(k)).
         *     b. Let kPresent be ? HasProperty(O, Pk).
         *     c. If kPresent is true, then
         *         i. Let kValue be ? Get(O, Pk).
         *         ii. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(n)), kValue).
         *     d. Set k to k + 1.
         *     e. Set n to n + 1.
         * 15. Perform ? Set(A, "length", 𝔽(n), true).
         * 16. Return A.
         * 
         * NOTE 1: The explicit setting of the "length" property of
         * the result Array in step 15 was necessary in previous editions
         * of ECMAScript to ensure that its length was correct in
         * situations where the trailing elements of the result Array
         * were not present. Setting "length" became unnecessary
         * starting in ES2015 when the result Array was initialized to
         * its proper length rather than an empty Array but is carried
         * forward to preserve backward compatibility.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'slice': method(function*($, thisValue, start, end) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          let k = LengthRelative(yield* ToIntegerOrInfinity($, start), len);
          if (IsAbrupt(k)) return k;
          let final = LengthRelative(
            end === undefined ? len : yield* ToIntegerOrInfinity($, end), len);
          if (IsAbrupt(final)) return final;
          const count = Math.max(final - k, 0);
          const A = yield* ArraySpeciesCreate($, O, count);
          if (IsAbrupt(A)) return A;
          let n = 0;
          while (k < final) {
            const Pk = String(k);
            const kPresent = HasProperty($, O, Pk);
            if (IsAbrupt(kPresent)) return kPresent;
            if (kPresent) {
              const kValue = yield* Get($, O, Pk);
              if (IsAbrupt(kValue)) return kValue;
              const createStatus = CreateDataPropertyOrThrow($, A, String(n), kValue);
              if (IsAbrupt(createStatus)) return createStatus;
            }
            k++;
            n++;
          }
          const setStatus = yield* Set($, A, 'length', n, true);
          if (IsAbrupt(setStatus)) return setStatus;
          return A;
        }),

        /**
         * 23.1.3.29 Array.prototype.some ( callbackfn [ , thisArg ] )
         * 
         * NOTE 1: callbackfn should be a function that accepts three
         * arguments and returns a value that is coercible to a
         * Boolean value. some calls callbackfn once for each element
         * present in the array, in ascending order, until it finds
         * one where callbackfn returns true. If such an element is
         * found, some immediately returns true. Otherwise, some
         * returns false. callbackfn is called only for elements of
         * the array which actually exist; it is not called for
         * missing elements of the array.
         * 
         * If a thisArg parameter is provided, it will be used as the
         * this value for each invocation of callbackfn. If it is not
         * provided, undefined is used instead.
         * 
         * callbackfn is called with three arguments: the value of the
         * element, the index of the element, and the object being
         * traversed.
         * 
         * some does not directly mutate the object on which it is
         * called but the object may be mutated by the calls to
         * callbackfn.
         * 
         * The range of elements processed by some is set before the
         * first call to callbackfn. Elements that are appended to the
         * array after the call to some begins will not be visited by
         * callbackfn. If existing elements of the array are changed,
         * their value as passed to callbackfn will be the value at
         * the time that some visits them; elements that are deleted
         * after the call to some begins and before being visited are
         * not visited. some acts like the "exists" quantifier in
         * mathematics. In particular, for an empty array, it returns
         * false.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
         * 4. Let k be 0.
         * 5. Repeat, while k < len,
         *     a. Let Pk be ! ToString(𝔽(k)).
         *     b. Let kPresent be ? HasProperty(O, Pk).
         *     c. If kPresent is true, then
         *         i. Let kValue be ? Get(O, Pk).
         *         ii. Let testResult be ToBoolean(? Call(callbackfn,
         *             thisArg, « kValue, 𝔽(k), O »)).
         *         iii. If testResult is true, return true.
         *     d. Set k to k + 1.
         * 6. Return false.
         * 
         * NOTE 2: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'some': method(function*($, thisValue, callbackfn, thisArg = undefined) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          if (!IsCallable(callbackfn)) {
            return $.throw('TypeError', `${DebugString(callbackfn)} is not a function`);
          }
          for (let k = 0; k < len; k++) {
            const Pk = String(k);
            const kPresent = HasProperty($, O, Pk);
            if (IsAbrupt(kPresent)) return kPresent;
            if (kPresent) {
              const kValue = yield* Get($, O, Pk);
              if (IsAbrupt(kValue)) return kValue;
              const callResult = yield* Call($, callbackfn, thisArg, [kValue, k, O]);
              if (IsAbrupt(callResult)) return callResult;
              if (ToBoolean(callResult)) return true;
            }
          }
          return false;
        }),

        /**
         * 23.1.3.30 Array.prototype.sort ( comparefn )
         * 
         * This method sorts the elements of this array. The sort must
         * be stable (that is, elements that compare equal must remain
         * in their original order). If comparefn is not undefined, it
         * should be a function that accepts two arguments x and y and
         * returns a negative Number if x < y, a positive Number if x
         * > y, or a zero otherwise.
         * 
         * It performs the following steps when called:
         * 
         * 1. If comparefn is not undefined and IsCallable(comparefn)
         *    is false, throw a TypeError exception.
         * 2. Let obj be ? ToObject(this value).
         * 3. Let len be ? LengthOfArrayLike(obj).
         * 4. Let SortCompare be a new Abstract Closure with
         *    parameters (x, y) that captures comparefn and performs the
         *    following steps when called:
         *     a. Return ? CompareArrayElements(x, y, comparefn).
         * 5. Let sortedList be ? SortIndexedProperties(obj, len, SortCompare, skip-holes).
         * 6. Let itemCount be the number of elements in sortedList.
         * 7. Let j be 0.
         * 8. Repeat, while j < itemCount,
         *     a. Perform ? Set(obj, ! ToString(𝔽(j)), sortedList[j], true).
         *     b. Set j to j + 1.
         * 9. NOTE: The call to SortIndexedProperties in step 5 uses
         *    skip-holes. The remaining indices are deleted to preserve
         *    the number of holes that were detected and excluded from
         *    the sort.
         * 10. Repeat, while j < len,
         *     a. Perform ? DeletePropertyOrThrow(obj, ! ToString(𝔽(j))).
         *     b. Set j to j + 1.
         * 11. Return obj.
         * 
         * NOTE 1: Because non-existent property values always compare
         * greater than undefined property values, and undefined
         * always compares greater than any other value (see
         * CompareArrayElements), undefined property values always
         * sort to the end of the result, followed by non-existent
         * property values.
         * 
         * NOTE 2: Method calls performed by the ToString abstract
         * operations in steps 5 and 6 have the potential to cause
         * SortCompare to not behave as a consistent comparator.
         * 
         * NOTE 3: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore, it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'sort': method(function*($, thisValue, comparefn) {
          if (comparefn !== undefined && !IsCallable(comparefn)) {
            return $.throw('TypeError', `${DebugString(comparefn)} is not a function`);
          }
          const obj = ToObject($, thisValue);
          if (IsAbrupt(obj)) return obj;
          const len = yield* LengthOfArrayLike($, obj);
          if (IsAbrupt(len)) return len;
          const SortCompare = (x: Val, y: Val) => CompareArrayElements($, x, y, comparefn);
          const sortedList = yield* SortIndexedProperties($, obj, len, SortCompare, true);
          if (IsAbrupt(sortedList)) return sortedList;
          const itemCount = sortedList.length;
          let j = 0;
          for (; j < itemCount; j++) {
            const setStatus = yield* Set($, obj, String(j), sortedList[j], true);
            if (IsAbrupt(setStatus)) return setStatus;
          }
          for (; j < len; j++) {
            const deleteStatus = DeletePropertyOrThrow($, obj, String(j));
            if (IsAbrupt(deleteStatus)) return deleteStatus;
          }
          return obj;
        }),

        /**
         * 23.1.3.31 Array.prototype.splice ( start, deleteCount, ...items )
         * 
         * NOTE 1: This method deletes the deleteCount elements of the
         * array starting at integer index start and replaces them
         * with the elements of items. It returns an Array containing
         * the deleted elements (if any).
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let relativeStart be ? ToIntegerOrInfinity(start).
         * 4. If relativeStart = -∞, let actualStart be 0.
         * 5. Else if relativeStart < 0, let actualStart be max(len + relativeStart, 0).
         * 6. Else, let actualStart be min(relativeStart, len).
         * 7. Let itemCount be the number of elements in items.
         * 8. If start is not present, then
         *     a. Let actualDeleteCount be 0.
         * 9. Else if deleteCount is not present, then
         *     a. Let actualDeleteCount be len - actualStart.
         * 10. Else,
         *     a. Let dc be ? ToIntegerOrInfinity(deleteCount).
         *     b. Let actualDeleteCount be the result of clamping dc
         *        between 0 and len - actualStart.
         * 11. If len + itemCount - actualDeleteCount > 253 - 1, throw
         *     a TypeError exception.
         * 12. Let A be ? ArraySpeciesCreate(O, actualDeleteCount).
         * 13. Let k be 0.
         * 14. Repeat, while k < actualDeleteCount,
         *     a. Let from be ! ToString(𝔽(actualStart + k)).
         *     b. If ? HasProperty(O, from) is true, then
         *         i. Let fromValue be ? Get(O, from).
         *         ii. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(k)), fromValue).
         *     c. Set k to k + 1.
         * 15. Perform ? Set(A, "length", 𝔽(actualDeleteCount), true).
         * 16. If itemCount < actualDeleteCount, then
         *     a. Set k to actualStart.
         *     b. Repeat, while k < (len - actualDeleteCount),
         *         i. Let from be ! ToString(𝔽(k + actualDeleteCount)).
         *         ii. Let to be ! ToString(𝔽(k + itemCount)).
         *         iii. If ? HasProperty(O, from) is true, then
         *             1. Let fromValue be ? Get(O, from).
         *             2. Perform ? Set(O, to, fromValue, true).
         *         iv. Else,
         *             1. Perform ? DeletePropertyOrThrow(O, to).
         *         v. Set k to k + 1.
         *     c. Set k to len.
         *     d. Repeat, while k > (len - actualDeleteCount + itemCount),
         *         i. Perform ? DeletePropertyOrThrow(O, ! ToString(𝔽(k - 1))).
         *         ii. Set k to k - 1.
         * 17. Else if itemCount > actualDeleteCount, then
         *     a. Set k to (len - actualDeleteCount).
         *     b. Repeat, while k > actualStart,
         *         i. Let from be ! ToString(𝔽(k + actualDeleteCount - 1)).
         *         ii. Let to be ! ToString(𝔽(k + itemCount - 1)).
         *         iii. If ? HasProperty(O, from) is true, then
         *             1. Let fromValue be ? Get(O, from).
         *             2. Perform ? Set(O, to, fromValue, true).
         *         iv. Else,
         *             1. Perform ? DeletePropertyOrThrow(O, to).
         *         v. Set k to k - 1.
         * 18. Set k to actualStart.
         * 19. For each element E of items, do
         *     a. Perform ? Set(O, ! ToString(𝔽(k)), E, true).
         *     b. Set k to k + 1.
         * 20. Perform ? Set(O, "length", 𝔽(len - actualDeleteCount + itemCount), true).
         * 21. Return A.
         * 
         * NOTE 2; The explicit setting of the "length" property of
         * the result Array in step 20 was necessary in previous
         * editions of ECMAScript to ensure that its length was
         * correct in situations where the trailing elements of the
         * result Array were not present. Setting "length" became
         * unnecessary starting in ES2015 when the result Array was
         * initialized to its proper length rather than an empty Array
         * but is carried forward to preserve backward compatibility.
         * 
         * NOTE 3: This method is intentionally generic; it does not
         * require that its this value be a Array. Therefore it can
         * be transferred to other kinds of objects for use as a method.
         */
        'splice': method(function*($, thisValue, start, deleteCount, ...items) {  
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          let actualStart = LengthRelative(yield* ToIntegerOrInfinity($, start), len);
          if (IsAbrupt(actualStart)) return actualStart;
          // 8.
          let actualDeleteCount: number;
          if (arguments.length < 3) {
            actualDeleteCount = 0;
          } else if (arguments.length < 4) {
            actualDeleteCount = len - actualStart;
          } else {
            const dc = yield* ToIntegerOrInfinity($, deleteCount);
            if (IsAbrupt(dc)) return dc;
            actualDeleteCount = Math.min(Math.max(dc, 0), len - actualStart);
          }
          // 11.
          if (len + items.length - actualDeleteCount > Number.MAX_SAFE_INTEGER) {
            return $.throw('TypeError', 'Array length exceeds 2^53-1');
          }
          const A = yield* ArraySpeciesCreate($, O, actualDeleteCount);
          if (IsAbrupt(A)) return A;
          for (let k = 0; k < actualDeleteCount; k++) {
            const from = String(actualStart + k);
            const kPresent = HasProperty($, O, from);
            if (IsAbrupt(kPresent)) return kPresent;
            if (kPresent) {
              const fromValue = yield* Get($, O, from);
              if (IsAbrupt(fromValue)) return fromValue;
              const createStatus = CreateDataPropertyOrThrow($, A, String(k), fromValue);
              if (IsAbrupt(createStatus)) return createStatus;
            }
          }

          // TODO - somethig went wrong, only copying the last element from
          // calls argument.

          // 15.
          const setStatus = yield* Set($, A, 'length', actualDeleteCount, true);
          if (IsAbrupt(setStatus)) return setStatus;
          if (items.length < actualDeleteCount) {
            for (let k = actualStart; k < len - actualDeleteCount; k++) {
              const from = String(k + actualDeleteCount);
              const to = String(k + items.length);
              const kPresent = HasProperty($, O, from);
              if (IsAbrupt(kPresent)) return kPresent;
              if (kPresent) {
                const fromValue = yield* Get($, O, from);
                if (IsAbrupt(fromValue)) return fromValue;
                const setStatus = yield* Set($, O, to, fromValue, true);
                if (IsAbrupt(setStatus)) return setStatus;
              } else {
                const deleteStatus = DeletePropertyOrThrow($, O, to);
                if (IsAbrupt(deleteStatus)) return deleteStatus;
              }
            }
            for (let k = len; k > len - actualDeleteCount + items.length; k--) {
              const deleteStatus = DeletePropertyOrThrow($, O, String(k - 1));
              if (IsAbrupt(deleteStatus)) return deleteStatus;
            }
          } else if (items.length > actualDeleteCount) {
            // 17.a
            for (let k = len - actualDeleteCount; k > actualStart; k--) {
              const from = String(k + actualDeleteCount - 1);
              const to = String(k + items.length - 1);
              const kPresent = HasProperty($, O, from);
              if (IsAbrupt(kPresent)) return kPresent;
              if (kPresent) {
                const fromValue = yield* Get($, O, from);
                if (IsAbrupt(fromValue)) return fromValue;
                const setStatus = yield* Set($, O, to, fromValue, true);
                if (IsAbrupt(setStatus)) return setStatus;
              } else {
                const deleteStatus = DeletePropertyOrThrow($, O, to);
                if (IsAbrupt(deleteStatus)) return deleteStatus;
              }
            }
          }
          // 18.
          let k = actualStart;
          for (const E of items) {
            const setStatus = yield* Set($, O, String(k++), E, true);
            if (IsAbrupt(setStatus)) return setStatus;
          }
          const status = yield* Set($, O, 'length', len - actualDeleteCount + items.length, true);
          if (IsAbrupt(status)) return status;
          return A;
        }),

        /**
         * 23.1.3.32 Array.prototype.toLocaleString ( [ reserved1 [ , reserved2 ] ] )
         * 
         * An ECMAScript implementation that includes the ECMA-402
         * Internationalization API must implement this method as
         * specified in the ECMA-402 specification. If an ECMAScript
         * implementation does not include the ECMA-402 API the
         * following specification of this method is used.
         * 
         * NOTE 1: The first edition of ECMA-402 did not include a
         * replacement specification for this method.
         * 
         * The meanings of the optional parameters to this method are
         * defined in the ECMA-402 specification; implementations that
         * do not include ECMA-402 support must not use those
         * parameter positions for anything else.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let array be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(array).
         * 3. Let separator be the implementation-defined
         *    list-separator String value appropriate for the host
         *    environment\'s current locale (such as ", ").
         * 4. Let R be the empty String.
         * 5. Let k be 0.
         * 6. Repeat, while k < len,
         *     a. If k > 0, then
         *         i. Set R to the string-concatenation of R and separator.
         *     b. Let nextElement be ? Get(array, ! ToString(𝔽(k))).
         *     c. If nextElement is neither undefined nor null, then
         *         i. Let S be ? ToString(? Invoke(nextElement, "toLocaleString")).
         *         ii. Set R to the string-concatenation of R and S.
         *     d. Set k to k + 1.
         * 7. Return R.
         * 
         * NOTE 2: This method converts the elements of the array to
         * Strings using their toLocaleString methods, and then
         * concatenates these Strings, separated by occurrences of an
         * implementation-defined locale-sensitive separator
         * String. This method is analogous to toString except that it
         * is intended to yield a locale-sensitive result
         * corresponding with conventions of the host environment\'s
         * current locale.
         * 
         * NOTE 3: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'toLocaleString': method(function*($, thisValue) {
          const array = ToObject($, thisValue);
          if (IsAbrupt(array)) return array;
          const len = yield* LengthOfArrayLike($, array);
          if (IsAbrupt(len)) return len;
          const separator = ', ';
          let R = '';
          for (let k = 0; k < len; k++) {
            if (k) R += separator;
            const nextElement = yield* Get($, array, String(k));
            if (IsAbrupt(nextElement)) return nextElement;
            if (nextElement != null) {
              const result = yield* Invoke($, nextElement, 'toLocaleString');
              if (IsAbrupt(result)) return result;
              const S = yield* ToString($, result);
              if (IsAbrupt(S)) return S;
              R += S;
            }
          }
          return R;
        }),

        /**
         * 23.1.3.33 Array.prototype.toReversed ( )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let A be ? ArrayCreate(len).
         * 4. Let k be 0.
         * 5. Repeat, while k < len,
         *     a. Let from be ! ToString(𝔽(len - k - 1)).
         *     b. Let Pk be ! ToString(𝔽(k)).
         *     c. Let fromValue be ? Get(O, from).
         *     d. Perform ! CreateDataPropertyOrThrow(A, Pk, fromValue).
         *     e. Set k to k + 1.
         * 6. Return A.
         */
        'toReversed': method(function*($, thisValue) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          const A = ArrayCreate($, len);
          if (IsAbrupt(A)) return A;
          for (let k = 0; k < len; k++) {
            const from = String(len - k - 1);
            const Pk = String(k);
            const fromValue = yield* Get($, O, from);
            if (IsAbrupt(fromValue)) return fromValue;
            const createStatus = CreateDataPropertyOrThrow($, A, Pk, fromValue);
            if (IsAbrupt(createStatus)) return createStatus;
          }
          return A;
        }),

        /**
         * 23.1.3.34 Array.prototype.toSorted ( comparefn )
         * 
         * This method performs the following steps when called:
         * 
         * 1. If comparefn is not undefined and IsCallable(comparefn)
         *    is false, throw a TypeError exception.
         * 2. Let O be ? ToObject(this value).
         * 3. Let len be ? LengthOfArrayLike(O).
         * 4. Let A be ? ArrayCreate(len).
         * 5. Let SortCompare be a new Abstract Closure with
         *    parameters (x, y) that captures comparefn and performs the
         *    following steps when called:
         *     a. Return ? CompareArrayElements(x, y, comparefn).
         * 6. Let sortedList be ? SortIndexedProperties(O, len,
         *    SortCompare, read-through-holes).
         * 7. Let j be 0.
         * 8. Repeat, while j < len,
         *     a. Perform ! CreateDataPropertyOrThrow(A, ! ToString(𝔽(j)), sortedList[j]).
         *     b. Set j to j + 1.
         * 9. Return A.
         */
        'toSorted': method(function*($, thisValue, comparefn) {
          if (comparefn !== undefined && !IsCallable(comparefn)) {
            return $.throw('TypeError', `${DebugString(comparefn)} is not a function`);
          }
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          const A = ArrayCreate($, len);
          if (IsAbrupt(A)) return A;
          const SortCompare = (x: Val, y: Val) => CompareArrayElements($, x, y, comparefn);
          const sortedList = yield* SortIndexedProperties($, O, len, SortCompare, false);
          if (IsAbrupt(sortedList)) return sortedList;
          for (let j = 0; j < len; j++) {
            const createStatus = CreateDataPropertyOrThrow($, A, String(j), sortedList[j]);
            if (IsAbrupt(createStatus)) return createStatus;
          }
          return A;
        }),

        /**
         * 23.1.3.35 Array.prototype.toSpliced ( start, skipCount, ...items )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let relativeStart be ? ToIntegerOrInfinity(start).
         * 4. If relativeStart is -∞, let actualStart be 0.
         * 5. Else if relativeStart < 0, let actualStart be max(len + relativeStart, 0).
         * 6. Else, let actualStart be min(relativeStart, len).
         * 7. Let insertCount be the number of elements in items.
         * 8. If start is not present, then
         *     a. Let actualSkipCount be 0.
         * 9. Else if skipCount is not present, then
         *     a. Let actualSkipCount be len - actualStart.
         * 10. Else,
         *     a. Let sc be ? ToIntegerOrInfinity(skipCount).
         *     b. Let actualSkipCount be the result of clamping sc
         *        between 0 and len - actualStart.
         * 11. Let newLen be len + insertCount - actualSkipCount.
         * 12. If newLen > 253 - 1, throw a TypeError exception.
         * 13. Let A be ? ArrayCreate(newLen).
         * 14. Let i be 0.
         * 15. Let r be actualStart + actualSkipCount.
         * 16. Repeat, while i < actualStart,
         *     a. Let Pi be ! ToString(𝔽(i)).
         *     b. Let iValue be ? Get(O, Pi).
         *     c. Perform ! CreateDataPropertyOrThrow(A, Pi, iValue).
         *     d. Set i to i + 1.
         * 17. For each element E of items, do
         *     a. Let Pi be ! ToString(𝔽(i)).
         *     b. Perform ! CreateDataPropertyOrThrow(A, Pi, E).
         *     c. Set i to i + 1.
         * 18. Repeat, while i < newLen,
         *     a. Let Pi be ! ToString(𝔽(i)).
         *     b. Let from be ! ToString(𝔽(r)).
         *     c. Let fromValue be ? Get(O, from).
         *     d. Perform ! CreateDataPropertyOrThrow(A, Pi, fromValue).
         *     e. Set i to i + 1.
         *     f. Set r to r + 1.
         * 19. Return A.
         */
        'toSpliced': method(function*($, thisValue, start, skipCount, ...items) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          let actualStart = LengthRelative(yield* ToIntegerOrInfinity($, start), len);
          if (IsAbrupt(actualStart)) return actualStart;
          let actualSkipCount: number;
          if (arguments.length < 3) {
            actualSkipCount = 0;
          } else if (arguments.length < 4) {
            actualSkipCount = len - actualStart;
          } else {
            const sc = yield* ToIntegerOrInfinity($, skipCount);
            if (IsAbrupt(sc)) return sc;
            actualSkipCount = Math.min(Math.max(sc, 0), len - actualStart);
          }
          const newLen = len + items.length - actualSkipCount;
          if (newLen > Number.MAX_SAFE_INTEGER) {
            return $.throw('TypeError', 'Array length exceeds 2^53-1');
          }
          const A = ArrayCreate($, newLen);
          if (IsAbrupt(A)) return A;
          let i = 0;
          let r = actualStart + actualSkipCount;
          for (; i < actualStart; i++) {
            const Pi = String(i);
            const iValue = yield* Get($, O, Pi);
            if (IsAbrupt(iValue)) return iValue;
            CastNotAbrupt(CreateDataPropertyOrThrow($, A, Pi, iValue));
          }
          for (const E of items) {
            const Pi = String(i++);
            CastNotAbrupt(CreateDataPropertyOrThrow($, A, Pi, E));
          }
          for (; i < newLen; i++) {
            const Pi = String(i);
            const from = String(r++);
            const fromValue = yield* Get($, O, from);
            if (IsAbrupt(fromValue)) return fromValue;
            CastNotAbrupt(CreateDataPropertyOrThrow($, A, Pi, fromValue));
          }
          return A;
        }),

        /**
         * 23.1.3.36 Array.prototype.toString ( )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let array be ? ToObject(this value).
         * 2. Let func be ? Get(array, "join").
         * 3. If IsCallable(func) is false, set func to the intrinsic
         *    function %Object.prototype.toString%.
         * 4. Return ? Call(func, array).
         * 
         * NOTE: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'toString': method(function*($, thisValue) {
          const array = ToObject($, thisValue);
          if (IsAbrupt(array)) return array;
          let func = yield* Get($, array, 'join');
          if (IsAbrupt(func)) return func;
          if (!IsCallable(func)) {
            func = $.getIntrinsic('%Object.prototype.toString%');
          }
          return yield* Call($, func, array);
        }),

        /**
         * 23.1.3.37 Array.prototype.unshift ( ...items )
         * 
         * This method prepends the arguments to the start of the
         * array, such that their order within the array is the same
         * as the order in which they appear in the argument list.
         * 
         * It performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let argCount be the number of elements in items.
         * 4. If argCount > 0, then
         *     a. If len + argCount > 253 - 1, throw a TypeError exception.
         *     b. Let k be len.
         *     c. Repeat, while k > 0,
         *         i. Let from be ! ToString(𝔽(k - 1)).
         *         ii. Let to be ! ToString(𝔽(k + argCount - 1)).
         *         iii. Let fromPresent be ? HasProperty(O, from).
         *         iv. If fromPresent is true, then
         *             1. Let fromValue be ? Get(O, from).
         *             2. Perform ? Set(O, to, fromValue, true).
         *         v. Else,
         *             1. Assert: fromPresent is false.
         *             2. Perform ? DeletePropertyOrThrow(O, to).
         *         vi. Set k to k - 1.
         *     d. Let j be +0𝔽.
         *     e. For each element E of items, do
         *         i. Perform ? Set(O, ! ToString(j), E, true).
         *         ii. Set j to j + 1𝔽.
         * 5. Perform ? Set(O, "length", 𝔽(len + argCount), true).
         * 6. Return 𝔽(len + argCount).
         * 
         * The "length" property of this method is 1𝔽.
         * 
         * NOTE: This method is intentionally generic; it does not
         * require that its this value be an Array. Therefore it can
         * be transferred to other kinds of objects for use as a
         * method.
         */
        'unshift': method(function*($, thisValue, ...items) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          const argCount = items.length;
          if (argCount) {
            if (len + argCount > Number.MAX_SAFE_INTEGER) {
              return $.throw('TypeError', 'Array length exceeds 2^53-1');
            }
            for (let k = len; k > 0; k--) {
              const from = String(k - 1);
              const to = String(k + argCount - 1);
              const fromPresent = HasProperty($, O, from);
              if (IsAbrupt(fromPresent)) return fromPresent;
              if (fromPresent) {
                const fromValue = yield* Get($, O, from);
                if (IsAbrupt(fromValue)) return fromValue;
                const setStatus = yield* Set($, O, to, fromValue, true);
                if (IsAbrupt(setStatus)) return setStatus;
              } else {
                const deleteStatus = DeletePropertyOrThrow($, O, to);
                if (IsAbrupt(deleteStatus)) return deleteStatus;
              }
            }
            let j = 0;
            for (const E of items) {
              const setStatus = yield* Set($, O, String(j), E, true);
              if (IsAbrupt(setStatus)) return setStatus;
              j++;
            }
          }
          const setStatus = yield* Set($, O, 'length', len + argCount, true);
          if (IsAbrupt(setStatus)) return setStatus;
          return len + argCount;
        }, 1),

        /**
         * 23.1.3.38 Array.prototype.values ( )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Return CreateArrayIterator(O, value).
         */
        'values': propWC(arrayPrototypeValues),

        /**
         * 23.1.3.39 Array.prototype.with ( index, value )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let O be ? ToObject(this value).
         * 2. Let len be ? LengthOfArrayLike(O).
         * 3. Let relativeIndex be ? ToIntegerOrInfinity(index).
         * 4. If relativeIndex ≥ 0, let actualIndex be relativeIndex.
         * 5. Else, let actualIndex be len + relativeIndex.
         * 6. If actualIndex ≥ len or actualIndex < 0, throw a RangeError exception.
         * 7. Let A be ? ArrayCreate(len).
         * 8. Let k be 0.
         * 9. Repeat, while k < len,
         *     a. Let Pk be ! ToString(𝔽(k)).
         *     b. If k is actualIndex, let fromValue be value.
         *     c. Else, let fromValue be ? Get(O, Pk).
         *     d. Perform ! CreateDataPropertyOrThrow(A, Pk, fromValue).
         *     e. Set k to k + 1.
         * 10. Return A.
         */
        'with': method(function*($, thisValue, index, value) {
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const len = yield* LengthOfArrayLike($, O);
          if (IsAbrupt(len)) return len;
          const relativeIndex = yield* ToIntegerOrInfinity($, index);
          if (IsAbrupt(relativeIndex)) return relativeIndex;
          const actualIndex = relativeIndex >= 0 ? relativeIndex : len + relativeIndex;
          if (actualIndex >= len || actualIndex < 0) {
            return $.throw('RangeError', 'Index out of bounds');
          }
          const A = ArrayCreate($, len);
          if (IsAbrupt(A)) return A;
          for (let k = 0; k < len; k++) {
            const Pk = String(k);
            const fromValue = k === actualIndex ? value : yield* Get($, O, Pk);
            if (IsAbrupt(fromValue)) return fromValue;
            CastNotAbrupt(CreateDataPropertyOrThrow($, A, Pk, fromValue));
          }
          return A;
        }),

        /**
         * 23.1.3.40 Array.prototype [ @@iterator ] ( )
         * 
         * The initial value of the @@iterator property is
         * %Array.prototype.values%, defined in 23.1.3.38.
         */
        [Symbol.iterator]: propWC(arrayPrototypeValues),

        /**
         * 23.1.3.41 Array.prototype [ @@unscopables ]
         * 
         * The initial value of the @@unscopables data property is an
         * object created by the following steps:
         * 
         * 1. Let unscopableList be OrdinaryObjectCreate(null).
         * 2. Perform ! CreateDataPropertyOrThrow(unscopableList, "at", true).
         * 3. Perform ! CreateDataPropertyOrThrow(unscopableList, "copyWithin", true).
         * 4. Perform ! CreateDataPropertyOrThrow(unscopableList, "entries", true).
         * 5. Perform ! CreateDataPropertyOrThrow(unscopableList, "fill", true).
         * 6. Perform ! CreateDataPropertyOrThrow(unscopableList, "find", true).
         * 7. Perform ! CreateDataPropertyOrThrow(unscopableList, "findIndex", true).
         * 8. Perform ! CreateDataPropertyOrThrow(unscopableList, "findLast", true).
         * 9. Perform ! CreateDataPropertyOrThrow(unscopableList, "findLastIndex", true).
         * 10. Perform ! CreateDataPropertyOrThrow(unscopableList, "flat", true).
         * 11. Perform ! CreateDataPropertyOrThrow(unscopableList, "flatMap", true).
         * 12. Perform ! CreateDataPropertyOrThrow(unscopableList, "includes", true).
         * 13. Perform ! CreateDataPropertyOrThrow(unscopableList, "keys", true).
         * 14. Perform ! CreateDataPropertyOrThrow(unscopableList, "toReversed", true).
         * 15. Perform ! CreateDataPropertyOrThrow(unscopableList, "toSorted", true).
         * 16. Perform ! CreateDataPropertyOrThrow(unscopableList, "toSpliced", true).
         * 17. Perform ! CreateDataPropertyOrThrow(unscopableList, "values", true).
         * 18. Return unscopableList.
         * 
         * This property has the attributes { [[Writable]]: false,
         * [[Enumerable]]: false, [[Configurable]]: true }.
         * 
         * NOTE: The own property names of this object are property
         * names that were not included as standard properties of
         * Array.prototype prior to the ECMAScript 2015 specification.
         * These names are ignored for with statement binding purposes
         * in order to preserve the behaviour of existing code that might
         * use one of these names as a binding in an outer scope that is
         * shadowed by a with statement whose binding object is an Array.
         * 
         * The reason that "with" is not included in the unscopableList
         * is because it is already a reserved word.
         */
        [Symbol.unscopables]: propC(OrdinaryObjectCreate({
          Prototype: null,
        }, {
          'at': propWEC(true),
          'copyWithin': propWEC(true),
          'entries': propWEC(true),
          'fill': propWEC(true),
          'find': propWEC(true),
          'findIndex': propWEC(true),
          'findLast': propWEC(true),
          'findLastIndex': propWEC(true),
          'flat': propWEC(true),
          'flatMap': propWEC(true),
          'includes': propWEC(true),
          'keys': propWEC(true),
          'toReversed': propWEC(true),
          'toSorted': propWEC(true),
          'toSpliced': propWEC(true),
          'values': propWEC(true),
        })),
      });

      // TODO - peel this off - arrays are only iterable if we _have_ an iterator.
      // We could also peel off IteratorPrototype as a fundamental intrinsic and
      // only populate it in the plugin?

      /**
       * 23.1.5.2 The %ArrayIteratorPrototype% Object
       *  
       * The %ArrayIteratorPrototype% object:
       * 
       *   - has properties that are inherited by all Array Iterator Objects.
       *   - is an ordinary object.
       *   - has a [[Prototype]] internal slot whose value is %IteratorPrototype%.
       *   - has the following properties:
       */
      const arrayIteratorPrototype = OrdinaryObjectCreate({
        Prototype: realm.Intrinsics.get('%IteratorPrototype%')!,
      });
      realm.Intrinsics.set('%ArrayIteratorPrototype%', arrayIteratorPrototype);

      defineProperties(realm, arrayIteratorPrototype, {
        /**
         * 23.1.5.2.1 %ArrayIteratorPrototype%.next ( )
         * 
         * 1. Return ? GeneratorResume(this value, empty, "%ArrayIteratorPrototype%").
         */
        'next': methodO(function*($, thisValue) {
          return yield* GeneratorResume(
            $, thisValue, undefined /*EMPTY*/, '%ArrayIteratorPrototype%');
        }),

        /**
         * 23.1.5.2.2 %ArrayIteratorPrototype% [ @@toStringTag ]
         * 
         * The initial value of the @@toStringTag property is the
         * String value "Array Iterator".
         * 
         * This property has the attributes { [[Writable]]: false,
         * [[Enumerable]]: false, [[Configurable]]: true }.
         */
        [Symbol.toStringTag]: propC('Array Iterator'),
      });
    },
  },
};


/**
 * 23.1.3.2.1 IsConcatSpreadable ( O )
 * 
 * The abstract operation IsConcatSpreadable takes argument O (an
 * ECMAScript language value) and returns either a normal completion
 * containing a Boolean or a throw completion. It performs the
 * following steps when called:
 * 
 * 1. If O is not an Object, return false.
 * 2. Let spreadable be ? Get(O, @@isConcatSpreadable).
 * 3. If spreadable is not undefined, return ToBoolean(spreadable).
 * 4. Return ? IsArray(O).
 */
function* IsConcatSpreadable($: VM, O: Val): ECR<boolean> {
  if (!(O instanceof Obj)) return false;
  const spreadable = yield* Get($, O, Symbol.isConcatSpreadable);
  if (IsAbrupt(spreadable)) return spreadable;
  if (spreadable !== undefined) return ToBoolean(spreadable);
  return IsArray($, O);
}

/**
 * 23.1.3.12.1 FindViaPredicate ( O, len, direction, predicate, thisArg )
 * 
 * The abstract operation FindViaPredicate takes arguments O
 * (an Object), len (a non-negative integer), direction
 * (ascending or descending), predicate (an ECMAScript
 * language value), and thisArg (an ECMAScript language value)
 * and returns either a normal completion containing a Record
 * with fields [[Index]] (an integral Number) and [[Value]]
 * (an ECMAScript language value) or a throw completion.
 * 
 * O should be an array-like object or a TypedArray. This
 * operation calls predicate once for each element of O, in
 * either ascending index order or descending index order (as
 * indicated by direction), until it finds one where predicate
 * returns a value that coerces to true. At that point, this
 * operation returns a Record that gives the index and value
 * of the element found. If no such element is found, this
 * operation returns a Record that specifies -1𝔽 for the index
 * and undefined for the value.
 * 
 * predicate should be a function. When called for an element
 * of the array, it is passed three arguments: the value of
 * the element, the index of the element, and the object being
 * traversed. Its return value will be coerced to a Boolean
 * value.
 * 
 * thisArg will be used as the this value for each invocation
 * of predicate.
 * 
 * This operation does not directly mutate the object on which
 * it is called, but the object may be mutated by the calls to
 * predicate.
 * 
 * The range of elements processed is set before the first
 * call to predicate, just before the traversal
 * begins. Elements that are appended to the array after this
 * will not be visited by predicate. If existing elements of
 * the array are changed, their value as passed to predicate
 * will be the value at the time that this operation visits
 * them. Elements that are deleted after traversal begins and
 * before being visited are still visited and are either
 * looked up from the prototype or are undefined.
 *
 * It performs the following steps when called:
 * 
 * 1. If IsCallable(predicate) is false, throw a TypeError exception.
 * 2. If direction is ascending, then
 *     a. Let indices be a List of the integers in the
 *        interval from 0 (inclusive) to len (exclusive), in
 *        ascending order.
 * 3. Else,
 *     a. Let indices be a List of the integers in the
 *        interval from 0 (inclusive) to len (exclusive), in
 *        descending order.
 * 4. For each integer k of indices, do
 *     a. Let Pk be ! ToString(𝔽(k)).
 *     b. NOTE: If O is a TypedArray, the following invocation
 *        of Get will return a normal completion.
 *     c. Let kValue be ? Get(O, Pk).
 *     d. Let testResult be ? Call(predicate, thisArg, « kValue, 𝔽(k), O »).
 *     e. If ToBoolean(testResult) is true, return the Record
 *        { [[Index]]: 𝔽(k), [[Value]]: kValue }.
 * 5. Return the Record { [[Index]]: -1𝔽, [[Value]]: undefined }.
 */
export function* FindViaPredicate(
  $: VM,
  O: Obj,
  len: number,
  reverse: boolean,
  predicate: Val,
  thisArg: Val,
  returnIndex: boolean,
): ECR<Val> {
  if (!IsCallable(predicate)) {
    return $.throw('TypeError', `${DebugString(predicate)} is not a function`);
  }
  for (let i = 0; i < len; i++) {
    const k = reverse ? len - i - 1 : i;
    const Pk = String(k);
    const kValue = yield* Get($, O, Pk);
    if (IsAbrupt(kValue)) return kValue;
    const testResult = yield* Call($, predicate, thisArg, [kValue, k, O]);
    if (IsAbrupt(testResult)) return testResult;
    if (ToBoolean(testResult)) return returnIndex ? k : kValue;
  }
  return returnIndex ? -1 : undefined;
}

function* FindViaPredicate_Array(
  $: VM,
  thisValue: Val,
  reverse: boolean,
  predicate: Val,
  thisArg: Val,
  returnIndex: boolean,
): ECR<Val> {
  const O = ToObject($, thisValue);
  if (IsAbrupt(O)) return O;
  const len = yield* LengthOfArrayLike($, O);
  if (IsAbrupt(len)) return len;
  return yield* FindViaPredicate($, O, len, reverse, predicate, thisArg, returnIndex);
}

/**
 * 23.1.3.13.1 FlattenIntoArray ( target, source, sourceLen,
 *                                start, depth [ , mapperFunction [ , thisArg ] ] )
 * 
 * The abstract operation FlattenIntoArray takes arguments
 * target (an Object), source (an Object), sourceLen (a
 * non-negative integer), start (a non-negative integer), and
 * depth (a non-negative integer or +∞) and optional arguments
 * mapperFunction (a function object) and thisArg (an
 * ECMAScript language value) and returns either a normal
 * completion containing a non-negative integer or a throw
 * completion. It performs the following steps when called:
 * 
 * 1. Assert: If mapperFunction is present, then
 *    IsCallable(mapperFunction) is true, thisArg is present, and
 *    depth is 1.
 * 2. Let targetIndex be start.
 * 3. Let sourceIndex be +0𝔽.
 * 4. Repeat, while ℝ(sourceIndex) < sourceLen,
 *     a. Let P be ! ToString(sourceIndex).
 *     b. Let exists be ? HasProperty(source, P).
 *     c. If exists is true, then
 *         i. Let element be ? Get(source, P).
 *         ii. If mapperFunction is present, then
 *             1. Set element to ? Call(mapperFunction,
 *                thisArg, « element, sourceIndex, source »).
 *         iii. Let shouldFlatten be false.
 *         iv. If depth > 0, then
 *             1. Set shouldFlatten to ? IsArray(element).
 *         v. If shouldFlatten is true, then
 *             1. If depth = +∞, let newDepth be +∞.
 *             2. Else, let newDepth be depth - 1.
 *             3. Let elementLen be ? LengthOfArrayLike(element).
 *             4. Set targetIndex to ? FlattenIntoArray(
 *                target, element, elementLen, targetIndex, newDepth).
 *         vi. Else,
 *             1. If targetIndex ≥ 253 - 1, throw a TypeError exception.
 *             2. Perform ? CreateDataPropertyOrThrow(target,
 *                ! ToString(𝔽(targetIndex)), element).
 *             3. Set targetIndex to targetIndex + 1.
 *     d. Set sourceIndex to sourceIndex + 1𝔽.
 * 5. Return targetIndex.
 */
function* FlattenIntoArray(
  $: VM,
  target: Obj,
  source: Obj,
  sourceLen: number,
  start: number,
  depth: number,
  mapperFunction?: Val,
  thisArg?: Val,
): ECR<number> {
  Assert(!mapperFunction || (IsCallable(mapperFunction) && depth === 1));
  let targetIndex: CR<number> = start;
  for (let sourceIndex = 0; sourceIndex < sourceLen; sourceIndex++) {
    const P = String(sourceIndex);
    const exists = HasProperty($, source, P);
    if (IsAbrupt(exists)) return exists;
    if (exists) {
      let element = yield* Get($, source, P);
      if (IsAbrupt(element)) return element;
      if (mapperFunction !== undefined) {
        element = yield* Call($, mapperFunction, thisArg, [element, sourceIndex, source]);
        if (IsAbrupt(element)) return element;
      }
      let shouldFlatten: CR<boolean> = false;
      if (depth > 0) {
        shouldFlatten = IsArray($, element);
        if (IsAbrupt(shouldFlatten)) return shouldFlatten;
      }
      if (shouldFlatten) {
        Assert(element instanceof Obj);
        const newDepth = depth - 1;
        const elementLen = yield* LengthOfArrayLike($, element);
        if (IsAbrupt(elementLen)) return elementLen;
        targetIndex = yield* FlattenIntoArray(
          $, target, element, elementLen, targetIndex, newDepth);
        if (IsAbrupt(targetIndex)) return targetIndex;
      } else {
        if (targetIndex >= Number.MAX_SAFE_INTEGER) {
          return $.throw('TypeError', 'Array too large');
        }
        const setStatus = CreateDataPropertyOrThrow($, target, String(targetIndex), element);
        if (IsAbrupt(setStatus)) return setStatus;
      }
    }
  }
  return targetIndex;
}

/**
 * 23.1.3.30.1 SortIndexedProperties ( obj, len, SortCompare, holes )
 * 
 * The abstract operation SortIndexedProperties takes arguments obj
 * (an Object), len (a non-negative integer), SortCompare (an Abstract
 * Closure with two parameters), and holes (skip-holes or
 * read-through-holes) and returns either a normal completion
 * containing a List of ECMAScript language values or a throw
 * completion. It performs the following steps when called:
 * 
 * 1. Let items be a new empty List.
 * 2. Let k be 0.
 * 3. Repeat, while k < len,
 *     a. Let Pk be ! ToString(𝔽(k)).
 *     b. If holes is skip-holes, then
 *         i. Let kRead be ? HasProperty(obj, Pk).
 *     c. Else,
 *         i. Assert: holes is read-through-holes.
 *         ii. Let kRead be true.
 *     d. If kRead is true, then
 *         i. Let kValue be ? Get(obj, Pk).
 *         ii. Append kValue to items.
 *     e. Set k to k + 1.
 * 4. Sort items using an implementation-defined sequence of calls to
 *    SortCompare. If any such call returns an abrupt completion, stop
 *    before performing any further calls to SortCompare and return that
 *    Completion Record.
 * 5. Return items.
 *
 * (Eliding mathematical commentary about consistent sort requirements, etc)
 */
function* SortIndexedProperties (
  $: VM,
  obj: Obj,
  len: number,
  SortCompare: (a: Val, b: Val) => ECR<number>,
  skipHoles: boolean,
): ECR<Val[]> {
  const items = [];
  for (let k = 0; k < len; k++) {
    const Pk = String(k);
    if (skipHoles) {
      const kRead = HasProperty($, obj, Pk);
      if (IsAbrupt(kRead)) return kRead;
      if (!kRead) continue;
    }
    const kValue = yield* Get($, obj, Pk);
    if (IsAbrupt(kValue)) return kValue;
    items.push(kValue);
  }
  return yield* MergeSort(items, SortCompare);
}

// NOTE: This algorithm from https://en.wikipedia.org/wiki/Merge_sort
function* MergeSort(A: Val[], SortCompare: (a: Val, b: Val) => ECR<number>): ECR<Val[]> {
  const n = A.length;
  let B = new Array(n);
  // Each 1-element run in A is already "sorted".
  // Make successively longer sorted runs of length 2, 4, 8, 16... until the whole array is sorted.
  for (let width = 1; width < n; width <<= 1) {
    // Array A is full of runs of length width.
    for (let i = 0; i < n; i = i + 2 * width) {
      // Merge two runs: A[i:i+width-1] and A[i+width:i+2*width-1] to B[]
      // or copy A[i:n-1] to B[] ( if (i+width >= n) )
      yield* BottomUpMerge(i, Math.min(i + width, n), Math.min(i + (width << 1), n));
    }
    // Now work array B is full of runs of length 2*width.
    // Copy array B to array A for the next iteration.
    // A more efficient implementation would swap the roles of A and B.
    [A, B] = [B, A];
    // Now array A is full of runs of length 2*width.
  }
  return A;

  //  Left run is A[iLeft :iRight-1].
  // Right run is A[iRight:iEnd-1  ].
  function* BottomUpMerge(iLeft: number, iRight: number, iEnd: number): ECR<void> {
    let i = iLeft;
    let j = iRight;
    // While there are elements in the left or right runs...
    for (let k = iLeft; k < iEnd; k++) {
      // If left run head exists and is <= existing right run head.
      let lessEqual = i < iRight;
      if (lessEqual && (j < iEnd)) {
        const cmp = yield* SortCompare(A[i], A[j]);
        if (IsAbrupt(cmp)) return cmp;
        lessEqual = cmp <= 0;
      }
      if (lessEqual) {
        B[k] = A[i];
        i = i + 1;
      } else {
        B[k] = A[j];
        j = j + 1;    
      }
    } 
  }
}

/**
 * 23.1.3.30.2 CompareArrayElements ( x, y, comparefn )
 * 
 * The abstract operation CompareArrayElements takes arguments x (an
 * ECMAScript language value), y (an ECMAScript language value), and
 * comparefn (a function object or undefined) and returns either a
 * normal completion containing a Number or an abrupt completion. It
 * performs the following steps when called:
 * 
 * 1. If x and y are both undefined, return +0𝔽.
 * 2. If x is undefined, return 1𝔽.
 * 3. If y is undefined, return -1𝔽.
 * 4. If comparefn is not undefined, then
 *     a. Let v be ? ToNumber(? Call(comparefn, undefined, « x, y »)).
 *     b. If v is NaN, return +0𝔽.
 *     c. Return v.
 * 5. Let xString be ? ToString(x).
 * 6. Let yString be ? ToString(y).
 * 7. Let xSmaller be ! IsLessThan(xString, yString, true).
 * 8. If xSmaller is true, return -1𝔽.
 * 9. Let ySmaller be ! IsLessThan(yString, xString, true).
 * 10. If ySmaller is true, return 1𝔽.
 * 11. Return +0𝔽.
 */
function* CompareArrayElements($: VM, x: Val, y: Val, comparefn?: Val): ECR<number> {
  if (x === undefined && y === undefined) return 0;
  if (x === undefined) return 1;
  if (y === undefined) return -1;
  if (comparefn !== undefined) {
    const callResult = yield* Call($, comparefn, undefined, [x, y]);
    if (IsAbrupt(callResult)) return callResult;
    const v = yield* ToNumber($, callResult);
    if (IsAbrupt(v)) return v;
    if (isNaN(v)) return 0;
    return v;
  }
  const xString = yield* ToString($, x);
  if (IsAbrupt(xString)) return xString;
  const yString = yield* ToString($, y);
  if (IsAbrupt(yString)) return yString
  return xString < yString ? -1 : yString < xString ? 1 : 0;
}

/**
 * 23.1.5.1 CreateArrayIterator ( array, kind )
 * 
 * The abstract operation CreateArrayIterator takes arguments array
 * (an Object) and kind (key+value, key, or value) and returns a
 * Generator. It is used to create iterator objects for Array methods
 * that return such iterators. It performs the following steps when
 * called:
 * 
 * 1. Let closure be a new Abstract Closure with no parameters that
 *    captures kind and array and performs the following steps when
 *    called:
 *     a. Let index be 0.
 *     b. Repeat,
 *         i. If array has a [[TypedArrayName]] internal slot, then
 *             1. If IsDetachedBuffer(array.[[ViewedArrayBuffer]]) is
 *                true, throw a TypeError exception.
 *             2. Let len be array.[[ArrayLength]].
 *         ii. Else,
 *             1. Let len be ? LengthOfArrayLike(array).
 *         iii. If index ≥ len, return NormalCompletion(undefined).
 *         iv. If kind is key, perform ?
 *             GeneratorYield(CreateIterResultObject(𝔽(index), false)).
 *         v. Else,
 *             1. Let elementKey be ! ToString(𝔽(index)).
 *             2. Let elementValue be ? Get(array, elementKey).
 *             3. If kind is value, perform ?
 *                GeneratorYield(CreateIterResultObject(elementValue, false)).
 *             4. Else,
 *                 a. Assert: kind is key+value.
 *                 b. Let result be CreateArrayFromList(« 𝔽(index), elementValue »).
 *                 c. Perform ? GeneratorYield(CreateIterResultObject(result, false)).
 *         vi. Set index to index + 1.
 * 2. Return CreateIteratorFromClosure(closure,
 *    "%ArrayIteratorPrototype%", %ArrayIteratorPrototype%).
 */
export function CreateArrayIterator(
  $: VM,
  array: Obj,
  kind: 'key'|'value'|'key+value',
): Obj {
  function* closure() {
    let index = 0;
    let len: CR<number>;
    while (true) {
      if (array.TypedArrayName) {
        if (IsDetachedBuffer($, array.ViewedArrayBuffer)) {
          return $.throw('TypeError', '23.1.5.1 / 1.b.i.1');
        }
        len = array.ArrayLength!;
      } else {
        len = yield* LengthOfArrayLike($, array);
        if (IsAbrupt(len)) return len;
      }
      if (index >= len) return undefined;
      if (kind === 'key') {
        const status = yield* GeneratorYield($, CreateIterResultObject($, index, false));
        if (IsAbrupt(status)) return status;
      } else {
        const elementKey = String(index);
        const elementValue = yield* Get($, array, elementKey);
        if (IsAbrupt(elementValue)) return elementValue;
        if (kind === 'value') {
          yield* GeneratorYield($, CreateIterResultObject($, elementValue, false));
        } else {
          const result = CreateArrayFromList($, [index, elementValue]);
          yield* GeneratorYield($, CreateIterResultObject($, result, false));
        }
      }
      index++;
    }
  };
  return CreateIteratorFromClosure(
    $, closure, '%ArrayIteratorPrototype%', $.getIntrinsic('%ArrayIteratorPrototype%')!);
}

function LengthRelative(signed: CR<number>, len: number): CR<number> {
  if (IsAbrupt(signed)) return signed;
  if (signed < 0) return Math.max(len + signed, 0);
  return Math.min(signed, len);
}

/**
 * 13.2.4.1 Runtime Semantics: ArrayAccumulation
 * 
 * The syntax-directed operation ArrayAccumulation takes arguments
 * array (an Array) and nextIndex (an integer) and returns either a
 * normal completion containing an integer or an abrupt completion. It
 * is defined piecewise over the following productions:
 * 
 * Elision : ,
 * 1. Let len be nextIndex + 1.
 * 2. Perform ? Set(array, "length", 𝔽(len), true).
 * 3. NOTE: The above step throws if len exceeds 232-1.
 * 4. Return len.
 * 
 * Elision : Elision ,
 * 1. Return ? ArrayAccumulation of Elision with arguments array and (nextIndex + 1).
 * 
 * ElementList : Elisionopt AssignmentExpression
 * 1. If Elision is present, then
 *     a. Set nextIndex to ? ArrayAccumulation of Elision with arguments array and nextIndex.
 * 2. Let initResult be ? Evaluation of AssignmentExpression.
 * 3. Let initValue be ? GetValue(initResult).
 * 4. Perform ! CreateDataPropertyOrThrow(array, ! ToString(𝔽(nextIndex)), initValue).
 * 5. Return nextIndex + 1.
 * 
 * ElementList : Elisionopt SpreadElement
 * 1. If Elision is present, then
 *     a. Set nextIndex to ? ArrayAccumulation of Elision with arguments array and nextIndex.
 * 2. Return ? ArrayAccumulation of SpreadElement with arguments array and nextIndex.
 * 
 * ElementList : ElementList , Elisionopt AssignmentExpression
 * 1. Set nextIndex to ? ArrayAccumulation of ElementList with arguments array and nextIndex.
 * 2. If Elision is present, then
 *     a. Set nextIndex to ? ArrayAccumulation of Elision with arguments array and nextIndex.
 * 3. Let initResult be ? Evaluation of AssignmentExpression.
 * 4. Let initValue be ? GetValue(initResult).
 * 5. Perform ! CreateDataPropertyOrThrow(array, ! ToString(𝔽(nextIndex)), initValue).
 * 6. Return nextIndex + 1.
 * 
 * ElementList : ElementList , Elisionopt SpreadElement
 * 1. Set nextIndex to ? ArrayAccumulation of ElementList with arguments array and nextIndex.
 * 2. If Elision is present, then
 *     a. Set nextIndex to ? ArrayAccumulation of Elision with arguments array and nextIndex.
 * 3. Return ? ArrayAccumulation of SpreadElement with arguments array and nextIndex.
 * 
 * SpreadElement : ... AssignmentExpression
 * 1. Let spreadRef be ? Evaluation of AssignmentExpression.
 * 2. Let spreadObj be ? GetValue(spreadRef).
 * 3. Let iteratorRecord be ? GetIterator(spreadObj, sync).
 * 4. Repeat,
 *     a. Let next be ? IteratorStep(iteratorRecord).
 *     b. If next is false, return nextIndex.
 *     c. Let nextValue be ? IteratorValue(next).
 *     d. Perform ! CreateDataPropertyOrThrow(array, ! ToString(𝔽(nextIndex)), nextValue).
 *     e. Set nextIndex to nextIndex + 1.
 * 
 * NOTE: CreateDataPropertyOrThrow is used to ensure that own
 * properties are defined for the array even if the standard built-in
 * Array prototype object has been modified in a manner that would
 * preclude the creation of new own properties using [[Set]].
 * 
 * ---
 *
 * 13.2.4.2 Runtime Semantics: Evaluation
 * 
 * ArrayLiteral : [ Elisionopt ]
 * 1. Let array be ! ArrayCreate(0).
 * 2. If Elision is present, then
 *     a. Perform ? ArrayAccumulation of Elision with arguments array and 0.
 * 3. Return array.
 * 
 * ArrayLiteral : [ ElementList ]
 * 1. Let array be ! ArrayCreate(0).
 * 2. Perform ? ArrayAccumulation of ElementList with arguments array and 0.
 * 3. Return array.
 * 
 * ArrayLiteral : [ ElementList , Elisionopt ]
 * 1. Let array be ! ArrayCreate(0).
 * 2. Let nextIndex be ? ArrayAccumulation of ElementList with arguments array and 0.
 * 3. If Elision is present, then
 *     a. Perform ? ArrayAccumulation of Elision with arguments array and nextIndex.
 * 4. Return array.
 */
export function* Evaluation_ArrayExpression($: VM, node: ArrayExpression): ECR<Obj> {
  const elements: Array<Val|EMPTY> = [];
  for (const e of node.elements) {
    if (e?.type === 'SpreadElement') {
      const spreadObj = yield* $.evaluateValue(e.argument);
      if (IsAbrupt(spreadObj)) return spreadObj;
      const iteratorRecord = yield* GetIterator($, spreadObj, SYNC);
      if (IsAbrupt(iteratorRecord)) return iteratorRecord;
      while (true) {
        const next = yield* IteratorStep($, iteratorRecord);
        if (IsAbrupt(next)) return next;
        if (!next) break;
        const nextValue = yield* IteratorValue($, next);
        if (IsAbrupt(nextValue)) return nextValue;
        elements.push(nextValue);
      }
      continue;
    }
    const v = e == null ? EMPTY : yield* $.evaluateValue(e);
    if (IsAbrupt(v)) return v;
    elements.push(v);
  }
  return CreateArrayFromList($, elements);
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
