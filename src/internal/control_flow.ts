/** @fileoverview Evaluation for control flow operators. */

import { ToBoolean } from './abstract_conversion';
import { Assert } from './assert';
import { Abrupt, CR, CastNotAbrupt, CompletionType, CompletionValue, IsAbrupt, UpdateEmpty } from './completion_record';
import { EMPTY, UNUSED } from './enums';
import { DeclarativeEnvironmentRecord } from './environment_record';
import { BoundNames } from './static/scope';
import { NodeMap, NodeType } from './tree';
import { Val } from './val';
import { ECR, Plugin, VM, just } from './vm';
import * as ESTree from 'estree';

export const controlFlow: Plugin = {
  id: 'controlFlow',
  deps: () => [labels, loops, conditionals, /*switchStatement*/],
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
  ],
};

export const conditionals: Plugin = {
  id: 'conditionals',
  syntax: {
    Evaluation: (on) => on('IfStatement', Evaluation_IfStatement),
  },
};

// export const switchStatement: Plugin = {
//   id: 'switchStatement',
//   syntax: {
//     Evaluation: (on) => on('SwitchStatement', Evaluation_SwitchStatement),
//   },
// };

export const breakContinue: Plugin = {
  syntax: {
    Evaluation(on) {
      on('BreakStatement', Evaluation_BreakStatement);
      on('ContinueStatement', Evaluation_ContinueStatement);
    },
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
function ForDeclarationBindingInitialization(
  $: VM,
  value: Val,
  environment: DeclarativeEnvironmentRecord | undefined,
): ECR<UNUSED> {
  return BindingInitialization(value, environment);

  // TODO - ???

}

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

// TODO - 14.11 with???
// TODO - 14.12 switch

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
