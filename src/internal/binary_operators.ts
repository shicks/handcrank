import { BinaryExpression, Expression } from 'estree';
import { DebugString, ECR, EvalGen, VM } from './vm';
import { CR, IsAbrupt } from './completion_record';
import { Val } from './val';
import { ToBoolean, ToNumeric, ToPrimitive, ToPropertyKey, ToString } from './abstract_conversion';
import { IsCallable, IsLessThan, IsLooselyEqual, IsStrictlyEqual } from './abstract_compare';
import { Obj } from './obj';
import { EMPTY } from './enums';
import { Call, GetMethod, HasProperty, OrdinaryHasInstance } from './abstract_object';

declare const ResolvePrivateIdentifier: any;
declare const PrivateElementFind: any;

export function Evaluate_BinaryExpression($: VM, n: BinaryExpression): EvalGen<CR<Val>> {
  if (STRNUM_OPS.has(n.operator)) {
    return EvaluateStringOrNumericBinaryExpression($, n.left, n.operator, n.right);
  } else if (REL_OPS.has(n.operator)) {
    return Evaluation_ComparisonExpression($, n.left, n.operator, n.right);
  } else if (SHORT_CIRCUIT_OPS.has(n.operator)) {
    return Evaluation_ShortCircuitExpression($, n.left, n.operator, n.right);
  } else {
    throw new Error(`Unknown binary operator ${n.operator}`);
  }
}

export const STRNUM_OPS = new Set([
  '+', '-', '*', '**', '/', '%', '<<', '>>', '>>>', '&', '^', '|',
]);
export const REL_OPS = new Set([
  '===', '==', '!==', '!=', '<', '>', '<=', '>=', 'in', 'instanceof',
]);
export const SHORT_CIRCUIT_OPS = new Set([
  '&&', '||', '??',
]);

/**
 * 13.10 Relational Operators
 * 13.11 Equality Operators
 */
export function* Evaluation_ComparisonExpression(
  $: VM,
  left: Expression|{type: 'PrivateIdentifier', name: string},
  opText: string,
  right: Expression,
): EvalGen<CR<boolean>> {
  if (left.type === 'PrivateIdentifier' && opText === 'in') {
    // RelationalExpression : PrivateIdentifier in ShiftExpression
    // 1. Let privateIdentifier be the StringValue of PrivateIdentifier.
    // 2. Let rref be ? Evaluation of ShiftExpression.
    // 3. Let rval be ? GetValue(rref).
    // 4. If rval is not an Object, throw a TypeError exception.
    // 5. Let privateEnv be the running execution context's PrivateEnvironment.
    // 6. Let privateName be ResolvePrivateIdentifier(privateEnv, privateIdentifier).
    // 7. If PrivateElementFind(rval, privateName) is not empty, return true.
    // 8. Return false.
    const privateIdentifier = left.name;
    const rval = yield* $.evaluateValue(right);
    if (IsAbrupt(rval)) return rval;
    if (!(rval instanceof Obj)) {
      return $.throw('TypeError', `Cannot use 'in' operator to search for '#${
                   privateIdentifier}' in ${DebugString(rval)}`);
    }
    const privateEnv = $.getRunningContext().PrivateEnvironment;
    const privateName = ResolvePrivateIdentifier($, privateEnv, privateIdentifier);
    return PrivateElementFind(rval, privateName) !== EMPTY;
  }

  const lval = yield* $.evaluateValue(left);
  if (IsAbrupt(lval)) return lval;
  const rval = yield* $.evaluateValue(right);
  if (IsAbrupt(rval)) return rval;

  switch (opText) {
    case '===': return IsStrictlyEqual(lval, rval);
    case '!==': return fmap(IsStrictlyEqual(lval, rval), x => !x);
    case '==': return IsLooselyEqual($, lval, rval);
    case '!=': return fmap(IsLooselyEqual($, lval, rval), x => !x);
    case '<': return fmap(IsLessThan($, lval, rval, true), x => x ?? false);
    case '>': return fmap(IsLessThan($, rval, lval, false), x => x ?? false);
    case '<=': return fmap(IsLessThan($, rval, lval, false), x => !x ?? false);
    case '>=': return fmap(IsLessThan($, lval, rval, true), x => !x ?? false);
    case 'in': {
      if (!(rval instanceof Obj)) {
        return $.throw('TypeError', `Cannot use 'in' operator to search for '${
                     DebugString(lval)}' in ${DebugString(rval)}`);
      }
      const propertyKey = yield* ToPropertyKey($, lval);
      if (IsAbrupt(propertyKey)) return propertyKey;
      return HasProperty($, rval, propertyKey);
    }
    case 'instanceof': return yield* InstanceofOperator($, lval, rval);
  }
  throw new Error(`Unexpected comparison operator ${opText}`);
}
function fmap<T, U>(v: CR<T>, f: (arg: T) => CR<U>): CR<U> {
  return IsAbrupt(v) ? v : f(v);
}

/**
 * 13.10.2 InstanceofOperator ( V, target )
 * 
 * The abstract operation InstanceofOperator takes arguments V
 * (an ECMAScript language value) and target (an ECMAScript
 * language value) and returns either a normal completion
 * containing a Boolean or a throw completion. It implements the
 * generic algorithm for determining if V is an instance of
 * target either by consulting target\'s @@hasInstance method
 * or, if absent, determining whether the value of target\'s
 * "prototype" property is present in V\'s prototype chain. It
 * performs the following steps when called:
 * 
 * 1. If target is not an Object, throw a TypeError exception.
 * 2. Let instOfHandler be ? GetMethod(target, @@hasInstance).
 * 3. If instOfHandler is not undefined, then
 *     a. Return ToBoolean(? Call(instOfHandler, target, « V »)).
 * 4. If IsCallable(target) is false, throw a TypeError exception.
 * 5. Return ? OrdinaryHasInstance(target, V).
 *
 * NOTE: Steps 4 and 5 provide compatibility with previous
 * editions of ECMAScript that did not use a @@hasInstance
 * method to define the instanceof operator semantics. If an
 * object does not define or inherit @@hasInstance it uses the
 * default instanceof semantics.
 */
export function* InstanceofOperator($: VM, V: Val, target: Val): EvalGen<CR<boolean>> {
  if (!(target instanceof Obj)) {
    return $.throw('TypeError', `Right-hand side of 'instanceof' is not an object`);
  }
  const instOfHandler = yield* GetMethod($, target, Symbol.hasInstance);
  if (IsAbrupt(instOfHandler)) return instOfHandler;
  if (instOfHandler != null) {
    return fmap(yield* Call($, instOfHandler, target, [V]), ToBoolean);
  }
  if (!IsCallable(target)) {
    return $.throw('TypeError', `Right-hand side of 'instanceof' is not callable`);
  }
  return yield* OrdinaryHasInstance($, target, V);
}

/** 13.13 Binary Logical Operators */
export function* Evaluation_ShortCircuitExpression(
  $: VM,
  left: Expression,
  opText: string,
  right: Expression,
): EvalGen<CR<Val>> {
  const lval = yield* $.evaluateValue(left);
  if (IsAbrupt(lval)) return lval;
  if (opText === '||' && ToBoolean(lval) === true) return lval;
  if (opText === '&&' && ToBoolean(lval) === false) return lval;
  if (opText === '??' && lval != null) return lval;
  return yield* $.evaluateValue(right);
}


/**
 * 13.15.3 ApplyStringOrNumericBinaryOperator ( lval, opText, rval )
 *
 * The abstract operation ApplyStringOrNumericBinaryOperator takes
 * arguments lval (an ECMAScript language value), opText (**, *, /, %,
 * +, -, <<, >>, >>>, &, ^, or |), and rval (an ECMAScript language
 * value) and returns either a normal completion containing either a
 * String, a BigInt, or a Number, or a throw completion. It performs
 * the following steps when called:
 * 
 * 1. If opText is +, then
 *     a. Let lprim be ? ToPrimitive(lval).
 *     b. Let rprim be ? ToPrimitive(rval).
 *     c. If lprim is a String or rprim is a String, then
 *         i. Let lstr be ? ToString(lprim).
 *         ii. Let rstr be ? ToString(rprim).
 *         iii. Return the string-concatenation of lstr and rstr.
 *     d. Set lval to lprim.
 *     e. Set rval to rprim.
 * 2. NOTE: At this point, it must be a numeric operation.
 * 3. Let lnum be ? ToNumeric(lval).
 * 4. Let rnum be ? ToNumeric(rval).
 * 5. If Type(lnum) is not Type(rnum), throw a TypeError exception.
 * 6. If lnum is a BigInt, then
 *     a. If opText is **, return ? BigInt::exponentiate(lnum, rnum).
 *     b. If opText is /, return ? BigInt::divide(lnum, rnum).
 *     c. If opText is %, return ? BigInt::remainder(lnum, rnum).
 *     d. If opText is >>>, return ? BigInt::unsignedRightShift(lnum, rnum).
 * 7. Let operation be the abstract operation associated with opText
 *    and Type(lnum)
 * 8. Return operation(lnum, rnum).
 *
 * NOTE 1: No hint is provided in the calls to ToPrimitive in steps
 * 1.a and 1.b. All standard objects except Dates handle the absence
 * of a hint as if number were given; Dates handle the absence of a
 * hint as if string were given. Exotic objects may handle the absence
 * of a hint in some other manner.
 * 
 * 
 * NOTE 2: Step 1.c differs from step 3 of the IsLessThan algorithm,
 * by using the logical-or operation instead of the logical-and
 * operation.
 */
export function* ApplyStringOrNumericBinaryOperator(
  $: VM,
  lval: Val,
  opText: string,
  rval: Val,
): ECR<Val> {
  if (opText === '+') {
    const lprim = yield* ToPrimitive($, lval);
    if (IsAbrupt(lprim)) return lprim;
    const rprim = yield* ToPrimitive($, rval);
    if (IsAbrupt(rprim)) return rprim;
    if (typeof lprim === 'string' || typeof rprim === 'string') {
      const lstr = yield* ToString($, lprim);
      if (IsAbrupt(lstr)) return lstr;
      const rstr = yield* ToString($, rprim);
      if (IsAbrupt(rstr)) return rstr;
      return lstr + rstr;
    }
    lval = lprim;
    rval = rprim;
  }
  // NOTE: We use `as any` here because TS can't guarantee that the
  // types are the same, but we check it below.
  const lnum = yield* ToNumeric($, lval) as any;
  if (IsAbrupt(lnum)) return lnum;
  const rnum = yield* ToNumeric($, rval) as any;
  if (IsAbrupt(rnum)) return rnum;
  // NOTE: `typeof` is equivalent to `Type` at this point
  if (typeof lnum !== typeof rnum) {
    return $.throw('TypeError', 'Cannot mix BigInt and other types, use explicit conversions');
  }
  switch (opText) {
    case '+': return lnum + rnum;
    case '-': return lnum - rnum;
    case '*': return lnum * rnum;
    case '**': return lnum ** rnum;
    case '/': return lnum / rnum;
    case '%': return lnum % rnum;
    case '<<': return lnum << rnum;
    case '>>': return lnum >> rnum;
    case '>>>': return lnum >>> rnum;
    case '&': return lnum & rnum;
    case '^': return lnum ^ rnum;
    case '|': return lnum | rnum;
  }
  throw new Error(`Unexpected operator ${opText}`);
}

/**
 * 13.15.4 EvaluateStringOrNumericBinaryExpression ( leftOperand,
 *         opText, rightOperand )
 *
 * The abstract operation EvaluateStringOrNumericBinaryExpression
 * takes arguments leftOperand (a Parse Node), opText (a sequence of
 * Unicode code points), and rightOperand (a Parse Node) and returns
 * either a normal completion containing either a String, a BigInt, or
 * a Number, or an abrupt completion. It performs the following steps
 * when called:
 *
 * 1. Let lref be ? Evaluation of leftOperand.
 * 2. Let lval be ? GetValue(lref).
 * 3. Let rref be ? Evaluation of rightOperand.
 * 4. Let rval be ? GetValue(rref).
 * 5. Return ? ApplyStringOrNumericBinaryOperator(lval, opText, rval).
 */
export function* EvaluateStringOrNumericBinaryExpression(
  $: VM,
  leftOperand: Expression,
  opText: string,
  rightOperand: Expression,
): EvalGen<CR<Val>> {
  const lval = yield* $.evaluateValue(leftOperand);
  if (IsAbrupt(lval)) return lval;
  const rval = yield* $.evaluateValue(rightOperand);
  if (IsAbrupt(rval)) return rval;
  return yield* ApplyStringOrNumericBinaryOperator($, lval, opText, rval);
}
