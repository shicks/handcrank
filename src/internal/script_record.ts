import { RealmRecord } from './realm_record';
import * as ESTree from 'estree';
import { ECR, VM } from './vm';
import { CR, IsAbrupt } from './completion_record';
import { Val } from './val';
import { CodeExecutionContext } from './execution_context';
import { UNUSED } from './enums';
import { Assert } from './assert';
import { BoundNames, IsConstantDeclaration, LexicallyDeclaredNames, LexicallyScopedDeclarations, VarDeclaredNames, VarScopedDeclarations } from './static/scope';
import { GlobalEnvironmentRecord } from './environment_record';
import { analyze } from './static/errors';

/**
 * 16.1.4 Script Records
 *
 * A Script Record encapsulates information about a script being
 * evaluated.
 */
export class ScriptRecord {

  // /**
  //  * A map from the specifier strings imported by this script to the
  //  * resolved Module Record. The list does not contain two different
  //  * Records with the same [[Specifier]].
  //  */
  // a List of Records with fields [[Specifier]] (a String) and [[Module]] (a Module Record)
  // LoadedModules: LoadedModuleRecord[] = [];

  constructor(
    /**
     * The realm within which this script was created. undefined if
     * not yet assigned.
     * @see https://github.com/tc39/ecma262/issues/3326
     */
    readonly Realm: RealmRecord|undefined,
    /** The result of parsing the source text of this script. */
    readonly ECMAScriptCode: ESTree.Program,
    /**
     * Field reserved for use by host environments that need to associate
     * additional information with a script.
     */
    readonly HostDefined?: unknown,
  ) {}
}

/**
 * 16.1.5 ParseScript ( sourceText, realm, hostDefined )
 *
 * The abstract operation ParseScript takes arguments sourceText
 * (ECMAScript source text), realm (a Realm Record or undefined), and
 * hostDefined (anything) and returns a Script Record or a non-empty
 * List of SyntaxError objects. It creates a Script Record based upon
 * the result of parsing sourceText as a Script. It performs the
 * following steps when called:
 */
export function ParseScript(script: ESTree.Program,
                            realm: RealmRecord|undefined,
                            hostDefined: unknown): ScriptRecord|string[] {

  // NOTE: An implementation may parse script source text and analyse
  // it for Early Error conditions prior to evaluation of ParseScript
  // for that script source text. However, the reporting of any errors
  // must be deferred until the point where this specification
  // actually performs ParseScript upon that source text.
  const errors = analyze(script);
  if (errors.length) return errors;
  return new ScriptRecord(realm, script, hostDefined);
}

/**
 * 16.1.6 ScriptEvaluation ( scriptRecord )
 *
 * The abstract operation ScriptEvaluation takes argument scriptRecord
 * (a Script Record) and returns either a normal completion containing
 * an ECMAScript language value or an abrupt completion. It performs
 * the following steps when called:
 */
export function* ScriptEvaluation($: VM, scriptRecord: ScriptRecord): ECR<Val> {

  const globalEnv = scriptRecord.Realm?.GlobalEnv;
  if (!globalEnv) throw new Error('no global env!');
  // TODO - this isn't quite right... need to use the InitHost... op.
  const scriptContext = new CodeExecutionContext(
    scriptRecord /* ScriptOrModule */,
    null /* Function */,
    scriptRecord.Realm /* Realm */,
    null /* PrivateEnvironmentRecord */,
    globalEnv /* LexicalEnvironment */,
    globalEnv /* VariableEnvironment */,
    // 8. Set the PrivateEnvironment of scriptContext to null.
  );
  $.getRunningContext().suspend();
  $.enterContext(scriptContext);
  const script = scriptRecord.ECMAScriptCode;
  let result: CR<UNUSED|Val> =
    yield* GlobalDeclarationInstantiation($, script, globalEnv);
  if (!IsAbrupt(result)) { // NOTE: does not rethrow!
    result = yield* $.evaluateValue(script);
  }
  // 14. Suspend scriptContext and remove it from the execution context stack.
  // 15. Assert: The execution context stack is not empty.
  // 16. Resume the context that is now on the top of the execution context
  //     stack as the running execution context.
  $.popContext(scriptContext);
  // 17. Return ? result.
  return result;
}

/**
 * 16.1.7 GlobalDeclarationInstantiation ( script, env )
 *
 * The abstract operation GlobalDeclarationInstantiation takes
 * arguments script (a Script Parse Node) and env (a Global
 * Environment Record) and returns either a normal completion
 * containing unused or a throw completion. script is the Script for
 * which the execution context is being established. env is the global
 * environment in which bindings are to be created.
 *
 * NOTE 1: When an execution context is established for evaluating
 * scripts, declarations are instantiated in the current global
 * environment. Each global binding declared in the code is
 * instantiated.
 *
 * NOTE 2: Early errors specified in 16.1.1 prevent name conflicts
 * between function/var declarations and let/const/class declarations
 * as well as redeclaration of let/const/class bindings for
 * declaration contained within a single Script. However, such
 * conflicts and redeclarations that span more than one Script are
 * detected as runtime errors during
 * GlobalDeclarationInstantiation. If any such errors are detected, no
 * bindings are instantiated for the script. However, if the global
 * object is defined using Proxy exotic objects then the runtime tests
 * for conflicting declarations may be unreliable resulting in an
 * abrupt completion and some global declarations not being
 * instantiated. If this occurs, the code for the Script is not
 * evaluated.
 *
 * Unlike explicit var or function declarations, properties that are
 * directly created on the global object result in global bindings
 * that may be shadowed by let/const/class declarations.
 */
export function* GlobalDeclarationInstantiation(
  $: VM,
  script: ESTree.Program,
  env: GlobalEnvironmentRecord,
): ECR<UNUSED> {
  // 1. Let lexNames be the LexicallyDeclaredNames of script.
  // NOTE: To enforce the early error in 14.2.1, that lexNames
  // and varNames are disjoint, we make lexNames a set and
  // check against it in the varNames loop.
  const lexNames = LexicallyDeclaredNames(script);
  // 2. Let varNames be the VarDeclaredNames of script.
  const varNames = VarDeclaredNames(script);
  for (const name of lexNames) {
    //   a. If env.HasVarDeclaration(name) is true, throw a SyntaxError exception.
    if (env.HasVarDeclaration($, name)) {
      return $.throw('SyntaxError',
                   `Identifier '${name}' has already been declared`);
    }
    //   b. If env.HasLexicalDeclaration(name) is true, throw a SyntaxError exception.
    if (env.HasLexicalDeclaration($, name)) {
      return $.throw('SyntaxError', `Identifier '${name}' has already been declared`);
    }
    //   c. Let hasRestrictedGlobal be ? env.HasRestrictedGlobalProperty(name).
    const hasRestrictedGlobal = env.HasRestrictedGlobalProperty($, name);
    if (IsAbrupt(hasRestrictedGlobal)) return hasRestrictedGlobal;
    //   d. If hasRestrictedGlobal is true, throw a SyntaxError exception.
    if (hasRestrictedGlobal) return $.throw('SyntaxError');
  }
  // 4. For each element name of varNames, do
  for (const name of varNames) {
    //   a. If env.HasLexicalDeclaration(name) is true, throw a SyntaxError exception.
    if (env.HasLexicalDeclaration($, name)) {
      return $.throw('SyntaxError',
                   `Identifier '${name}' has already been declared`);
    }
  }
  // 5. Let varDeclarations be the VarScopedDeclarations of script.
  const varDeclarations = VarScopedDeclarations(script);

  // 6. Let functionsToInitialize be a new empty List.
  const functionsToInitialize: ESTree.FunctionDeclaration[] = [];
  // 7. Let declaredFunctionNames be a new empty List.
  const declaredFunctionNames = new Set<string>();
  // 8. For each element d of varDeclarations, in reverse List order, do
  for (const d of varDeclarations.reverse()) {
    //   a. If d is not either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
    //       i. Assert: d is either a FunctionDeclaration, a GeneratorDeclaration,
    //          an AsyncFunctionDeclaration, or an AsyncGeneratorDeclaration.
    //       ii. NOTE: If there are multiple function declarations for the same name,
    //           the last declaration is used.
    if (d.type === 'FunctionDeclaration') {
      //     iii. Let fn be the sole element of the BoundNames of d.
      const [fn, ...rest] = BoundNames(d);
      Assert(!rest.length);
      //     iv. If declaredFunctionNames does not contain fn, then
      if (declaredFunctionNames.has(fn)) continue;
      //         1. Let fnDefinable be ? env.CanDeclareGlobalFunction(fn).
      const fnDefinable = env.CanDeclareGlobalFunction($, fn);
      if (IsAbrupt(fnDefinable)) return fnDefinable;
      //         2. If fnDefinable is false, throw a TypeError exception.
      if (!fnDefinable) return $.throw('TypeError');
      //         3. Append fn to declaredFunctionNames.
      declaredFunctionNames.add(fn);
      //         4. Insert d as the first element of functionsToInitialize.
      functionsToInitialize.push(d);
    }
  }
  functionsToInitialize.reverse();

  // 9. Let declaredVarNames be a new empty List.
  const declaredVarNames = new Set<string>();
  // 10. For each element d of varDeclarations, do
  for (const d of varDeclarations) {
    //   a. If d is either a VariableDeclaration, a ForBinding, or a BindingIdentifier, then
    if (d.type !== 'FunctionDeclaration') {
      //     i. For each String vn of the BoundNames of d, do
      for (const vn of BoundNames(d)) {
        //       1. If declaredFunctionNames does not contain vn, then
        if (!declaredFunctionNames.has(vn)) {
          //         a. Let vnDefinable be ? env.CanDeclareGlobalVar(vn).
          const vnDefinable = env.CanDeclareGlobalVar($, vn);
          if (IsAbrupt(vnDefinable)) return vnDefinable;
          //         b. If vnDefinable is false, throw a TypeError exception.
          if (!vnDefinable) return $.throw('TypeError');
          //         c. If declaredVarNames does not contain vn, then
          //             i. Append vn to declaredVarNames.
          declaredVarNames.add(vn);
        }
      }
    }
  }

  // 11. NOTE: No abnormal terminations occur after this algorithm step
  //     if the global object is an ordinary object. However, if the global
  //     object is a Proxy exotic object it may exhibit behaviours that
  //     cause abnormal terminations in some of the following steps.
  // 12. NOTE: Annex B.3.2.2 adds additional steps at this point.

  // 13. Let lexDeclarations be the LexicallyScopedDeclarations of script.
  const lexDeclarations = LexicallyScopedDeclarations(script);
  // 14. Let privateEnv be null.
  let privateEnv = null;
  // 15. For each element d of lexDeclarations, do
  for (const d of lexDeclarations) {
    //   a. NOTE: Lexically declared names are only instantiated here but not initialized.
    //   b. For each element dn of the BoundNames of d, do
    for (const dn of BoundNames(d)) {
      //     i. If IsConstantDeclaration of d is true, then
      //         1. Perform ? env.CreateImmutableBinding(dn, true).
      //     ii. Else,
      //         1. Perform ? env.CreateMutableBinding(dn, false).
      const result = IsConstantDeclaration(d) ?
        env.CreateImmutableBinding($, dn, true) :
        env.CreateMutableBinding($, dn, false);
      if (IsAbrupt(result)) return result;
    }
  }
  // 16. For each Parse Node f of functionsToInitialize, do
  for (const f of functionsToInitialize) {
    //   a. Let fn be the sole element of the BoundNames of f.
    const [fn, ...rest] = BoundNames(f);
    Assert(!rest.length);
    //   b. Let fo be InstantiateFunctionObject of f with arguments env and privateEnv.
    const fo = $.InstantiateFunctionObject(f, env, privateEnv);
    //   c. Perform ? env.CreateGlobalFunctionBinding(fn, fo, false).
    const result = yield* env.CreateGlobalFunctionBinding($, fn, fo, false);
    if (IsAbrupt(result)) return result;
  }
  // 17. For each String vn of declaredVarNames, do
  //     a. Perform ? env.CreateGlobalVarBinding(vn, false).
  for (const vn of declaredVarNames) {
    const result = yield* env.CreateGlobalVarBinding($, vn, false);
    if (IsAbrupt(result)) return result;
  }
  // 18. Return unused.
  return UNUSED;
}
