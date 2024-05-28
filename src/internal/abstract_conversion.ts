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

import { IsCallable } from './abstract_compare';
import { Call, Get, GetMethod } from './abstract_object';
import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt, Throw } from './completion_record';
import { NUMBER, STRING } from './enums';
import { Obj } from './obj';
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
      return Throw('TypeError');
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
  return Throw('TypeError');
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
 * 10. Return ? ToNumber(primValue).
 * 9. Assert: primValue is not an Object.
 */
export function* ToNumber($: VM, argument: Val): ECR<number> {
  if (argument instanceof Obj) {
    const primValue = yield* ToPrimitive($, argument, NUMBER);
    if (IsAbrupt(primValue)) return primValue;
    Assert(!(primValue instanceof Obj));
    return yield* ToNumber($, primValue);
  } else if (typeof argument === 'symbol' || typeof argument === 'bigint') {
    return Throw('TypeError');
  }
  return Number(argument);
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
    return Throw('TypeError');
  }
  return String(argument);  
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
export function ToObject(_$: VM, argument: Val): CR<Obj> {
  if (argument instanceof Obj) return argument;
  throw new Error('not implemented');
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
7.1.20 ToLength ( argument )

The abstract operation ToLength takes argument argument (an ECMAScript language value) and returns either a normal completion containing an integral Number or a throw completion. It clamps argument to an integral Number suitable for use as the length of an array-like object. It performs the following steps when called:

1. 1. Let len be ? ToIntegerOrInfinity(argument).
2. 2. If len ≤ 0, return +0𝔽.
3. 3. Return 𝔽(min(len, 253 - 1)).
7.1.21 CanonicalNumericIndexString ( argument )

The abstract operation CanonicalNumericIndexString takes argument argument (a String) and returns a Number or undefined. If argument is either "-0" or exactly matches the result of ToString(n) for some Number value n, it returns the respective Number value. Otherwise, it returns undefined. It performs the following steps when called:

1. 1. If argument is "-0", return -0𝔽.
2. 2. Let n be ! ToNumber(argument).
3. 3. If ! ToString(n) is argument, return n.
4. 4. Return undefined.

A canonical numeric string is any String value for which the CanonicalNumericIndexString abstract operation does not return undefined.

7.1.22 ToIndex ( value )

The abstract operation ToIndex takes argument value (an ECMAScript language value) and returns either a normal completion containing a non-negative integer or a throw completion. It converts value to a non-negative integer if the corresponding decimal representation, as a String, is an integer index. It performs the following steps when called:

1. 1. If value is undefined, then
a. a. Return 0.
2. 2. Else,
a. a. Let integer be ? ToIntegerOrInfinity(value).
b. b. Let clamped be ! ToLength(𝔽(integer)).
c. c. If SameValue(𝔽(integer), clamped) is false, throw a RangeError exception.
d. d. Assert: 0 ≤ integer ≤ 253 - 1.
e. e. Return integer.
/**/
