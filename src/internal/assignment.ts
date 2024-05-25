// 13.15 Assignment Operators
//
// Syntax
// AssignmentExpression[In, Yield, Await] :
//   ConditionalExpression[?In, ?Yield, ?Await]
//   [+Yield] YieldExpression[?In, ?Await]
//   ArrowFunction[?In, ?Yield, ?Await]
//   AsyncArrowFunction[?In, ?Yield, ?Await]
//   LeftHandSideExpression[?Yield, ?Await] =
//       AssignmentExpression[?In, ?Yield, ?Await]
//   LeftHandSideExpression[?Yield, ?Await] AssignmentOperator
//       AssignmentExpression[?In, ?Yield, ?Await]
//   LeftHandSideExpression[?Yield, ?Await] &&=
//       AssignmentExpression[?In, ?Yield, ?Await]
//   LeftHandSideExpression[?Yield, ?Await] ||=
//       AssignmentExpression[?In, ?Yield, ?Await]
//   LeftHandSideExpression[?Yield, ?Await] ??=
//       AssignmentExpression[?In, ?Yield, ?Await]
// AssignmentOperator :
//    one of
//      *= /= %= += -= <<= >>= >>>= &= ^= |= **=

import { AssignmentExpression } from "estree";
import { CR, IsAbrupt } from "./completion_record";
import { IsAnonymousFunctionDefinition, NamedEvaluation } from "./static/functions";
import { EvalGen, VM } from "./vm";
import { Val } from "./val";
import { GetValue, PutValue } from "./reference_record";
import { EMPTY } from "./enums";
import { Assert } from "./assert";
import { ToBoolean } from "./abstract_conversion";
import { ApplyStringOrNumericBinaryOperator, SHORT_CIRCUIT_OPS, STRNUM_OPS } from "./binary_operators";

/**
 * 13.15.2 Runtime Semantics: Evaluation
 *
 * AssignmentExpression : LeftHandSideExpression = AssignmentExpression
 * 1. If LeftHandSideExpression is neither an ObjectLiteral nor an
 *    ArrayLiteral, then
 *     a. Let lref be ? Evaluation of LeftHandSideExpression.
 *     b. If IsAnonymousFunctionDefinition(AssignmentExpression) and
 *        IsIdentifierRef of LeftHandSideExpression are both true, then
 *         i. Let rval be ? NamedEvaluation of AssignmentExpression
 *            with argument lref.[[ReferencedName]].
 *     c. Else,
 *         i. Let rref be ? Evaluation of AssignmentExpression.
 *         ii. Let rval be ? GetValue(rref).
 *     d. Perform ? PutValue(lref, rval).
 *     e. Return rval.
 * 2. Let assignmentPattern be the AssignmentPattern that is covered
 *    by LeftHandSideExpression.
 * 3. Let rref be ? Evaluation of AssignmentExpression.
 * 4. Let rval be ? GetValue(rref).
 * 5. Perform ? DestructuringAssignmentEvaluation of assignmentPattern
 *    with argument rval.
 * 6. Return rval.
 *
 * AssignmentExpression :
 *   LeftHandSideExpression AssignmentOperator AssignmentExpression
 * 1. Let lref be ? Evaluation of LeftHandSideExpression.
 * 2. Let lval be ? GetValue(lref).
 * 3. Let rref be ? Evaluation of AssignmentExpression.
 * 4. Let rval be ? GetValue(rref).
 * 5. Let assignmentOpText be the source text matched by
 *    AssignmentOperator.
 * 6. Let opText be the sequence of Unicode code points associated
 *    with assignmentOpText in the following table:
 * 7. Let r be ? ApplyStringOrNumericBinaryOperator(lval, opText, rval).
 * 8. Perform ? PutValue(lref, r).
 * 9. Return r.
 *
 * AssignmentExpression : LeftHandSideExpression &&= AssignmentExpression
 * 1. Let lref be ? Evaluation of LeftHandSideExpression.
 * 2. Let lval be ? GetValue(lref).
 * 3. Let lbool be ToBoolean(lval).
 * 4. If lbool is false, return lval.
 * 5. If IsAnonymousFunctionDefinition(AssignmentExpression) is true
 *    and IsIdentifierRef of LeftHandSideExpression is true, then
 *     a. Let rval be ? NamedEvaluation of AssignmentExpression with
 *        argument lref.[[ReferencedName]].
 * 6. Else,
 *     a. Let rref be ? Evaluation of AssignmentExpression.
 *     b. Let rval be ? GetValue(rref).
 * 7. Perform ? PutValue(lref, rval).
 * 8. Return rval.
 *
 * AssignmentExpression : LeftHandSideExpression ||= AssignmentExpression
 * 1. Let lref be ? Evaluation of LeftHandSideExpression.
 * 2. Let lval be ? GetValue(lref).
 * 3. Let lbool be ToBoolean(lval).
 * 4. If lbool is true, return lval.
 * 5. If IsAnonymousFunctionDefinition(AssignmentExpression) is true
 *    and IsIdentifierRef of LeftHandSideExpression is true, then
 *     a. Let rval be ? NamedEvaluation of AssignmentExpression with
 *        argument lref.[[ReferencedName]].
 * 6. Else,
 *     a. Let rref be ? Evaluation of AssignmentExpression.
 *     b. Let rval be ? GetValue(rref).
 * 7. Perform ? PutValue(lref, rval).
 * 8. Return rval.
 *
 * AssignmentExpression : LeftHandSideExpression ??= AssignmentExpression
 * 1. Let lref be ? Evaluation of LeftHandSideExpression.
 * 2. Let lval be ? GetValue(lref).
 * 3. If lval is neither undefined nor null, return lval.
 * 4. If IsAnonymousFunctionDefinition(AssignmentExpression) is true
 *    and IsIdentifierRef of LeftHandSideExpression is true, then
 *     a. Let rval be ? NamedEvaluation of AssignmentExpression with
 *        argument lref.[[ReferencedName]].
 * 5. Else,
 *     a. Let rref be ? Evaluation of AssignmentExpression.
 *     b. Let rval be ? GetValue(rref).
 * 6. Perform ? PutValue(lref, rval).
 * 7. Return rval.
 *
 * NOTE: When this expression occurs within strict mode code, it is a
 * runtime error if lref in step 1.d, 2, 2, 2, 2 is an unresolvable
 * reference. If it is, a ReferenceError exception is
 * thrown. Additionally, it is a runtime error if the lref in step 8,
 * 7, 7, 6 is a reference to a data property with the attribute value
 * { [[Writable]]: false }, to an accessor property with the attribute
 * value { [[Set]]: undefined }, or to a non-existent property of an
 * object for which the IsExtensible predicate returns the value
 * false. In these cases a TypeError exception is thrown.
 */
export function* Evaluation_AssignmentExpression($: VM, n: AssignmentExpression): EvalGen<CR<Val>> {
  if (n.left.type === 'ObjectPattern' || n.left.type === 'ArrayPattern') {
    return yield* Evaluation_AssignmentExpression_pattern($, n);
  }
  const lref = yield* $.operate('Evaluation', n.left);
  if (IsAbrupt(lref)) return lref;
  Assert(!EMPTY.is(lref));
  let lval;
  if (n.operator !== '=') {
    lval = GetValue($, lref);
    if (IsAbrupt(lval)) return lval;
  }
  if (n.operator === '||=' && ToBoolean(lval) === true) return lval;
  if (n.operator === '&&=' && ToBoolean(lval) === false) return lval;
  if (n.operator === '??=' && lval != null) return lval;

  const compoundOp = n.operator.substring(0, n.operator.length - 1);
  const namedEval = !compoundOp || SHORT_CIRCUIT_OPS.has(compoundOp);
  let rval: CR<Val>;
  if (namedEval && IsAnonymousFunctionDefinition(n.right) && n.left.type === 'Identifier') {
    rval = yield* NamedEvaluation($, n.right as any, n.left.name);
  } else {
    rval = yield* $.evaluateValue(n.right);
  }
  if (IsAbrupt(rval)) return rval;
  if (STRNUM_OPS.has(compoundOp)) {
    rval = ApplyStringOrNumericBinaryOperator($, lval, compoundOp, rval);
    if (IsAbrupt(rval)) return rval;
  }
  const result = PutValue($, lref, rval);
  if (IsAbrupt(result)) return result;
  return rval;
}

function Evaluation_AssignmentExpression_pattern(_$: VM, _n: AssignmentExpression): EvalGen<CR<Val>> {
  // 2. Let assignmentPattern be the AssignmentPattern that is covered
  //    by LeftHandSideExpression.
  // 3. Let rref be ? Evaluation of AssignmentExpression.
  // 4. Let rval be ? GetValue(rref).
  // 5. Perform ? DestructuringAssignmentEvaluation of assignmentPattern
  //    with argument rval.
  // 6. Return rval.
  throw new Error('not implemented');
}
