import { StringToBigInt, ToBoolean, ToNumeric, ToPrimitive } from './abstract_conversion';
import { Get } from './abstract_object';
import { CR, IsAbrupt } from './completion_record';
import { BOOLEAN, NUMBER, OBJECT } from './enums';
import { ArrayExoticObject } from './exotic_array';
import { Func } from './func';
import { Obj } from './obj';
import { Type, Val } from './val';
import { ECR, VM } from './vm';

function ProxyExoticObject() { return function() {} }
declare const ValidateNonRevokedProxy: any;

/**
 * 7.2.1 RequireObjectCoercible ( argument )
 * 
 * The abstract operation RequireObjectCoercible takes argument
 * argument (an ECMAScript language value) and returns either a normal
 * completion containing an ECMAScript language value or a throw
 * completion. It throws an error if argument is a value that cannot
 * be converted to an Object using ToObject. It is defined by Table
 * 14:
 * 
 * Table 14: RequireObjectCoercible Results
 * Argument Type	Result
 * Undefined	Throw a TypeError exception.
 * Null	Throw a TypeError exception.
 * Boolean	Return argument.
 * Number	Return argument.
 * String	Return argument.
 * Symbol	Return argument.
 * BigInt	Return argument.
 * Object	Return argument.
 */
export function RequireObjectCoercible($: VM, argument: Val): CR<Val> {
  if (argument == null) {
    return $.throw('TypeError', 'Value cannot be converted to an object');
  }
  return argument;
}

/**
 * 7.2.2 IsArray ( argument )
 * 
 * The abstract operation IsArray takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing a Boolean or a throw completion. It performs the
 * following steps when called:
 * 
 * 1. If argument is not an Object, return false.
 * 2. If argument is an Array exotic object, return true.
 * 3. If argument is a Proxy exotic object, then
 *     a. Perform ? ValidateNonRevokedProxy(argument).
 *     b. Let proxyTarget be argument.[[ProxyTarget]].
 *     c. Return ? IsArray(proxyTarget).
 * 4. Return false.
 */
export function IsArray($: VM, argument: Val): CR<boolean> {
  if (!(argument instanceof Obj)) return false;
  if (argument instanceof ArrayExoticObject()) return true;
  if (argument instanceof ProxyExoticObject()) {
    const validateStatus = ValidateNonRevokedProxy($, argument);
    if (IsAbrupt(validateStatus)) return validateStatus;
    const proxyTarget = argument.ProxyTarget;
    // @ts-expect-error - implement proxy
    return IsArray($, proxyTarget);
  }
  return false;
}

/**
 * 7.2.3 IsCallable ( argument )
 *
 * The abstract operation IsCallable takes argument argument (an
 * ECMAScript language value) and returns a Boolean. It determines if
 * argument is a callable function with a [[Call]] internal method. It
 * performs the following steps when called:
 *
 * 1. If argument is not an Object, return false.
 * 2. If argument has a [[Call]] internal method, return true.
 * 3. Return false.
 */
export function IsCallable(argument: Val): argument is Func&{Call: {}} {
  if (!(argument instanceof Obj)) return false;
  if ((argument as Func).Call) return true;
  return false;
}

/**
 * 7.2.4 IsConstructor ( argument )
 *
 * The abstract operation IsConstructor takes argument argument (an
 * ECMAScript language value) and returns a Boolean. It determines if
 * argument is a function object with a [[Construct]] internal
 * method. It performs the following steps when called:
 *
 * 1. If argument is not an Object, return false.
 * 2. If argument has a [[Construct]] internal method, return true.
 * 3. Return false.
 */
export function IsConstructor(argument: Val): argument is Func&{Construct: {}} {
  if (!(argument instanceof Obj)) return false;
  if ((argument as Func).Construct) return true;
  return false;
}

/**
 * 7.2.5 IsExtensible ( O )
 *
 * The abstract operation IsExtensible takes argument O (an Object)
 * and returns either a normal completion containing a Boolean or a
 * throw completion. It is used to determine whether additional
 * properties can be added to O. It performs the following steps when
 * called:
 *
 * 1. Return ? O.[[IsExtensible]]().
 */
export function IsExtensible($: VM, O: Obj): CR<boolean> {
  return O.IsExtensible($);
}

/**
 * 7.2.6 IsIntegralNumber ( argument )
 *
 * The abstract operation IsIntegralNumber takes argument argument (an
 * ECMAScript language value) and returns a Boolean. It determines if
 * argument is a finite integral Number value. It performs the
 * following steps when called:
 *
 * 1. If argument is not a Number, return false.
 * 2. If argument is not finite, return false.
 * 3. If truncate(ℝ(argument)) ≠ ℝ(argument), return false.
 * 4. Return true.
 */
export function IsIntegralNumber(argument: Val): boolean {
  // if (typeof argument !== 'number') return false;
  // if (!Number.isFinite(argument)) return false;
  // if (Math.trunc(argument) !== argument) return false;
  // return true;
  return Number.isInteger(argument);
}

/**
 * 7.2.7 IsPropertyKey ( argument )
 *
 * The abstract operation IsPropertyKey takes argument argument (an
 * ECMAScript language value) and returns a Boolean. It determines if
 * argument is a value that may be used as a property key. It performs
 * the following steps when called:
 *
 * 1. If argument is a String, return true.
 * 2. If argument is a Symbol, return true.
 * 3. Return false.
 */
export function IsPropertyKey(argument: Val): argument is string|symbol {
  const t = typeof argument;
  return t === 'string' || t === 'symbol';
}

/**
 * IsArrayIndex ( argument )
 *
 * NOTE: This is not in the spec.
 */
export function IsArrayIndex(argument: Val): boolean {
  if (typeof argument !== 'string') return false;
  const n = Number(argument);
  return Number.isSafeInteger(n) && n >= 0 && String(n) === argument;
}

/**
 * 7.2.8 IsRegExp ( argument )
 * 
 * The abstract operation IsRegExp takes argument argument (an
 * ECMAScript language value) and returns either a normal completion
 * containing a Boolean or a throw completion. It performs the
 * following steps when called:
 * 
 * 1. If argument is not an Object, return false.
 * 2. Let matcher be ? Get(argument, @@match).
 * 3. If matcher is not undefined, return ToBoolean(matcher).
 * 4. If argument has a [[RegExpMatcher]] internal slot, return true.
 * 5. Return false.
 */
export function* IsRegExp($: VM, argument: Val): ECR<boolean> {
  if (!(argument instanceof Obj)) return false;
  const matcher = yield* Get($, argument, Symbol.match);
  if (IsAbrupt(matcher)) return matcher;
  if (matcher !== undefined) return ToBoolean(matcher);
  return Boolean(argument.RegExpMatcher);
}

/**
 * 7.2.9 Static Semantics: IsStringWellFormedUnicode ( string )
 * 
 * The abstract operation IsStringWellFormedUnicode takes argument
 * string (a String) and returns a Boolean. It interprets string as a
 * sequence of UTF-16 encoded code points, as described in 6.1.4, and
 * determines whether it is a well formed UTF-16 sequence. It performs
 * the following steps when called:
 * 
 * 1. Let len be the length of string.
 * 2. Let k be 0.
 * 3. Repeat, while k < len,
 *     a. Let cp be CodePointAt(string, k).
 *     b. If cp.[[IsUnpairedSurrogate]] is true, return false.
 *     c. Set k to k + cp.[[CodeUnitCount]].
 * 4. Return true.
 */


/**
 * 7.2.10 SameValue ( x, y )
 *
 * The abstract operation SameValue takes arguments x (an ECMAScript
 * language value) and y (an ECMAScript language value) and returns a
 * Boolean. It determines whether or not the two arguments are the
 * same value. It performs the following steps when called:
 *
 * 1. If Type(x) is not Type(y), return false.
 * 2. If x is a Number, then
 *     a. Return Number::sameValue(x, y).
 * 3. Return SameValueNonNumber(x, y).
 *
 * NOTE: This algorithm differs from the IsStrictlyEqual Algorithm by
 * treating all NaN values as equivalent and by differentiating +0𝔽
 * from -0𝔽.
 */
export function SameValue(x: Val, y: Val): boolean {
  return Object.is(x, y);
}

/**
 * 7.2.11 SameValueZero ( x, y )
 *
 * The abstract operation SameValueZero takes arguments x (an
 * ECMAScript language value) and y (an ECMAScript language value) and
 * returns a Boolean. It determines whether or not the two arguments
 * are the same value (ignoring the difference between +0𝔽 and
 * -0𝔽). It performs the following steps when called:
 *
 * 1. If Type(x) is not Type(y), return false.
 * 2. If x is a Number, then
 *     a. Return Number::sameValueZero(x, y).
 * 3. Return SameValueNonNumber(x, y).
 *
 * NOTE: SameValueZero differs from SameValue only in that it treats
 * +0𝔽 and -0𝔽 as equivalent.
 */
export function SameValueZero(x: Val, y: Val): boolean {
  return Object.is(x, y) || (x === 0 && y === 0);
}

// 7.2.12 SameValueNonNumber ( x, y ) - unused

/**
 * 7.2.13 IsLessThan ( x, y, LeftFirst )
 *
 * The abstract operation IsLessThan takes arguments x (an ECMAScript
 * language value), y (an ECMAScript language value), and LeftFirst (a
 * Boolean) and returns either a normal completion containing either a
 * Boolean or undefined, or a throw completion. It provides the
 * semantics for the comparison x < y, returning true, false, or
 * undefined (which indicates that at least one operand is NaN). The
 * LeftFirst flag is used to control the order in which operations
 * with potentially visible side-effects are performed upon x and
 * y. It is necessary because ECMAScript specifies left to right
 * evaluation of expressions. If LeftFirst is true, the x parameter
 * corresponds to an expression that occurs to the left of the y
 * parameter's corresponding expression. If LeftFirst is false, the
 * reverse is the case and operations must be performed upon y before
 * x. It performs the following steps when called:
 *
 * 1. If LeftFirst is true, then
 *     a. Let px be ? ToPrimitive(x, number).
 *     b. Let py be ? ToPrimitive(y, number).
 * 2. Else,
 *     a. NOTE: The order of evaluation needs to be reversed to preserve
 *        left to right evaluation.
 *     b. Let py be ? ToPrimitive(y, number).
 *     c. Let px be ? ToPrimitive(x, number).
 * 3. If px is a String and py is a String, then
 *     a. Let lx be the length of px.
 *     b. Let ly be the length of py.
 *     c. For each integer i such that 0 ≤ i < min(lx, ly), in ascending
 *        order, do
 *         i. Let cx be the numeric value of the code unit at index i
 *            within px.
 *         ii. Let cy be the numeric value of the code unit at index i
 *             within py.
 *         iii. If cx < cy, return true.
 *         iv. If cx > cy, return false.
 *     d. If lx < ly, return true. Otherwise, return false.
 * 4. Else,
 *     a. If px is a BigInt and py is a String, then
 *         i. Let ny be StringToBigInt(py).
 *         ii. If ny is undefined, return undefined.
 *         iii. Return BigInt::lessThan(px, ny).
 *     b. If px is a String and py is a BigInt, then
 *         i. Let nx be StringToBigInt(px).
 *         ii. If nx is undefined, return undefined.
 *         iii. Return BigInt::lessThan(nx, py).
 *     c. NOTE: Because px and py are primitive values, evaluation order
 *        is not important.
 *     d. Let nx be ? ToNumeric(px).
 *     e. Let ny be ? ToNumeric(py).
 *     f. If Type(nx) is Type(ny), then
 *         i. If nx is a Number, then
 *             1. Return Number::lessThan(nx, ny).
 *         ii. Else,
 *             1. Assert: nx is a BigInt.
 *             2. Return BigInt::lessThan(nx, ny).
 *     g. Assert: nx is a BigInt and ny is a Number, or nx is a Number
 *        and ny is a BigInt.
 *     h. If nx or ny is NaN, return undefined.
 *     i. If nx is -∞𝔽 or ny is +∞𝔽, return true.
 *     j. If nx is +∞𝔽 or ny is -∞𝔽, return false.
 *     k. If ℝ(nx) < ℝ(ny), return true; otherwise return false.
 *
 * NOTE 1: Step 3 differs from step 1.c in the algorithm that handles
 * the addition operator + (13.15.3) by using the logical-and
 * operation instead of the logical-or operation.
 *
 * NOTE 2: The comparison of Strings uses a simple lexicographic
 * ordering on sequences of UTF-16 code unit values. There is no
 * attempt to use the more complex, semantically oriented definitions
 * of character or string equality and collating order defined in the
 * Unicode specification. Therefore String values that are canonically
 * equal according to the Unicode Standard but not in the same
 * normalization form could test as unequal. Also note that
 * lexicographic ordering by code unit differs from ordering by code
 * point for Strings containing surrogate pairs.
 */
export function* IsLessThan($: VM, x: Val, y: Val, LeftFirst: boolean): ECR<boolean|undefined> {
  let px: CR<Val>, py: CR<Val>;
  if (LeftFirst) {
    px = yield* ToPrimitive($, x, NUMBER);
    if (IsAbrupt(px)) return px;
    py = yield* ToPrimitive($, y, NUMBER);
    if (IsAbrupt(py)) return py;
  } else {
    py = yield* ToPrimitive($, y, NUMBER);
    if (IsAbrupt(py)) return py;
    px = yield* ToPrimitive($, x, NUMBER);
    if (IsAbrupt(px)) return px;
  }
  if (typeof px === 'string' && typeof py === 'string') {
    return px < py;
  }
  if (typeof px === 'bigint' && typeof py === 'string') {
    const ny = StringToBigInt(py);
    if (ny == undefined) return undefined;
    return px < ny;
  }
  if (typeof px === 'string' && typeof py === 'bigint') {
    const nx = StringToBigInt(px);
    if (nx == undefined) return undefined;
    return nx < py;
  }
  // NOTE: Because px and py are primitive values, evaluation order
  // is not important.
  const nx = yield* ToNumeric($, px);
  if (IsAbrupt(nx)) return nx;
  const ny = yield* ToNumeric($, py);
  if (IsAbrupt(ny)) return ny;
  if (nx !== nx || ny !== ny) return undefined;
  return nx < ny;
}

/**
 * 7.2.14 IsLooselyEqual ( x, y )
 *
 * The abstract operation IsLooselyEqual takes arguments x (an
 * ECMAScript language value) and y (an ECMAScript language value) and
 * returns either a normal completion containing a Boolean or a throw
 * completion. It provides the semantics for the == operator. It
 * performs the following steps when called:
 *
 * 1. If Type(x) is Type(y), then
 *     a. Return IsStrictlyEqual(x, y).
 * 2. If x is null and y is undefined, return true.
 * 3. If x is undefined and y is null, return true.
 * 4. NOTE: This step is replaced in section B.3.6.2.
 * 5. If x is a Number and y is a String,
 *    return ! IsLooselyEqual(x, ! ToNumber(y)).
 * 6. If x is a String and y is a Number,
 *    return ! IsLooselyEqual(! ToNumber(x), y).
 * 7. If x is a BigInt and y is a String, then
 *     a. Let n be StringToBigInt(y).
 *     b. If n is undefined, return false.
 *     c. Return ! IsLooselyEqual(x, n).
 * 8. If x is a String and y is a BigInt, return ! IsLooselyEqual(y, x).
 * 9. If x is a Boolean, return ! IsLooselyEqual(! ToNumber(x), y).
 * 10. If y is a Boolean, return ! IsLooselyEqual(x, ! ToNumber(y)).
 * 11. If x is either a String, a Number, a BigInt, or a Symbol and y is an Object,
 *     return ! IsLooselyEqual(x, ? ToPrimitive(y)).
 * 12. If x is an Object and y is either a String, a Number, a BigInt, or a Symbol,
 *     return ! IsLooselyEqual(? ToPrimitive(x), y).
 * 13. If x is a BigInt and y is a Number, or if x is a Number and y is a BigInt, then
 *     a. If x is not finite or y is not finite, return false.
 *     b. If ℝ(x) = ℝ(y), return true; otherwise return false.
 * 14. Return false.
 */
export function* IsLooselyEqual($: VM, x: Val, y:Val): ECR<boolean> {
  const tx = Type(x);
  const ty = Type(y);
  if (tx === ty) return IsStrictlyEqual(x, y);
  if (!OBJECT.is(tx) && !OBJECT.is(ty)) {
    // both primitives: fall back on host equality
    return x == y;
  }
  // We're guaranteed to have one object and one primitive at this point.
  // First normalize away booleans and nullish values.
  if (x == null || y == null) return false;
  if (BOOLEAN.is(tx)) {
    x = +(x as boolean);
  } else if (BOOLEAN.is(ty)) {
    y = +(y as boolean);
  }
  // Figure out which value is the object and make it primitive.
  if (OBJECT.is(ty)) {
    const py = yield* ToPrimitive($, y);
    if (IsAbrupt(py)) return py;
    return yield* IsLooselyEqual($, x, py);
  } else {
    const px = yield* ToPrimitive($, x);
    if (IsAbrupt(px)) return px;
    return yield* IsLooselyEqual($, px, y);
  }
}

/**
 * 7.2.15 IsStrictlyEqual ( x, y )
 *
 * The abstract operation IsStrictlyEqual takes arguments x (an
 * ECMAScript language value) and y (an ECMAScript language value) and
 * returns a Boolean. It provides the semantics for the ===
 * operator. It performs the following steps when called:
 *
 * 1. If Type(x) is not Type(y), return false.
 * 2. If x is a Number, then
 *     a. Return Number::equal(x, y).
 * 3. Return SameValueNonNumber(x, y).
 *
 * NOTE: This algorithm differs from the SameValue Algorithm in its
 * treatment of signed zeroes and NaNs.
 */
export function IsStrictlyEqual(x: Val, y: Val): boolean {
  // This one is at least trivial, object types are referential anyway
  return x === y;
}
