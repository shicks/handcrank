import { IsCallable, IsLessThan, IsLooselyEqual, IsStrictlyEqual } from './abstract_compare';
import { ToBoolean, ToNumber, ToNumeric, ToObject, ToPrimitive, ToPropertyKey, ToString } from './abstract_conversion';
import { Call, GetMethod, HasProperty, OrdinaryHasInstance } from './abstract_object';
import { Assert } from './assert';
import { CR, IsAbrupt, NotGen } from './completion_record';
import { EMPTY } from './enums';
import { EnvironmentRecord } from './environment_record';
import { IsFunc } from './func';
import { Obj } from './obj';
import { prop0 } from './property_descriptor';
import { defineProperties } from './realm_record';
import { GetValue, IsPrivateReference, IsPropertyReference, IsUnresolvableReference, PutValue, ReferenceRecord } from './reference_record';
import { PropertyKey, Val } from './val';
import { DebugString, ECR, EvalGen, Plugin, VM, when } from './vm';
import { BinaryExpression, Expression, UnaryExpression, UpdateExpression } from 'estree';

declare const ResolvePrivateIdentifier: any;
declare const PrivateElementFind: any;

export const arithmetic: Plugin = {
  id: 'arithmetic',

  syntax: {
    Evaluation(on) {
      on('UnaryExpression',
         when(n => UNARY_OPS.has(n.operator),
              Evaluate_UnaryExpression));
      on('UpdateExpression',
         when(n => n.operator === '++' || n.operator === '--',
              Evaluate_UpdateExpression));
      on('BinaryExpression', Evaluate_BinaryExpression);
    },
  },

  realm: {
    SetDefaultGlobalBindings(realm) {
      defineProperties(realm, realm.GlobalObject!, {
        'Infinity': prop0(Infinity),
      });
    },
  },
};

/**
 * 13.4 Update Expressions
 * 
 * UpdateExpression : LeftHandSideExpression ++
 * 1. Let lhs be ? Evaluation of LeftHandSideExpression.
 * 2. Let oldValue be ? ToNumeric(? GetValue(lhs)).
 * 3. If oldValue is a Number, then
 *     a. Let newValue be Number::add(oldValue, 1𝔽).
 * 4. Else,
 *     a. Assert: oldValue is a BigInt.
 *     b. Let newValue be BigInt::add(oldValue, 1ℤ).
 * 5. Perform ? PutValue(lhs, newValue).
 * 6. Return oldValue.
 * 
 * UpdateExpression : LeftHandSideExpression --
 * 1. Let lhs be ? Evaluation of LeftHandSideExpression.
 * 2. Let oldValue be ? ToNumeric(? GetValue(lhs)).
 * 3. If oldValue is a Number, then
 *     a. Let newValue be Number::subtract(oldValue, 1𝔽).
 * 4. Else,
 *     a. Assert: oldValue is a BigInt.
 *     b. Let newValue be BigInt::subtract(oldValue, 1ℤ).
 * 5. Perform ? PutValue(lhs, newValue).
 * 6. Return oldValue.
 * 
 * UpdateExpression : ++ UnaryExpression
 * 1. Let expr be ? Evaluation of UnaryExpression.
 * 2. Let oldValue be ? ToNumeric(? GetValue(expr)).
 * 3. If oldValue is a Number, then
 *     a. Let newValue be Number::add(oldValue, 1𝔽).
 * 4. Else,
 *     a. Assert: oldValue is a BigInt.
 *     b. Let newValue be BigInt::add(oldValue, 1ℤ).
 * 5. Perform ? PutValue(expr, newValue).
 * 6. Return newValue.
 * 
 * UpdateExpression : -- UnaryExpression
 * 1. Let expr be ? Evaluation of UnaryExpression.
 * 2. Let oldValue be ? ToNumeric(? GetValue(expr)).
 * 3. If oldValue is a Number, then
 *     a. Let newValue be Number::subtract(oldValue, 1𝔽).
 * 4. Else,
 *     a. Assert: oldValue is a BigInt.
 *     b. Let newValue be BigInt::subtract(oldValue, 1ℤ).
 * 5. Perform ? PutValue(expr, newValue).
 * 6. Return newValue.
 */
export function* Evaluate_UpdateExpression($: VM, n: UpdateExpression): ECR<Val> {
  const ref = yield* $.Evaluation(n.argument);
  if (IsAbrupt(ref)) return ref;
  Assert(!EMPTY.is(ref));
  const expr = yield* GetValue($, ref);
  if (IsAbrupt(expr)) return expr;
  const oldValue = yield* ToNumeric($, expr);
  if (IsAbrupt(oldValue)) return oldValue;
  let newValue = oldValue;
  if (n.operator === '++') newValue++;
  if (n.operator === '--') newValue--;
  const result = yield* PutValue($, ref, newValue);
  if (IsAbrupt(result)) return result;
  return n.prefix ? newValue : oldValue;
}

export function Evaluate_UnaryExpression($: VM, n: UnaryExpression): ECR<Val> {
  switch (n.operator) {
    case 'typeof': return EvaluateUnaryTypeof($, n.argument);
    case 'void': return EvaluateUnaryVoid($, n.argument);
    case 'delete': return EvaluateUnaryDelete($, n.argument);
    case '!': return EvaluateUnaryNot($, n.argument);
    case '~': return EvaluateUnaryBitwiseNot($, n.argument);
    case '-': return EvaluateUnaryMinus($, n.argument);
    case '+': return EvaluateUnaryPlus($, n.argument);
  }
}

export function Evaluate_BinaryExpression($: VM, n: BinaryExpression): ECR<Val> {
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

export const UNARY_OPS = new Set(['!', '~', '-', '+', 'typeof', 'void', 'delete']);

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
 * 13.5.1 The delete Operator
 * 
 * UnaryExpression : delete UnaryExpression
 * 1. Let ref be ? Evaluation of UnaryExpression.
 * 2. If ref is not a Reference Record, return true.
 * 3. If IsUnresolvableReference(ref) is true, then
 *     a. Assert: ref.[[Strict]] is false.
 *     b. Return true.
 * 4. If IsPropertyReference(ref) is true, then
 *     a. Assert: IsPrivateReference(ref) is false.
 *     b. If IsSuperReference(ref) is true, throw a ReferenceError exception.
 *     c. Let baseObj be ? ToObject(ref.[[Base]]).
 *     d. Let deleteStatus be ? baseObj.[[Delete]](ref.[[ReferencedName]]).
 *     e. If deleteStatus is false and ref.[[Strict]] is true, throw a TypeError exception.
 *     f. Return deleteStatus.
 * 5. Else,
 *     a. Let base be ref.[[Base]].
 *     b. Assert: base is an Environment Record.
 *     c. Return ? base.DeleteBinding(ref.[[ReferencedName]]).
 * 
 * NOTE 1: When a delete operator occurs within strict mode code, a
 * SyntaxError exception is thrown if its UnaryExpression is a direct
 * reference to a variable, function argument, or function name. In
 * addition, if a delete operator occurs within strict mode code and
 * the property to be deleted has the attribute { [[Configurable]]:
 * false } (or otherwise cannot be deleted), a TypeError exception is
 * thrown.
 * 
 * NOTE 2: The object that may be created in step 4.c is not
 * accessible outside of the above abstract operation and the ordinary
 * object [[Delete]] internal method. An implementation might choose
 * to avoid the actual creation of that object.
 */
export function* EvaluateUnaryDelete($: VM, n: Expression): ECR<boolean> {
  const ref = yield* $.Evaluation(n);
  if (IsAbrupt(ref)) return ref;
  if (!(ref instanceof ReferenceRecord)) return true;
  if (IsUnresolvableReference(ref)) {
    Assert(!ref.Strict);
    return true;
  }
  if (IsPropertyReference(ref)) {
    Assert(!IsPrivateReference(ref));
    const baseObj = ToObject($, ref.Base);
    if (IsAbrupt(baseObj)) return baseObj;
    const deleteStatus = baseObj.Delete($, ref.ReferencedName as PropertyKey);
    if (deleteStatus === false && ref.Strict) {
      return $.throw('TypeError', `Cannot delete property '${String(ref.ReferencedName)}'`);
    }
    return deleteStatus;
  }
  const base = ref.Base;
  Assert(base instanceof EnvironmentRecord);
  Assert(typeof ref.ReferencedName === 'string');
  return base.DeleteBinding($, ref.ReferencedName);
}

/**
 * 13.5.2 The void Operator
 * 
 * UnaryExpression : void UnaryExpression
 * 1. Let expr be ? Evaluation of UnaryExpression.
 * 2. Perform ? GetValue(expr).
 * 3. Return undefined.
 * 
 * NOTE: GetValue must be called even though its value is not used
 * because it may have observable side-effects.
 */
export function* EvaluateUnaryVoid($: VM, n: Expression): ECR<undefined> {
  const value = yield* $.evaluateValue(n);
  if (IsAbrupt(value)) return value;
  return undefined;
}

/**
 * 13.5.3 The typeof Operator
 * 
 * UnaryExpression : typeof UnaryExpression
 * 1. Let val be ? Evaluation of UnaryExpression.
 * 2. If val is a Reference Record, then
 *     a. If IsUnresolvableReference(val) is true, return "undefined".
 * 3. Set val to ? GetValue(val).
 * 4. If val is undefined, return "undefined".
 * 5. If val is null, return "object".
 * 6. If val is a String, return "string".
 * 7. If val is a Symbol, return "symbol".
 * 8. If val is a Boolean, return "boolean".
 * 9. If val is a Number, return "number".
 * 10. If val is a BigInt, return "bigint".
 * 11. Assert: val is an Object.
 * 12. NOTE: This step is replaced in section B.3.6.3.
 * 13. If val has a [[Call]] internal slot, return "function".
 * 14. Return "object".
 */
export function* EvaluateUnaryTypeof($: VM, n: Expression): ECR<string> {
  const val = yield* $.Evaluation(n);
  if (IsAbrupt(val)) return val;
  if (val instanceof ReferenceRecord) {
    if (IsUnresolvableReference(val)) return 'undefined';
  }
  const value = yield* $.evaluateValue(n);
  if (IsAbrupt(value)) return value;
  if (value === undefined) return 'undefined';
  if (value === null) return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'symbol') return 'symbol';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'bigint') return 'bigint';
  Assert(value instanceof Obj);
  if (IsFunc(value)) return 'function';
  return 'object';
}

/**
 * 13.5.4 Unary + Operator
 * 
 * NOTE: The unary + operator converts its operand to Number type.
 * 
 * UnaryExpression : + UnaryExpression
 * 1. Let expr be ? Evaluation of UnaryExpression.
 * 2. Return ? ToNumber(? GetValue(expr)).
 */
export function* EvaluateUnaryPlus($: VM, n: Expression): ECR<number> {
  const value = yield* $.evaluateValue(n);
  if (IsAbrupt(value)) return value;
  return yield* ToNumber($, value);
}

/**
 * 13.5.5 Unary - Operator
 * 
 * NOTE: The unary - operator converts its operand to a numeric value
 * and then negates it. Negating +0𝔽 produces -0𝔽, and negating -0𝔽
 * produces +0𝔽.
 * 
 * UnaryExpression : - UnaryExpression
 * 1. Let expr be ? Evaluation of UnaryExpression.
 * 2. Let oldValue be ? ToNumeric(? GetValue(expr)).
 * 3. If oldValue is a Number, then
 *     a. Return Number::unaryMinus(oldValue).
 * 4. Else,
 *     a. Assert: oldValue is a BigInt.
 *     b. Return BigInt::unaryMinus(oldValue).
 */
export function* EvaluateUnaryMinus($: VM, n: Expression): ECR<bigint|number> {
  const value = yield* $.evaluateValue(n);
  if (IsAbrupt(value)) return value;
  const oldValue = yield* ToNumeric($, value);
  if (IsAbrupt(oldValue)) return oldValue;
  return -oldValue;
}

/**
 * 13.5.6 Bitwise NOT Operator ( ~ )
 * 
 * UnaryExpression : ~ UnaryExpression
 * 1. Let expr be ? Evaluation of UnaryExpression.
 * 2. Let oldValue be ? ToNumeric(? GetValue(expr)).
 * 3. If oldValue is a Number, then
 *     a. Return Number::bitwiseNOT(oldValue).
 * 4. Else,
 *     a. Assert: oldValue is a BigInt.
 *     b. Return BigInt::bitwiseNOT(oldValue).
 */
export function* EvaluateUnaryBitwiseNot($: VM, n: Expression): ECR<bigint|number> {
  const value = yield* $.evaluateValue(n);
  if (IsAbrupt(value)) return value;
  const oldValue = yield* ToNumeric($, value);
  if (IsAbrupt(oldValue)) return oldValue;
  return ~oldValue;
}

/**
 * 13.5.7 Logical NOT Operator ( ! )
 * 
 * UnaryExpression : ! UnaryExpression
 * 1. Let expr be ? Evaluation of UnaryExpression.
 * 2. Let oldValue be ToBoolean(? GetValue(expr)).
 * 3. If oldValue is true, return false.
 * 4. Return true.
 */
export function* EvaluateUnaryNot($: VM, n: Expression): ECR<boolean> {
  const value = yield* $.evaluateValue(n);
  if (IsAbrupt(value)) return value;
  return !ToBoolean(value);
}

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
    case '==': return yield* IsLooselyEqual($, lval, rval);
    case '!=': return fmap(yield* IsLooselyEqual($, lval, rval), x => !x);
    case '<': return fmap(yield* IsLessThan($, lval, rval, true), x => x ?? false);
    case '>': return fmap(yield* IsLessThan($, rval, lval, false), x => x ?? false);
    case '<=': return fmap(yield* IsLessThan($, rval, lval, false), x => !x ?? false);
    case '>=': return fmap(yield* IsLessThan($, lval, rval, true), x => !x ?? false);
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
function fmap<T, U>(v: CR<T>, f: (arg: T) => CR<U>, ...rest: NotGen<T>): CR<U> {
  return IsAbrupt(v, ...rest) ? v : f(v as any) as any;
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
