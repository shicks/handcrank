import { IsCallable } from './abstract_compare';
import { Call } from './abstract_object';
import { Assert } from './assert';
import { EMPTY, UNUSED } from './enums';
import { Func } from './func';
import { RealmRecord } from './realm_record';
import { Val } from './val';
import { ECR, VM } from './vm';

/**
 * @fileoverview
 *
 * 9.5 Jobs and Host Operations to Enqueue Jobs
 * 
 * A Job is an Abstract Closure with no parameters that initiates an
 * ECMAScript computation when no other ECMAScript computation is
 * currently in progress.
 * 
 * Jobs are scheduled for execution by ECMAScript host
 * environments. This specification describes the host hook
 * HostEnqueuePromiseJob to schedule one kind of job; hosts may define
 * additional abstract operations which schedule jobs. Such operations
 * accept a Job Abstract Closure as the parameter and schedule it to
 * be performed at some future time. Their implementations must
 * conform to the following requirements:
 * 
 * At some future point in time, when there is no running execution
 * context and the execution context stack is empty, the
 * implementation must:
 *   - Perform any host-defined preparation steps.
 *   - Invoke the Job Abstract Closure.
 *   - Perform any host-defined cleanup steps, after which the execution
 *     context stack must be empty.
 *   - Only one Job may be actively undergoing evaluation at any point in time.
 *   - Once evaluation of a Job starts, it must run to completion before
 *     evaluation of any other Job starts.
 *   - The Abstract Closure must return a normal completion,
 *     implementing its own handling of errors.
 *
 * NOTE 1: Host environments are not required to treat Jobs uniformly
 * with respect to scheduling. For example, web browsers and Node.js
 * treat Promise-handling Jobs as a higher priority than other work;
 * future features may add Jobs that are not treated at such a high
 * priority.
 * 
 * At any particular time, scriptOrModule (a Script Record, a Module
 * Record, or null) is the active script or module if all of the
 * following conditions are true:
 *   - GetActiveScriptOrModule() is scriptOrModule.
 *   - If scriptOrModule is a Script Record or Module Record, let ec be
 *     the topmost execution context on the execution context stack
 *     whose ScriptOrModule component is scriptOrModule. The Realm
 *     component of ec is scriptOrModule.[[Realm]].
 * 
 * At any particular time, an execution is prepared to evaluate
 * ECMAScript code if all of the following conditions are true:
 *   - The execution context stack is not empty.
 *   - The Realm component of the topmost execution context on the
 *     execution context stack is a Realm Record.
 * 
 * NOTE 2: Host environments may prepare an execution to evaluate code
 * by pushing execution contexts onto the execution context stack. The
 * specific steps are implementation-defined.
 * 
 * The specific choice of Realm is up to the host environment. This
 * initial execution context and Realm is only in use before any
 * callback function is invoked. When a callback function related to a
 * Job, like a Promise handler, is invoked, the invocation pushes its
 * own execution context and Realm.
 * 
 * Particular kinds of Jobs have additional conformance requirements.
 */

/**
 * 9.5.1 JobCallback Records
 * 
 * A JobCallback Record is a Record value used to store a function
 * object and a host-defined value. Function objects that are invoked
 * via a Job enqueued by the host may have additional host-defined
 * context. To propagate the state, Job Abstract Closures should not
 * capture and call function objects directly. Instead, use
 * HostMakeJobCallback and HostCallJobCallback.
 * 
 * NOTE: The WHATWG HTML specification (https://html.spec.whatwg.org/),
 * for example, uses the host-defined value to propagate the incumbent
 * settings object for Promise callbacks.
 * 
 * JobCallback Records have the fields listed in Table 28.
 * [[Callback]], a function object - The function to invoke when the
 * Job is invoked.
 * [[HostDefined]], anything (default value is empty) - Field reserved
 * for use by hosts.
 */
export class JobCallback{
  constructor(
    readonly Callback: Func,
    readonly HostDefined: unknown = EMPTY,
  ) {}
}

/**
 * 9.5.2 HostMakeJobCallback ( callback )
 * 
 * The host-defined abstract operation HostMakeJobCallback takes
 * argument callback (a function object) and returns a JobCallback
 * Record.
 * 
 * An implementation of HostMakeJobCallback must conform to the
 * following requirements:
 * 
 * It must return a JobCallback Record whose [[Callback]] field is
 * callback.
 * 
 * The default implementation of HostMakeJobCallback performs the
 * following steps when called:
 * 
 * 1. Return the JobCallback Record { [[Callback]]: callback, [[HostDefined]]: empty }.
 * 
 * ECMAScript hosts that are not web browsers must use the default
 * implementation of HostMakeJobCallback.
 * 
 * NOTE: This is called at the time that the callback is passed to the
 * function that is responsible for its being eventually scheduled and
 * run. For example, promise.then(thenAction) calls MakeJobCallback on
 * thenAction at the time of invoking Promise.prototype.then, not at
 * the time of scheduling the reaction Job.
 */
export function HostMakeJobCallback(callback: Func): JobCallback {
  return new JobCallback(callback);
}

/**
 * 9.5.3 HostCallJobCallback ( jobCallback, V, argumentsList )
 * 
 * The host-defined abstract operation HostCallJobCallback takes
 * arguments jobCallback (a JobCallback Record), V (an ECMAScript
 * language value), and argumentsList (a List of ECMAScript language
 * values) and returns either a normal completion containing an
 * ECMAScript language value or a throw completion.
 * 
 * An implementation of HostCallJobCallback must conform to the
 * following requirements:
 * 
 * It must perform and return the result of
 * Call(jobCallback.[[Callback]], V, argumentsList).
 * 
 * NOTE: This requirement means that hosts cannot change the [[Call]]
 * behaviour of function objects defined in this specification.
 * 
 * The default implementation of HostCallJobCallback performs the
 * following steps when called:
 * 
 * 1. Assert: IsCallable(jobCallback.[[Callback]]) is true.
 * 2. Return ? Call(jobCallback.[[Callback]], V, argumentsList).
 * 
 * ECMAScript hosts that are not web browsers must use the default
 * implementation of HostCallJobCallback.
 */
export function* HostCallJobCallback(
  $: VM,
  jobCallback: JobCallback,
  V: Val,
  argumentsList: Val[],
): ECR<Val> {
  Assert(IsCallable(jobCallback.Callback));
  return yield* Call($, jobCallback.Callback, V, argumentsList);
}

/**
 * 9.5.4 HostEnqueuePromiseJob ( job, realm )
 * 
 * The host-defined abstract operation HostEnqueuePromiseJob takes
 * arguments job (a Job Abstract Closure) and realm (a Realm Record or
 * null) and returns unused. It schedules job to be performed at some
 * future time. The Abstract Closures used with this algorithm are
 * intended to be related to the handling of Promises, or otherwise,
 * to be scheduled with equal priority to Promise handling operations.
 * 
 * An implementation of HostEnqueuePromiseJob must conform to the
 * requirements in 9.5 as well as the following:
 * 
 *   - If realm is not null, each time job is invoked the implementation
 *     must perform implementation-defined steps such that execution is
 *     prepared to evaluate ECMAScript code at the time of job's
 *     invocation.
 *   - Let scriptOrModule be GetActiveScriptOrModule() at the time
 *     HostEnqueuePromiseJob is invoked. If realm is not null, each time
 *     job is invoked the implementation must perform
 *     implementation-defined steps such that scriptOrModule is the active
 *     script or module at the time of job's invocation.
 *   - Jobs must run in the same order as the HostEnqueuePromiseJob
 *     invocations that scheduled them.
 * 
 * NOTE: The realm for Jobs returned by NewPromiseResolveThenableJob
 * is usually the result of calling GetFunctionRealm on the then function
 * object. The realm for Jobs returned by NewPromiseReactionJob is
 * usually the result of calling GetFunctionRealm on the handler if
 * the handler is not undefined. If the handler is undefined, realm is
 * null. For both kinds of Jobs, when GetFunctionRealm completes
 * abnormally (i.e. called on a revoked Proxy), realm is the current
 * Realm at the time of the GetFunctionRealm call. When the realm is
 * null, no user ECMAScript code will be evaluated and no new
 * ECMAScript objects (e.g. Error objects) will be created. The WHATWG
 * HTML specification (https://html.spec.whatwg.org/), for example,
 * uses realm to check for the ability to run script and for the entry
 * concept.
 */
export function HostEnqueuePromiseJob(
  $: VM,
  job: ($: VM) => ECR<void>,
  realm: RealmRecord | null,
): UNUSED {
  $.enqueuePromiseJob(job, realm);
  return UNUSED;
}
