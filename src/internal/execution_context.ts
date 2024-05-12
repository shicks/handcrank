import { Assert } from './assert';
import { CR } from './completion_record';
import { EnvironmentRecord, FunctionEnvironmentRecord, GetIdentifierReference } from './environment_record';
import { ModuleRecord } from './module_record';
import { RealmRecord } from './realm_record';
import { ReferenceRecord } from './reference_record';
import { ScriptRecord } from './script_record';
import { Func, Obj, Val } from './values';
import { VM } from './vm';

/**
 * 9.4 Execution Contexts
 *
 * An execution context is a specification device that is used to
 * track the runtime evaluation of code by an ECMAScript
 * implementation. At any point in time, there is at most one
 * execution context per agent that is actually executing code. This
 * is known as the agent\'s running execution context. All references
 * to the running execution context in this specification denote the
 * running execution context of the surrounding agent.
 *
 * The execution context stack is used to track execution
 * contexts. The running execution context is always the top element
 * of this stack. A new execution context is created whenever control
 * is transferred from the executable code associated with the
 * currently running execution context to executable code that is not
 * associated with that execution context. The newly created execution
 * context is pushed onto the stack and becomes the running execution
 * context.
 *
 * An execution context contains whatever implementation specific
 * state is necessary to track the execution progress of its
 * associated code. Each execution context has at least the state
 * components listed below:
 *
 *  - code evaluation state - Any state needed to perform, suspend, and
 *    resume evaluation of the code associated with this execution
 *    context.
 *  - Function - If this execution context is evaluating the code of a
 *    function object, then the value of this component is that function
 *    object. If the context is evaluating the code of a Script or
 *    Module, the value is null.
 *  - Realm - The Realm Record from which associated code accesses
 *    ECMAScript resources.
 *  - ScriptOrModule - The Module Record or Script Record from which
 *    associated code originates. If there is no originating script or
 *    module, as is the case for the original execution context created
 *    in InitializeHostDefinedRealm, the value is null.
 *
 * Evaluation of code by the running execution context may be
 * suspended at various points defined within this specification. Once
 * the running execution context has been suspended a different
 * execution context may become the running execution context and
 * commence evaluating its code. At some later time a suspended
 * execution context may again become the running execution context
 * and continue evaluating its code at the point where it had
 * previously been suspended. Transition of the running execution
 * context status among execution contexts usually occurs in
 * stack-like last-in/first-out manner. However, some ECMAScript
 * features require non-LIFO transitions of the running execution
 * context.
 *
 * The value of the Realm component of the running execution context
 * is also called the current Realm Record. The value of the Function
 * component of the running execution context is also called the
 * active function object.
 *
 * An execution context is purely a specification mechanism and need
 * not correspond to any particular artefact of an ECMAScript
 * implementation. It is impossible for ECMAScript code to directly
 * access or observe an execution context.
 */
export class ExecutionContext {

  // TODO - is there an ExecutionContext that isn't a CodeExecutionContext?
  //      - if so, then maybe the ctor params below are pulled out for code only

  isStrict: boolean = false;

  constructor(
    readonly ScriptOrModule: ScriptRecord|ModuleRecord|null,
    readonly Function: Func|null,
    readonly Realm: RealmRecord,
    //PrivateEnvironment?: PrivateEnvironmentRecord;
    //Generator?: Gen;
  ) { }

  suspend(): void {
    // TODO ???
  }

  resume(): void {
    // TODO ???
  }
}

/**
 * ECMAScript code execution contexts have the additional state
 * components listed below
 *
 *  - LexicalEnvironment - Identifies the Environment Record used to
 *    resolve identifier references made by code within this execution
 *    context.
 *  - VariableEnvironment - Identifies the Environment Record that holds
 *    bindings created by VariableStatements within this execution
 *    context.
 *  - PrivateEnvironment - Identifies the PrivateEnvironment Record that
 *    holds Private Names created by ClassElements in the nearest
 *    containing class. null if there is no containing class.
 *
 * The LexicalEnvironment and VariableEnvironment components of an
 * execution context are always Environment Records.
 *
 * Execution contexts representing the evaluation of Generators have
 * the additional state components listed below
 *
 *  - Generator - The Generator that this execution context is evaluating.
 *
 * In most situations only the running execution context (the top of
 * the execution context stack) is directly manipulated by algorithms
 * within this specification. Hence when the terms
 * “LexicalEnvironment”, and “VariableEnvironment” are used without
 * qualification they are in reference to those components of the
 * running execution context.
 */
export class CodeExecutionContext extends ExecutionContext {
  constructor(
    ScriptOrModule: ScriptRecord|ModuleRecord|null,
    Function: Func|null,
    Realm: RealmRecord,
    readonly LexicalEnvironment: EnvironmentRecord,
    readonly VariableEnvironment: EnvironmentRecord,
  ) { super(ScriptOrModule, Function, Realm); }
}

export function GetLexicalEnvironment($: VM): EnvironmentRecord|undefined {
  const ctx = $.getRunningContext();
  return ctx instanceof CodeExecutionContext ? ctx.LexicalEnvironment : undefined;
}

export function GetVariableEnvironment($: VM): EnvironmentRecord|undefined {
  const ctx = $.getRunningContext();
  return ctx instanceof CodeExecutionContext ? ctx.VariableEnvironment : undefined;
}

/**
 * 9.4.1 GetActiveScriptOrModule ( )
 *
 * The abstract operation GetActiveScriptOrModule takes no arguments
 * and returns a Script Record, a Module Record, or null. It is used
 * to determine the running script or module, based on the running
 * execution context. It performs the following steps when called:
 */
export function GetActiveScriptOrModule($: VM): ScriptRecord|ModuleRecord|null {
  if ($.executionStack.length < 1) return null;
  for (let i = $.executionStack.length - 1; i >= 0; i--) {
    const sm = $.executionStack[i].ScriptOrModule;
    if (sm != null) return sm;
  }
  return null;
}

/**
 * 9.4.2 ResolveBinding ( name [ , env ] )
 *
 * The abstract operation ResolveBinding takes argument name (a
 * String) and optional argument env (an Environment Record or
 * undefined) and returns either a normal completion containing a
 * Reference Record or a throw completion. It is used to determine the
 * binding of name. env can be used to explicitly provide the
 * Environment Record that is to be searched for the binding. It
 * performs the following steps when called:
 *
 * NOTE: The result of ResolveBinding is always a Reference Record
 * whose [[ReferencedName]] field is name.
 */
export function ResolveBinding($: VM, name: string,
                               env?: EnvironmentRecord): CR<ReferenceRecord> {
  env ??= GetLexicalEnvironment($);
  Assert(env instanceof EnvironmentRecord);
  // TODO - 3. If the source text matched by the syntactic production
  // that is being evaluated is contained in strict mode code, let
  // strict be true; else let strict be false.
  //      -> how do we determine this? what is it hung onto?
  const strict = null!; // ???
  return GetIdentifierReference($, env, name, strict);
}

/**
 * 9.4.3 GetThisEnvironment ( )
 *
 * The abstract operation GetThisEnvironment takes no arguments and
 * returns an Environment Record. It finds the Environment Record that
 * currently supplies the binding of the keyword this. It performs the
 * following steps when called:
 */
export function GetThisEnvironment($: VM): EnvironmentRecord {
  let env = GetLexicalEnvironment($);
  Assert(env instanceof EnvironmentRecord); // NOTE: this assert not in spec
  // NOTE: The loop in step 2 will always terminate because the list
  // of environments always ends with the global environment which has
  // a this binding.
  for (;;) {
    const exists = env.HasThisBinding();
    if (exists) return env;
    Assert(env.OuterEnv != null);
    env = env.OuterEnv;
  }
}

/**
 * 9.4.4 ResolveThisBinding ( )
 *
 * The abstract operation ResolveThisBinding takes no arguments and
 * returns either a normal completion containing an ECMAScript
 * language value or a throw completion. It determines the binding of
 * the keyword this using the LexicalEnvironment of the running
 * execution context. It performs the following steps when called:
 */
export function ResolveThisBinding($: VM): CR<Val> {
  return GetThisEnvironment($).GetThisBinding();
}

/**
 * 9.4.5 GetNewTarget ( )
 *
 * The abstract operation GetNewTarget takes no arguments and returns
 * an Object or undefined. It determines the NewTarget value using the
 * LexicalEnvironment of the running execution context. It performs
 * the following steps when called:
 */
export function GetNewTarget($: VM): Obj|undefined {
  const envRec = GetThisEnvironment($);
  Assert(envRec instanceof FunctionEnvironmentRecord);
  return envRec.NewTarget;
}

/**
 * 9.4.6 GetGlobalObject ( )
 *
 * The abstract operation GetGlobalObject takes no arguments and
 * returns an Object. It returns the global object used by the
 * currently running execution context. It performs the following
 * steps when called:
 */
export function GetGlobalObject($: VM): Obj {
  return $.getRunningContext().Realm.GlobalObject!;
}
