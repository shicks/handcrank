/** @fileoverview Evaluation for control flow operators. */

import { IsStrictlyEqual } from './abstract_compare';
import { ToBoolean, ToObject } from './abstract_conversion';
import { AsyncIteratorClose, CreateIterResultObject, GetIterator, IteratorClose, IteratorComplete, IteratorRecord, IteratorValue } from './abstract_iterator';
import { Call, GetV } from './abstract_object';
import { Assert } from './assert';
import { Abrupt, CR, CastNotAbrupt, CompletionType, CompletionValue, IsAbrupt, IsThrowCompletion, UpdateEmpty } from './completion_record';
import { ASYNC, ASYNC_ITERATE, EMPTY, ENUMERATE, ITERATE, SYNC, UNUSED } from './enums';
import { DeclarativeEnvironmentRecord, ObjectEnvironmentRecord } from './environment_record';
import { IsFunc, methodO } from './func';
import { Obj, OrdinaryObjectCreate } from './obj';
import { defineProperties } from './realm_record';
import { GetValue } from './reference_record';
import { BlockDeclarationInstantiation } from './statements';
import { BoundNames, IsConstantDeclaration } from './static/scope';
import { NodeMap, NodeType } from './tree';
import { Val } from './val';
import { DebugString, ECR, Plugin, VM, just } from './vm';
import * as ESTree from 'estree';

declare function Await(...args: unknown[]): ECR<Val>;

export const controlFlow: Plugin = {
  id: 'controlFlow',
  deps: () => [labels, loops, conditionals, tryStatement, switchStatement, withStatement],
};

export const labels: Plugin = {
  id: 'labels',
  deps: () => [
    breakContinue,
    labelledEvaluationPlugin('LabeledStatement', LabelledEvaluation_LabelledStatement),
  ],
};

export const loops: Plugin = {
  id: 'loops',
  deps: () => [
    breakContinue,
    labelledEvaluationPlugin('DoWhileStatement', DoWhileLoopEvaluation),
    labelledEvaluationPlugin('WhileStatement', WhileLoopEvaluation),
    labelledEvaluationPlugin('ForStatement', ForLoopEvaluation),
    labelledEvaluationPlugin('ForInStatement', ForInOfLoopEvaluation),
    labelledEvaluationPlugin('ForOfStatement', ForInOfLoopEvaluation),
  ],
};

export const conditionals: Plugin = {
  id: 'conditionals',
  syntax: {
    Evaluation: (on) => on('IfStatement', Evaluation_IfStatement),
  },
};

export const switchStatement: Plugin = {
  id: 'switchStatement',
  syntax: {
    Evaluation: (on) => on('SwitchStatement', Evaluation_SwitchStatement),
  },
};

export const tryStatement: Plugin = {
  id: 'tryStatement',
  syntax: {
    Evaluation: (on) => on('TryStatement', Evaluation_TryStatement),
  },
};

export const breakContinue: Plugin = {
  syntax: {
    Evaluation(on) {
      on('BreakStatement', Evaluation_BreakStatement);
      on('ContinueStatement', Evaluation_ContinueStatement);
    },
  },
};

export const withStatement: Plugin = {
  id: 'withStatement',
  syntax: {
    Evaluation: (on) => on('WithStatement', Evaluation_WithStatement),
  },
};

function labelledEvaluationPlugin<N extends NodeType>(
  type: N,
  fn: ($: VM, n: NodeMap[N], labelSet: string[]) => ECR<Val|EMPTY>,
): Plugin {
  return {
    syntax: {
      Evaluation: (on) => on(type, LabelledEvaluation),
      LabelledEvaluation: (on) => on(type, fn),
    },
  };
}

function LabelledEvaluation($: VM, n: ESTree.Node, labelSet: string[] = []): ECR<Val|EMPTY> {
  return $.LabelledEvaluation(n, labelSet);
}

/**
 * 13.14.1 Runtime Semantics: Evaluation
 * 
 * ConditionalExpression : ShortCircuitExpression ? AssignmentExpression : AssignmentExpression
 * 1. Let lref be ? Evaluation of ShortCircuitExpression.
 * 2. Let lval be ToBoolean(? GetValue(lref)).
 * 3. If lval is true, then
 *     a. Let trueRef be ? Evaluation of the first AssignmentExpression.
 *     b. Return ? GetValue(trueRef).
 * 4. Else,
 *     a. Let falseRef be ? Evaluation of the second AssignmentExpression.
 *     b. Return ? GetValue(falseRef).
 */
export function* Evaluation_ConditionalExpression(
  $: VM,
  n: ESTree.ConditionalExpression,
): ECR<Val> {
  const test = yield* $.evaluateValue(n.test);
  if (IsAbrupt(test)) return test;
  if (ToBoolean(test)) {
    return yield* $.evaluateValue(n.consequent);
  } else {
    return yield* $.evaluateValue(n.alternate);
  }
}

/**
 * 13.16.1 Runtime Semantics: Evaluation
 * 
 * Expression : Expression , AssignmentExpression
 * 1. Let lref be ? Evaluation of Expression.
 * 2. Perform ? GetValue(lref).
 * 3. Let rref be ? Evaluation of AssignmentExpression.
 * 4. Return ? GetValue(rref).
 */
export function* Evaluation_SequenceExpression(
  $: VM,
  n: ESTree.SequenceExpression,
): ECR<Val> {
  let result: CR<Val> = undefined;
  for (const expr of n.expressions) {
    result = yield* $.evaluateValue(expr);
    if (IsAbrupt(result)) return result;
  }
  return result;
}

/**
 * 14.6.2 Runtime Semantics: Evaluation
 * 
 * IfStatement : if ( Expression ) Statement else Statement
 * 1. Let exprRef be ? Evaluation of Expression.
 * 2. Let exprValue be ToBoolean(? GetValue(exprRef)).
 * 3. If exprValue is true, then
 *     a. Let stmtCompletion be Completion(Evaluation of the first Statement).
 * 4. Else,
 *     a. Let stmtCompletion be Completion(Evaluation of the second Statement).
 * 5. Return ? UpdateEmpty(stmtCompletion, undefined).
 * 
 * IfStatement : if ( Expression ) Statement
 * 1. Let exprRef be ? Evaluation of Expression.
 * 2. Let exprValue be ToBoolean(? GetValue(exprRef)).
 * 3. If exprValue is false, then
 *     a. Return undefined.
 * 4. Else,
 *     a. Let stmtCompletion be Completion(Evaluation of Statement).
 *     b. Return ? UpdateEmpty(stmtCompletion, undefined).
 */
export function *Evaluation_IfStatement(
  $: VM,
  n: ESTree.IfStatement,
): ECR<Val> {
  const exprValue = yield* $.evaluateValue(n.test);
  if (IsAbrupt(exprValue)) return exprValue;
  const exprValueBool = ToBoolean(exprValue);
  if (!exprValueBool && !n.alternate) return undefined;
  const stmtCompletion = yield* $.evaluateValue(exprValueBool ? n.consequent : n.alternate!);
  return UpdateEmpty(stmtCompletion, undefined);
}

/**
 * 14.7.1.1 LoopContinues ( completion, labelSet )
 * 
 * The abstract operation LoopContinues takes arguments completion (a
 * Completion Record) and labelSet (a List of Strings) and returns a
 * Boolean. It performs the following steps when called:
 * 
 * 1. If completion.[[Type]] is normal, return true.
 * 2. If completion.[[Type]] is not continue, return false.
 * 3. If completion.[[Target]] is empty, return true.
 * 4. If labelSet contains completion.[[Target]], return true.
 * 5. Return false.
 * 
 * NOTE: Within the Statement part of an IterationStatement a
 * ContinueStatement may be used to begin a new iteration.
 */
function LoopContinues(
  completion: CR<unknown>,
  labelSet: string[],
): boolean {
  if (!IsAbrupt(completion)) return true;
  if (completion.Type !== CompletionType.Continue) return false;
  if (typeof completion.Target !== 'string') return true;
  return labelSet.includes(completion.Target);
}

/** 
 * 14.7.2 The do-while Statement
 * 
 * 14.7.2.2 Runtime Semantics: DoWhileLoopEvaluation
 * 
 * The syntax-directed operation DoWhileLoopEvaluation takes argument
 * labelSet (a List of Strings) and returns either a normal completion
 * containing an ECMAScript language value or an abrupt completion. It
 * is defined piecewise over the following productions:
 *
 * BreakableStatement : IterationStatement
 * IterationStatement : DoWhileStatement 
 * DoWhileStatement : do Statement while ( Expression ) ;
 * 1. Let V be undefined.
 * 2. Repeat,
 *     a. Let stmtResult be Completion(Evaluation of Statement).
 *     b. If LoopContinues(stmtResult, labelSet) is false, return ? UpdateEmpty(stmtResult, V).
 *     c. If stmtResult.[[Value]] is not empty, set V to stmtResult.[[Value]].
 *     d. Let exprRef be ? Evaluation of Expression.
 *     e. Let exprValue be ? GetValue(exprRef).
 *     f. If ToBoolean(exprValue) is false, return V.
 */
export function* DoWhileLoopEvaluation(
  $: VM,
  n: ESTree.DoWhileStatement,
  labelSet: string[],
): ECR<Val|EMPTY> {
  let V: Val = undefined;
  while (true) {
    yield;  // pause before repeating to avoid infinite loops
    const stmtResult = yield* $.evaluateValue(n.body);
    if (!LoopContinues(stmtResult, labelSet)) {
      return BreakableStatement(UpdateEmpty(stmtResult, V));
    }
    const cv = CompletionValue(stmtResult);
    if (!EMPTY.is(cv)) V = cv;
    const exprValue = yield* $.evaluateValue(n.test);
    if (IsAbrupt(exprValue)) return exprValue;
    if (!ToBoolean(exprValue)) return V;
  }
}

/**
 * 14.7.3 The while Statement
 *
 * 14.7.3.2 Runtime Semantics: WhileLoopEvaluation
 * 
 * The syntax-directed operation WhileLoopEvaluation takes argument
 * labelSet (a List of Strings) and returns either a normal completion
 * containing an ECMAScript language value or an abrupt completion. It
 * is defined piecewise over the following productions:
 * 
 * BreakableStatement : IterationStatement
 * IterationStatement : DoWhileStatement 
 * WhileStatement : while ( Expression ) Statement
 * 1. Let V be undefined.
 * 2. Repeat,
 *     a. Let exprRef be ? Evaluation of Expression.
 *     b. Let exprValue be ? GetValue(exprRef).
 *     c. If ToBoolean(exprValue) is false, return V.
 *     d. Let stmtResult be Completion(Evaluation of Statement).
 *     e. If LoopContinues(stmtResult, labelSet) is false, return ? UpdateEmpty(stmtResult, V).
 *     f. If stmtResult.[[Value]] is not empty, set V to stmtResult.[[Value]].
 */
export function* WhileLoopEvaluation(
  $: VM,
  n: ESTree.WhileStatement,
  labelSet: string[],
): ECR<Val|EMPTY> {
  let V: Val = undefined;
  while (true) {
    yield;  // pause before repeating to avoid infinite loops
    const exprValue = yield* $.evaluateValue(n.test);
    if (IsAbrupt(exprValue)) return exprValue;
    if (!ToBoolean(exprValue)) return V;
    const stmtResult = yield* $.evaluateValue(n.body);
    if (!LoopContinues(stmtResult, labelSet)) {
      return BreakableStatement(UpdateEmpty(stmtResult, V));
    }
    const cv = CompletionValue(stmtResult);
    if (!EMPTY.is(cv)) V = cv;
  }
}

/**
 * 14.7.4 The for Statement
 * 
 * 14.7.4.2 Runtime Semantics: ForLoopEvaluation
 * 
 * The syntax-directed operation ForLoopEvaluation takes argument
 * labelSet (a List of Strings) and returns either a normal completion
 * containing an ECMAScript language value or an abrupt completion. It
 * is defined piecewise over the following productions:
 * 
 * ForStatement : for ( Expressionopt ; Expressionopt ; Expressionopt ) Statement
 * 1. If the first Expression is present, then
 *     a. Let exprRef be ? Evaluation of the first Expression.
 *     b. Perform ? GetValue(exprRef).
 * 2. If the second Expression is present, let test be the second
 *    Expression; otherwise, let test be empty.
 * 3. If the third Expression is present, let increment be the third
 *    Expression; otherwise, let increment be empty.
 * 4. Return ? ForBodyEvaluation(test, increment, Statement, « », labelSet).
 * 
 * ForStatement : for ( var VariableDeclarationList ; Expressionopt ; Expressionopt ) Statement
 * 1. Perform ? Evaluation of VariableDeclarationList.
 * 2. If the first Expression is present, let test be the first
 *    Expression; otherwise, let test be empty.
 * 3. If the second Expression is present, let increment be the second
 *    Expression; otherwise, let increment be empty.
 * 4. Return ? ForBodyEvaluation(test, increment, Statement, « », labelSet).
 */
export function* ForLoopEvaluation(
  $: VM,
  n: ESTree.ForStatement,
  labelSet: string[],
): ECR<Val|EMPTY> {
  if (n.init) {
    // Handle LexicalDeclaration
    if (n.init.type === 'VariableDeclaration') {
      if (n.init.kind === 'let' || n.init.kind === 'const') {
        return BreakableStatement(
          yield* ForLoopEvaluation_LexicalDeclaration($, n, n.init, labelSet));
      }
    }
    const init = yield* $.evaluateValue(n.init);
    if (IsAbrupt(init)) return init;
  }
  return BreakableStatement(
    yield* ForBodyEvaluation($, n.test, n.update, n.body, [], labelSet));
}

/**
 * 14.7.4.2 Runtime Semantics: ForLoopEvaluation
 * 
 * ForStatement : for ( LexicalDeclaration Expressionopt ; Expressionopt ) Statement
 * 1. Let oldEnv be the running execution context's LexicalEnvironment.
 * 2. Let loopEnv be NewDeclarativeEnvironment(oldEnv).
 * 3. Let isConst be IsConstantDeclaration of LexicalDeclaration.
 * 4. Let boundNames be the BoundNames of LexicalDeclaration.
 * 5. For each element dn of boundNames, do
 *     a. If isConst is true, then
 *         i. Perform ! loopEnv.CreateImmutableBinding(dn, true).
 *     b. Else,
 *         i. Perform ! loopEnv.CreateMutableBinding(dn, false).
 * 6. Set the running execution context's LexicalEnvironment to loopEnv.
 * 7. Let forDcl be Completion(Evaluation of LexicalDeclaration).
 * 8. If forDcl is an abrupt completion, then
 *     a. Set the running execution context's LexicalEnvironment to oldEnv.
 *     b. Return ? forDcl.
 * 9. If isConst is false, let perIterationLets be boundNames;
 *    otherwise let perIterationLets be a new empty List.
 * 10. If the first Expression is present, let test be the first
 *     Expression; otherwise, let test be empty.
 * 11. If the second Expression is present, let increment be the
 *     second Expression; otherwise, let increment be empty.
 * 12. Let bodyResult be Completion(ForBodyEvaluation(test, increment,
 *     Statement, perIterationLets, labelSet)).
 * 13. Set the running execution context's LexicalEnvironment to oldEnv.
 * 14. Return ? bodyResult.
 */
function* ForLoopEvaluation_LexicalDeclaration(
  $: VM,
  n: ESTree.ForStatement,
  init: ESTree.VariableDeclaration,
  labelSet: string[],
): ECR<Val|EMPTY> {
  const ctx = $.getRunningContext();
  const oldEnv = ctx.LexicalEnvironment;
  Assert(oldEnv);
  const loopEnv = new DeclarativeEnvironmentRecord(oldEnv);
  const isConst = init.kind === 'const';
  const boundNames = BoundNames(init);
  for (const dn of boundNames) {
    if (isConst) {
      CastNotAbrupt(loopEnv.CreateImmutableBinding($, dn, true));
    } else {
      CastNotAbrupt(loopEnv.CreateMutableBinding($, dn, false));
    }
  }
  ctx.LexicalEnvironment = loopEnv;
  const forDcl = yield* $.evaluateValue(init);
  if (IsAbrupt(forDcl)) {
    ctx.LexicalEnvironment = oldEnv;
    return forDcl;
  }
  const perIterationLets = isConst ? [] : boundNames;
  const bodyResult = yield* ForBodyEvaluation($, n.test, n.update, n.body, perIterationLets, labelSet);
  ctx.LexicalEnvironment = oldEnv;
  return bodyResult;
}

/**
 * 14.7.4.3 ForBodyEvaluation ( test, increment, stmt, perIterationBindings, labelSet )
 * 
 * The abstract operation ForBodyEvaluation takes arguments test (an
 * Expression Parse Node or empty), increment (an Expression Parse
 * Node or empty), stmt (a Statement Parse Node), perIterationBindings
 * (a List of Strings), and labelSet (a List of Strings) and returns
 * either a normal completion containing an ECMAScript language value
 * or an abrupt completion. It performs the following steps when
 * called:
 * 
 * 1. Let V be undefined.
 * 2. Perform ? CreatePerIterationEnvironment(perIterationBindings).
 * 3. Repeat,
 *     a. If test is not empty, then
 *         i. Let testRef be ? Evaluation of test.
 *         ii. Let testValue be ? GetValue(testRef).
 *         iii. If ToBoolean(testValue) is false, return V.
 *     b. Let result be Completion(Evaluation of stmt).
 *     c. If LoopContinues(result, labelSet) is false, return ? UpdateEmpty(result, V).
 *     d. If result.[[Value]] is not empty, set V to result.[[Value]].
 *     e. Perform ? CreatePerIterationEnvironment(perIterationBindings).
 *     f. If increment is not empty, then
 *         i. Let incRef be ? Evaluation of increment.
 *         ii. Perform ? GetValue(incRef).
 */
function* ForBodyEvaluation(
  $: VM,
  test: ESTree.Expression | null | undefined,
  increment: ESTree.Expression | null | undefined,
  stmt: ESTree.Statement,
  perIterationBindings: string[],
  labelSet: string[],
): ECR<Val|EMPTY> {
  let V: Val = undefined;
  const createStatus = yield* CreatePerIterationEnvironment($, perIterationBindings);
  if (IsAbrupt(createStatus)) return createStatus;
  while (true) {
    yield;  // pause before repeating to avoid infinite loops
    if (test) {
      const testValue = yield* $.evaluateValue(test);
      if (IsAbrupt(testValue)) return testValue;
      if (!ToBoolean(testValue)) return V;
    }
    const result = yield* $.evaluateValue(stmt);
    if (!LoopContinues(result, labelSet)) return UpdateEmpty(result, V);
    const cv = CompletionValue(result);
    if (!EMPTY.is(cv)) V = cv;
    const createStatus = yield* CreatePerIterationEnvironment($, perIterationBindings);
    if (IsAbrupt(createStatus)) return createStatus;
    if (increment) {
      const inc = yield* $.evaluateValue(increment);
      if (IsAbrupt(inc)) return inc;
    }
  }
}

/**
 * 14.7.4.4 CreatePerIterationEnvironment ( perIterationBindings )
 * 
 * The abstract operation CreatePerIterationEnvironment takes argument
 * perIterationBindings (a List of Strings) and returns either a
 * normal completion containing unused or a throw completion. It
 * performs the following steps when called:
 * 
 * 1. If perIterationBindings has any elements, then
 *     a. Let lastIterationEnv be the running execution context's LexicalEnvironment.
 *     b. Let outer be lastIterationEnv.[[OuterEnv]].
 *     c. Assert: outer is not null.
 *     d. Let thisIterationEnv be NewDeclarativeEnvironment(outer).
 *     e. For each element bn of perIterationBindings, do
 *         i. Perform ! thisIterationEnv.CreateMutableBinding(bn, false).
 *         ii. Let lastValue be ? lastIterationEnv.GetBindingValue(bn, true).
 *         iii. Perform ! thisIterationEnv.InitializeBinding(bn, lastValue).
 *     f. Set the running execution context's LexicalEnvironment to thisIterationEnv.
 * 2. Return unused.
 */
function* CreatePerIterationEnvironment(
  $: VM,
  perIterationBindings: string[],
): ECR<UNUSED> {
  if (!perIterationBindings.length) return UNUSED;
  const ctx = $.getRunningContext();
  const lastIterationEnv = ctx.LexicalEnvironment;
  const outer = lastIterationEnv!.OuterEnv;
  Assert(outer);
  const thisIterationEnv = new DeclarativeEnvironmentRecord(outer);
  for (const bn of perIterationBindings) {
    CastNotAbrupt(thisIterationEnv.CreateMutableBinding($, bn, false));
    const lastValue = yield* lastIterationEnv!.GetBindingValue($, bn, true);
    if (IsAbrupt(lastValue)) return lastValue;
    CastNotAbrupt(yield* thisIterationEnv.InitializeBinding($, bn, lastValue));
  }
  ctx.LexicalEnvironment = thisIterationEnv;
  return UNUSED;
}

/**
 * 14.8 The continue Statement
 * 
 * 14.8.2 Runtime Semantics: Evaluation
 * 
 * ContinueStatement : continue ;
 * 1. Return Completion Record { [[Type]]: continue, [[Value]]: empty, [[Target]]: empty }.
 * 
 * ContinueStatement : continue LabelIdentifier ;
 * 1. Let label be the StringValue of LabelIdentifier.
 * 2. Return Completion Record { [[Type]]: continue, [[Value]]: empty, [[Target]]: label }.
 */
export function Evaluation_ContinueStatement(
  _$: VM,
  n: ESTree.ContinueStatement,
): ECR<never> {
  return just(new Abrupt(CompletionType.Continue, EMPTY, n.label ? n.label.name : EMPTY));
}

// 14.7.5 The for-in, for-of, and for-await-of Statements

/**
 * 14.7.5.2 Static Semantics: IsDestructuring
 * 
 * The syntax-directed operation IsDestructuring takes no arguments
 * and returns a Boolean. It is defined piecewise over the following
 * productions:
 * 
 * MemberExpression : PrimaryExpression
 * 1. If PrimaryExpression is either an ObjectLiteral or an ArrayLiteral, return true.
 * 2. Return false.
 * 
 * MemberExpression :
 * MemberExpression [ Expression ]
 * MemberExpression . IdentifierName
 * MemberExpression TemplateLiteral
 * SuperProperty
 * MetaProperty
 * new MemberExpression Arguments
 * MemberExpression . PrivateIdentifier
 * NewExpression :
 * new NewExpression
 * LeftHandSideExpression :
 * CallExpression
 * OptionalExpression
 * 1. Return false.
 * 
 * ForDeclaration : LetOrConst ForBinding
 * 1. Return IsDestructuring of ForBinding.
 * 
 * ForBinding : BindingIdentifier
 * 1. Return false.
 * 
 * ForBinding : BindingPattern
 * 1. Return true.
 */
// function IsDestructuring(n: ESTree.Node): boolean {
//   switch (n.type) {
//     case 'ObjectPattern':
//     case 'ArrayPattern':
//       return true;
//     case 'AssignmentPattern':
//     case 'ForInStatement':
//     case 'ForOfStatement':
//       return IsDestructuring(n.left);
//     case 'VariableDeclaration':
//       return n.declarations.some(IsDestructuring);
//     case 'VariableDeclarator':
//       return IsDestructuring(n.id);
//     default:
//       return false;
//   }
// }

/**
 * 14.7.5.3 Runtime Semantics: ForDeclarationBindingInitialization
 * 
 * The syntax-directed operation ForDeclarationBindingInitialization
 * takes arguments value (an ECMAScript language value) and
 * environment (an Environment Record or undefined) and returns either
 * a normal completion containing unused or an abrupt completion.
 * 
 * NOTE: undefined is passed for environment to indicate that a
 * PutValue operation should be used to assign the initialization
 * value. This is the case for var statements and the formal parameter
 * lists of some non-strict functions (see 10.2.11). In those cases a
 * lexical binding is hoisted and preinitialized prior to evaluation
 * of its initializer.
 * 
 * It is defined piecewise over the following productions:
 * 
 * ForDeclaration : LetOrConst ForBinding
 * 1. Return ? BindingInitialization of ForBinding with arguments value and environment.
 */
// function ForDeclarationBindingInitialization(
//   $: VM,
//   forOfIn: ESTree.ForOfStatement|ESTree.ForInStatement,
//   value: Val,
//   environment: DeclarativeEnvironmentRecord | undefined,
// ): ECR<UNUSED> {
//   const decl = forOfIn.left.type === 'VariableDeclaration' ?
//     forOfIn.left.declarations[0] : forOfIn.left;
//   return $.BindingInitialization(decl, value, environment);
// }

/**
 * 14.7.5.4 Runtime Semantics: ForDeclarationBindingInstantiation
 * 
 * The syntax-directed operation ForDeclarationBindingInstantiation
 * takes argument environment (a Declarative Environment Record) and
 * returns unused. It is defined piecewise over the following
 * productions:
 * 
 * ForDeclaration : LetOrConst ForBinding
 * 1. For each element name of the BoundNames of ForBinding, do
 *     a. If IsConstantDeclaration of LetOrConst is true, then
 *         i. Perform ! environment.CreateImmutableBinding(name, true).
 *     b. Else,
 *         i. Perform ! environment.CreateMutableBinding(name, false).
 * 2. Return unused.
 */
function ForDeclarationBindingInstantiation(
  $: VM,
  decl: ESTree.VariableDeclaration,
  environment: DeclarativeEnvironmentRecord,
): UNUSED {
  for (const elt of BoundNames(decl)) {
    if (IsConstantDeclaration(decl)) {
      CastNotAbrupt(environment.CreateImmutableBinding($, elt, true));
    } else {
      CastNotAbrupt(environment.CreateMutableBinding($, elt, false));
    }
  }
  return UNUSED;
}

/**
 * 14.7.5.5 Runtime Semantics: ForInOfLoopEvaluation
 * 
 * The syntax-directed operation ForInOfLoopEvaluation takes argument
 * labelSet (a List of Strings) and returns either a normal completion
 * containing an ECMAScript language value or an abrupt completion. It
 * is defined piecewise over the following productions:
 * 
 * ForInOfStatement : for ( LeftHandSideExpression in Expression ) Statement
 * 1. Let keyResult be ? ForIn/OfHeadEvaluation(« », Expression, enumerate).
 * 2. Return ? ForIn/OfBodyEvaluation(LeftHandSideExpression,
 *    Statement, keyResult, enumerate, assignment, labelSet).
 * 
 * ForInOfStatement : for ( var ForBinding in Expression ) Statement
 * 1. Let keyResult be ? ForIn/OfHeadEvaluation(« », Expression, enumerate).
 * 2. Return ? ForIn/OfBodyEvaluation(ForBinding, Statement,
 *    keyResult, enumerate, varBinding, labelSet).
 * 
 * ForInOfStatement : for ( ForDeclaration in Expression ) Statement
 * 1. Let keyResult be ? ForIn/OfHeadEvaluation(BoundNames of
 *    ForDeclaration, Expression, enumerate).
 * 2. Return ? ForIn/OfBodyEvaluation(ForDeclaration, Statement,
 *    keyResult, enumerate, lexicalBinding, labelSet).
 * 
 * ForInOfStatement : for ( LeftHandSideExpression of AssignmentExpression ) Statement
 * 1. Let keyResult be ? ForIn/OfHeadEvaluation(« », AssignmentExpression, iterate).
 * 2. Return ? ForIn/OfBodyEvaluation(LeftHandSideExpression,
 *    Statement, keyResult, iterate, assignment, labelSet).
 * 
 * ForInOfStatement : for ( var ForBinding of AssignmentExpression ) Statement
 * 1. Let keyResult be ? ForIn/OfHeadEvaluation(« », AssignmentExpression, iterate).
 * 2. Return ? ForIn/OfBodyEvaluation(ForBinding, Statement,
 *    keyResult, iterate, varBinding, labelSet).
 * 
 * ForInOfStatement : for ( ForDeclaration of AssignmentExpression ) Statement
 * 1. Let keyResult be ? ForIn/OfHeadEvaluation(BoundNames of
 *    ForDeclaration, AssignmentExpression, iterate).
 * 2. Return ? ForIn/OfBodyEvaluation(ForDeclaration, Statement,
 *    keyResult, iterate, lexicalBinding, labelSet).
 * 
 * ForInOfStatement : for await ( LeftHandSideExpression of AssignmentExpression ) Statement
 * 1. Let keyResult be ? ForIn/OfHeadEvaluation(« »,
 *    AssignmentExpression, async-iterate).
 * 2. Return ? ForIn/OfBodyEvaluation(LeftHandSideExpression,
 *    Statement, keyResult, iterate, assignment, labelSet, async).
 * 
 * ForInOfStatement : for await ( var ForBinding of AssignmentExpression ) Statement
 * 1. Let keyResult be ? ForIn/OfHeadEvaluation(« »,
 *    AssignmentExpression, async-iterate).
 * 2. Return ? ForIn/OfBodyEvaluation(ForBinding, Statement,
 *    keyResult, iterate, varBinding, labelSet, async).
 * 
 * ForInOfStatement : for await ( ForDeclaration of AssignmentExpression ) Statement
 * 1. Let keyResult be ? ForIn/OfHeadEvaluation(BoundNames of
 *    ForDeclaration, AssignmentExpression, async-iterate).
 * 2. Return ? ForIn/OfBodyEvaluation(ForDeclaration, Statement,
 *    keyResult, iterate, lexicalBinding, labelSet, async).
 * 
 * NOTE: This section is extended by Annex B.3.5.
 */
export function* ForInOfLoopEvaluation(
  $: VM,
  n: ESTree.ForOfStatement|ESTree.ForInStatement,
  labelSet: string[],
): ECR<Val|EMPTY> {
  const isLexical = n.left.type === 'VariableDeclaration' && n.left.kind !== 'var';
  const lhs: ESTree.Pattern|ESTree.VariableDeclaration = n.left;
  const iterationKind = n.type === 'ForInStatement' ? ENUMERATE : ITERATE;
  const lexicalNames = isLexical ? BoundNames(n.left) : [];
  const keyResult = yield* ForInOfHeadEvaluation($, lexicalNames, n.right, iterationKind);
  if (IsAbrupt(keyResult)) return keyResult;
  return yield* ForInOfBodyEvaluation(
    $, lhs, n.body, keyResult, iterationKind, isLexical, labelSet,
    n.type === 'ForOfStatement' && n.await ? ASYNC : SYNC);
}

/**
 * 14.7.5.6 ForIn/OfHeadEvaluation ( uninitializedBoundNames, expr, iterationKind )
 * 
 * The abstract operation ForIn/OfHeadEvaluation takes arguments
 * uninitializedBoundNames (a List of Strings), expr (an Expression
 * Parse Node or an AssignmentExpression Parse Node), and
 * iterationKind (enumerate, iterate, or async-iterate) and returns
 * either a normal completion containing an Iterator Record or an
 * abrupt completion. It performs the following steps when called:
 * 
 * 1. Let oldEnv be the running execution context's LexicalEnvironment.
 * 2. If uninitializedBoundNames is not empty, then
 *     a. Assert: uninitializedBoundNames has no duplicate entries.
 *     b. Let newEnv be NewDeclarativeEnvironment(oldEnv).
 *     c. For each String name of uninitializedBoundNames, do
 *         i. Perform ! newEnv.CreateMutableBinding(name, false).
 *     d. Set the running execution context's LexicalEnvironment to newEnv.
 * 3. Let exprRef be Completion(Evaluation of expr).
 * 4. Set the running execution context's LexicalEnvironment to oldEnv.
 * 5. Let exprValue be ? GetValue(? exprRef).
 * 6. If iterationKind is enumerate, then
 *     a. If exprValue is either undefined or null, then
 *         i. Return Completion Record { [[Type]]: break, [[Value]]:
 *            empty, [[Target]]: empty }.
 *     b. Let obj be ! ToObject(exprValue).
 *     c. Let iterator be EnumerateObjectProperties(obj).
 *     d. Let nextMethod be ! GetV(iterator, "next").
 *     e. Return the Iterator Record { [[Iterator]]: iterator,
 *        [[NextMethod]]: nextMethod, [[Done]]: false }.
 * 7. Else,
 *     a. Assert: iterationKind is either iterate or async-iterate.
 *     b. If iterationKind is async-iterate, let iteratorKind be async.
 *     c. Else, let iteratorKind be sync.
 *     d. Return ? GetIterator(exprValue, iteratorKind).
 */
function* ForInOfHeadEvaluation(
  $: VM,
  uninitializedBoundNames: string[],
  expr: ESTree.Expression,
  iterationKind: ENUMERATE|ITERATE|ASYNC_ITERATE,
): ECR<IteratorRecord> {
  const oldEnv = $.getRunningContext().LexicalEnvironment;
  Assert(oldEnv);
  if (uninitializedBoundNames.length) {
    Assert(uninitializedBoundNames.length === new Set(uninitializedBoundNames).size);
    const newEnv = new DeclarativeEnvironmentRecord(oldEnv);
    for (const name of uninitializedBoundNames) {
      CastNotAbrupt(newEnv.CreateMutableBinding($, name, false));
    }
    $.getRunningContext().LexicalEnvironment = newEnv;
  }
  const exprRef = yield* $.Evaluation(expr);
  $.getRunningContext().LexicalEnvironment = oldEnv;
  if (IsAbrupt(exprRef)) return exprRef;
  Assert(!EMPTY.is(exprRef));
  const exprValue = yield* GetValue($, exprRef);
  if (IsAbrupt(exprValue)) return exprValue;
  if (iterationKind === ENUMERATE) {
    if (exprValue == null) return new Abrupt(CompletionType.Break, EMPTY, EMPTY);
    const obj = CastNotAbrupt(ToObject($, exprValue));
    const iterator = EnumerateObjectProperties($, obj);
    const nextMethod = CastNotAbrupt(yield* GetV($, iterator, 'next'));
    Assert(IsFunc(nextMethod));
    return new IteratorRecord(iterator, nextMethod, false);
  } else {
    const iteratorKind = iterationKind === ASYNC_ITERATE ? ASYNC : SYNC;
    return yield* GetIterator($, exprValue, iteratorKind);
  }
}

/**
 * 14.7.5.7 ForIn/OfBodyEvaluation ( lhs, stmt, iteratorRecord, iterationKind,
 *                                   lhsKind, labelSet [ , iteratorKind ] )
 * 
 * The abstract operation ForIn/OfBodyEvaluation takes arguments lhs
 * (a Parse Node), stmt (a Statement Parse Node), iteratorRecord (an
 * Iterator Record), iterationKind (enumerate or iterate), lhsKind
 * (assignment, varBinding, or lexicalBinding), and labelSet (a List
 * of Strings) and optional argument iteratorKind (sync or async) and
 * returns either a normal completion containing an ECMAScript
 * language value or an abrupt completion. It performs the following
 * steps when called:
 * 
 * 1. If iteratorKind is not present, set iteratorKind to sync.
 * 2. Let oldEnv be the running execution context's LexicalEnvironment.
 * 3. Let V be undefined.
 * 4. Let destructuring be IsDestructuring of lhs.
 * 5. If destructuring is true and lhsKind is assignment, then
 *     a. Assert: lhs is a LeftHandSideExpression.
 *     b. Let assignmentPattern be the AssignmentPattern that is covered by lhs.
 * 6. Repeat,
 *     a. Let nextResult be ? Call(iteratorRecord.[[NextMethod]],
 *        iteratorRecord.[[Iterator]]).
 *     b. If iteratorKind is async, set nextResult to ? Await(nextResult).
 *     c. If nextResult is not an Object, throw a TypeError exception.
 *     d. Let done be ? IteratorComplete(nextResult).
 *     e. If done is true, return V.
 *     f. Let nextValue be ? IteratorValue(nextResult).
 *     g. If lhsKind is either assignment or varBinding, then
 *         i. If destructuring is true, then
 *             1. If lhsKind is assignment, then
 *                 a. Let status be
 *                    Completion(DestructuringAssignmentEvaluation of
 *                    assignmentPattern with argument nextValue).
 *             2. Else,
 *                 a. Assert: lhsKind is varBinding.
 *                 b. Assert: lhs is a ForBinding.
 *                 c. Let status be Completion(BindingInitialization
 *                    of lhs with arguments nextValue and undefined).
 *         ii. Else,
 *             1. Let lhsRef be Completion(Evaluation of lhs). (It may
 *                be evaluated repeatedly.)
 *             2. If lhsRef is an abrupt completion, then
 *                 a. Let status be lhsRef.
 *             3. Else,
 *                 a. Let status be Completion(PutValue(lhsRef.[[Value]], nextValue)).
 *     h. Else,
 *         i. Assert: lhsKind is lexicalBinding.
 *         ii. Assert: lhs is a ForDeclaration.
 *         iii. Let iterationEnv be NewDeclarativeEnvironment(oldEnv).
 *         iv. Perform ForDeclarationBindingInstantiation of lhs with argument iterationEnv.
 *         v. Set the running execution context's LexicalEnvironment to iterationEnv.
 *         vi. If destructuring is true, then
 *             1. Let status be
 *                Completion(ForDeclarationBindingInitialization of lhs
 *                with arguments nextValue and iterationEnv).
 *         vii. Else,
 *             1. Assert: lhs binds a single name.
 *             2. Let lhsName be the sole element of BoundNames of lhs.
 *             3. Let lhsRef be ! ResolveBinding(lhsName).
 *             4. Let status be Completion(InitializeReferencedBinding(lhsRef, nextValue)).
 *     i. If status is an abrupt completion, then
 *         i. Set the running execution context's LexicalEnvironment to oldEnv.
 *         ii. If iteratorKind is async, return ? AsyncIteratorClose(iteratorRecord, status).
 *         iii. If iterationKind is enumerate, then
 *             1. Return ? status.
 *         iv. Else,
 *             1. Assert: iterationKind is iterate.
 *             2. Return ? IteratorClose(iteratorRecord, status).
 *     j. Let result be Completion(Evaluation of stmt).
 *     k. Set the running execution context's LexicalEnvironment to oldEnv.
 *     l. If LoopContinues(result, labelSet) is false, then
 *         i. If iterationKind is enumerate, then
 *             1. Return ? UpdateEmpty(result, V).
 *         ii. Else,
 *             1. Assert: iterationKind is iterate.
 *             2. Set status to Completion(UpdateEmpty(result, V)).
 *             3. If iteratorKind is async, return ? AsyncIteratorClose(iteratorRecord, status).
 *             4. Return ? IteratorClose(iteratorRecord, status).
 *     m. If result.[[Value]] is not empty, set V to result.[[Value]].
 */
function* ForInOfBodyEvaluation(
  $: VM,
  lhs: ESTree.Pattern|ESTree.VariableDeclaration,
  stmt: ESTree.Statement,
  iteratorRecord: IteratorRecord,
  iterationKind: ENUMERATE|ITERATE,
  isLexical: boolean,
  labelSet: string[],
  iteratorKind: SYNC|ASYNC = SYNC,
): ECR<Val|EMPTY> {
  const oldEnv = $.getRunningContext().LexicalEnvironment;
  Assert(oldEnv);
  let V: Val = undefined;
  const assignmentPattern = lhs.type === 'VariableDeclaration' ? lhs.declarations[0].id : lhs;
  Assert(lhs.type !== 'VariableDeclaration' ||
    lhs.declarations.length === 1 && !lhs.declarations[0].init);
  // const assignmentPattern = lhs;
  while (true) {
    yield;  // pause before repeating to avoid infinite loops
    let nextResult = yield* Call($, iteratorRecord.NextMethod, iteratorRecord.Iterator)
    if (IsAbrupt(nextResult)) return nextResult;
    if (iteratorKind === ASYNC) {
      nextResult = yield* Await($, nextResult);
      if (IsAbrupt(nextResult)) return nextResult;
    }
    if (!(nextResult instanceof Obj)) {
      return $.throw('TypeError', `Iterator result ${DebugString(nextResult)} is not an object`);
    }
    const done = yield* IteratorComplete($, nextResult);
    if (IsAbrupt(done)) return done;
    if (done) return V;
    const nextValue = yield* IteratorValue($, nextResult);
    if (IsAbrupt(nextValue)) return nextValue;
    let status;
    if (!isLexical) {
      // NOTE: We've folded all these cases together...
      status = yield* $.BindingInitialization(assignmentPattern, nextValue, undefined);
    } else {
      Assert(lhs.type === 'VariableDeclaration');
      const iterationEnv = new DeclarativeEnvironmentRecord(oldEnv);
      ForDeclarationBindingInstantiation($, lhs, iterationEnv);
      $.getRunningContext().LexicalEnvironment = iterationEnv;
      status = yield* $.BindingInitialization(assignmentPattern, nextValue, iterationEnv);
    }
    if (IsAbrupt(status)) {
      $.getRunningContext().LexicalEnvironment = oldEnv;
      if (iteratorKind === ASYNC) return yield* AsyncIteratorClose($, iteratorRecord, status);
      if (iterationKind === ITERATE) return yield* IteratorClose($, iteratorRecord, status);
      return status;
    }
    const result = yield* $.evaluateValue(stmt);
    $.getRunningContext().LexicalEnvironment = oldEnv;
    if (!LoopContinues(result, labelSet)) {
      if (iterationKind === ENUMERATE) return UpdateEmpty(result, V);
      status = UpdateEmpty(result, V);
      if (iteratorKind === ASYNC) return yield* AsyncIteratorClose($, iteratorRecord, status);
      return yield* IteratorClose($, iteratorRecord, status);
    }
    const cv = CompletionValue(result);
    if (!EMPTY.is(cv)) V = cv;
  }
}

/**
 * 14.7.5.9 EnumerateObjectProperties ( O )
 * 
 * The abstract operation EnumerateObjectProperties takes argument O
 * (an Object) and returns an Iterator. It performs the following
 * steps when called:
 * 
 * 1. Return an Iterator object (27.1.1.2) whose next method iterates
 *    over all the String-valued keys of enumerable properties of O. The
 *    iterator object is never directly accessible to ECMAScript
 *    code. The mechanics and order of enumerating the properties is not
 *    specified but must conform to the rules specified below.
 * 
 * The iterator's throw and return methods are null and are never
 * invoked. The iterator's next method processes object properties to
 * determine whether the property key should be returned as an
 * iterator value. Returned property keys do not include keys that are
 * Symbols. Properties of the target object may be deleted during
 * enumeration. A property that is deleted before it is processed by
 * the iterator's next method is ignored. If new properties are added
 * to the target object during enumeration, the newly added properties
 * are not guaranteed to be processed in the active enumeration. A
 * property name will be returned by the iterator's next method at
 * most once in any enumeration.
 * 
 * Enumerating the properties of the target object includes
 * enumerating properties of its prototype, and the prototype of the
 * prototype, and so on, recursively; but a property of a prototype is
 * not processed if it has the same name as a property that has
 * already been processed by the iterator's next method. The values
 * of [[Enumerable]] attributes are not considered when determining if
 * a property of a prototype object has already been processed. The
 * enumerable property names of prototype objects must be obtained by
 * invoking EnumerateObjectProperties passing the prototype object as
 * the argument. EnumerateObjectProperties must obtain the own
 * property keys of the target object by calling its
 * [[OwnPropertyKeys]] internal method. Property attributes of the
 * target object must be obtained by calling its [[GetOwnProperty]]
 * internal method.
 * 
 * In addition, if neither O nor any object in its prototype chain is
 * a Proxy exotic object, Integer-Indexed exotic object, module
 * namespace exotic object, or implementation provided exotic object,
 * then the iterator must behave as would the iterator given by
 * CreateForInIterator(O) until one of the following occurs:
 * 
 *   - the value of the [[Prototype]] internal slot of O or an object in
 *     its prototype chain changes,
 *   - a property is removed from O or an object in its prototype chain,
 *   - a property is added to an object in O's prototype chain, or
 *   - the value of the [[Enumerable]] attribute of a property of O or
 *     an object in its prototype chain changes.
 */
export function EnumerateObjectProperties($: VM, obj: Obj): Obj {
  return CreateForInIterator($, obj);
}

/**
 * 14.7.5.10 For-In Iterator Objects
 * 
 * A For-In Iterator is an object that represents a specific iteration
 * over some specific object. For-In Iterator objects are never
 * directly accessible to ECMAScript code; they exist solely to
 * illustrate the behaviour of EnumerateObjectProperties.
 * 
 * 14.7.5.10.1 CreateForInIterator ( object )
 * 
 * The abstract operation CreateForInIterator takes argument object
 * (an Object) and returns a For-In Iterator. It is used to create a
 * For-In Iterator object which iterates over the own and inherited
 * enumerable string properties of object in a specific order. It
 * performs the following steps when called:
 * 
 * 1. Let iterator be OrdinaryObjectCreate(%ForInIteratorPrototype%, «
 *    [[Object]], [[ObjectWasVisited]], [[VisitedKeys]],
 *    [[RemainingKeys]] »).
 * 2. Set iterator.[[Object]] to object.
 * 3. Set iterator.[[ObjectWasVisited]] to false.
 * 4. Set iterator.[[VisitedKeys]] to a new empty List.
 * 5. Set iterator.[[RemainingKeys]] to a new empty List.
 * 6. Return iterator.
 */
export function CreateForInIterator($: VM, obj: Obj): Obj {
  return OrdinaryObjectCreate({
    Prototype: GetForInIteratorPrototype($),
    Object: obj,
    ObjectWasVisited: false,
    VisitedKeys: new Set(),
    RemainingKeys: [],
  });
}

/**
 * 14.7.5.10.2 The %ForInIteratorPrototype% Object
 * 
 * The %ForInIteratorPrototype% object:
 * 
 * has properties that are inherited by all For-In Iterator Objects.
 * is an ordinary object.
 * has a [[Prototype]] internal slot whose value is %IteratorPrototype%.
 * is never directly accessible to ECMAScript code.
 * has the following properties:
 */
function GetForInIteratorPrototype($: VM): Obj {
  const realm = $.getRealm()!;
  let proto = realm.Intrinsics.get('%ForInIteratorPrototype%');
  if (!proto) {
    proto = OrdinaryObjectCreate({
      Prototype: $.getIntrinsic('%IteratorPrototype%'),
    });
    realm.Intrinsics.set('%ForInIteratorPrototype%', proto);

    defineProperties(realm, proto, {
      /**
       * 14.7.5.10.2.1 %ForInIteratorPrototype%.next ( )
       * 1. Let O be the this value.
       * 2. Assert: O is an Object.
       * 3. Assert: O has all of the internal slots of a For-In Iterator
       *    Instance (14.7.5.10.3).
       * 4. Let object be O.[[Object]].
       * 5. Repeat,
       *     a. If O.[[ObjectWasVisited]] is false, then
       *         i. Let keys be ? object.[[OwnPropertyKeys]]().
       *         ii. For each element key of keys, do
       *             1. If key is a String, then
       *                 a. Append key to O.[[RemainingKeys]].
       *         iii. Set O.[[ObjectWasVisited]] to true.
       *     b. Repeat, while O.[[RemainingKeys]] is not empty,
       *         i. Let r be the first element of O.[[RemainingKeys]].
       *         ii. Remove the first element from O.[[RemainingKeys]].
       *         iii. If there does not exist an element v of
       *              O.[[VisitedKeys]] such that SameValue(r, v) is true, then
       *             1. Let desc be ? object.[[GetOwnProperty]](r).
       *             2. If desc is not undefined, then
       *                 a. Append r to O.[[VisitedKeys]].
       *                 b. If desc.[[Enumerable]] is true, return
       *                    CreateIterResultObject(r, false).
       *     c. Set object to ? object.[[GetPrototypeOf]]().
       *     d. Set O.[[Object]] to object.
       *     e. Set O.[[ObjectWasVisited]] to false.
       *     f. If object is null, return
       *        CreateIterResultObject(undefined, true).
       */
      'next': methodO(function*($, O) {
        let obj = O.Object;
        while (obj) {
          if (!O.ObjectWasVisited) {
            const keys = obj.OwnPropertyKeys($);
            if (IsAbrupt(keys)) return keys;
            for (const key of keys) {
              if (typeof key === 'string') O.RemainingKeys!.push(key);
            }
            O.RemainingKeys!.reverse();
            O.ObjectWasVisited = true;
          }
          while (O.RemainingKeys!.length) {
            const r = O.RemainingKeys!.pop()!;
            if (O.VisitedKeys!.has(r)) continue;
            const desc = obj.GetOwnProperty($, r);
            if (IsAbrupt(desc)) return desc;
            if (desc) {
              O.VisitedKeys!.add(r);
              if (desc.Enumerable) return CreateIterResultObject($, r, false);
            }
          }
          const proto = obj.GetPrototypeOf($);
          if (IsAbrupt(proto)) return proto;
          obj = O.Object = proto;
          O.ObjectWasVisited = false;
        }
        return CreateIterResultObject($, undefined, true);
      }),
    });
  }
  return proto;
}

/**
 * 14.7.5.10.3 Properties of For-In Iterator Instances
 * 
 * For-In Iterator instances are ordinary objects that inherit
 * properties from the %ForInIteratorPrototype% intrinsic
 * object. For-In Iterator instances are initially created with the
 * internal slots listed in Table 38.
 * 
 * [[Object]], an Object - The Object value whose properties are being
 *     iterated.
 * [[ObjectWasVisited]], a Boolean - true if the iterator has invoked
 *     [[OwnPropertyKeys]] on [[Object]], false otherwise.
 * [[VisitedKeys]], a List of Strings - The values that have been
 *     emitted by this iterator thus far.
 * [[RemainingKeys]], a List of Strings - The values remaining to be
 *     emitted for the current object, before iterating the properties of
 *     its prototype (if its prototype is not null).
 */
interface ForInIteratorSlots {
  Object?: Obj|null;
  ObjectWasVisited?: boolean;
  VisitedKeys?: Set<string>;
  RemainingKeys?: string[];
}

declare global {
  interface ObjectSlots extends ForInIteratorSlots {}
}

/**
 * 14.9 The break Statement
 * 
 * 14.9.2 Runtime Semantics: Evaluation
 * 
 * BreakStatement : break ;
 * 1. Return Completion Record { [[Type]]: break, [[Value]]: empty, [[Target]]: empty }.
 * 
 * BreakStatement : break LabelIdentifier ;
 * 1. Let label be the StringValue of LabelIdentifier.
 * 2. Return Completion Record { [[Type]]: break, [[Value]]: empty, [[Target]]: label }.
 */
export function Evaluation_BreakStatement(
  _$: VM,
  n: ESTree.BreakStatement,
): ECR<never> {
  return just(new Abrupt(CompletionType.Break, EMPTY, n.label ? n.label.name : EMPTY));
}

/**
 * 14.11 The with Statement
 * 
 * NOTE 1: Use of the Legacy with statement is discouraged in new
 * ECMAScript code. Consider alternatives that are permitted in both
 * strict mode code and non-strict code, such as destructuring
 * assignment.
 * 
 * NOTE 2: The with statement adds an Object Environment Record for a
 * computed object to the lexical environment of the running execution
 * context. It then executes a statement using this augmented lexical
 * environment. Finally, it restores the original lexical environment.
 * 
 * 14.11.2 Runtime Semantics: Evaluation
 * 
 * WithStatement : with ( Expression ) Statement
 * 1. Let val be ? Evaluation of Expression.
 * 2. Let obj be ? ToObject(? GetValue(val)).
 * 3. Let oldEnv be the running execution context's LexicalEnvironment.
 * 4. Let newEnv be NewObjectEnvironment(obj, true, oldEnv).
 * 5. Set the running execution context\'s LexicalEnvironment to newEnv.
 * 6. Let C be Completion(Evaluation of Statement).
 * 7. Set the running execution context\'s LexicalEnvironment to oldEnv.
 * 8. Return ? UpdateEmpty(C, undefined).
 * 
 * NOTE: No matter how control leaves the embedded Statement, whether
 * normally or by some form of abrupt completion or exception, the
 * LexicalEnvironment is always restored to its former state.
 */
export function* Evaluation_WithStatement(
  $: VM,
  n: ESTree.WithStatement,
): ECR<Val|EMPTY> {
  const val = yield* $.evaluateValue(n.object);
  if (IsAbrupt(val)) return val;
  const obj = ToObject($, val);
  if (IsAbrupt(obj)) return obj;
  const oldEnv = $.getRunningContext().LexicalEnvironment;
  const newEnv = new ObjectEnvironmentRecord(obj, true, oldEnv ?? null);
  $.getRunningContext().LexicalEnvironment = newEnv;
  const C = yield* $.evaluateValue(n.body);
  $.getRunningContext().LexicalEnvironment = oldEnv;
  return UpdateEmpty(C, undefined);
}

/**
 * 14.12 The switch Statement
 * 
 * 14.12.2 Runtime Semantics: CaseBlockEvaluation
 * 
 * The syntax-directed operation CaseBlockEvaluation takes argument
 * input (an ECMAScript language value) and returns either a normal
 * completion containing an ECMAScript language value or an abrupt
 * completion. It is defined piecewise over the following productions:
 * 
 * CaseBlock : { }
 * 1. Return undefined.
 * 
 * CaseBlock : { CaseClauses }
 * 1. Let V be undefined.
 * 2. Let A be the List of CaseClause items in CaseClauses, in source text order.
 * 3. Let found be false.
 * 4. For each CaseClause C of A, do
 *     a. If found is false, then
 *         i. Set found to ? CaseClauseIsSelected(C, input).
 *     b. If found is true, then
 *         i. Let R be Completion(Evaluation of C).
 *         ii. If R.[[Value]] is not empty, set V to R.[[Value]].
 *         iii. If R is an abrupt completion, return ? UpdateEmpty(R, V).
 * 5. Return V.
 * 
 * CaseBlock : { CaseClausesopt DefaultClause CaseClausesopt }
 * 1. Let V be undefined.
 * 2. If the first CaseClauses is present, then
 *     a. Let A be the List of CaseClause items in the first CaseClauses, in source text order.
 * 3. Else,
 *     a. Let A be a new empty List.
 * 4. Let found be false.
 * 5. For each CaseClause C of A, do
 *     a. If found is false, then
 *         i. Set found to ? CaseClauseIsSelected(C, input).
 *     b. If found is true, then
 *         i. Let R be Completion(Evaluation of C).
 *         ii. If R.[[Value]] is not empty, set V to R.[[Value]].
 *         iii. If R is an abrupt completion, return ? UpdateEmpty(R, V).
 * 6. Let foundInB be false.
 * 7. If the second CaseClauses is present, then
 *     a. Let B be the List of CaseClause items in the second CaseClauses, in source text order.
 * 8. Else,
 *     a. Let B be a new empty List.
 * 9. If found is false, then
 *     a. For each CaseClause C of B, do
 *         i. If foundInB is false, then
 *             1. Set foundInB to ? CaseClauseIsSelected(C, input).
 *         ii. If foundInB is true, then
 *             1. Let R be Completion(Evaluation of CaseClause C).
 *             2. If R.[[Value]] is not empty, set V to R.[[Value]].
 *             3. If R is an abrupt completion, return ? UpdateEmpty(R, V).
 * 10. If foundInB is true, return V.
 * 11. Let R be Completion(Evaluation of DefaultClause).
 * 12. If R.[[Value]] is not empty, set V to R.[[Value]].
 * 13. If R is an abrupt completion, return ? UpdateEmpty(R, V).
 * 14. NOTE: The following is another complete iteration of the second CaseClauses.
 * 15. For each CaseClause C of B, do
 *     a. Let R be Completion(Evaluation of CaseClause C).
 *     b. If R.[[Value]] is not empty, set V to R.[[Value]].
 *     c. If R is an abrupt completion, return ? UpdateEmpty(R, V).
 * 16. Return V.
 */
function* CaseBlockEvaluation(
  $: VM,
  cases: ESTree.SwitchCase[],
  input: Val,
): ECR<Val|EMPTY> {
  let V: CR<Val> = undefined;
  let A = cases;
  let found = false;
  for (const C of A) {
    if (!found) {
      const result = yield* CaseClauseIsSelected($, C, input);
      if (IsAbrupt(result)) return result;
      found = result;
    }
    if (found) {
      for (const stmt of C.consequent) {
        const R = yield* $.evaluateValue(stmt);
        if (IsAbrupt(R)) return UpdateEmpty(R, V);
        if (!EMPTY.is(R)) V = R;
      }
    }
  }
  return V;
}

/**
 * 14.12.3 CaseClauseIsSelected ( C, input )
 * 
 * The abstract operation CaseClauseIsSelected takes arguments C (a
 * CaseClause Parse Node) and input (an ECMAScript language value) and
 * returns either a normal completion containing a Boolean or an
 * abrupt completion. It determines whether C matches input. It
 * performs the following steps when called:
 * 
 * 1. Assert: C is an instance of the production CaseClause : case Expression : StatementListopt .
 * 2. Let exprRef be ? Evaluation of the Expression of C.
 * 3. Let clauseSelector be ? GetValue(exprRef).
 * 4. Return IsStrictlyEqual(input, clauseSelector).
 * 
 * NOTE: This operation does not execute C's StatementList (if
 * any). The CaseBlock algorithm uses its return value to determine
 * which StatementList to start executing.
 */
function* CaseClauseIsSelected(
  $: VM,
  C: ESTree.SwitchCase,
  input: Val,
): ECR<boolean> {
  if (!C.test) return true;
  const clauseSelector = yield* $.evaluateValue(C.test);
  if (IsAbrupt(clauseSelector)) return clauseSelector;
  return IsStrictlyEqual(input, clauseSelector);
}

/**
 * 14.12.4 Runtime Semantics: Evaluation
 * 
 * SwitchStatement : switch ( Expression ) CaseBlock
 * 1. Let exprRef be ? Evaluation of Expression.
 * 2. Let switchValue be ? GetValue(exprRef).
 * 3. Let oldEnv be the running execution context's LexicalEnvironment.
 * 4. Let blockEnv be NewDeclarativeEnvironment(oldEnv).
 * 5. Perform BlockDeclarationInstantiation(CaseBlock, blockEnv).
 * 6. Set the running execution context's LexicalEnvironment to blockEnv.
 * 7. Let R be Completion(CaseBlockEvaluation of CaseBlock with argument switchValue).
 * 8. Set the running execution context's LexicalEnvironment to oldEnv.
 * 9. Return R.
 * 
 * NOTE: No matter how control leaves the SwitchStatement the
 * LexicalEnvironment is always restored to its former state.
 * 
 * CaseClause : case Expression :
 * 1. Return empty.
 * 
 * CaseClause : case Expression : StatementList
 * 1. Return ? Evaluation of StatementList.
 * 
 * DefaultClause : default :
 * 1. Return empty.
 * 
 * DefaultClause : default : StatementList
 * 1. Return ? Evaluation of StatementList.
 */
export function* Evaluation_SwitchStatement(
  $: VM,
  n: ESTree.SwitchStatement,
): ECR<Val|EMPTY> {
  const switchValue = yield* $.evaluateValue(n.discriminant);
  if (IsAbrupt(switchValue)) return switchValue;
  const oldEnv = $.getRunningContext().LexicalEnvironment;
  const blockEnv = new DeclarativeEnvironmentRecord(oldEnv ?? null);
  BlockDeclarationInstantiation($, n, blockEnv);
  $.getRunningContext().LexicalEnvironment = blockEnv;
  const R = yield* CaseBlockEvaluation($, n.cases, switchValue);
  $.getRunningContext().LexicalEnvironment = oldEnv;
  return BreakableStatement(R);
}

/**
 * 14.13.3 Runtime Semantics: Evaluation
 * 
 * LabelledStatement : LabelIdentifier : LabelledItem
 * 1. Return ? LabelledEvaluation of this LabelledStatement with argument « ».
 */
export function Evaluation_LabelledStatement(
  $: VM,
  n: ESTree.Node,
): ECR<Val|EMPTY> {
  return $.LabelledEvaluation(n, []);
}

/**
 * 14.13.4 Runtime Semantics: LabelledEvaluation
 *
 * The syntax-directed operation LabelledEvaluation takes argument
 * labelSet (a List of Strings) and returns either a normal completion
 * containing an ECMAScript language value or an abrupt completion. It
 * is defined piecewise over the following productions:
 * 
 * LabelledStatement : LabelIdentifier : LabelledItem
 * 1. Let label be the StringValue of LabelIdentifier.
 * 2. Let newLabelSet be the list-concatenation of labelSet and « label ».
 * 3. Let stmtResult be Completion(LabelledEvaluation of LabelledItem
 *    with argument newLabelSet).
 * 4. If stmtResult.[[Type]] is break and
 *    SameValue(stmtResult.[[Target]], label) is true, then
 *     a. Set stmtResult to NormalCompletion(stmtResult.[[Value]]).
 * 5. Return ? stmtResult.
 */
export function* LabelledEvaluation_LabelledStatement(
  $: VM,
  n: ESTree.LabeledStatement,
  labelSet: string[],
): ECR<Val|EMPTY> {
  const label = n.label.name;
  const stmtResult = yield* $.LabelledEvaluation(n.body, [...labelSet, label]);
  if (IsAbrupt(stmtResult) && stmtResult.Target === label) {
    if (stmtResult.Type === CompletionType.Break) return stmtResult.Value;
    Assert(stmtResult.Type === CompletionType.Continue);
    return $.throw(
      'SyntaxError',
      `Illegal continue statement: '${label}' does not denote an iteration statement`,
    );
  }
  return stmtResult;
}





/**
 * 14.13.4 Runtime Semantics: LabelledEvaluation
 * 
 * The syntax-directed operation LabelledEvaluation takes argument
 * labelSet (a List of Strings) and returns either a normal completion
 * containing an ECMAScript language value or an abrupt completion. It
 * is defined piecewise over the following productions:
 * 
 * BreakableStatement : IterationStatement
 * 1. Let stmtResult be Completion(LoopEvaluation of
 *    IterationStatement with argument labelSet)
 * 2. If stmtResult.[[Type]] is break, then
 *     a. If stmtResult.[[Target]] is empty, then
 *         i. If stmtResult.[[Value]] is empty, set stmtResult to
 *            NormalCompletion(undefined).
 *         ii. Else, set stmtResult to NormalCompletion(stmtResult.[[Value]]).
 * 3. Return ? stmtResult.
 *
 * ---
 *
 * BreakableStatement : SwitchStatement
 * 1. Let stmtResult be Completion(Evaluation of SwitchStatement).
 * 2-3. (from above)
 *
 * NOTE 1: A BreakableStatement is one that can be exited via an
 * unlabelled BreakStatement.
 */
function BreakableStatement(
  completion: CR<Val|EMPTY>,
): CR<Val|EMPTY> {
  if (
    IsAbrupt(completion) &&
      completion.Type === CompletionType.Break &&
      EMPTY.is(completion.Target)
  ) {
    return EMPTY.is(completion.Value) ? undefined : completion.Value;
  }
  return completion;
}

/**
 * 14.15 The try Statement
 * 
 * 14.15.2 Runtime Semantics: CatchClauseEvaluation
 * The syntax-directed operation CatchClauseEvaluation takes argument thrownValue (an ECMAScript language value) and returns either a normal completion containing an ECMAScript language value or an abrupt completion. It is defined piecewise over the following productions:
 * 
 * Catch : catch ( CatchParameter ) Block
 * 1. Let oldEnv be the running execution context's LexicalEnvironment.
 * 2. Let catchEnv be NewDeclarativeEnvironment(oldEnv).
 * 3. For each element argName of the BoundNames of CatchParameter, do
 *     a. Perform ! catchEnv.CreateMutableBinding(argName, false).
 * 4. Set the running execution context's LexicalEnvironment to catchEnv.
 * 5. Let status be Completion(BindingInitialization of CatchParameter with arguments thrownValue and catchEnv).
 * 6. If status is an abrupt completion, then
 *     a. Set the running execution context's LexicalEnvironment to oldEnv.
 *     b. Return ? status.
 * 7. Let B be Completion(Evaluation of Block).
 * 8. Set the running execution context's LexicalEnvironment to oldEnv.
 * 9. Return ? B.
 * 
 * Catch : catch Block
 * 1. Return ? Evaluation of Block.
 * 
 * NOTE: No matter how control leaves the Block the LexicalEnvironment
 * is always restored to its former state.
 */
function* CatchClauseEvaluation(
  $: VM,
  n: ESTree.CatchClause,
  thrownValue: Val,
): ECR<Val|EMPTY> {
  if (!n.param) return yield* $.evaluateValue(n.body);
  const oldEnv = $.getRunningContext().LexicalEnvironment;
  const catchEnv = new DeclarativeEnvironmentRecord(oldEnv ?? null);
  for (const argName of BoundNames(n.param)) {
    CastNotAbrupt(catchEnv.CreateMutableBinding($, argName, false));
  }
  $.getRunningContext().LexicalEnvironment = catchEnv;
  const status = yield* $.BindingInitialization(n.param, thrownValue, catchEnv);
  if (IsAbrupt(status)) return ($.getRunningContext().LexicalEnvironment = oldEnv, status);
  const B = yield* $.evaluateValue(n.body);
  $.getRunningContext().LexicalEnvironment = oldEnv;
  return B;
}

/**
 * 14.15.3 Runtime Semantics: Evaluation
 * 
 * TryStatement : try Block Catch
 * 1. Let B be Completion(Evaluation of Block).
 * 2. If B.[[Type]] is throw, let C be Completion(CatchClauseEvaluation of Catch with argument B.[[Value]]).
 * 3. Else, let C be B.
 * 4. Return ? UpdateEmpty(C, undefined).
 * 
 * TryStatement : try Block Finally
 * 1. Let B be Completion(Evaluation of Block).
 * 2. Let F be Completion(Evaluation of Finally).
 * 3. If F.[[Type]] is normal, set F to B.
 * 4. Return ? UpdateEmpty(F, undefined).
 * 
 * TryStatement : try Block Catch Finally
 * 1. Let B be Completion(Evaluation of Block).
 * 2. If B.[[Type]] is throw, let C be Completion(CatchClauseEvaluation of Catch with argument B.[[Value]]).
 * 3. Else, let C be B.
 * 4. Let F be Completion(Evaluation of Finally).
 * 5. If F.[[Type]] is normal, set F to C.
 * 6. Return ? UpdateEmpty(F, undefined).
 */
export function* Evaluation_TryStatement($: VM, n: ESTree.TryStatement): ECR<Val> {
  let B: CR<Val|EMPTY> = yield* $.evaluateValue(n.block);
  if (IsThrowCompletion(B) && n.handler) {
    B = yield* CatchClauseEvaluation($, n.handler, B.Value);
  }
  if (n.finalizer) {
    const F = yield* $.evaluateValue(n.finalizer);
    if (IsAbrupt(F)) B = F;
  }    
  return UpdateEmpty(B, undefined);
}
