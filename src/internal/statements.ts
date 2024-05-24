// 14

import { BlockStatement, Node, VariableDeclaration } from "estree";
import { Assert } from "./assert";
import { CR, CastNotAbrupt, IsAbrupt, UpdateEmpty } from "./completion_record";
import { EMPTY, UNUSED } from "./enums";
import { DeclarativeEnvironmentRecord, EnvironmentRecord } from "./environment_record";
import { InstantiateFunctionObject } from "./func";
import { BoundNames, IsConstantDeclaration, LexicallyScopedDeclarations } from "./static/scope";
import { EvalGen, VM } from "./vm";
import { Val } from "./val";
import { ResolveBinding } from "./execution_context";
import { InitializeReferencedBinding } from "./reference_record";
import { IsAnonymousFunctionDefinition, NamedEvaluation } from "./static/functions";

/**
 * 14.2.2 Runtime Semantics: Evaluation
 *
 * Block : { }
 * 1. Return empty.
 *
 * Block : { StatementList }
 * 1. Let oldEnv be the running execution context's LexicalEnvironment.
 * 2. Let blockEnv be NewDeclarativeEnvironment(oldEnv).
 * 3. Perform BlockDeclarationInstantiation(StatementList, blockEnv).
 * 4. Set the running execution context's LexicalEnvironment to blockEnv.
 * 5. Let blockValue be Completion(Evaluation of StatementList).
 * 6. Set the running execution context's LexicalEnvironment to oldEnv.
 * 7. Return ? blockValue.
 *
 * NOTE 1: No matter how control leaves the Block the
 * LexicalEnvironment is always restored to its former state.
 *
 * StatementList : StatementList StatementListItem
 * 1. Let sl be ? Evaluation of StatementList.
 * 2. Let s be Completion(Evaluation of StatementListItem).
 * 3. Return ? UpdateEmpty(s, sl).
 *
 * NOTE 2: The value of a StatementList is the value of the last
 * value-producing item in the StatementList. For example, the
 * following calls to the eval function all return the value 1:
 *
 * eval("1;;;;;")
 * eval("1;{}")
 * eval("1;var a;")
 */
export function* Evaluation_BlockStatement($: VM, n: BlockStatement): EvalGen<CR<Val|EMPTY>> {
  if (!n.body.length) return EMPTY;
  const context = $.getRunningContext();
  const oldEnv = context.LexicalEnvironment || null;
  const blockEnv = new DeclarativeEnvironmentRecord(oldEnv);
  BlockDeclarationInstantiation($, n, blockEnv);
  context.LexicalEnvironment = blockEnv;
  let blockValue: CR<Val> = yield* $.evaluateValue(n.body[0]);
  try {
    for (let i = 1; i < n.body.length; i++) {
      if (IsAbrupt(blockValue)) return blockValue;
      const stmt = n.body[i];
      const s = yield* $.evaluateValue(stmt);
      blockValue = UpdateEmpty(s, blockValue);
    }
  } finally {
    context.LexicalEnvironment = oldEnv || undefined;
  }
  return blockValue;
}

/**
 * 14.2.3 BlockDeclarationInstantiation ( code, env )
 *
 * The abstract operation BlockDeclarationInstantiation takes
 * arguments code (a Parse Node) and env (a Declarative Environment
 * Record) and returns unused. code is the Parse Node corresponding to
 * the body of the block. env is the Environment Record in which
 * bindings are to be created.cccccbenfndbeufgkgfdrietdkbkrjggnvkuthuddbrt

 *
 * NOTE: When a Block or CaseBlock is evaluated a new Declarative
 * Environment Record is created and bindings for each block scoped
 * variable, constant, function, or class declared in the block are
 * instantiated in the Environment Record.
 *
 * It performs the following steps when called:
 */
export function BlockDeclarationInstantiation($: VM, code: Node, env: EnvironmentRecord): UNUSED {
  // 1. Let declarations be the LexicallyScopedDeclarations of code.
  const declarations = LexicallyScopedDeclarations(code);
  // 2. Let privateEnv be the running execution context's PrivateEnvironment.
  const privateEnv = $.getRunningContext().PrivateEnvironment;
  // 3. For each element d of declarations, do
  for (const d of declarations) {
    //   a. For each element dn of the BoundNames of d, do
    for (const dn of BoundNames(d)) {
      //     i. If IsConstantDeclaration of d is true, then
      //         1. Perform ! env.CreateImmutableBinding(dn, true).
      //     ii. Else,
      //         1. Perform ! env.CreateMutableBinding(dn, false). NOTE: This step is replaced in section B.3.2.6.
      CastNotAbrupt(IsConstantDeclaration(d) ?
        env.CreateImmutableBinding($, dn, true) :
        env.CreateMutableBinding($, dn, false));
    }
    //   b. If d is either a FunctionDeclaration, a GeneratorDeclaration, an AsyncFunctionDeclaration, or an AsyncGeneratorDeclaration, then
    if (d.type === 'FunctionDeclaration') {
    //       i. Let fn be the sole element of the BoundNames of d.
    //       ii. Let fo be InstantiateFunctionObject of d with arguments env and privateEnv.
    //       iii. Perform ! env.InitializeBinding(fn, fo). NOTE: This step is replaced in section B.3.2.6.
      const [fn, ...rest] = BoundNames(d);
      Assert(fn != null && !rest.length);
      const fo = InstantiateFunctionObject($, env, privateEnv, d);
      CastNotAbrupt(env.InitializeBinding($, fn, fo));
    }
  }
  // 4. Return unused.
  return UNUSED;
}

/**
 * 14.3.1.2 Runtime Semantics: Evaluation
 *
 * LexicalDeclaration : LetOrConst BindingList ;
 * 1. Perform ? Evaluation of BindingList.
 * 2. Return empty.
 *
 * BindingList : BindingList , LexicalBinding
 * 1. Perform ? Evaluation of BindingList.
 * 2. Return ? Evaluation of LexicalBinding.
 *
 * LexicalBinding : BindingIdentifier
 * 1. Let lhs be ! ResolveBinding(StringValue of BindingIdentifier).
 * 2. Perform ! InitializeReferencedBinding(lhs, undefined).
 * 3. Return empty.
 *
 * NOTE: A static semantics rule ensures that this form of
 * LexicalBinding never occurs in a const declaration.
 *
 * LexicalBinding : BindingIdentifier Initializer
 * 1. Let bindingId be StringValue of BindingIdentifier.
 * 2. Let lhs be ! ResolveBinding(bindingId).
 * 3. If IsAnonymousFunctionDefinition(Initializer) is true, then
 *     a. Let value be ? NamedEvaluation of Initializer with argument bindingId.
 * 4. Else,
 *     a. Let rhs be ? Evaluation of Initializer.
 *     b. Let value be ? GetValue(rhs).
 * 5. Perform ! InitializeReferencedBinding(lhs, value).
 * 6. Return empty.
 *
 * LexicalBinding : BindingPattern Initializer
 * 1. Let rhs be ? Evaluation of Initializer.
 * 2. Let value be ? GetValue(rhs).
 * 3. Let env be the running execution context's LexicalEnvironment.
 * 4. Return ? BindingInitialization of BindingPattern with arguments value and env.
 */
export function* Evaluation_LexicalDeclaration($: VM, n: VariableDeclaration): EvalGen<CR<EMPTY>> {
  Assert(n.kind !== 'var');
  for (const binding of n.declarations) {
    switch (binding.id.type) {
      case 'Identifier': {
        const lhs = CastNotAbrupt(ResolveBinding($, binding.id.name));
        if (binding.init == null) {
          // LexicalBinding : BindingIdentifier
          CastNotAbrupt(InitializeReferencedBinding($, lhs, undefined));
          return EMPTY;
        } else {
          // LexicalBinding : BindingIdentifier Initializer
          let value;
          if (IsAnonymousFunctionDefinition(binding.init)) {
            value = NamedEvaluation($, binding.init,)

            // TODO

          }
        }
      }
      case 'ObjectPattern':
      case 'ArrayPattern':
    }
  }
  return EMPTY;
}
