import { CR, IsAbrupt } from './completion_record';
import { BOOLEAN, NUMBER, OBJECT } from './enums';
import { Obj, Type, Val } from './values';
import { VM } from './vm';

declare const StringToBigInt: any;
declare const ToPrimitive: any;
declare const ToNumeric: any;

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
export function IsPropertyKey(argument: Val): boolean {
  const t = typeof argument;
  return t === 'string' || t === 'symbol';
}



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
export function IsLessThan($: VM, x: Val, y: Val, LeftFirst: boolean): CR<boolean|undefined> {
  let px: CR<Val>, py: CR<Val>;
  if (LeftFirst) {
    px = ToPrimitive($, x, NUMBER);
    if (IsAbrupt(px)) return px;
    py = ToPrimitive($, y, NUMBER);
    if (IsAbrupt(py)) return py;
  } else {
    py = ToPrimitive($, y, NUMBER);
    if (IsAbrupt(py)) return py;
    px = ToPrimitive($, x, NUMBER);
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
  const nx = ToNumeric(px);
  if (IsAbrupt(nx)) return nx;
  const ny = ToNumeric(py);
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
export function IsLooselyEqual($: VM, x: Val, y:Val): CR<boolean> {
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
    const py = ToPrimitive($, y);
    if (IsAbrupt(py)) return py;
    return IsLooselyEqual($, x, py);
  } else {
    const px = ToPrimitive($, x);
    if (IsAbrupt(px)) return px;
    return IsLooselyEqual($, px, y);
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
