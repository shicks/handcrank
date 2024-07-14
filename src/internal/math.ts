import { ToNumber, ToUint32 } from './abstract_conversion';
import { Abrupt, IsAbrupt } from './completion_record';
import { CreateBuiltinFunction, method } from './func';
import { OrdinaryObjectCreate } from './obj';
import { prelude } from './prelude';
import { PropertyDescriptor, prop0, propC, propWC } from './property_descriptor';
import { RealmRecord, defineProperties } from './realm_record';
import { Val } from './val';
import { ECR, Plugin, VM, just } from './vm';

export const math: Plugin = {
  id: 'math',
  deps: () => [prelude],
  realm: {CreateIntrinsics},
};

export function CreateIntrinsics(realm: RealmRecord, stagedGlobals: Map<string, PropertyDescriptor>) {
  /**
   * 21.3 The Math Object
   * 
   * The Math object:
   *   - is %Math%.
   *   - is the initial value of the "Math" property of the global object.
   *   - is an ordinary object.
   *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
   *   - is not a function object.
   *   - does not have a [[Construct]] internal method; it cannot be used
   *     as a constructor with the new operator.
   *   - does not have a [[Call]] internal method; it cannot be invoked as
   *     a function.
   * 
   * NOTE: In this specification, the phrase “the Number value for x”
   * has a technical meaning defined in 6.1.6.1.
   */
  const math = OrdinaryObjectCreate({
    Prototype: realm.Intrinsics.get('%Object.prototype%')!,
  }, {
    // 21.3.1 Value Properties of the Math Object
    /**
     * 21.3.1.1 Math.E
     *      
     * The Number value for e, the base of the natural logarithms,
     * which is approximately 2.7182818284590452354.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: false }.
     */
    'E': prop0(Math.E),

    /**
     * 21.3.1.2 Math.LN10
     * 
     * The Number value for the natural logarithm of 10, which is
     * approximately 2.302585092994046.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: false }.
     */
    'LN10': prop0(Math.LN10),

    /**
     * 21.3.1.3 Math.LN2
     * 
     * The Number value for the natural logarithm of 2, which is
     * approximately 0.6931471805599453.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: false }.
     */
    'LN2': prop0(Math.LN2),

    /**
     * 21.3.1.4 Math.LOG10E
     * 
     * The Number value for the base-10 logarithm of e, the base of
     * the natural logarithms; this value is approximately
     * 0.4342944819032518.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: false }.
     * 
     * NOTE: The value of Math.LOG10E is approximately the reciprocal
     * of the value of Math.LN10.
     */
    'LOG10E': prop0(Math.LOG10E),

    /**
     * 21.3.1.5 Math.LOG2E
     * 
     * The Number value for the base-2 logarithm of e, the base of the
     * natural logarithms; this value is approximately
     * 1.4426950408889634.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: false }.
     * 
     * NOTE: The value of Math.LOG2E is approximately the reciprocal
     * of the value of Math.LN2.
     */
    'LOG2E': prop0(Math.LOG2E),

    /**
     * 21.3.1.6 Math.PI
     * 
     * The Number value for π, the ratio of the circumference of a circle
     * to its diameter, which is approximately 3.1415926535897932.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: false }.
     */
    'PI': prop0(Math.PI),

    /**
     * 21.3.1.7 Math.SQRT1_2
     * 
     * The Number value for the square root of ½, which is
     * approximately 0.7071067811865476.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: false }.
     * 
     * NOTE: The value of Math.SQRT1_2 is approximately the reciprocal
     * of the value of Math.SQRT2.
     */
    'SQRT1_2': prop0(Math.SQRT1_2),

    /**
     * 21.3.1.8 Math.SQRT2
     * 
     * The Number value for the square root of 2, which is
     * approximately 1.4142135623730951.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: false }.
     */
    'SQRT2': prop0(Math.SQRT2),

    /**
     * 21.3.1.9 Math [ @@toStringTag ]
     * 
     * The initial value of the @@toStringTag property is the String
     * value "Math".
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    [Symbol.toStringTag]: propC('Math'),
  });
  realm.Intrinsics.set('%Math%', math);
  stagedGlobals.set('Math', propWC(math));

  /**
   * 21.3.2 Function Properties of the Math Object
   * 
   * NOTE: The behaviour of the functions acos, acosh, asin, asinh,
   * atan, atanh, atan2, cbrt, cos, cosh, exp, expm1, hypot, log,
   * log1p, log2, log10, pow, random, sin, sinh, sqrt, tan, and tanh
   * is not precisely specified here except to require specific
   * results for certain argument values that represent boundary cases
   * of interest. For other argument values, these functions are
   * intended to compute approximations to the results of familiar
   * mathematical functions, but some latitude is allowed in the
   * choice of approximation algorithms. The general intent is that an
   * implementer should be able to use the same mathematical library
   * for ECMAScript on a given hardware platform that is available to
   * C programmers on that platform.
   * 
   * Although the choice of algorithms is left to the implementation,
   * it is recommended (but not specified by this standard) that
   * implementations use the approximation algorithms for IEEE
   * 754-2019 arithmetic contained in fdlibm, the freely distributable
   * mathematica library from Sun Microsystems (http://www.netlib.org/fdlibm).
   */
  defineProperties(realm, math, {
    /**
     * 21.3.2.1 Math.abs ( x )
     * 
     * This function returns the absolute value of x; the result has the
     * same magnitude as x but has positive sign.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is NaN, return NaN.
     * 3. If n is -0𝔽, return +0𝔽.
     * 4. If n is -∞𝔽, return +∞𝔽.
     * 5. If n < -0𝔽, return -n.
     * 6. Return n.
     */
    'abs': mathMethod(Math.abs, fixed(ToNumber)),

    /**
     * 21.3.2.2 Math.acos ( x )
     * 
     * This function returns the inverse cosine of x. The result is
     * expressed in radians and is in the inclusive interval from +0𝔽 to
     * 𝔽(π).
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is NaN, n > 1𝔽, or n < -1𝔽, return NaN.
     * 3. If n is 1𝔽, return +0𝔽.
     * 4. Return an implementation-approximated Number value representing
     *    the result of the inverse cosine of ℝ(n).
     */
    'acos': mathMethod(Math.acos, fixed(ToNumber)),

    /**
     * 21.3.2.3 Math.acosh ( x )
     * 
     * This function returns the inverse hyperbolic cosine of x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is either NaN or +∞𝔽, return n.
     * 3. If n is 1𝔽, return +0𝔽.
     * 4. If n < 1𝔽, return NaN.
     * 5. Return an implementation-approximated Number value representing
     *    the result of the inverse hyperbolic cosine of ℝ(n).
     */
    'acosh': mathMethod(Math.acosh, fixed(ToNumber)),

    /**
     * 21.3.2.4 Math.asin ( x )
     * 
     * This function returns the inverse sine of x. The result is
     * expressed in radians and is in the inclusive interval from 𝔽(-π
     * / 2) to 𝔽(π / 2).
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is one of NaN, +0𝔽, or -0𝔽, return n.
     * 3. If n > 1𝔽 or n < -1𝔽, return NaN.
     * 4. Return an implementation-approximated Number value
     *    representing the result of the inverse sine of ℝ(n).
     */
    'asin': mathMethod(Math.asin, fixed(ToNumber)),

    /**
     * 21.3.2.5 Math.asinh ( x )
     * 
     * This function returns the inverse hyperbolic sine of x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is not finite or n is either +0𝔽 or -0𝔽, return n.
     * 3. Return an implementation-approximated Number value
     *    representing the result of the inverse hyperbolic sine of ℝ(n).
     */
    'asinh': mathMethod(Math.asinh, fixed(ToNumber)),

    /**
     * 21.3.2.6 Math.atan ( x )
     * 
     * This function returns the inverse tangent of x. The result is
     * expressed in radians and is in the inclusive interval from 𝔽(-π
     * / 2) to 𝔽(π / 2).
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is one of NaN, +0𝔽, or -0𝔽, return n.
     * 3. If n is +∞𝔽, return an implementation-approximated Number
     *    value representing π / 2.
     * 4. If n is -∞𝔽, return an implementation-approximated Number
     *    value representing -π / 2.
     * 5. Return an implementation-approximated Number value
     *    representing the result of the inverse tangent of ℝ(n).
     */
    'atan': mathMethod(Math.atan, fixed(ToNumber)),

    /**
     * 21.3.2.7 Math.atanh ( x )
     * 
     * This function returns the inverse hyperbolic tangent of x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is one of NaN, +0𝔽, or -0𝔽, return n.
     * 3. If n > 1𝔽 or n < -1𝔽, return NaN.
     * 4. If n is 1𝔽, return +∞𝔽.
     * 5. If n is -1𝔽, return -∞𝔽.
     * 6. Return an implementation-approximated Number value
     *    representing the result of the inverse hyperbolic tangent of
     *    ℝ(n).
     */
    'atanh': mathMethod(Math.atanh, fixed(ToNumber)),

    /**
     * 21.3.2.8 Math.atan2 ( y, x )
     * 
     * This function returns the inverse tangent of the quotient y / x
     * of the arguments y and x, where the signs of y and x are used
     * to determine the quadrant of the result. Note that it is
     * intentional and traditional for the two-argument inverse
     * tangent function that the argument named y be first and the
     * argument named x be second. The result is expressed in radians
     * and is in the inclusive interval from -π to +π.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let ny be ? ToNumber(y).
     * 2. Let nx be ? ToNumber(x).
     * 3. If ny is NaN or nx is NaN, return NaN.
     * 4. If ny is +∞𝔽, then
     *     a. If nx is +∞𝔽, return an implementation-approximated
     *        Number value representing π / 4.
     *     b. If nx is -∞𝔽, return an implementation-approximated
     *        Number value representing 3π / 4.
     *     c. Return an implementation-approximated Number value
     *        representing π / 2.
     * 5. If ny is -∞𝔽, then
     *     a. If nx is +∞𝔽, return an implementation-approximated
     *        Number value representing -π / 4.
     *     b. If nx is -∞𝔽, return an implementation-approximated
     *        Number value representing -3π / 4.
     *     c. Return an implementation-approximated Number value representing -π / 2.
     * 6. If ny is +0𝔽, then
     *     a. If nx > +0𝔽 or nx is +0𝔽, return +0𝔽.
     *     b. Return an implementation-approximated Number value representing π.
     * 7. If ny is -0𝔽, then
     *     a. If nx > +0𝔽 or nx is +0𝔽, return -0𝔽.
     *     b. Return an implementation-approximated Number value representing -π.
     * 8. Assert: ny is finite and is neither +0𝔽 nor -0𝔽.
     * 9. If ny > +0𝔽, then
     *     a. If nx is +∞𝔽, return +0𝔽.
     *     b. If nx is -∞𝔽, return an implementation-approximated
     *        Number value representing π.
     *     c. If nx is either +0𝔽 or -0𝔽, return an implementation-approximated
     *        Number value representing π / 2.
     * 10. If ny < -0𝔽, then
     *     a. If nx is +∞𝔽, return -0𝔽.
     *     b. If nx is -∞𝔽, return an implementation-approximated Number
     *        value representing -π.
     *     c. If nx is either +0𝔽 or -0𝔽, return an implementation-approximated
     *        Number value representing -π / 2.
     * 11. Assert: nx is finite and is neither +0𝔽 nor -0𝔽.
     * 12. Return an implementation-approximated Number value
     *     representing the result of the inverse tangent of the quotient
     *     ℝ(ny) / ℝ(nx).
     */
    'atan2': mathMethod(Math.atan2, fixed(ToNumber, ToNumber)),

    /**
     * 21.3.2.9 Math.cbrt ( x )
     * 
     * This function returns the cube root of x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is not finite or n is either +0𝔽 or -0𝔽, return n.
     * 3. Return an implementation-approximated Number value
     *    representing the result of the cube root of ℝ(n).
     */
    'cbrt': mathMethod(Math.cbrt, fixed(ToNumber)),

    /**
     * 21.3.2.10 Math.ceil ( x )
     * 
     * This function returns the smallest (closest to -∞) integral
     * Number value that is not less than x. If x is already an
     * integral Number, the result is x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is not finite or n is either +0𝔽 or -0𝔽, return n.
     * 3. If n < -0𝔽 and n > -1𝔽, return -0𝔽.
     * 4. If n is an integral Number, return n.
     * 5. Return the smallest (closest to -∞) integral Number value
     *    that is not less than n.
     * 
     * NOTE: The value of Math.ceil(x) is the same as the value of
     * -Math.floor(-x).
     */
    'ceil': mathMethod(Math.ceil, fixed(ToNumber)),

    /**
     * 21.3.2.11 Math.clz32 ( x )
     * 
     * This function performs the following steps when called:
     * 
     * 1. Let n be ? ToUint32(x).
     * 2. Let p be the number of leading zero bits in the unsigned
     *    32-bit binary representation of n.
     * 3. Return 𝔽(p).
     * 
     * NOTE: If n is either +0𝔽 or -0𝔽, this method returns 32𝔽. If
     * the most significant bit of the 32-bit binary encoding of n is
     * 1, this method returns +0𝔽.
     */
    'clz32': mathMethod(Math.clz32, fixed(ToUint32)),

    /**
     * 21.3.2.12 Math.cos ( x )
     * 
     * This function returns the cosine of x. The argument is expressed in radians.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is not finite, return NaN.
     * 3. If n is either +0𝔽 or -0𝔽, return 1𝔽.
     * 4. Return an implementation-approximated Number value
     *    representing the result of the cosine of ℝ(n).
     */
    'cos': mathMethod(Math.cos, fixed(ToNumber)),

    /**
     * 21.3.2.13 Math.cosh ( x )
     * 
     * This function returns the hyperbolic cosine of x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is NaN, return NaN.
     * 3. If n is either +∞𝔽 or -∞𝔽, return +∞𝔽.
     * 4. If n is either +0𝔽 or -0𝔽, return 1𝔽.
     * 5. Return an implementation-approximated Number value
     *    representing the result of the hyperbolic cosine of ℝ(n).
     * 
     * NOTE: The value of Math.cosh(x) is the same as the value of
     * (Math.exp(x) + Math.exp(-x)) / 2.
     */
    'cosh': mathMethod(Math.cosh, fixed(ToNumber)),

    /**
     * 21.3.2.14 Math.exp ( x )
     * 
     * This function returns the exponential function of x (e raised
     * to the power of x, where e is the base of the natural
     * logarithms).
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is either NaN or +∞𝔽, return n.
     * 3. If n is either +0𝔽 or -0𝔽, return 1𝔽.
     * 4. If n is -∞𝔽, return +0𝔽.
     * 5. Return an implementation-approximated Number value
     *    representing the result of the exponential function of ℝ(n).
     */
    'exp': mathMethod(Math.exp, fixed(ToNumber)),

    /**
     * 21.3.2.15 Math.expm1 ( x )
     * 
     * This function returns the result of subtracting 1 from the
     * exponential function of x (e raised to the power of x, where e
     * is the base of the natural logarithms). The result is computed
     * in a way that is accurate even when the value of x is close to
     * 0.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is one of NaN, +0𝔽, -0𝔽, or +∞𝔽, return n.
     * 3. If n is -∞𝔽, return -1𝔽.
     * 4. Return an implementation-approximated Number value
     *    representing the result of subtracting 1 from the exponential
     *    function of ℝ(n).
     */
    'expm1': mathMethod(Math.expm1, fixed(ToNumber)),

    /**
     * 21.3.2.16 Math.floor ( x )
     * 
     * This function returns the greatest (closest to +∞) integral
     * Number value that is not greater than x. If x is already an
     * integral Number, the result is x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is not finite or n is either +0𝔽 or -0𝔽, return n.
     * 3. If n < 1𝔽 and n > +0𝔽, return +0𝔽.
     * 4. If n is an integral Number, return n.
     * 5. Return the greatest (closest to +∞) integral Number value
     *    that is not greater than n.
     * 
     * NOTE: The value of Math.floor(x) is the same as the value of
     * -Math.ceil(-x).
     */
    'floor': mathMethod(Math.floor, fixed(ToNumber)),

    /**
     * 21.3.2.17 Math.fround ( x )
     * 
     * This function performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is NaN, return NaN.
     * 3. If n is one of +0𝔽, -0𝔽, +∞𝔽, or -∞𝔽, return n.
     * 4. Let n32 be the result of converting n to a value in IEEE
     *    754-2019 binary32 format using roundTiesToEven mode.
     * 5. Let n64 be the result of converting n32 to a value in IEEE
     *    754-2019 binary64 format.
     * 6. Return the ECMAScript Number value corresponding to n64.
     */
    'fround': mathMethod(Math.fround, fixed(ToNumber)),

    /**
     * 21.3.2.18 Math.hypot ( ...args )
     * 
     * Given zero or more arguments, this function returns the square
     * root of the sum of squares of its arguments.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let coerced be a new empty List.
     * 2. For each element arg of args, do
     *     a. Let n be ? ToNumber(arg).
     *     b. Append n to coerced.
     * 3. For each element number of coerced, do
     *     a. If number is either +∞𝔽 or -∞𝔽, return +∞𝔽.
     * 4. Let onlyZero be true.
     * 5. For each element number of coerced, do
     *     a. If number is NaN, return NaN.
     *     b. If number is neither +0𝔽 nor -0𝔽, set onlyZero to false.
     * 6. If onlyZero is true, return +0𝔽.
     * 7. Return an implementation-approximated Number value
     *    representing the square root of the sum of squares of the
     *    mathematical values of the elements of coerced.
     * 
     * The "length" property of this function is 2𝔽.
     * 
     * NOTE: Implementations should take care to avoid the loss of
     * precision from overflows and underflows that are prone to occur
     * in naive implementations when this function is called with two
     * or more arguments.
     */
    'hypot': mathMethod(Math.hypot, variadic(ToNumber)),

    /**
     * 21.3.2.19 Math.imul ( x, y )
     * 
     * This function performs the following steps when called:
     * 
     * 1. Let a be ℝ(? ToUint32(x)).
     * 2. Let b be ℝ(? ToUint32(y)).
     * 3. Let product be (a × b) modulo 232.
     * 4. If product ≥ 231, return 𝔽(product - 232); otherwise return 𝔽(product).
     */
    'imul': mathMethod(Math.imul, fixed(ToUint32, ToUint32)),

    /**
     * 21.3.2.20 Math.log ( x )
     * 
     * This function returns the natural logarithm of x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is either NaN or +∞𝔽, return n.
     * 3. If n is 1𝔽, return +0𝔽.
     * 4. If n is either +0𝔽 or -0𝔽, return -∞𝔽.
     * 5. If n < -0𝔽, return NaN.
     * 6. Return an implementation-approximated Number value
     *    representing the result of the natural logarithm of ℝ(n).
     */
    'log': mathMethod(Math.log, fixed(ToNumber)),

    /**
     * 21.3.2.21 Math.log1p ( x )
     * 
     * This function returns the natural logarithm of 1 + x. The
     * result is computed in a way that is accurate even when the
     * value of x is close to zero.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is one of NaN, +0𝔽, -0𝔽, or +∞𝔽, return n.
     * 3. If n is -1𝔽, return -∞𝔽.
     * 4. If n < -1𝔽, return NaN.
     * 5. Return an implementation-approximated Number value
     *    representing the result of the natural logarithm of 1 + ℝ(n).
     */
    'log1p': mathMethod(Math.log1p, fixed(ToNumber)),

    /**
     * 21.3.2.22 Math.log10 ( x )
     * 
     * This function returns the base 10 logarithm of x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is either NaN or +∞𝔽, return n.
     * 3. If n is 1𝔽, return +0𝔽.
     * 4. If n is either +0𝔽 or -0𝔽, return -∞𝔽.
     * 5. If n < -0𝔽, return NaN.
     * 6. Return an implementation-approximated Number value
     *    representing the result of the base 10 logarithm of ℝ(n).
     */
    'log10': mathMethod(Math.log10, fixed(ToNumber)),

    /**
     * 21.3.2.23 Math.log2 ( x )
     * 
     * This function returns the base 2 logarithm of x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is either NaN or +∞𝔽, return n.
     * 3. If n is 1𝔽, return +0𝔽.
     * 4. If n is either +0𝔽 or -0𝔽, return -∞𝔽.
     * 5. If n < -0𝔽, return NaN.
     * 6. Return an implementation-approximated Number value
     *    representing the result of the base 2 logarithm of ℝ(n).
     */
    'log2': mathMethod(Math.log2, fixed(ToNumber)),

    /**
     * 21.3.2.24 Math.max ( ...args )
     * 
     * Given zero or more arguments, this function calls ToNumber on
     * each of the arguments and returns the largest of the resulting
     * values.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let coerced be a new empty List.
     * 2. For each element arg of args, do
     *     a. Let n be ? ToNumber(arg).
     *     b. Append n to coerced.
     * 3. Let highest be -∞𝔽.
     * 4. For each element number of coerced, do
     *     a. If number is NaN, return NaN.
     *     b. If number is +0𝔽 and highest is -0𝔽, set highest to +0𝔽.
     *     c. If number > highest, set highest to number.
     * 5. Return highest.
     * 
     * NOTE: The comparison of values to determine the largest value
     * is done using the IsLessThan algorithm except that +0𝔽 is
     * considered to be larger than -0𝔽.
     * 
     * The "length" property of this function is 2𝔽.
     */
    'max': mathMethod(Math.max, variadic(ToNumber)),

    /**
     * 21.3.2.25 Math.min ( ...args )
     * 
     * Given zero or more arguments, this function calls ToNumber on
     * each of the arguments and returns the smallest of the resulting
     * values.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let coerced be a new empty List.
     * 2. For each element arg of args, do
     *     a. Let n be ? ToNumber(arg).
     *     b. Append n to coerced.
     * 3. Let lowest be +∞𝔽.
     * 4. For each element number of coerced, do
     *     a. If number is NaN, return NaN.
     *     b. If number is -0𝔽 and lowest is +0𝔽, set lowest to -0𝔽.
     *     c. If number < lowest, set lowest to number.
     * 5. Return lowest.
     * 
     * NOTE: The comparison of values to determine the largest value
     * is done using the IsLessThan algorithm except that +0𝔽 is
     * considered to be larger than -0𝔽.
     * 
     * The "length" property of this function is 2𝔽.
     */
    'min': mathMethod(Math.min, variadic(ToNumber)),

    /**
     * 21.3.2.26 Math.pow ( base, exponent )
     * 
     * This function performs the following steps when called:
     * 
     * 1. Set base to ? ToNumber(base).
     * 2. Set exponent to ? ToNumber(exponent).
     * 3. Return Number::exponentiate(base, exponent).
     */
    'pow': mathMethod(Math.pow, fixed(ToNumber, ToNumber)),

    /**
     * 21.3.2.27 Math.random ( )
     * 
     * This function returns a Number value with positive sign,
     * greater than or equal to +0𝔽 but strictly less than 1𝔽, chosen
     * randomly or pseudo randomly with approximately uniform
     * distribution over that range, using an implementation-defined
     * algorithm or strategy.
     * 
     * Each Math.random function created for distinct realms must
     * produce a distinct sequence of values from successive calls.
     *
     * ---
     *
     * NOTE: This indirects via an abstractOperation on the VM object
     * so that we can more easily substitute the exact operation, e.g.
     * to provide a fixed seed or use an alternative PRNG.
     */
    'random': method(($: VM) => {
      return $.abstractOperations.MathRandom?.($) ?? just(Math.random());
    }),

    /**
     * 21.3.2.28 Math.round ( x )
     * 
     * This function returns the Number value that is closest to x and
     * is integral. If two integral Numbers are equally close to x,
     * then the result is the Number value that is closer to +∞. If x
     * is already integral, the result is x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is not finite or n is an integral Number, return n.
     * 3. If n < 0.5𝔽 and n > +0𝔽, return +0𝔽.
     * 4. If n < -0𝔽 and n ≥ -0.5𝔽, return -0𝔽.
     * 5. Return the integral Number closest to n, preferring the
     *    Number closer to +∞ in the case of a tie.
     * 
     * NOTE 1: Math.round(3.5) returns 4, but Math.round(-3.5) returns -3.
     * 
     * NOTE 2: The value of Math.round(x) is not always the same as the
     * value of Math.floor(x + 0.5). When x is -0𝔽 or x is less than +0𝔽
     * but greater than or equal to -0.5𝔽, Math.round(x) returns -0𝔽, but
     * Math.floor(x + 0.5) returns +0𝔽. Math.round(x) may also differ from
     * the value of Math.floor(x + 0.5)because of internal rounding when
     * computing x + 0.5.
     */
    'round': mathMethod(Math.round, fixed(ToNumber)),

    /**
     * 21.3.2.29 Math.sign ( x )
     * 
     * This function returns the sign of x, indicating whether x is
     * positive, negative, or zero.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is one of NaN, +0𝔽, or -0𝔽, return n.
     * 3. If n < -0𝔽, return -1𝔽.
     * 4. Return 1𝔽.
     */
    'sign': mathMethod(Math.sign, fixed(ToNumber)),

    /**
     * 21.3.2.30 Math.sin ( x )
     * 
     * This function returns the sine of x. The argument is expressed in radians.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is one of NaN, +0𝔽, or -0𝔽, return n.
     * 3. If n is either +∞𝔽 or -∞𝔽, return NaN.
     * 4. Return an implementation-approximated Number value
     *    representing the result of the sine of ℝ(n).
     */
    'sin': mathMethod(Math.sin, fixed(ToNumber)),

    /**
     * 21.3.2.31 Math.sinh ( x )
     * 
     * This function returns the hyperbolic sine of x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is not finite or n is either +0𝔽 or -0𝔽, return n.
     * 3. Return an implementation-approximated Number value
     *    representing the result of the hyperbolic sine of ℝ(n).
     * 
     * NOTE: The value of Math.sinh(x) is the same as the value of
     * (Math.exp(x) - Math.exp(-x)) / 2.
     */
    'sinh': mathMethod(Math.sinh, fixed(ToNumber)),

    /**
     * 21.3.2.32 Math.sqrt ( x )
     * 
     * This function returns the square root of x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is one of NaN, +0𝔽, -0𝔽, or +∞𝔽, return n.
     * 3. If n < -0𝔽, return NaN.
     * 4. Return an implementation-approximated Number value
     *    representing the result of the square root of ℝ(n).
     */
    'sqrt': mathMethod(Math.sqrt, fixed(ToNumber)),

    /**
     * 21.3.2.33 Math.tan ( x )
     * 
     * This function returns the tangent of x. The argument is expressed in radians.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is one of NaN, +0𝔽, or -0𝔽, return n.
     * 3. If n is either +∞𝔽 or -∞𝔽, return NaN.
     * 4. Return an implementation-approximated Number value
     *    representing the result of the tangent of ℝ(n).
     */
    'tan': mathMethod(Math.tan, fixed(ToNumber)),

    /**
     * 21.3.2.34 Math.tanh ( x )
     * 
     * This function returns the hyperbolic tangent of x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is one of NaN, +0𝔽, or -0𝔽, return n.
     * 3. If n is +∞𝔽, return 1𝔽.
     * 4. If n is -∞𝔽, return -1𝔽.
     * 5. Return an implementation-approximated Number value
     *    representing the result of the hyperbolic tangent of ℝ(n).
     * 
     * NOTE: The value of Math.tanh(x) is the same as the value of
     * (Math.exp(x) - Math.exp(-x)) / (Math.exp(x) + Math.exp(-x)).
     */
    'tanh': mathMethod(Math.tanh, fixed(ToNumber)),

    /**
     * 21.3.2.35 Math.trunc ( x )
     * 
     * This function returns the integral part of the number x,
     * removing any fractional digits. If x is already integral, the
     * result is x.
     * 
     * It performs the following steps when called:
     * 
     * 1. Let n be ? ToNumber(x).
     * 2. If n is not finite or n is either +0𝔽 or -0𝔽, return n.
     * 3. If n < 1𝔽 and n > +0𝔽, return +0𝔽.
     * 4. If n < -0𝔽 and n > -1𝔽, return -0𝔽.
     * 5. Return the integral Number nearest n in the direction of +0𝔽.
     */
    'trunc': mathMethod(Math.trunc, fixed(ToNumber)),
  });
}

type ArgsTransformer<A extends unknown[]> = ($: VM, args: Val[]) => ECR<A>;
type Transformed<A extends ArgTransformer<unknown>[]> =
    {[K in keyof A]: A[K] extends ArgTransformer<infer T> ? T : never};
type ArgTransformer<A> = ($: VM, arg: Val) => ECR<A>;

function mathMethod<A extends unknown[], R extends Val>(
  fn: (...args: A) => R,
  argsTransformer: ArgsTransformer<A>,
): (realm: RealmRecord) => PropertyDescriptor {
  return realm => propWC(CreateBuiltinFunction(
    {* Call($, _, args): ECR<Val> {
      const transformed = yield* argsTransformer($, args);
      if (transformed instanceof Abrupt) return transformed;
      try {
        return fn(...transformed);
      } catch (err) {
        return $.throw(err.name, err.message);
      }
    }},
    fn.length, fn.name, {Realm: realm}));
}

function fixed<A extends ArgTransformer<unknown>[]>(
  ...fns: A
): ($: VM, args: Val[]) => ECR<Transformed<A>> {
  return function* ($, args) {
    const results = [];
    for (let i = 0; i < fns.length; i++) {
      const result = yield* fns[i]($, args[i]);
      if (IsAbrupt(result)) return result;
      results.push(result);
    }
    return results as Transformed<A>;
  };
}

function variadic<A>(fn: ArgTransformer<A>): ($: VM, args: Val[]) => ECR<A[]> {
  return function* ($, args) {
    const results: A[] = [];
    for (const arg of args) {
      const result = yield* fn($, arg);
      if (result instanceof Abrupt) return result;
      results.push(result);
    }
    return results;
  };
}
