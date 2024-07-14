import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt, IsNormalCompletion } from './completion_record';
import { DERIVED, EMPTY } from './enums';
import { DeclarativeEnvironmentRecord, EnvironmentRecord, FunctionEnvironmentRecord, GlobalEnvironmentRecord, ObjectEnvironmentRecord } from './environment_record';
import { CodeExecutionContext, GetThisEnvironment } from './execution_context';
import { CreateBuiltinFunction, functions } from './func';
import { HostEnsureCanCompileStrings } from './fundamental';
import { prelude } from './prelude';
import { PrivateEnvironmentRecord } from './private_environment_record';
import { PropertyDescriptor, propWC } from './property_descriptor';
import { RealmRecord } from './realm_record';
import { BoundNames, IsConstantDeclaration, LexicallyScopedDeclarations, VarDeclaredNames, VarScopedDeclarations } from './static/scope';
import { BlockLike, StrictNode, visitChildren } from './tree';
import { Val } from './val';
import { ECR, Plugin, VM } from './vm';

import * as ESTree from 'estree';

export const globalEval: Plugin = {
  id: 'globalEval',
  deps: () => [prelude, functions],
  realm: {CreateIntrinsics},
  abstract: {PerformEval},
};

export function CreateIntrinsics(
  realm: RealmRecord,
  stagedGlobals: Map<string, PropertyDescriptor>,
): void {
  /**
   * 19.2.1 eval ( x )
   * 
   * This function is the %eval% intrinsic object.
   * 
   * It performs the following steps when called:
   * 
   * 1. Return ? PerformEval(x, false, false).
   */
  const globalEval = CreateBuiltinFunction(
    {Call: ($, _thisArg, [x]) => PerformEval($, x, false, false)},
    1, 'eval', {Realm: realm});
  realm.Intrinsics.set('%eval%', globalEval);
  stagedGlobals.set('eval', propWC(globalEval));
}

/**
 * 19.2.1.1 PerformEval ( x, strictCaller, direct )
 * 
 * The abstract operation PerformEval takes arguments x (an ECMAScript
 * language value), strictCaller (a Boolean), and direct (a Boolean)
 * and returns either a normal completion containing an ECMAScript
 * language value or a throw completion. It performs the following
 * steps when called:
 * 
 * 1. Assert: If direct is false, then strictCaller is also false.
 * 2. If x is not a String, return x.
 * 3. Let evalRealm be the current Realm Record.
 * 4. NOTE: In the case of a direct eval, evalRealm is the realm of
 *    both the caller of eval and of the eval function itself.
 * 5. Perform ? HostEnsureCanCompileStrings(evalRealm).
 * 6. Let inFunction be false.
 * 7. Let inMethod be false.
 * 8. Let inDerivedConstructor be false.
 * 9. Let inClassFieldInitializer be false.
 * 10. If direct is true, then
 *     a. Let thisEnvRec be GetThisEnvironment().
 *     b. If thisEnvRec is a Function Environment Record, then
 *         i. Let F be thisEnvRec.[[FunctionObject]].
 *         ii. Set inFunction to true.
 *         iii. Set inMethod to thisEnvRec.HasSuperBinding().
 *         iv. If F.[[ConstructorKind]] is derived, set inDerivedConstructor to true.
 *         v. Let classFieldInitializerName be F.[[ClassFieldInitializerName]].
 *         vi. If classFieldInitializerName is not empty, set inClassFieldInitializer to true.
 * 11. Perform the following substeps in an implementation-defined
 *     order, possibly interleaving parsing and error detection:
 *     a. Let script be ParseText(StringToCodePoints(x), Script).
 *     b. If script is a List of errors, throw a SyntaxError exception.
 *     c. If script Contains ScriptBody is false, return undefined.
 *     d. Let body be the ScriptBody of script.
 *     e. If inFunction is false and body Contains NewTarget, throw a SyntaxError exception.
 *     f. If inMethod is false and body Contains SuperProperty, throw a SyntaxError exception.
 *     g. If inDerivedConstructor is false and body Contains
 *        SuperCall, throw a SyntaxError exception.
 *     h. If inClassFieldInitializer is true and ContainsArguments of
 *        body is true, throw a SyntaxError exception.
 * 12. If strictCaller is true, let strictEval be true.
 * 13. Else, let strictEval be IsStrict of script.
 * 14. Let runningContext be the running execution context.
 * 15. NOTE: If direct is true, runningContext will be the execution
 *     context that performed the direct eval. If direct is false,
 *     runningContext will be the execution context for the invocation of
 *     the eval function.
 * 16. If direct is true, then
 *     a. Let lexEnv be NewDeclarativeEnvironment(runningContext's LexicalEnvironment).
 *     b. Let varEnv be runningContext's VariableEnvironment.
 *     c. Let privateEnv be runningContext's PrivateEnvironment.
 * 17. Else,
 *     a. Let lexEnv be NewDeclarativeEnvironment(evalRealm.[[GlobalEnv]]).
 *     b. Let varEnv be evalRealm.[[GlobalEnv]].
 *     c. Let privateEnv be null.
 * 18. If strictEval is true, set varEnv to lexEnv.
 * 19. If runningContext is not already suspended, suspend runningContext.
 * 20. Let evalContext be a new ECMAScript code execution context.
 * 21. Set evalContext's Function to null.
 * 22. Set evalContext's Realm to evalRealm.
 * 23. Set evalContext's ScriptOrModule to runningContext's ScriptOrModule.
 * 24. Set evalContext's VariableEnvironment to varEnv.
 * 25. Set evalContext's LexicalEnvironment to lexEnv.
 * 26. Set evalContext's PrivateEnvironment to privateEnv.
 * 27. Push evalContext onto the execution context stack; evalContext
 *     is now the running execution context.
 * 28. Let result be Completion(EvalDeclarationInstantiation(body,
 *     varEnv, lexEnv, privateEnv, strictEval)).
 * 29. If result.[[Type]] is normal, then
 *     a. Set result to Completion(Evaluation of body).
 * 30. If result.[[Type]] is normal and result.[[Value]] is empty, then
 *     a. Set result to NormalCompletion(undefined).
 * 31. Suspend evalContext and remove it from the execution context stack.
 * 32. Resume the context that is now on the top of the execution
 *     context stack as the running execution context.
 * 33. Return ? result.
 * 
 * NOTE: The eval code cannot instantiate variable or function
 * bindings in the variable environment of the calling context that
 * invoked the eval if either the code of the calling context or the
 * eval code is strict mode code. Instead such bindings are instantiated
 * in a new VariableEnvironment that is only accessible to the eval code.
 * Bindings introduced by let, const, or class declarations are always
 * instantiated in a new LexicalEnvironment.
 */
export function* PerformEval(
  $: VM,
  x: Val,
  strictCaller: boolean,
  direct: boolean,
): ECR<Val> {
  Assert(direct || !strictCaller);
  if (typeof x !== 'string') return x;
  const evalRealm = $.getRealm();
  const permission = HostEnsureCanCompileStrings($, evalRealm);
  if (IsAbrupt(permission)) return permission;
  let inFunction = false;
  let inMethod = false;
  let inDerivedConstructor = false;
  let inClassFieldInitializer = false;
  if (direct) {
    const thisEnvRec = GetThisEnvironment($);
    if (thisEnvRec instanceof FunctionEnvironmentRecord) {
      const F = thisEnvRec.FunctionObject;
      inFunction = true;
      inMethod = thisEnvRec.HasSuperBinding();
      if (F.ConstructorKind === DERIVED) inDerivedConstructor = true;
      if (F.ClassFieldInitializerName) inClassFieldInitializer = true;
    }
  }
  // 11.
  const runningContext = $.getRunningContext();
  const privateEnv = direct ? runningContext.PrivateEnvironment : null;
  const privateNames = allPrivateNames(privateEnv);
  const body = parse($, x, {
    inFunction,
    inMethod,
    inDerivedConstructor,
    inClassFieldInitializer,
    privateNames,
  });
  if (IsAbrupt(body)) return body;
  const strictEval = Boolean(strictCaller || (body as StrictNode).strict);
  const lexEnv = new DeclarativeEnvironmentRecord(
    (direct ? runningContext.LexicalEnvironment : evalRealm.GlobalEnv) ?? null);
  let varEnv = direct ? runningContext.VariableEnvironment : evalRealm.GlobalEnv;
  // 18.
  if (strictEval) varEnv = lexEnv;
  const evalContext =
    new CodeExecutionContext(
      runningContext.ScriptOrModule, null, evalRealm, privateEnv, lexEnv, varEnv!);
  $.enterContext(evalContext);
  // 28.
  let result = yield* EvalDeclarationInstantiation($, body, varEnv!, lexEnv, privateEnv!, strictEval);
  if (IsNormalCompletion(result)) {
    result = yield* $.evaluateValue(body);
    if (EMPTY.is(result)) result = undefined;
  }
  $.popContext(evalContext);
  return result;
}

interface ParseContext {
  inFunction: boolean;
  inMethod: boolean;
  inDerivedConstructor: boolean;
  inClassFieldInitializer: boolean;
  privateNames: Set<string>,
}
function parse(
  $: VM,
  x: string,
  {
    inFunction,
    inMethod,
    inDerivedConstructor,
    inClassFieldInitializer,
    privateNames,
  }: ParseContext,
): CR<BlockLike> {
  // NOTE: Wrap in a derived constructor to support `super` and `#x`
  const privates = [...privateNames].map((name) => `#${name};`).join('');
  let script: string;
  let unpack: (node: any) => any;
  if (inClassFieldInitializer) {
    script = `(class { static { { ${x} } } ${privates} })`;
    unpack = node => node.body[0].expression.body.body[0].body[0];
  } else if (inDerivedConstructor) {
    script = `(class extends class {} { constructor() { ${x} } ${privates} })`;
    unpack = node => node.body[0].expression.body.body[0].value.body;
  } else if (inMethod) {
    script = `(class extends class {} { method() { ${x} } ${privates} })`;
    unpack = node => node.body[0].expression.body.body[0].value.body;
  } else if (inFunction) {
    script = `(function() { ${x} })`;
    unpack = node => node.body[0].expression.body;
  } else {
    script = x;
    unpack = node => node;
  }
  const full = $.parseScript(script);
  if (IsAbrupt(full)) return full;
  const body: BlockLike = unpack(full);
  if (hasReturn(body)) {
    return $.throw('SyntaxError', 'illegal return statement');
  }
  return body;
}

function hasReturn(n: ESTree.Node): boolean {
  switch (n.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ClassBody':
      return false;
    case 'ReturnStatement':
      return true;
    default:
      let found = false;
      visitChildren(n, c => {
        if (hasReturn(c)) found = true;
      });
      return found;
  }
}

/**
 * 19.2.1.3 EvalDeclarationInstantiation ( body, varEnv, lexEnv, privateEnv, strict )
 * 
 * The abstract operation EvalDeclarationInstantiation takes arguments
 * body (a ScriptBody Parse Node), varEnv (an Environment Record),
 * lexEnv (a Declarative Environment Record), privateEnv (a
 * PrivateEnvironment Record or null), and strict (a Boolean) and
 * returns either a normal completion containing unused or a throw
 * completion. It performs the following steps when called:
 * 
 * 1. Let varNames be the VarDeclaredNames of body.
 * 2. Let varDeclarations be the VarScopedDeclarations of body.
 * 3. If strict is false, then
 *     a. If varEnv is a Global Environment Record, then
 *         i. For each element name of varNames, do
 *             1. If varEnv.HasLexicalDeclaration(name) is true, throw a
 *                SyntaxError exception.
 *             2. NOTE: eval will not create a global var declaration that would
 *                be shadowed by a global lexical declaration.
 *     b. Let thisEnv be lexEnv.
 *     c. Assert: The following loop will terminate.
 *     d. Repeat, while thisEnv is not varEnv,
 *         i. If thisEnv is not an Object Environment Record, then
 *             1. NOTE: The environment of with statements cannot contain any
 *                lexical declaration so it doesn't need to be checked for var/let
 *                hoisting conflicts.
 *             2. For each element name of varNames, do
 *                 a. If ! thisEnv.HasBinding(name) is true, then
 *                     i. Throw a SyntaxError exception.
 *                     ii. NOTE: Annex B.3.4 defines alternate semantics for the above step.
 *                 b. NOTE: A direct eval will not hoist var declaration over a
 *                    like-named lexical declaration.
 *         ii. Set thisEnv to thisEnv.[[OuterEnv]].
 * 4. Let privateIdentifiers be a new empty List.
 * 5. Let pointer be privateEnv.
 * 6. Repeat, while pointer is not null,
 *     a. For each Private Name binding of pointer.[[Names]], do
 *         i. If privateIdentifiers does not contain
 *            binding.[[Description]], append binding.[[Description]] to
 *            privateIdentifiers.
 *     b. Set pointer to pointer.[[OuterPrivateEnvironment]].
 * 7. If AllPrivateIdentifiersValid of body with argument
 *    privateIdentifiers is false, throw a SyntaxError exception.
 * 8. Let functionsToInitialize be a new empty List.
 * 9. Let declaredFunctionNames be a new empty List.
 * 10. For each element d of varDeclarations, in reverse List order, do
 *     a. If d is not either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
 *         i. Assert: d is either a FunctionDeclaration, a
 *            GeneratorDeclaration, an AsyncFunctionDeclaration, or an
 *            AsyncGeneratorDeclaration.
 *         ii. NOTE: If there are multiple function declarations for
 *             the same name, the last declaration is used.
 *         iii. Let fn be the sole element of the BoundNames of d.
 *         iv. If declaredFunctionNames does not contain fn, then
 *             1. If varEnv is a Global Environment Record, then
 *                 a. Let fnDefinable be ? varEnv.CanDeclareGlobalFunction(fn).
 *                 b. If fnDefinable is false, throw a TypeError exception.
 *             2. Append fn to declaredFunctionNames.
 *             3. Insert d as the first element of functionsToInitialize.
 * 11. NOTE: Annex B.3.2.3 adds additional steps at this point.
 * 12. Let declaredVarNames be a new empty List.
 * 13. For each element d of varDeclarations, do
 *     a. If d is either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
 *         i. For each String vn of the BoundNames of d, do
 *             1. If declaredFunctionNames does not contain vn, then
 *                 a. If varEnv is a Global Environment Record, then
 *                     i. Let vnDefinable be ? varEnv.CanDeclareGlobalVar(vn).
 *                     ii. If vnDefinable is false, throw a TypeError exception.
 *                 b. If declaredVarNames does not contain vn, then
 *                     i. Append vn to declaredVarNames.
 * 14. NOTE: No abnormal terminations occur after this algorithm step
 *     unless varEnv is a Global Environment Record and the global object
 *     is a Proxy exotic object.
 * 15. Let lexDeclarations be the LexicallyScopedDeclarations of body.
 * 16. For each element d of lexDeclarations, do
 *     a. NOTE: Lexically declared names are only instantiated here but not initialized.
 *     b. For each element dn of the BoundNames of d, do
 *         i. If IsConstantDeclaration of d is true, then
 *             1. Perform ? lexEnv.CreateImmutableBinding(dn, true).
 *         ii. Else,
 *             1. Perform ? lexEnv.CreateMutableBinding(dn, false).
 * 17. For each Parse Node f of functionsToInitialize, do
 *     a. Let fn be the sole element of the BoundNames of f.
 *     b. Let fo be InstantiateFunctionObject of f with arguments lexEnv and privateEnv.
 *     c. If varEnv is a Global Environment Record, then
 *         i. Perform ? varEnv.CreateGlobalFunctionBinding(fn, fo, true).
 *     d. Else,
 *         i. Let bindingExists be ! varEnv.HasBinding(fn).
 *         ii. If bindingExists is false, then
 *             1. NOTE: The following invocation cannot return an abrupt
 *                completion because of the validation preceding step 14.
 *             2. Perform ! varEnv.CreateMutableBinding(fn, true).
 *             3. Perform ! varEnv.InitializeBinding(fn, fo).
 *         iii. Else,
 *             1. Perform ! varEnv.SetMutableBinding(fn, fo, false).
 * 18. For each String vn of declaredVarNames, do
 *     a. If varEnv is a Global Environment Record, then
 *         i. Perform ? varEnv.CreateGlobalVarBinding(vn, true).
 *     b. Else,
 *         i. Let bindingExists be ! varEnv.HasBinding(vn).
 *         ii. If bindingExists is false, then
 *             1. NOTE: The following invocation cannot return an abrupt
 *                completion because of the validation preceding step 14.
 *             2. Perform ! varEnv.CreateMutableBinding(vn, true).
 *             3. Perform ! varEnv.InitializeBinding(vn, undefined).
 * 19. Return unused.
 * 
 * NOTE: An alternative version of this algorithm is described in B.3.4.
 */
export function* EvalDeclarationInstantiation(
  $: VM,
  body: BlockLike,
  varEnv: EnvironmentRecord,
  lexEnv: DeclarativeEnvironmentRecord,
  privateEnv: PrivateEnvironmentRecord,
  strict: boolean,
): ECR<Val> {
  const varNames = VarDeclaredNames(body);
  const varDeclarations = VarScopedDeclarations(body);
  if (!strict) {
    if (varEnv instanceof GlobalEnvironmentRecord) {
      for (const name of varNames) {
        if (varEnv.HasLexicalDeclaration($, name)) {
          return $.throw('SyntaxError', 'var shadowed by lexical declaration');
        }
      }
    }
    let thisEnv: EnvironmentRecord = lexEnv;
    while (thisEnv !== varEnv) {
      if (!(thisEnv instanceof ObjectEnvironmentRecord)) {
        for (const name of varNames) {
          if (CastNotAbrupt(thisEnv.HasBinding($, name))) {
            return $.throw('SyntaxError', 'var shadowed by lexical declaration');
          }
        }
      }
      Assert(thisEnv.OuterEnv);
      thisEnv = thisEnv.OuterEnv;
    }
  }
  // 4.
  const privateIdentifiers = new Set<string>();
  let pointer: PrivateEnvironmentRecord|null = privateEnv;
  while (pointer) {
    for (const binding of pointer.Names.values()) {
      privateIdentifiers.add(binding.Description);
    }
    pointer = pointer.OuterPrivateEnvironment;
  }
  // 7. NOTE: Acorn handles bad privates as a parse error
  // 8.
  const functionsToInitialize: ESTree.Node[] = [];
  const declaredFunctionNames = new Set<string>();
  for (const d of varDeclarations.reverse()) {
    if (d.type !== 'FunctionExpression') continue;
    const fn = BoundNames(d)[0];
    if (!declaredFunctionNames.has(fn)) {
      if (varEnv instanceof GlobalEnvironmentRecord) {
        const fnDefinable = varEnv.CanDeclareGlobalFunction($, fn);
        if (IsAbrupt(fnDefinable)) return fnDefinable;
        if (!fnDefinable) return $.throw('TypeError', 'cannot declare global function');
      }
      declaredFunctionNames.add(fn);
      functionsToInitialize.unshift(d);
    }
  }
  // 12.
  const declaredVarNames: string[] = [];
  for (const d of varDeclarations) {
    if (d.type === 'VariableDeclaration') {
      for (const vn of BoundNames(d)) {
        if (!declaredFunctionNames.has(vn)) {
          if (varEnv instanceof GlobalEnvironmentRecord) {
            const vnDefinable = varEnv.CanDeclareGlobalVar($, vn);
            if (IsAbrupt(vnDefinable)) return vnDefinable;
            if (!vnDefinable) return $.throw('TypeError', 'cannot declare global var');
          }
          if (!declaredVarNames.includes(vn)) {
            declaredVarNames.push(vn);
          }
        }
      }
    }
  }
  // 15.
  const lexDeclarations = LexicallyScopedDeclarations(body);
  for (const d of lexDeclarations) {
    for (const dn of BoundNames(d)) {
      const status = IsConstantDeclaration(d) ?
        lexEnv.CreateImmutableBinding($, dn, true) :
        lexEnv.CreateMutableBinding($, dn, false);
      if (IsAbrupt(status)) return status;
    }
  }
  // 17.
  for (const f of functionsToInitialize) {
    const fn = BoundNames(f)[0];
    const fo = $.InstantiateFunctionObject(f, lexEnv, privateEnv);
    if (varEnv instanceof GlobalEnvironmentRecord) {
      const status = yield* varEnv.CreateGlobalFunctionBinding($, fn, fo, true);
      if (IsAbrupt(status)) return status;
    } else {
      const bindingExists = varEnv.HasBinding($, fn);
      if (IsAbrupt(bindingExists)) return bindingExists;
      if (!bindingExists) {
        CastNotAbrupt(varEnv.CreateMutableBinding($, fn, true));
        CastNotAbrupt(yield* varEnv.InitializeBinding($, fn, fo));
      } else {
        CastNotAbrupt(yield* varEnv.SetMutableBinding($, fn, fo, false));
      }
    }
  }
  // 18.
  for (const vn of declaredVarNames) {
    if (varEnv instanceof GlobalEnvironmentRecord) {
      yield* varEnv.CreateGlobalVarBinding($, vn, true);
    } else {
      const bindingExists = varEnv.HasBinding($, vn);
      if (!bindingExists) {
        CastNotAbrupt(varEnv.CreateMutableBinding($, vn, true));
        CastNotAbrupt(yield* varEnv.InitializeBinding($, vn, undefined));
      }
    }
  }
  return undefined;
}


function allPrivateNames(privateEnv: PrivateEnvironmentRecord|null): Set<string> {
  const privateNames = new Set<string>();
  let pointer = privateEnv;
  while (pointer) {
    for (const name of pointer.Names.keys()) {
      privateNames.add(name);
    }
    pointer = pointer.OuterPrivateEnvironment;
  }
  return privateNames;
}
