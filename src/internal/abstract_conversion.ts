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

import { Get } from "./abstract_object";
import { CR, CastNotAbrupt, IsAbrupt, Throw } from "./completion_record";
import { NUMBER, STRING } from "./enums";
import { Obj } from "./obj";
import { PropertyKey, Val } from "./val";
import { VM } from "./vm";


function GetMethod(...args: any[]) { return undefined; }
declare const Call: any;
declare const IsCallable: any;
declare const ToString: any;

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
export function ToPrimitive($: VM, input: Val, preferredType?: STRING|NUMBER): CR<Val> {
  // 1. If input is an Object, then
  if (input instanceof Obj) {
    //   a. Let exoticToPrim be ? GetMethod(input, @@toPrimitive).
    const exoticToPrim = GetMethod(input, Symbol.toPrimitive);
    //   b. If exoticToPrim is not undefined, then
    if (exoticToPrim != null) {
      //     i. If preferredType is not present, let hint be "default".
      //     ii. Else if preferredType is string, let hint be "string".
      //     iii. Else,
      //         1. Assert: preferredType is number.
      //         2. Let hint be "number".
      const hint = !preferredType ? 'default' : STRING.is(preferredType) ? 'string' : 'number';
      //     iv. Let result be ? Call(exoticToPrim, input, « hint »).
      const result = Call(exoticToPrim, input, [hint]);
      if (IsAbrupt(result)) return result;
      //     v. If result is not an Object, return result.
      if (!(result instanceof Obj)) return result;
      //     vi. Throw a TypeError exception.
      return Throw('TypeError');
    }
    //   c. If preferredType is not present, let preferredType be number.
    //   d. Return ? OrdinaryToPrimitive(input, preferredType).
    return OrdinaryToPrimitive($, input, preferredType ?? NUMBER);
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
function OrdinaryToPrimitive($: VM, O: Obj, hint: STRING|NUMBER): CR<Val> {
  // 1. If hint is string, then
  //     a. Let methodNames be « "toString", "valueOf" ».
  // 2. Else,
  //     a. Let methodNames be « "valueOf", "toString" ».
  const methodNames = STRING.is(hint) ? ['toString', 'valueOf'] : ['valueOf', 'toString'];
  // 3. For each element name of methodNames, do
  for (const name of methodNames) {
    //   a. Let method be ? Get(O, name).
    const method = Get($, O, name);
    if (IsAbrupt(method)) return method;
    //   b. If IsCallable(method) is true, then
    if (IsCallable(method)) {
      //     i. Let result be ? Call(method, O).
      const result = Call(method, O);
      if (IsAbrupt(result)) return result;
      //     ii. If result is not an Object, return result.
      if (!(result instanceof Obj)) return result;
    }
  }
  // 4. Throw a TypeError exception.
  return Throw('TypeError');
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
export function ToPropertyKey($: VM, argument: Val): CR<PropertyKey> {
  const key = ToPrimitive($, argument, STRING);
  if (IsAbrupt(key)) return key;
  if (typeof key === 'symbol') return key;
  return CastNotAbrupt(ToString(key));
}
