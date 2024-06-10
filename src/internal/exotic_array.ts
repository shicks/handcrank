import { ArrayExpression } from 'estree';
import { IsArray, IsArrayIndex, IsCallable, IsConstructor, IsIntegralNumber, SameValue, SameValueZero } from './abstract_compare';
import { ToIntegerOrInfinity, ToNumber, ToObject, ToUint32 } from './abstract_conversion';
import { Call, Construct, CreateArrayFromList, CreateDataPropertyOrThrow, Get, GetMethod, LengthOfArrayLike, Set } from './abstract_object';
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
import { SYNC } from './enums';

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
  const elements: Val[] = [];
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
    const v = e == null ? undefined : yield* $.evaluateValue(e);
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
