import { IsArrayIndex, IsCallable, IsIntegralNumber, IsRegExp, RequireObjectCoercible } from './abstract_compare';
import { CanonicalNumericIndexString, ToIntegerOrInfinity, ToLength, ToNumber, ToObject, ToString, ToStringECR, ToUint16, ToUint32 } from './abstract_conversion';
import { CreateIterResultObject } from './abstract_iterator';
import { Call, CreateArrayFromList, Get, GetMethod, Invoke, LengthOfArrayLike } from './abstract_object';
import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { CreateBuiltinFunction, Func, callOrConstruct, method } from './func';
import { SymbolDescriptiveString } from './fundamental';
import { CreateIteratorFromClosure, GeneratorYield } from './generator';
import { createBrandedIteratorPrototype, iterators } from './iterators';
import { GetPrototypeFromConstructor, IsCompatiblePropertyDescriptor, Obj, OrdinaryDefineOwnProperty, OrdinaryGetOwnProperty, OrdinaryObject } from './obj';
import { prelude } from './prelude';
import { PropertyDescriptor, PropertyRecord, prop0, propE, propWC } from './property_descriptor';
import { defineProperties } from './realm_record';
import { CodePointAt, GetSubstitution, RegExpCreate } from './regexp';
import { memoize } from './slots';
import { PropertyKey, Val } from './val';
import { DebugString, ECR, EvalGen, Plugin, VM } from './vm';

const {} = {DebugString};

/**
 * 22.1 String Objects
 *
 * 22.1.1 The String Constructor
 *
 * The String constructor:
 *   - is %String%.
 *   - is the initial value of the "String" property of the global object.
 *   - creates and initializes a new String object when called as a constructor.
 *   - performs a type conversion when called as a function rather than as a constructor.
 *   - may be used as the value of an extends clause of a class
 *     definition. Subclass constructors that intend to inherit the
 *     specified String behaviour must include a super call to the
 *     String constructor to create and initialize the subclass
 *     instance with a [[StringData]] internal slot.
 *
 * ---
 *
 * 22.1.3 Properties of the String Prototype Object
 * 
 * The String prototype object:
 *   - is %String.prototype%.
 *   - is a String exotic object and has the internal methods specified
 *     for such objects.
 *   - has a [[StringData]] internal slot whose value is the empty String.
 *   - has a "length" property whose initial value is +0𝔽 and whose
 *     attributes are { [[Writable]]: false, [[Enumerable]]: false,
 *     [[Configurable]]: false }.
 *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
 * 
 * Unless explicitly stated otherwise, the methods of the String
 * prototype object defined below are not generic and the this value
 * passed to them must be either a String value or an object that has
 * a [[StringData]] internal slot that has been initialized to a
 * String value.
 */
export const stringObject: Plugin = {
  id: 'stringObject',
  // TODO - make the iterators dep optional (and remove String.prototype[@@iterator])
  deps: () => [prelude, iterators],
  realm: {
    CreateIntrinsics(realm, stagedGlobals) {
      /** 22.1.1.1 String ( value ) */
      const stringCtor = CreateBuiltinFunction(
        callOrConstruct(StringConstructor), 1, 'String', {Realm: realm});

      const stringPrototype =
        StringCreate('', realm.Intrinsics.get('%Object.prototype%')!);

      stringCtor.OwnProps.set('prototype', prop0(stringPrototype));
      realm.Intrinsics.set('%String%', stringCtor);
      realm.Intrinsics.set('%String.prototype%', stringPrototype);
      stagedGlobals.set('String', propWC(stringCtor));

      /** 22.1.2 Properties of the String Constructor */
      defineProperties(realm, stringCtor, {
        /** 22.1.2.1 String.fromCharCode ( ...codeUnits ) */
        'fromCharCode': method(StringFromCharCode, {length: 1}),

        /** 22.1.2.2 String.fromCodePoint ( ...codePoints ) */
        'fromCodePoint': method(StringFromCodePoint, {length: 1}),

        /** 22.1.2.4 String.raw ( template, ...substitutions ) */
        'raw': method(StringRaw),
      });

      /** 22.1.3 Properties of the String Prototype Object */
      defineProperties(realm, stringPrototype, {
        /** 22.1.3.1 String.prototype.at ( index ) */
        'at': method(StringPrototypeAt),

        /** 22.1.3.2 String.prototype.charAt ( pos ) */
        'charAt': method(StringPrototypeCharAt),

        /** 22.1.3.3 String.prototype.charCodeAt ( pos ) */
        'charCodeAt': method(StringPrototypeCharCodeAt),

        /** 22.1.3.4 String.prototype.codePointAt ( pos ) */
        'codePointAt': method(StringPrototypeCodePointAt),

        /** 22.1.3.5 String.prototype.concat ( ...args ) */
        'concat': method(StringPrototypeConcat, {length: 1}),

        /** 22.1.3.6 String.prototype.constructor */
        'constructor': propWC(stringCtor),

        /** 22.1.3.7 String.prototype.endsWith ( searchString [ , endPosition ] ) */
        'endsWith': method(StringPrototypeEndsWith),

        /** 22.1.3.8 String.prototype.includes ( searchString [ , position ] ) */
        'includes': method(StringPrototypeIncludes),

        /** 22.1.3.9 String.prototype.indexOf ( searchString [ , position ] ) */
        'indexOf': method(StringPrototypeIndexOf),

        /** 22.1.3.10 String.prototype.lastIndexOf ( searchString [ , position ] ) */
        'lastIndexOf': method(StringPrototypeLastIndexOf),

        /** 22.1.3.11 String.prototype.localeCompare */
        'localeCompare': method(StringPrototypeLocaleCompare),

        /** 22.1.3.12 String.prototype.match ( regexp ) */
        'match': method(StringPrototypeMatch),

        /** 22.1.3.13 String.prototype.matchAll ( regexp ) */
        'matchAll': method(StringPrototypeMatchAll),

        /** 22.1.3.14 String.prototype.normalize ( [ form ] ) */
        'normalize': method(StringPrototypeNormalize),

        /** 22.1.3.15 String.prototype.padEnd ( maxLength [ , fillString ] ) */
        'padEnd': method(StringPrototypePadEnd),

        /** 22.1.3.16 String.prototype.padStart ( maxLength [ , fillString ] ) */
        'padStart': method(StringPrototypePadStart),

        /** 22.1.3.17 String.prototype.repeat ( count ) */
        'repeat': method(StringPrototypeRepeat),

        /** 22.1.3.18 String.prototype.replace ( searchValue, replaceValue ) */
        'replace': method(StringPrototypeReplace),
          
        /** 22.1.3.19 String.prototype.replaceAll ( searchValue, replaceValue ) */
        'replaceAll': method(StringPrototypeReplaceAll),

        /** 22.1.3.20 String.prototype.search ( regexp ) */
        'search': method(StringPrototypeSearch),

        /** 22.1.3.21 String.prototype.slice ( start, end ) */
        'slice': method(StringPrototypeSlice),

        /** 22.1.3.22 String.prototype.split ( separator, limit ) */
        'split': method(StringPrototypeSplit),

        /** 22.1.3.23 String.prototype.startsWith ( searchString [ , position ] ) */
        'startsWith': method(StringPrototypeStartsWith),

        /** 22.1.3.24 String.prototype.substring ( start, end ) */
        'substring': method(StringPrototypeSubstring),

        /** 22.1.3.25 String.prototype.toLocaleLowerCase */
        'toLocaleLowerCase': method(StringPrototypeToLocaleLowerCase),

        /** 22.1.3.26 String.prototype.toLocaleUpperCase */
        'toLocaleUpperCase': method(StringPrototypeToLocaleUpperCase),

        /** 22.1.3.27 String.prototype.toLowerCase ( ) */
        'toLowerCase': method(StringPrototypeToLowerCase),

        /** 22.1.3.28 String.prototype.toString ( ) */
        'toString': method(StringPrototypeToString),

        /** 22.1.3.29 String.prototype.toUpperCase ( ) */
        'toUpperCase': method(StringPrototypeToUpperCase),

        /** 22.1.3.30 String.prototype.trim ( ) */
        'trim': method(StringPrototypeTrim),

        /** 22.1.3.31 String.prototype.trimEnd ( ) */
        'trimEnd': method(StringPrototypeTrimEnd),

        /** 22.1.3.32 String.prototype.trimStart ( ) */
        'trimStart': method(StringPrototypeTrimStart),

        /** 22.1.3.33 String.prototype.valueOf ( ) */
        'valueOf': method(StringPrototypeValueOf),

        /** 22.1.3.34 String.prototype [ @@iterator ] ( ) */
        [Symbol.iterator]: method(StringPrototype$$Iterator),
      });

      /**
       * 22.1.5 String Iterator Objects
       * 
       * A String Iterator is an object, that represents a specific
       * iteration over some specific String instance object. There is
       * not a named constructor for String Iterator objects. Instead,
       * String iterator objects are created by calling certain
       * methods of String instance objects.
       * 
       * ---
       * 
       * 22.1.5.1 The %StringIteratorPrototype% Object
       * 
       * The %StringIteratorPrototype% object:
       * 
       * has properties that are inherited by all String Iterator Objects.
       * is an ordinary object.
       * has a [[Prototype]] internal slot whose value is %IteratorPrototype%.
       * has the following properties:
       * 
       * ---
       * 
       * 22.1.5.1.2 %StringIteratorPrototype% [ @@toStringTag ]
       * 
       * The initial value of the @@toStringTag property is the String
       * value "String Iterator".
       * 
       * This property has the attributes { [[Writable]]: false,
       * [[Enumerable]]: false, [[Configurable]]: true }.
       */
      createBrandedIteratorPrototype(
        realm, '%StringIteratorPrototype%', 'String Iterator');
    },
  },
};

// TODO - decouple this into a function???

/**
 * 6.1.4.1 StringIndexOf ( string, searchValue, fromIndex )
 * 
 * The abstract operation StringIndexOf takes arguments string (a
 * String), searchValue (a String), and fromIndex (a non-negative
 * integer) and returns an integer. It performs the following steps
 * when called:
 * 
 * 1. Let len be the length of string.
 * 2. If searchValue is the empty String and fromIndex ≤ len, return fromIndex.
 * 3. Let searchLen be the length of searchValue.
 * 4. For each integer i such that fromIndex ≤ i ≤ len - searchLen, in
 *    ascending order, do
 *     a. Let candidate be the substring of string from i to i + searchLen.
 *     b. If candidate is searchValue, return i.
 * 5. Return -1.
 * 
 * NOTE 1: If searchValue is the empty String and fromIndex ≤ the
 * length of string, this algorithm returns fromIndex. The empty
 * String is effectively found at every position within a string,
 * including after the last code unit.
 * 
 * NOTE 2: This algorithm always returns -1 if fromIndex + the length
 * of searchValue > the length of string.
 */
export function StringIndexOf(
  string: string,
  searchValue: string,
  fromIndex: number,
): number {
  return fromIndex <= string.length - searchValue.length ?
    string.indexOf(searchValue, fromIndex) : -1;
}

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
 * 11. Return the PropertyDescriptor { [[Value]]: resultStr,
 *     [[Writable]]: false, [[Enumerable]]: true, [[Configurable]]: false }.
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

/**
 * 22.1.1.1 String ( value )
 *
 * This function performs the following steps when called:
 * 
 * 1. If value is not present, let s be the empty String.
 * 2. Else,
 *     a. If NewTarget is undefined and value is a Symbol,
 *        return SymbolDescriptiveString(value).
 *     b. Let s be ? ToString(value).
 * 3. If NewTarget is undefined, return s.
 * 4. Return StringCreate(s,
 *    ? GetPrototypeFromConstructor(NewTarget, "%String.prototype%")).
 */
function* StringConstructor($: VM, NewTarget: Func|undefined, value: Val) {
  let s = '';
  if (value != null) {
    if (NewTarget == null && typeof value === 'symbol') {
      return SymbolDescriptiveString(value);
    }
    const crs = yield* ToString($, value);
    if (IsAbrupt(crs)) return crs;
    s = crs;
  }
  if (NewTarget == null) return s;
  const prototype =
    yield* GetPrototypeFromConstructor($, NewTarget, '%String.prototype%');
  if (IsAbrupt(prototype)) return prototype;
  return StringCreate(s, prototype);
}

/**
 * 22.1.2.1 String.fromCharCode ( ...codeUnits )
 *
 * This function may be called with any number of arguments
 * which form the rest parameter codeUnits.
 *
 * It performs the following steps when called:
 *
 * 1. Let result be the empty String.
 * 2. For each element next of codeUnits, do
 *     a. Let nextCU be the code unit whose numeric value is ℝ(? ToUint16(next)).
 *     b. Set result to the string-concatenation of result and nextCU.
 * 3. Return result.
 * 
 * The "length" property of this function is 1𝔽.
 */
export function* StringFromCharCode($: VM, _: Val, ...codeUnits: Val[]) {
  const numbers: number[] = [];
  for (const element of codeUnits) {
    const numeric = yield* ToUint16($, element);
    if (IsAbrupt(numeric)) return numeric;
    numbers.push(numeric);
  }
  return String.fromCharCode(...numbers);
}

/**
 * 22.1.2.2 String.fromCodePoint ( ...codePoints )
 * 
 * This function may be called with any number of arguments
 * which form the rest parameter codePoints.
 * 
 * It performs the following steps when called:
 * 
 * 1. Let result be the empty String.
 * 2. For each element next of codePoints, do
 *     a. Let nextCP be ? ToNumber(next).
 *     b. If IsIntegralNumber(nextCP) is false, throw a
 *        RangeError exception.
 *     c. If ℝ(nextCP) < 0 or ℝ(nextCP) > 0x10FFFF, throw a
 *        RangeError exception.
 *     d. Set result to the string-concatenation of result and
 *        UTF16EncodeCodePoint(ℝ(nextCP)).
 * 3. Assert: If codePoints is empty, then result is the empty String.
 * 4. Return result.
 * 
 * The "length" property of this function is 1𝔽.
 */
export function* StringFromCodePoint($: VM, _: Val, ...codePoints: Val[]) {
  const numbers: number[] = [];
  for (const element of codePoints) {
    const nextCP = yield* ToNumber($, element);
    if (IsAbrupt(nextCP)) return nextCP;
    if (!IsIntegralNumber(nextCP) || nextCP < 0 || nextCP > 0x10FFFF) {
      return $.throw('RangeError', `Invalid code point ${nextCP}`);
    }
    numbers.push(nextCP);
  }
  return String.fromCodePoint(...numbers);
};

/**
 * 22.1.2.4 String.raw ( template, ...substitutions )
 *
 * This function may be called with a variable number of
 * arguments. The first argument is template and the remainder
 * of the arguments form the List substitutions.
 * 
 * It performs the following steps when called:
 * 
 * 1. Let substitutionCount be the number of elements in
 *    substitutions.
 * 2. Let cooked be ? ToObject(template).
 * 3. Let literals be ? ToObject(? Get(cooked, "raw")).
 * 4. Let literalCount be ? LengthOfArrayLike(literals).
 * 5. If literalCount ≤ 0, return the empty String.
 * 6. Let R be the empty String.
 * 7. Let nextIndex be 0.
 * 8. Repeat,
 *     a. Let nextLiteralVal be ? Get(literals, ! ToString(𝔽(nextIndex))).
 *     b. Let nextLiteral be ? ToString(nextLiteralVal).
 *     c. Set R to the string-concatenation of R and nextLiteral.
 *     d. If nextIndex + 1 = literalCount, return R.
 *     e. If nextIndex < substitutionCount, then
 *         i. Let nextSubVal be substitutions[nextIndex].
 *         ii. Let nextSub be ? ToString(nextSubVal).
 *         iii. Set R to the string-concatenation of R and nextSub.
 *     f. Set nextIndex to nextIndex + 1.
 * 
 * NOTE: This function is intended for use as a tag function
 * of a Tagged Template (13.3.11). When called as such, the
 * first argument will be a well formed template object and
 * the rest parameter will contain the substitution values.
 */
export function* StringRaw($: VM, _: Val, template: Val, ...substitutions: Val[]): ECR<Val> {
  const substitutionCount = substitutions.length;
  const cooked = ToObject($, template);
  if (IsAbrupt(cooked)) return cooked;
  const literals = yield* Get($, cooked, 'raw');
  if (IsAbrupt(literals)) return literals;
  Assert(literals instanceof Obj);
  const literalCount = yield* LengthOfArrayLike($, literals);
  if (IsAbrupt(literalCount)) return literalCount;
  if (literalCount <= 0) return '';
  let R = '';
  for (let nextIndex = 0;; nextIndex++) {
    const nextLiteral = yield* ToStringECR($, Get($, literals, String(nextIndex)));
    if (IsAbrupt(nextLiteral)) return nextLiteral;
    R += nextLiteral;
    if (nextIndex + 1 === literalCount) return R;
    if (nextIndex < substitutionCount) {
      const nextSubVal = substitutions[nextIndex];
      const nextSub = yield* ToString($, nextSubVal);
      if (IsAbrupt(nextSub)) return nextSub;
      R += nextSub;
    }
  }
}

/**
 * (22.1.3) The abstract operation thisStringValue takes
 * argument value. It performs the following steps when called:
 * 
 * 1. If value is a String, return value.
 * 2. If value is an Object and value has a [[StringData]] internal slot, then
 *     a. Let s be value.[[StringData]].
 *     b. Assert: s is a String.
 *     c. Return s.
 * 3. Throw a TypeError exception.
 */
function thisStringValue($: VM, value: Val, method: string): CR<string> {
  if (typeof value === 'string') return value;
  if (value instanceof Obj && value.StringData != null) {
    Assert(typeof value.StringData === 'string');
    return value.StringData;
  }
  return $.throw('TypeError', `String.prototype${method} requires that 'this' be a String`);
}

function* coercibleToString($: VM, value: Val): ECR<string> {
  const O = RequireObjectCoercible($, value);
  if (IsAbrupt(O)) return O;
  return yield* ToString($, O);
}
type Factory<T> = ((...args: any[]) => CR<T>|ECR<T>);//|((...args: any[]) => ECR<T>);

function isIter(arg: unknown): arg is EvalGen<any> {
  return Boolean(arg && typeof arg === 'object' && Symbol.iterator in arg);
}

function* wrapMethod<R, A extends unknown[]>(
  $: VM,
  fn: (this: string, ...args: A) => R,
  str: Factory<string>,
  ...args: {[K in keyof A]: K extends 'length' ? A[K] : Factory<A[K]>}
): ECR<R> {
  const thisArg$ = str();
  const thisArg = isIter(thisArg$) ? yield* (thisArg$ as any) : thisArg$;
  if (IsAbrupt(thisArg)) return thisArg;
  const argArray: Val[] = [];
  for (const factory of args) {
    const arg = factory(thisArg, ...argArray);
    const yielded = isIter(arg) ? yield* arg : arg;
    if (IsAbrupt(yielded)) return yielded;
    argArray.push(yielded);
  }
  return callMethod($, fn, thisArg as string, ...argArray as any);
  // try {
  //   return fn.apply(thisArg, argArray);
  // } catch (err) {
  //   return $.throw(err.name, err.message);
  // }
}

function* noRegExpToString($: VM, value: Val): ECR<string> {
  const isRegExp = yield* IsRegExp($, value);
  if (IsAbrupt(isRegExp)) return isRegExp;
  if (isRegExp) {
    return $.throw('TypeError', 'argument must not be a regular expression');
  }
  return yield* ToString($, value);
}

function callMethod<A extends unknown[], R>($: VM, method: (this: string, ...args: A) => R, thisArg: string, ...args: A): CR<R> {
  try {
    return method.apply(thisArg, args);
  } catch (err) {
    return $.throw(err.name, err.message);
  }
}

/**
 * 22.1.3.1 String.prototype.at ( index )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 4. Let relativeIndex be ? ToIntegerOrInfinity(index).
 * ...
 */
export function StringPrototypeAt($: VM, thisValue: Val, index: Val) {
  return wrapMethod($, String.prototype.at,
             () => coercibleToString($, thisValue),
             () => ToIntegerOrInfinity($, index));
}

/**
 * 22.1.3.2 String.prototype.charAt ( pos )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. Let position be ? ToIntegerOrInfinity(pos).
 * ...
 */
export function StringPrototypeCharAt($: VM, thisValue: Val, pos: Val) {
  return wrapMethod($, String.prototype.charAt,
             () => coercibleToString($, thisValue),
             () => ToIntegerOrInfinity($, pos));
}

/**
 * 22.1.3.3 String.prototype.charCodeAt ( pos )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. Let position be ? ToIntegerOrInfinity(pos).
 * ...
 */
export function StringPrototypeCharCodeAt($: VM, thisValue: Val, pos: Val) {
  return wrapMethod($, String.prototype.charCodeAt,
             () => coercibleToString($, thisValue),
             () => ToIntegerOrInfinity($, pos));
}

/**
 * 22.1.3.4 String.prototype.codePointAt ( pos )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. Let position be ? ToIntegerOrInfinity(pos).
 * ...
 */
export function StringPrototypeCodePointAt($: VM, thisValue: Val, pos: Val) {
  return wrapMethod($, String.prototype.codePointAt,
             () => coercibleToString($, thisValue),
             () => ToIntegerOrInfinity($, pos));
}

/**
 * 22.1.3.5 String.prototype.concat ( ...args )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. Let R be S.
 * 4. For each element next of args, do
 *     a. Let nextString be ? ToString(next).
 * ...
 * The "length" property of this method is 1𝔽.
 */
export function StringPrototypeConcat($: VM, thisValue: Val, ...args: Val[]) {
  return wrapMethod($, String.prototype.concat,
             () => coercibleToString($, thisValue),
             ...args.map((arg) => () => ToString($, arg)));
}

/**
 * 22.1.3.7 String.prototype.endsWith ( searchString [ , endPosition ] )
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. Let isRegExp be ? IsRegExp(searchString).
 * 4. If isRegExp is true, throw a TypeError exception.
 * 5. Let searchStr be ? ToString(searchString).
 * 6. Let len be the length of S.
 * 7. If endPosition is undefined, let pos be len; else let
 *    pos be ? ToIntegerOrInfinity(endPosition).
 * ...
 */
export function StringPrototypeEndsWith(
  $: VM,
  thisValue: Val,
  searchString: Val,
  endPosition: Val = undefined,
) {
  return wrapMethod($, String.prototype.endsWith,
             () => coercibleToString($, thisValue),
             () => noRegExpToString($, searchString),
             function*() {
               if (endPosition == null) return undefined;
               return yield* ToIntegerOrInfinity($, endPosition);
             });
}

/**
 * 22.1.3.8 String.prototype.includes ( searchString [ , position ] )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. Let isRegExp be ? IsRegExp(searchString).
 * 4. If isRegExp is true, throw a TypeError exception.
 * 5. Let searchStr be ? ToString(searchString).
 * 6. Let pos be ? ToIntegerOrInfinity(position).
 */
export function StringPrototypeIncludes(
  $: VM,
  thisValue: Val,
  searchString: Val,
  position: Val = undefined,
) {
  return wrapMethod($, String.prototype.includes,
             () => coercibleToString($, thisValue),
             () => noRegExpToString($, searchString),
             () => ToIntegerOrInfinity($, position));
}

/**
 * 22.1.3.9 String.prototype.indexOf ( searchString [ , position ] )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. Let searchStr be ? ToString(searchString).
 * 4. Let pos be ? ToIntegerOrInfinity(position).
 */
export function StringPrototypeIndexOf(
  $: VM,
  thisValue: Val,
  searchString: Val,
  position: Val = undefined,
) {
  return wrapMethod($, String.prototype.indexOf,
             () => coercibleToString($, thisValue),
             () => ToString($, searchString),
             () => ToIntegerOrInfinity($, position));
}

/**
 * 22.1.3.10 String.prototype.lastIndexOf ( searchString [ , position ] )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. Let searchStr be ? ToString(searchString).
 * 4. Let numPos be ? ToNumber(position).
 */
export function StringPrototypeLastIndexOf(
  $: VM,
  thisValue: Val,
  searchString: Val,
  position: Val = undefined,
) {
  return wrapMethod($, String.prototype.lastIndexOf,
             () => coercibleToString($, thisValue),
             () => ToString($, searchString),
             () => ToNumber($, position));
}

/**
 * 22.1.3.11 String.prototype.localeCompare ( that [ , reserved1 [ , reserved2 ] ] )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. Let thatValue be ? ToString(that).
 *
 * NOTE: We don't attempt to do anything with locale (even delegating to the host)
 * to avoid getting different results on different hosts.  Instead, we do a trivial
 * non-locale compare.
 */
export function* StringPrototypeLocaleCompare($: VM, thisValue: Val, that: Val) {
  const left = yield* coercibleToString($, thisValue);
  if (IsAbrupt(left)) return left;
  const right = yield* ToString($, that);
  if (IsAbrupt(right)) return right;
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * 22.1.3.12 String.prototype.match ( regexp )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. If regexp is neither undefined nor null, then
 *     a. Let matcher be ? GetMethod(regexp, @@match).
 *     b. If matcher is not undefined, then
 *         i. Return ? Call(matcher, regexp, « O »).
 * 3. Let S be ? ToString(O).
 * 4. Let rx be ? RegExpCreate(regexp, undefined).
 * 5. Return ? Invoke(rx, @@match, « S »).
 */
export function* StringPrototypeMatch($: VM, thisValue: Val, regexp: Val) {
  const O = RequireObjectCoercible($, thisValue);
  if (IsAbrupt(O)) return O;
  if (regexp != null) {
    const matcher = yield* GetMethod($, regexp, Symbol.match);
    if (IsAbrupt(matcher)) return matcher;
    if (matcher !== undefined) {
      return yield* Call($, matcher, regexp, [O]);
    }
  }
  const S = yield* ToString($, O);
  if (IsAbrupt(S)) return S;
  const rx = yield* RegExpCreate($, regexp, undefined);
  if (IsAbrupt(rx)) return rx;
  return yield* Invoke($, rx, Symbol.match, [S]);
}

/**
 * 22.1.3.13 String.prototype.matchAll ( regexp )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. If regexp is neither undefined nor null, then
 *     a. Let isRegExp be ? IsRegExp(regexp).
 *     b. If isRegExp is true, then
 *         i. Let flags be ? Get(regexp, "flags").
 *         ii. Perform ? RequireObjectCoercible(flags).
 *         iii. If ? ToString(flags) does not contain "g", throw a TypeError exception.
 *     c. Let matcher be ? GetMethod(regexp, @@matchAll).
 *     d. If matcher is not undefined, then
 *         i. Return ? Call(matcher, regexp, « O »).
 * 3. Let S be ? ToString(O).
 * 4. Let rx be ? RegExpCreate(regexp, "g").
 * 5. Return ? Invoke(rx, @@matchAll, « S »).
 */
export function* StringPrototypeMatchAll($: VM, thisValue: Val, regexp: Val) {
  const O = RequireObjectCoercible($, thisValue);
  if (IsAbrupt(O)) return O;
  if (regexp != null) {
    const isRegExp = yield* IsRegExp($, regexp);
    if (IsAbrupt(isRegExp)) return isRegExp;
    if (isRegExp) {
      const flags = yield* Get($, regexp as Obj, 'flags');
      if (IsAbrupt(flags)) return flags;
      if (!String(flags).includes('g')) {
        return $.throw('TypeError', 'RegExp must have "g" flag for matchAll');
      }
    }
    const matcher = yield* GetMethod($, regexp, Symbol.matchAll);
    if (IsAbrupt(matcher)) return matcher;
    if (matcher !== undefined) {
      return yield* Call($, matcher, regexp, [O]);
    }
  }
  const S = yield* ToString($, O);
  if (IsAbrupt(S)) return S;
  const rx = yield* RegExpCreate($, regexp, 'g');
  if (IsAbrupt(rx)) return rx;
  return yield* Invoke($, rx, Symbol.matchAll, [S]);
}

/**
 * 22.1.3.14 String.prototype.normalize ( [ form ] )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. If form is undefined, let f be "NFC".
 * 4. Else, let f be ? ToString(form).
 * 5. If f is not one of "NFC", "NFD", "NFKC", or "NFKD", throw a RangeError exception.
 */
export function StringPrototypeNormalize($: VM, thisValue: Val, form: Val = 'NFC') {
  return wrapMethod($, String.prototype.normalize,
             () => coercibleToString($, thisValue),
             () => ToString($, form));
}

/**
 * 22.1.3.15 String.prototype.padEnd ( maxLength [ , fillString ] )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Return ? StringPad(O, maxLength, fillString, end).
 */
export function StringPrototypePadEnd(
  $: VM,
  thisValue: Val,
  maxLength: Val,
  fillString: Val = ' ',
) {
  return wrapMethod($, String.prototype.padEnd,
             () => coercibleToString($, thisValue),
             () => ToIntegerOrInfinity($, maxLength),
             () => ToString($, fillString));
}

/**
 * 22.1.3.16 String.prototype.padStart ( maxLength [ , fillString ] )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Return ? StringPad(O, maxLength, fillString, start).
 * ---
 * 22.1.3.16.1 StringPad ( O, maxLength, fillString, placement )
 *
 * 1. Let S be ? ToString(O).
 * 2. Let intMaxLength be ℝ(? ToLength(maxLength)).
 * 3. Let stringLength be the length of S.
 * 4. If intMaxLength ≤ stringLength, return S.
 * 5. If fillString is undefined, let filler be the String
 *    value consisting solely of the code unit 0x0020 (SPACE).
 * 6. Else, let filler be ? ToString(fillString).
 * ...
 */
export function StringPrototypePadStart(
  $: VM,
  thisValue: Val,
  maxLength: Val,
  fillString: Val = ' ',
) {
  return wrapMethod($, String.prototype.padStart,
             () => coercibleToString($, thisValue),
             () => ToLength($, maxLength),
             (str: string, len: number) =>
    ToString($, len > str.length ? fillString : ' '));
}

/**
 * 22.1.3.17 String.prototype.repeat ( count )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. Let n be ? ToIntegerOrInfinity(count).
 * 4. If n < 0 or n = +∞, throw a RangeError exception.
 */
export function StringPrototypeRepeat($: VM, thisValue: Val, count: Val) {
  return wrapMethod($, String.prototype.repeat,
             () => coercibleToString($, thisValue),
             () => ToIntegerOrInfinity($, count));
}

/**
 * 22.1.3.18 String.prototype.replace ( searchValue, replaceValue )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. If searchValue is neither undefined nor null, then
 *     a. Let replacer be ? GetMethod(searchValue, @@replace).
 *     b. If replacer is not undefined, then
 *         i. Return ? Call(replacer, searchValue, « O, replaceValue »).
 * 3. Let string be ? ToString(O).
 * 4. Let searchString be ? ToString(searchValue).
 * 5. Let functionalReplace be IsCallable(replaceValue).
 * 6. If functionalReplace is false, then
 *     a. Set replaceValue to ? ToString(replaceValue).
 * 7. Let searchLength be the length of searchString.
 * 8. Let position be StringIndexOf(string, searchString, 0).
 * 9. If position = -1, return string.
 * 10. Let preceding be the substring of string from 0 to position.
 * 11. Let following be the substring of string from position + searchLength.
 * 12. If functionalReplace is true, then
 *     a. Let replacement be ? ToString(? Call(replaceValue,
 *        undefined, « searchString, 𝔽(position), string »)).
 * 13. Else,
 *     a. Assert: replaceValue is a String.
 *     b. Let captures be a new empty List.
 *     c. Let replacement be ! GetSubstitution(searchString,
 *        string, position, captures, undefined, replaceValue).
 * 14. Return the string-concatenation of preceding, replacement, and following.
 */
export function* StringPrototypeReplace($: VM, thisValue: Val, searchValue: Val, replaceValue: Val) {
  const O = RequireObjectCoercible($, thisValue);
  if (IsAbrupt(O)) return O;
  if (searchValue != null) {
    const replacer = yield* GetMethod($, searchValue, Symbol.replace);
    if (IsAbrupt(replacer)) return replacer;
    if (replacer !== undefined) {
      return yield* Call($, replacer, searchValue, [O, replaceValue]);
    }
  }
  // 3.
  const string = yield* ToString($, O);
  if (IsAbrupt(string)) return string;
  const searchString = yield* ToString($, searchValue);
  if (IsAbrupt(searchString)) return searchString;
  const functionalReplace = IsCallable(replaceValue);
  if (!functionalReplace) {
    const replaceValue$ = yield* ToString($, replaceValue);
    if (IsAbrupt(replaceValue$)) return replaceValue$;
    replaceValue = replaceValue$;
  }
  const searchLength = searchString.length;
  let position = string.indexOf(searchString);
  if (position === -1) return string;
  const preceding = string.substring(0, position);
  const following = string.substring(position + searchLength);
  let replacement: CR<Val>;
  if (functionalReplace) {
    replacement = yield* ToStringECR($, Call($, replaceValue, undefined, [searchString, position, string]));
    if (IsAbrupt(replacement)) return replacement;
  } else {
    Assert(typeof replaceValue === 'string');
    replacement = CastNotAbrupt(yield* GetSubstitution($, searchString, string, position, [], undefined, replaceValue));
  }
  return preceding + replacement + following;
}

/**
 * 22.1.3.19 String.prototype.replaceAll ( searchValue, replaceValue )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. If searchValue is neither undefined nor null, then
 *     a. Let isRegExp be ? IsRegExp(searchValue).
 *     b. If isRegExp is true, then
 *         i. Let flags be ? Get(searchValue, "flags").
 *         ii. Perform ? RequireObjectCoercible(flags).
 *         iii. If ? ToString(flags) does not contain "g",
 *              throw a TypeError exception.
 *     c. Let replacer be ? GetMethod(searchValue, @@replace).
 *     d. If replacer is not undefined, then
 *         i. Return ? Call(replacer, searchValue, « O, replaceValue »).
 * 3. Let string be ? ToString(O).
 * 4. Let searchString be ? ToString(searchValue).
 * 5. Let functionalReplace be IsCallable(replaceValue).
 * 6. If functionalReplace is false, then
 *     a. Set replaceValue to ? ToString(replaceValue).
 * 7. Let searchLength be the length of searchString.
 * 8. Let advanceBy be max(1, searchLength).
 * 9. Let matchPositions be a new empty List.
 * 10. Let position be StringIndexOf(string, searchString, 0).
 * 11. Repeat, while position ≠ -1,
 *     a. Append position to matchPositions.
 *     b. Set position to StringIndexOf(string, searchString, position + advanceBy).
 * 12. Let endOfLastMatch be 0.
 * 13. Let result be the empty String.
 * 14. For each element p of matchPositions, do
 *     a. Let preserved be the substring of string from endOfLastMatch to p.
 *     b. If functionalReplace is true, then
 *         i. Let replacement be ? ToString(?
 *            Call(replaceValue, undefined, « searchString, 𝔽(p),
 *            string »)).
 *     c. Else,
 *         i. Assert: replaceValue is a String.
 *         ii. Let captures be a new empty List.
 *         iii. Let replacement be
 *              ! GetSubstitution(searchString, string, p,
 *              captures, undefined, replaceValue).
 *     d. Set result to the string-concatenation of result, preserved, and replacement.
 *     e. Set endOfLastMatch to p + searchLength.
 * 15. If endOfLastMatch < the length of string, then
 *     a. Set result to the string-concatenation of result and the substring of
 *        string from endOfLastMatch.
 * 16. Return result.
 */
export function* StringPrototypeReplaceAll($: VM, thisValue: Val, searchValue: Val, replaceValue: Val): ECR<Val> {
  const O = RequireObjectCoercible($, thisValue);
  if (IsAbrupt(O)) return O;
  if (searchValue != null) {
    const isRegExp = yield* IsRegExp($, searchValue);
    if (IsAbrupt(isRegExp)) return isRegExp;
    if (isRegExp) {
      const flags = yield* Get($, searchValue as Obj, 'flags');
      if (IsAbrupt(flags)) return flags;
      const coercible = RequireObjectCoercible($, flags);
      if (IsAbrupt(coercible)) return coercible;
      const s = yield* ToString($, flags);
      if (IsAbrupt(s)) return s;
      if (!s.includes('g')) {
        return $.throw('TypeError', 'RegExp must have "g" flag for replaceAll');
      }
    }
    const replacer = yield* GetMethod($, searchValue, Symbol.replace);
    if (IsAbrupt(replacer)) return replacer;
    if (replacer !== undefined) {
      return yield* Call($, replacer, searchValue, [O, replaceValue]);
    }
  }
  // 3.
  const string = yield* ToString($, O);
  if (IsAbrupt(string)) return string;
  const searchString = yield* ToString($, searchValue);
  if (IsAbrupt(searchString)) return searchString;
  const functionalReplace = IsCallable(replaceValue);
  if (!functionalReplace) {
    const replaceValue$ = yield* ToString($, replaceValue);
    if (IsAbrupt(replaceValue$)) return replaceValue$;
    replaceValue = replaceValue$;
  }
  const searchLength = searchString.length;
  const advanceBy = Math.max(1, searchLength);
  const matchPositions: number[] = [];
  let position = string.indexOf(searchString);
  while (position !== -1) {
    matchPositions.push(position);
    position = StringIndexOf(string, searchString, position + advanceBy);
  }
  let endOfLastMatch = 0;
  // 13.
  let result = '';
  for (const p of matchPositions) {
    const preserved = string.substring(endOfLastMatch, p);
    let replacement: CR<Val>;
    if (functionalReplace) {
      replacement = yield* ToStringECR($, Call($, replaceValue, undefined, [searchString, p, string]));
      if (IsAbrupt(replacement)) return replacement;
    } else {
      Assert(typeof replaceValue === 'string');
      replacement = CastNotAbrupt(yield* GetSubstitution($, searchString, string, p, [], undefined, replaceValue));
    }
    result += preserved + replacement;
    endOfLastMatch = p + searchLength;
  }
  if (endOfLastMatch < string.length) {
    result += string.substring(endOfLastMatch);
  }
  return result;
}

/**
 * 22.1.3.20 String.prototype.search ( regexp )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. If regexp is neither undefined nor null, then
 *     a. Let searcher be ? GetMethod(regexp, @@search).
 *     b. If searcher is not undefined, then
 *         i. Return ? Call(searcher, regexp, « O »).
 * 3. Let string be ? ToString(O).
 * 4. Let rx be ? RegExpCreate(regexp, undefined).
 * 5. Return ? Invoke(rx, @@search, « string »).
 */
export function* StringPrototypeSearch($: VM, thisValue: Val, regexp: Val) {
  const O = RequireObjectCoercible($, thisValue);
  if (IsAbrupt(O)) return O;
  if (regexp != null) {
    const searcher = yield* GetMethod($, regexp, Symbol.search);
    if (IsAbrupt(searcher)) return searcher;
    if (searcher !== undefined) {
      return yield* Call($, searcher, regexp, [O]);
    }
  }
  const string = yield* ToString($, O);
  if (IsAbrupt(string)) return string;
  const rx = yield* RegExpCreate($, regexp, undefined);
  if (IsAbrupt(rx)) return rx;
  return yield* Invoke($, rx, Symbol.search, [string]);
}

/**
 * 22.1.3.21 String.prototype.slice ( start, end )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. Let len be the length of S.
 * 4. Let intStart be ? ToIntegerOrInfinity(start).
 * 5. If intStart = -∞, let from be 0.
 * 6. Else if intStart < 0, let from be max(len + intStart, 0).
 * 7. Else, let from be min(intStart, len).
 * 8. If end is undefined, let intEnd be len; else let intEnd be ? ToIntegerOrInfinity(end).
 */
export function StringPrototypeSlice(
  $: VM,
  thisValue: Val,
  start: Val,
  end: Val = undefined,
) {
  return wrapMethod($, String.prototype.slice,
             () => coercibleToString($, thisValue),
             () => ToIntegerOrInfinity($, start),
             () => end !== undefined ? ToIntegerOrInfinity($, end) : end);
}

/**
 * 22.1.3.22 String.prototype.split ( separator, limit )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. If separator is neither undefined nor null, then
 *     a. Let splitter be ? GetMethod(separator, @@split).
 *     b. If splitter is not undefined, then
 *         i. Return ? Call(splitter, separator, « O, limit »).
 * 3. Let S be ? ToString(O).
 * 4. If limit is undefined, let lim be 232 - 1;
 *    else let lim be ℝ(? ToUint32(limit)).
 * 5. Let R be ? ToString(separator).
 * 6. If lim = 0, then
 *     a. Return CreateArrayFromList(« »).
 * 7. If separator is undefined, then
 *     a. Return CreateArrayFromList(« S »).
 * 8. Let separatorLength be the length of R.
 * 9. If separatorLength = 0, then
 *     a. Let head be the substring of S from 0 to lim.
 *     b. Let codeUnits be a List consisting of the sequence
 *        of code units that are the elements of head.
 *     c. Return CreateArrayFromList(codeUnits).
 * 10. If S is the empty String, return CreateArrayFromList(« S »).
 * 11. Let substrings be a new empty List.
 * 12. Let i be 0.
 * 13. Let j be StringIndexOf(S, R, 0).
 * 14. Repeat, while j ≠ -1,
 *     a. Let T be the substring of S from i to j.
 *     b. Append T to substrings.
 *     c. If the number of elements in substrings is lim,
 *        return CreateArrayFromList(substrings).
 *     d. Set i to j + separatorLength.
 *     e. Set j to StringIndexOf(S, R, i).
 * 15. Let T be the substring of S from i.
 * 16. Append T to substrings.
 * 17. Return CreateArrayFromList(substrings).
 * 
 * NOTE 1: The value of separator may be an empty String. In
 * this case, separator does not match the empty substring at
 * the beginning or end of the input String, nor does it match
 * the empty substring at the end of the previous separator
 * match. If separator is the empty String, the String is
 * split up into individual code unit elements; the length of
 * the result array equals the length of the String, and each
 * substring contains one code unit.
 * 
 * If the this value is (or converts to) the empty String, the
 * result depends on whether separator can match the empty
 * String. If it can, the result array contains no
 * elements. Otherwise, the result array contains one element,
 * which is the empty String.
 * 
 * If separator is undefined, then the result array contains
 * just one String, which is the this value (converted to a
 * String). If limit is not undefined, then the output array
 * is truncated so that it contains no more tha limit elements.
 * 
 * NOTE 2: This method is intentionally generic; it does not
 * require that its this value be a String object. Therefore,
 * it can be transferred to other kinds of objects for use as
 * a method.
 */
export function* StringPrototypeSplit(
  $: VM,
  thisValue: Val,
  separator: Val,
  limit: Val = undefined,
) {
  const O = RequireObjectCoercible($, thisValue);
  if (IsAbrupt(O)) return O;
  if (separator != null) {
    const splitter = yield* GetMethod($, separator, Symbol.split);
    if (IsAbrupt(splitter)) return splitter;
    if (splitter !== undefined) {
      return yield* Call($, splitter, separator, [O, limit]);
    }
  }
  // 3.
  const S = yield* ToString($, O);
  if (IsAbrupt(S)) return S;
  const lim = limit === undefined ? 0xFFFFFFFF : yield* ToUint32($, limit);
  if (IsAbrupt(lim)) return lim;
  const R = yield* ToString($, separator);
  if (IsAbrupt(R)) return R;
  if (lim === 0) return CreateArrayFromList($, []);
  if (separator === undefined) return CreateArrayFromList($, [S]);
  const separatorLength = R.length;
  // 9.
  if (separatorLength === 0) {
    const head = S.substring(0, lim);
    return CreateArrayFromList($, [...head]);
  }
  if (!S) return CreateArrayFromList($, [S]);
  const substrings = [];
  let i = 0;
  let j = S.indexOf(R, 0);
  // 14.
  while (j !== -1) {
    const T = S.substring(i, j);
    substrings.push(T);
    if (substrings.length === lim) return CreateArrayFromList($, substrings);
    i = j + separatorLength;
    j = StringIndexOf(S, R, i);
  }
  const T = S.substring(i);
  substrings.push(T);
  return CreateArrayFromList($, substrings);
}

/**
 * 22.1.3.23 String.prototype.startsWith ( searchString [ , position ] )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. Let isRegExp be ? IsRegExp(searchString).
 * 4. If isRegExp is true, throw a TypeError exception.
 * 5. Let searchStr be ? ToString(searchString).
 * 6. Let len be the length of S.
 * 7. If position is undefined, let pos be 0; else let pos be
 *    ? ToIntegerOrInfinity(position).
 */
export function StringPrototypeStartsWith(
  $: VM,
  thisValue: Val,
  searchString: Val,
  position: Val = undefined,
) {
  return wrapMethod($, String.prototype.startsWith,
             () => coercibleToString($, thisValue),
             () => noRegExpToString($, searchString),
             () => ToIntegerOrInfinity($, position));
}

/**
 * 22.1.3.24 String.prototype.substring ( start, end )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 * 3. Let len be the length of S.
 * 4. Let intStart be ? ToIntegerOrInfinity(start).
 * 5. If end is undefined, let intEnd be len; else let intEnd be ? ToIntegerOrInfinity(end).
 */
export function StringPrototypeSubstring($: VM, thisValue: Val, start: Val, end: Val) {
  return wrapMethod($, String.prototype.substring,
             () => coercibleToString($, thisValue),
             () => ToIntegerOrInfinity($, start),
             () => end !== undefined ? ToIntegerOrInfinity($, end) : end);
}

/**
 * 22.1.3.25 String.prototype.toLocaleLowerCase ( [ reserved1 [ , reserved2 ] ] )
 */
export function StringPrototypeToLocaleLowerCase($: VM, thisValue: Val) {
  return wrapMethod($, String.prototype.toLowerCase,
             () => coercibleToString($, thisValue));
}

/**
 * 22.1.3.26 String.prototype.toLocaleUpperCase ( [ reserved1 [ , reserved2 ] ] )
 */
export function StringPrototypeToLocaleUpperCase($: VM, thisValue: Val) {
  return wrapMethod($, String.prototype.toUpperCase,
             () => coercibleToString($, thisValue));
}

/**
 * 22.1.3.27 String.prototype.toLowerCase ( )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let S be ? ToString(O).
 */
export function StringPrototypeToLowerCase($: VM, thisValue: Val) {
  return wrapMethod($, String.prototype.toLowerCase,
             () => coercibleToString($, thisValue));
}

/**
 * 22.1.3.28 String.prototype.toString ( )
 * 
 * 1. Return ? thisStringValue(this value).
 */
export function* StringPrototypeToString($: VM, thisValue: Val) {
  return thisStringValue($, thisValue, '.toString');
}

/**
 * 22.1.3.29 String.prototype.toUpperCase ( )
 * 
 * It behaves in exactly the same way as
 * String.prototype.toLowerCase, except that the String is
 * mapped using the toUppercase algorithm of the Unicode
 * Default Case Conversion.
 */
export function StringPrototypeToUpperCase($: VM, thisValue: Val) {
  return wrapMethod($, String.prototype.toUpperCase,
             () => coercibleToString($, thisValue));
}

/**
 * 22.1.3.30 String.prototype.trim ( )
 * 
 * 1. Let S be the this value.
 * 2. Return ? TrimString(S, start+end).
 * ---
 * 1. Let str be ? RequireObjectCoercible(string).
 * 2. Let S be ? ToString(str).
 * ...
 */
export function StringPrototypeTrim($: VM, thisValue: Val) {
  return wrapMethod($, String.prototype.trim,
             () => coercibleToString($, thisValue));
}

/**
 * 22.1.3.31 String.prototype.trimEnd ( )
 * 
 * 1. Let S be the this value.
 * 2. Return ? TrimString(S, end).
 * ---
 * 1. Let str be ? RequireObjectCoercible(string).
 * 2. Let S be ? ToString(str).
 * ...
 */
export function StringPrototypeTrimEnd($: VM, thisValue: Val) {
  return wrapMethod($, String.prototype.trimEnd,
             () => coercibleToString($, thisValue));
}

/**
 * 22.1.3.32 String.prototype.trimStart ( )
 * 
 * 1. Let S be the this value.
 * 2. Return ? TrimString(S, start).
 * ---
 * 1. Let str be ? RequireObjectCoercible(string).
 * 2. Let S be ? ToString(str).
 * ...
 */
export function StringPrototypeTrimStart($: VM, thisValue: Val) {
  return wrapMethod($, String.prototype.trimStart,
             () => coercibleToString($, thisValue));
}

/**
 * 22.1.3.33 String.prototype.valueOf ( )
 * 
 * 1. Return ? thisStringValue(this value).
 */
export function* StringPrototypeValueOf($: VM, thisValue: Val) {
  return thisStringValue($, thisValue, '.valueOf');
}

/**
 * 22.1.3.34 String.prototype [ @@iterator ] ( )
 * 
 * 1. Let O be ? RequireObjectCoercible(this value).
 * 2. Let s be ? ToString(O).
 * 3. Let closure be a new Abstract Closure with no parameters that captures s and performs the following steps when called:
 *     a. Let len be the length of s.
 *     b. Let position be 0.
 *     c. Repeat, while position < len,
 *         i. Let cp be CodePointAt(s, position).
 *         ii. Let nextIndex be position + cp.[[CodeUnitCount]].
 *         iii. Let resultString be the substring of s from position to nextIndex.
 *         iv. Set position to nextIndex.
 *         v. Perform ? GeneratorYield(CreateIterResultObject(resultString, false)).
 *     d. Return undefined.
 * 4. Return CreateIteratorFromClosure(closure, "%StringIteratorPrototype%", %StringIteratorPrototype%).
 */
export function* StringPrototype$$Iterator($: VM, thisValue: Val) {
  const O = RequireObjectCoercible($, thisValue);
  if (IsAbrupt(O)) return O;
  const s = yield* ToString($, O);
  if (IsAbrupt(s)) return s;
  return CreateIteratorFromClosure($, function*(): ECR<Val> {
    const len = s.length;
    let position = 0;
    while (position < len) {
      const cp = CodePointAt(s, position);
      const nextIndex = position + cp.CodeUnitCount;
      const resultString = s.substring(position, nextIndex);
      position = nextIndex;
      yield* GeneratorYield($, CreateIterResultObject($, resultString, false));
    }
    return undefined;
  }, '%StringIteratorPrototype%', $.getIntrinsic('%StringIteratorPrototype%'));
}
