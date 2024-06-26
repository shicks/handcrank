/**
 * @fileoverview
 * 7.1 Type Conversion
 *
 * The ECMAScript language implicitly performs automatic type
 * conversion as needed. To clarify the semantics of certain
 * constructs it is useful to define a set of conversion abstract
 * operations. The conversion abstract operations are polymorphic;
 * they can accept a value of any ECMAScript language type. But no
 * other specification types are used with these operations.
 *
 * The BigInt type has no implicit conversions in the ECMAScript
 * language; programmers must call BigInt explicitly to convert values
 * from other types.
 */

import { IsCallable, SameValue } from './abstract_compare';
import { Call, Get, GetMethod } from './abstract_object';
import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { NUMBER, STRING } from './enums';
import { StringCreate } from './exotic_string';
import { Obj, OrdinaryObjectCreate } from './obj';
import { PropertyKey, Val } from './val';
import { ECR, VM } from './vm';

/**
 * 7.1.1 ToPrimitive ( input [ , preferredType ] )
 *
 * The abstract operation ToPrimitive takes argument input (an
 * ECMAScript language value) and optional argument preferredType
 * (string or number) and returns either a normal completion
 * containing an ECMAScript language value or a throw completion. It
 * converts its input argument to a non-Object type. If an object is
 * capable of converting to more than one primitive type, it may use
 * the optional hint preferredType to favour that type. It performs
 * the following steps when called:
 *
 * NOTE: When ToPrimitive is called without a hint, then it generally
 * behaves as if the hint were number. However, objects may over-ride
 * this behaviour by defining a @@toPrimitive method. Of the objects
 * defined in this specification only Dates (see 21.4.4.45) and Symbol
 * objects (see 20.4.3.5) over-ride the default ToPrimitive
 * behaviour. Dates treat the absence of a hint as if the hint were
 * string.
 */
export function* ToPrimitive($: VM, input: Val, preferredType?: STRING|NUMBER): ECR<Val> {
  // 1. If input is an Object, then
  if (input instanceof Obj) {
    //   a. Let exoticToPrim be ? GetMethod(input, @@toPrimitive).
    const exoticToPrim = yield* GetMethod($, input, Symbol.toPrimitive);
    if (IsAbrupt(exoticToPrim)) return exoticToPrim;
    //   b. If exoticToPrim is not undefined, then
    if (exoticToPrim != null) {
      //     i. If preferredType is not present, let hint be "default".
      //     ii. Else if preferredType is string, let hint be "string".
      //     iii. Else,
      //         1. Assert: preferredType is number.
      //         2. Let hint be "number".
      const hint = !preferredType ? 'default' : STRING.is(preferredType) ? 'string' : 'number';
      //     iv. Let result be ? Call(exoticToPrim, input, « hint »).
      const result = yield* Call($, exoticToPrim, input, [hint]);
      if (IsAbrupt(result)) return result;
      //     v. If result is not an Object, return result.
      if (!(result instanceof Obj)) return result;
      //     vi. Throw a TypeError exception.
      return $.throw('TypeError');
    }
    //   c. If preferredType is not present, let preferredType be number.
    //   d. Return ? OrdinaryToPrimitive(input, preferredType).
    return yield* OrdinaryToPrimitive($, input, preferredType ?? NUMBER);
  }
  // 2. Return input.
  return input;
}

/**
 * 7.1.1.1 OrdinaryToPrimitive ( O, hint )
 *
 * The abstract operation OrdinaryToPrimitive takes arguments O (an
 * Object) and hint (string or number) and returns either a normal
 * completion containing an ECMAScript language value or a throw
 * completion. It performs the following steps when called:
 */
function* OrdinaryToPrimitive($: VM, O: Obj, hint: STRING|NUMBER): ECR<Val> {
  // 1. If hint is string, then
  //     a. Let methodNames be « "toString", "valueOf" ».
  // 2. Else,
  //     a. Let methodNames be « "valueOf", "toString" ».
  const methodNames = STRING.is(hint) ? ['toString', 'valueOf'] : ['valueOf', 'toString'];
  // 3. For each element name of methodNames, do
  for (const name of methodNames) {
    //   a. Let method be ? Get(O, name).
    const method = yield* Get($, O, name);
    if (IsAbrupt(method)) return method;
    //   b. If IsCallable(method) is true, then
    if (IsCallable(method)) {
      //     i. Let result be ? Call(method, O).
      const result = yield* Call($, method, O);
      if (IsAbrupt(result)) return result;
      //     ii. If result is not an Object, return result.
      if (!(result instanceof Obj)) return result;
    }
  }
  // 4. Throw a TypeError exception.
  return $.throw('TypeError');
}

/**
 * 7.1.2 ToBoolean ( argument )
 *
 * The abstract operation ToBoolean takes argument argument (an
 * ECMAScript language value) and returns a Boolean. It converts
 * argument to a value of type Boolean. It performs the following
 * steps when called:
 *
 * 1. If argument is a Boolean, return argument.
 * 2. If argument is one of undefined, null, +0𝔽, -0𝔽, NaN, 0ℤ, or the empty String, return false.
 * 3. NOTE: This step is replaced in section B.3.6.1.
 * 4. Return true.
 */
export function ToBoolean(argument: Val): boolean {
  // NOTE: all falsy values are already primitives
  return Boolean(argument);
}

/**
 * 7.1.3 ToNumeric ( value )
 *
 * The abstract operation ToNumeric takes argument value (an
 * ECMAScript language value) and returns either a normal completion
 * containing either a Number or a BigInt, or a throw completion. It
 * returns value converted to a Number or a BigInt. It performs the
 * following steps when called:
 *
 * 1. Let primValue be ? ToPrimitive(value, number).
 * 2. If primValue is a BigInt, return primValue.
 * 3. Return ? ToNumber(primValue).
 */
export function* ToNumeric($: VM, value: Val): ECR<number|bigint> {
  const primValue = yield* ToPrimitive($, value, NUMBER);
  if (IsAbrupt(primValue)) return primValue;
  if (typeof primValue === 'bigint') return primValue;
  return yield* ToNumber($, primValue);
}

/**
 * 7.1.4 ToNumber ( argument )
 *
 * The abstract operation ToNumber takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing a Number or a throw completion. It converts argument to
 * a value of type Number. It performs the following steps when
 * called:
 *
 * 1. If argument is a Number, return argument.
 * 2. If argument is either a Symbol or a BigInt, throw a TypeError exception.
 * 3. If argument is undefined, return NaN.
 * 4. If argument is either null or false, return +0𝔽.
 * 5. If argument is true, return 1𝔽.
 * 6. If argument is a String, return StringToNumber(argument).
 * 7. Assert: argument is an Object.
 * 8. Let primValue be ? ToPrimitive(argument, number).
 * 9. Assert: primValue is not an Object.
 * 10. Return ? ToNumber(primValue).
 */
export function* ToNumber($: VM, argument: Val): ECR<number> {
  if (argument instanceof Obj) {
    const primValue = yield* ToPrimitive($, argument, NUMBER);
    if (IsAbrupt(primValue)) return primValue;
    Assert(!(primValue instanceof Obj));
    return yield* ToNumber($, primValue);
  } else if (typeof argument === 'symbol' || typeof argument === 'bigint') {
    return $.throw('TypeError', `Cannot convert a ${typeof argument} value to a number`);
  }
  return Number(argument);
}

/**
 * 7.1.5 ToIntegerOrInfinity ( argument )
 *
 * The abstract operation ToIntegerOrInfinity takes argument argument
 * (an ECMAScript language value) and returns either a normal
 * completion containing either an integer, +∞, or -∞, or a throw
 * completion. It converts argument to an integer representing its
 * Number value with fractional part truncated, or to +∞ or -∞ when
 * that Number value is infinite. It performs the following steps when
 * called:
 * 
 * 1. Let number be ? ToNumber(argument).
 * 2. If number is one of NaN, +0𝔽, or -0𝔽, return 0.
 * 3. If number is +∞𝔽, return +∞.
 * 4. If number is -∞𝔽, return -∞.
 * 5. Return truncate(ℝ(number)).
 *
 * NOTE: 𝔽(ToIntegerOrInfinity(x)) never returns -0𝔽 for any value of
 * x. The truncation of the fractional part is performed after
 * converting x to a mathematical value.
 */
export function* ToIntegerOrInfinity($: VM, argument: Val): ECR<number> {
  const number = yield* ToNumber($, argument);
  if (IsAbrupt(number)) return number;
  return ToIntegerOrInfinityInternal(number);
}
export function ToIntegerOrInfinityInternal(number: number): number {
  if (Number.isNaN(number) || number === 0) return 0;
  if (number === Infinity || number === -Infinity) return number;
  return Math.trunc(number);
}

/**
 * 7.1.6 ToInt32 ( argument )
 *
 * The abstract operation ToInt32 takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing an integral Number or a throw completion. It converts
 * argument to one of 2^32 integral Number values in the inclusive
 * interval from 𝔽(-2^31) to 𝔽(2^31 - 1). It performs the following
 * steps when called:
 *
 * 1. Let number be ? ToNumber(argument).
 * 2. If number is not finite or number is either +0𝔽 or -0𝔽, return +0𝔽.
 * 3. Let int be truncate(ℝ(number)).
 * 4. Let int32bit be int modulo 2^32.
 * 5. If int32bit ≥ 2^31, return 𝔽(int32bit - 2^32); otherwise return
 *    𝔽(int32bit).
 *
 * NOTE: Given the above definition of ToInt32:
 *   - The ToInt32 abstract operation is idempotent: if applied to a
 *     result that it produced, the second application leaves that
 *     value unchanged.
 *   - ToInt32(ToUint32(x)) is the same value as ToInt32(x) for all
 *     values of x. (It is to preserve this latter property that +∞𝔽
 *     and -∞𝔽 are mapped to +0𝔽.)
 *   - ToInt32 maps -0𝔽 to +0𝔽.
 */
export function* ToInt32($: VM, argument: Val): ECR<number> {
  const number = yield* ToNumber($, argument);
  if (IsAbrupt(number)) return number;
  return number >> 0;
}

/**
 * 7.1.7 ToUint32 ( argument )
 *
 * The abstract operation ToUint32 takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing an integral Number or a throw completion. It converts
 * argument to one of 2^32 integral Number values in the inclusive
 * interval from +0𝔽 to 𝔽(2^32 - 1). It performs the following steps
 * when called:
 * 
 * 1. Let number be ? ToNumber(argument).
 * 2. If number is not finite or number is either +0𝔽 or -0𝔽, return +0𝔽.
 * 3. Let int be truncate(ℝ(number)).
 * 4. Let int32bit be int modulo 2^32.
 * 5. Return 𝔽(int32bit).
 *
 * NOTE: Given the above definition of ToUint32:
 *   - Step 5 is the only difference between ToUint32 and ToInt32.
 *   - The ToUint32 abstract operation is idempotent: if applied to a
 *     result that it produced, the second application leaves that
 *     value unchanged.
 *   - ToUint32(ToInt32(x)) is the same value as ToUint32(x) for all
 *     values of x. (It is to preserve this latter property that +∞𝔽
 *     and -∞𝔽 are mapped to +0𝔽.)
 *   - ToUint32 maps -0𝔽 to +0𝔽.
 */
export function* ToUint32($: VM, argument: Val): ECR<number> {
  const number = yield* ToNumber($, argument);
  if (IsAbrupt(number)) return number;
  return number >>> 0;
}

/**
 * 7.1.8 ToInt16 ( argument )
 *
 * The abstract operation ToInt16 takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing an integral Number or a throw completion. It converts
 * argument to one of 2^16 integral Number values in the inclusive
 * interval from 𝔽(-2^15) to 𝔽(2^15 - 1). It performs the following
 * steps when called:
 *
 * 1. Let number be ? ToNumber(argument).
 * 2. If number is not finite or number is either +0𝔽 or -0𝔽, return +0𝔽.
 * 3. Let int be truncate(ℝ(number)).
 * 4. Let int16bit be int modulo 2^16.
 * 5. If int16bit ≥ 2^15, return 𝔽(int16bit - 2^16); otherwise return
 *    𝔽(int16bit).
 */
export function* ToInt16($: VM, argument: Val): ECR<number> {
  const number = yield* ToNumber($, argument);
  if (IsAbrupt(number)) return number;
  return (number << 16) >> 16;
}

/**
 * 7.1.9 ToUint16 ( argument )
 *
 * The abstract operation ToUint16 takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing an integral Number or a throw completion. It converts
 * argument to one of 2^16 integral Number values in the inclusive
 * interval from +0𝔽 to 𝔽(2^16 - 1). It performs the following steps
 * when called:
 *
 * 1. Let number be ? ToNumber(argument).
 * 2. If number is not finite or number is either +0𝔽 or -0𝔽, return +0𝔽.
 * 3. Let int be truncate(ℝ(number)).
 * 4. Let int16bit be int modulo 2^16.
 * 5. Return 𝔽(int16bit).
 *
 * NOTE: Given the above definition of ToUint16:
 *   - The substitution of 2^16 for 2^32 in step 4 is the only
 *     difference between ToUint32 and ToUint16.
 *   - ToUint16 maps -0𝔽 to +0𝔽.
 */
export function* ToUint16($: VM, argument: Val): ECR<number> {
  const number = yield* ToNumber($, argument);
  if (IsAbrupt(number)) return number;
  return (number << 16) >>> 16;
}

/**
 * 7.1.10 ToInt8 ( argument )
 *
 * The abstract operation ToInt8 takes argument argument (an ECMAScript
 * language value) and returns either a normal completion containing an
 * integral Number or a throw completion. It converts argument to one
 * of 2^8 integral Number values in the inclusive interval from -128𝔽 to
 * 127𝔽. It performs the following steps when called:
 *
 * 1. Let number be ? ToNumber(argument).
 * 2. If number is not finite or number is either +0𝔽 or -0𝔽, return +0𝔽.
 * 3. Let int be truncate(ℝ(number)).
 * 4. Let int8bit be int modulo 2^8.
 * 5. If int8bit ≥ 2^7, return 𝔽(int8bit - 2^8); otherwise return 𝔽(int8bit).
 */
export function* ToInt8($: VM, argument: Val): ECR<number> {
  const number = yield* ToNumber($, argument);
  if (IsAbrupt(number)) return number;
  return (number << 24) >> 24;
}

/**
 * 7.1.11 ToUint8 ( argument )
 *
 * The abstract operation ToUint8 takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing an integral Number or a throw completion. It converts
 * argument to one of 2^8 integral Number values in the inclusive
 * interval from +0𝔽 to 255𝔽. It performs the following steps when
 * called:
 * 
 * 1. Let number be ? ToNumber(argument).
 * 2. If number is not finite or number is either +0𝔽 or -0𝔽, return +0𝔽.
 * 3. Let int be truncate(ℝ(number)).
 * 4. Let int8bit be int modulo 2^8.
 * 5. Return 𝔽(int8bit).
 */
export function* ToUint8($: VM, argument: Val): ECR<number> {
  const number = yield* ToNumber($, argument);
  if (IsAbrupt(number)) return number;
  return (number << 24) >>> 24;
}

/**
 * 7.1.12 ToUint8Clamp ( argument )
 *
 * The abstract operation ToUint8Clamp takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing an integral Number or a throw completion. It converts
 * argument to one of 2^8 integral Number values in the inclusive
 * interval from +0𝔽 to 255𝔽. It performs the following steps when
 * called:
 * 
 * 1. Let number be ? ToNumber(argument).
 * 2. If number is NaN, return +0𝔽.
 * 3. If ℝ(number) ≤ 0, return +0𝔽.
 * 4. If ℝ(number) ≥ 255, return 255𝔽.
 * 5. Let f be floor(ℝ(number)).
 * 6. If f + 0.5 < ℝ(number), return 𝔽(f + 1).
 * 7. If ℝ(number) < f + 0.5, return 𝔽(f).
 * 8. If f is odd, return 𝔽(f + 1).
 * 9. Return 𝔽(f).
 *
 * NOTE: Unlike the other ECMAScript integer conversion abstract
 * operation, ToUint8Clamp rounds rather than truncates non-integral
 * values and does not convert +∞𝔽 to +0𝔽. ToUint8Clamp does “round
 * half to even” tie-breaking. This differs from Math.round which does
 * “round half up” tie-breaking.
 */
export function* ToUint8Clamp($: VM, argument: Val): ECR<number> {
  const number = yield* ToNumber($, argument);
  if (IsAbrupt(number)) return number;
  if (Number.isNaN(number)) return 0;
  if (number <= 0) return 0;
  if (number >= 255) return 255;
  const f = Math.floor(number);
  if (f + 0.5 < number) return f + 1;
  if (number < f + 0.5) return f;
  if (f & 1) return f + 1;
  return f;
}

/**
 * 7.1.13 ToBigInt ( argument )
 * 
 * The abstract operation ToBigInt takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing a BigInt or a throw completion. It converts argument to
 * a BigInt value, or throws if an implicit conversion from Number
 * would be required. It performs the following steps when called:
 * 
 * 1. Let prim be ? ToPrimitive(argument, number).
 * 2. Return the value that prim corresponds below:
 *     Undefined: Throw a TypeError exception.
 *     Null:      Throw a TypeError exception.
 *     Boolean:   Return 1n if prim is true and 0n if prim is false.
 *     BigInt:    Return prim.
 *     Number:    Throw a TypeError exception.
 *     String:    1. Let n be StringToBigInt(prim).
 *                2. If n is undefined, throw a SyntaxError exception.
 *                3. Return n.
 *     Symbol:    Throw a TypeError exception.
 */
export function* ToBigInt($: VM, argument: Val): ECR<bigint> {
  const prim = yield* ToPrimitive($, argument, NUMBER);
  if (IsAbrupt(prim)) return prim;
  switch (typeof prim) {
    case 'object': // null
    case 'undefined':
    case 'number':
      return $.throw('TypeError'); // TODO - message?
    case 'symbol':
      return $.throw('TypeError'); // TODO - message?
    case 'boolean':
      return prim ? 1n : 0n;
    case 'string': {
      const n = StringToBigInt(prim);
      if (n == undefined) return $.throw('SyntaxError', `Cannot convert ${prim} to a BigInt`);
      return n;
    }
    case 'bigint':
      return prim;
  }
}

/**
 * 7.1.14 StringToBigInt ( str )
 * 
 * The abstract operation StringToBigInt takes argument str (a String)
 * and returns a BigInt or undefined. It performs the following steps
 * when called:
 * 
 * 1. Let text be StringToCodePoints(str).
 * 2. Let literal be ParseText(text, StringIntegerLiteral).
 * 3. If literal is a List of errors, return undefined.
 * 4. Let mv be the MV of literal.
 * 5. Assert: mv is an integer.
 * 6. Return ℤ(mv).
 */
export function StringToBigInt(str: string): bigint|undefined {
  try {
    return BigInt(str);
  } catch (err) {
    return undefined;
  }
}

/**
 * 7.1.17 ToString ( argument )
 *
 * The abstract operation ToString takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing a String or a throw completion. It converts argument to
 * a value of type String. It performs the following steps when
 * called:
 *
 * 1. If argument is a String, return argument.
 * 2. If argument is a Symbol, throw a TypeError exception.
 * 3. If argument is undefined, return "undefined".
 * 4. If argument is null, return "null".
 * 5. If argument is true, return "true".
 * 6. If argument is false, return "false".
 * 7. If argument is a Number, return Number::toString(argument, 10).
 * 8. If argument is a BigInt, return BigInt::toString(argument, 10).
 * 9. Assert: argument is an Object.
 * 10. Let primValue be ? ToPrimitive(argument, string).
 * 11. Assert: primValue is not an Object.
 * 12. Return ? ToString(primValue).
 */ 
export function* ToString($: VM, argument: Val): ECR<string> {
  if (argument instanceof Obj) {
    const primValue = yield* ToPrimitive($, argument);
    if (IsAbrupt(primValue)) return primValue;
    Assert(!(primValue instanceof Obj));
    return yield* ToString($, primValue);
  } else if (typeof argument === 'symbol') {
    return $.throw('TypeError');
  }
  return String(argument);  
}

/** Modified version of ToString that takes a CR instead. */
export function* ToStringCR($: VM, arg: CR<Val>): ECR<string> {
  if (IsAbrupt(arg)) return arg;
  return yield* ToString($, arg);
}

/** Modified version of ToString that takes an ECR instead. */
export function* ToStringECR($: VM, arg: ECR<Val>): ECR<string> {
  return yield* ToStringCR($, yield* arg);
}

/**
 * 7.1.18 ToObject ( argument )
 *
 * The abstract operation ToObject takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing an Object or a throw completion. It converts argument to
 * a value of type Object according to Table 13:
 *
 * Table 13: ToObject Conversions
 * Undefined: Throw a TypeError exception.
 * Null:      Throw a TypeError exception.
 * Boolean:   Return a new Boolean object whose [[BooleanData]] internal
 *            slot is set to argument. See 20.3 for a description of Boolean
 *            objects.
 * Number:    Return a new Number object whose [[NumberData]] internal
 *            slot is set to argument. See 21.1 for a description of Number
 *            objects.
 * String:    Return a new String object whose [[StringData]] internal
 *            slot is set to argument. See 22.1 for a description of String
 *            objects.
 * Symbol:    Return a new Symbol object whose [[SymbolData]] internal
 *            slot is set to argument. See 20.4 for a description of Symbol
 *            objects.
 * BigInt:    Return a new BigInt object whose [[BigIntData]] internal
 *            slot is set to argument. See 21.2 for a description of BigInt
 *            objects.
 * Object:    Return argument.
 */
export function ToObject($: VM, argument: Val): CR<Obj> {
  if (argument instanceof Obj) return argument;
  if (argument == null) return $.throw('TypeError', 'Cannot convert undefined or null to object');
  switch (typeof argument) {
    case 'boolean': return makeWrapper($, '%Boolean.prototype%', {BooleanData: argument});
    case 'number': return makeWrapper($, '%Number.prototype%', {NumberData: argument});
    case 'string': return StringCreate(argument, $.getIntrinsic('%String.prototype%'));
    case 'symbol': return makeWrapper($, '%Symbol.prototype%', {SymbolData: argument});
    case 'bigint': return makeWrapper($, '%BigInt.prototype%', {BigIntData: argument});
  }
}
function makeWrapper($: VM, proto: string, slots: ObjectSlots): CR<Obj> {
  const Prototype = $.getIntrinsic(proto);
  if (!Prototype) return $.throw('TypeError', `${proto} not defined`);
  return OrdinaryObjectCreate({...slots, Prototype});
}

/**
 * 7.1.19 ToPropertyKey ( argument )
 *
 * The abstract operation ToPropertyKey takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing a property key or a throw completion. It converts
 * argument to a value that can be used as a property key. It performs
 * the following steps when called:
 *
 * 1. Let key be ? ToPrimitive(argument, string).
 * 2. If key is a Symbol, then
 *     a. Return key.
 * 3. Return ! ToString(key).
 */
export function* ToPropertyKey($: VM, argument: Val): ECR<PropertyKey> {
  const key = yield* ToPrimitive($, argument, STRING);
  if (IsAbrupt(key)) return key;
  if (typeof key === 'symbol') return key;
  return CastNotAbrupt(yield* ToString($, key));
}

/**
 * 7.1.20 ToLength ( argument )
 *
 * The abstract operation ToLength takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing an integral Number or a throw completion. It clamps
 * argument to an integral Number suitable for use as the length of an
 * array-like object. It performs the following steps when called:
 *
 * 1. Let len be ? ToIntegerOrInfinity(argument).
 * 2. If len ≤ 0, return +0𝔽.
 * 3. Return 𝔽(min(len, 253 - 1)).
 */
export function* ToLength($: VM, argument: Val): ECR<number> {
  const len = yield* ToIntegerOrInfinity($, argument);
  if (IsAbrupt(len)) return len;
  if (len <= 0) return 0;
  return Math.min(len, 2**53 - 1);
}

/** Modified version of ToLength that takes a CR instead. */
export function* ToLengthCR($: VM, arg: CR<Val>): ECR<number> {
  if (IsAbrupt(arg)) return arg;
  return yield* ToLength($, arg);
}

/** Modified version of ToLength that takes an ECR instead. */
export function* ToLengthECR($: VM, arg: ECR<Val>): ECR<number> {
  return yield* ToLengthCR($, yield* arg);
}

/**
 * 7.1.21 CanonicalNumericIndexString ( argument )
 *
 * The abstract operation CanonicalNumericIndexString takes argument
 * argument (a String) and returns a Number or undefined. If argument
 * is either "-0" or exactly matches the result of ToString(n) for
 * some Number value n, it returns the respective Number
 * value. Otherwise, it returns undefined. It performs the following
 * steps when called:
 *
 * 1. If argument is "-0", return -0𝔽.
 * 2. Let n be ! ToNumber(argument).
 * 3. If ! ToString(n) is argument, return n.
 * 4. Return undefined.
 *
 * A canonical numeric string is any String value for which the
 * CanonicalNumericIndexString abstract operation does not return
 * undefined.
 */
export function CanonicalNumericIndexString(argument: string): number|undefined {
  if (argument === '-0') return -0;
  const n = Number(argument);
  return argument === String(n) ? n : undefined;
}

/**
 * 7.1.22 ToIndex ( value )
 *
 * The abstract operation ToIndex takes argument value (an ECMAScript
 * language value) and returns either a normal completion containing a
 * non-negative integer or a throw completion. It converts value to a
 * non-negative integer if the corresponding decimal representation,
 * as a String, is an integer index. It performs the following steps
 * when called:
 *
 * 1. If value is undefined, then
 *     a. Return 0.
 * 2. Else,
 *     a. Let integer be ? ToIntegerOrInfinity(value).
 *     b. Let clamped be ! ToLength(𝔽(integer)).
 *     c. If SameValue(𝔽(integer), clamped) is false, throw a RangeError exception.
 *     d. Assert: 0 ≤ integer ≤ 253 - 1.
 *     e. Return integer.
 */
export function* ToIndex($: VM, value: Val): ECR<number> {
  if (value == null) return 0;
  const integer = yield* ToIntegerOrInfinity($, value);
  if (IsAbrupt(integer)) return integer;
  const clamped = CastNotAbrupt(yield* ToLength($, integer));
  if (!SameValue(clamped, integer)) return $.throw('RangeError');
  Assert(0 <= integer && integer <= 2**53 - 1);
  return integer;
}
