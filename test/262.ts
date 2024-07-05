import { ECR, Plugin, VM } from '../src/internal/vm';
import { objectAndFunctionPrototype } from '../src/internal/fundamental';
import { CreateBuiltinFunction } from '../src/internal/func';
import { prop0 } from '../src/internal/property_descriptor';
import { Obj, OrdinaryObjectCreate } from '../src/internal/obj';
import { Val } from '../src/internal/val';
import { IsAbrupt, IsThrowCompletion, ThrowCompletion } from '../src/internal/completion_record';
import { ToString } from '../src/internal/abstract_conversion';
import { RootExecutionContext } from '../src/internal/execution_context';

/** See https://github.com/tc39/test262/blob/main/INTERPRETING.md */
export const test262: Plugin = {
  id: 'test262',
  deps: () => [objectAndFunctionPrototype],
  realm: {
    SetDefaultGlobalBindings(realm) {

      function def(owner: Obj, name: string, fn: ($: VM, ...args: Val[]) => ECR<Val>) {
        owner.OwnProps.set(
          name,
          prop0(CreateBuiltinFunction(
            {Call: ($, _, args) => fn($, ...args)},
            fn.length - 2, name, {Realm: realm})));
      }

      def(realm.GlobalObject!, 'print', function*($, arg): ECR<Val> {
        const s = yield* ToString($, arg);
        return IsAbrupt(s) ? s : void console.log(s);
      });

      const $262 = OrdinaryObjectCreate({Prototype: realm.Intrinsics.get('%Object.prototype%')!});
      realm.GlobalObject!.OwnProps.set('$262', prop0($262));

      def($262, 'createRealm', function*($): ECR<Val> {
        // TODO - what about the previous realm???
        const realm = $.createRealm();
        return realm.GlobalObject!.OwnProps.get('$262')!.Value!;
      });

      def($262, 'detachArrayBuffer', function*($, buffer): ECR<Val> {
        // TODO - implement
        return buffer;
      });

      /**
       * evalScript - a function which accepts a string value as its
       * first argument and executes it as an ECMAScript script
       * according to the following algorithm:
       *
       * 1. Let hostDefined be any host-defined values for the provided
       *    sourceText (obtained in an implementation dependent manner)
       * 2. Let realm be the current Realm Record.
       * 3. Let s be ParseScript(sourceText, realm, hostDefined).
       * 4. If s is a List of errors, then
       *    a. Let error be the first element of s.
       *    b. Return
       *       Completion{[[Type]]: throw, [[Value]]: error, [[Target]]: empty}.
       * 5. Let status be ScriptEvaluation(s).
       * 6. Return Completion(status).
       */
      def($262, 'evalScript', function*($, sourceText): ECR<Val> {
        // TODO - implement
        if (typeof sourceText !== 'string') {
          return $.throw('TypeError', 'sourceText must be a string');
        }
        // Pull the realm out of the object
        const realm = $.getActiveFunctionObject()!.Realm;
        return yield* $.withEmptyStack(function*() {
          const newContext = new RootExecutionContext(realm);
          $.enterContext(newContext);

          let result = yield* $.evaluateScript(sourceText, realm, {filename: 'script'});
          if (IsThrowCompletion(result)) {
            const props = (result.Value as Obj).OwnProps || new Map();
            if (props.get('name')?.Value === 'SyntaxError') {
              result = ThrowCompletion(props.get('message')?.Value);
            }
          }
          return result;
        });
      });

      def($262, 'gc', function*($): ECR<Val> {
        return $.throw('TypeError', 'no gc');
      });

      def($262, 'global', function*($): ECR<Val> {
        const realm = $.getActiveFunctionObject()!.Realm;
        return realm.GlobalObject!;
      });

      const agent = OrdinaryObjectCreate({
        Prototype: realm.Intrinsics.get('%Object.prototype%')!,
      });
      realm.GlobalObject!.OwnProps.set('agent', prop0(agent));

      /**
       * start - a function that takes a script source string and runs
       * the script in a concurrent agent. Will block until that agent
       * is running. The agent has no representation. The agent script
       * will be run in an environment that has an object $262 with a
       * property agent with the following properties:
       *   - receiveBroadcast - a function that takes a function and calls
       *     the function when it has received a broadcast from the
       *     parent, passing it the broadcast as two arguments, a
       *     SharedArrayBuffer and an Int32 or BigInt. This function may
       *     return before a broadcast is received (eg to return to an
       *     event loop to await a message) and no code should follow the
       *     call to this function.
       *   - report - a function that accepts a single "message" argument,
       *     which is converted to a string* and placed in a transmit
       *     queue whence the parent will retrieve it. Messages should be
       *     short. (* Note that string conversion has been implicit since
       *     the introduction of this host API, but is now explicit.)
       *   - sleep - a function that takes a millisecond argument and
       *     sleeps the agent for approximately that duration.
       *   - leaving - a function that signals that the agent is done
       *     and may be terminated (if possible).
       *   - monotonicNow - a function that returns a value that conforms
       *     to DOMHighResTimeStamp and is produced in such a way that its
       *     semantics conform to Monotonic Clock.
       */
      def($262, 'start', function*($, ...args): ECR<Val> {
        throw 'not implemented';
      });
      /**
       * broadcast - a function that takes a SharedArrayBuffer and an
       * Int32 or BigInt and broadcasts the two values to all
       * concurrent agents. The function blocks until all agents have
       * retrieved the message. Note, this assumes that all agents
       * that were started are still running.
       */
      def($262, 'broadcast', function*($, ...args): ECR<Val> {
        throw 'not implemented';
      });
      /**
       * getReport - a function that reads an incoming string from any
       * agent, and returns it if it exists, or returns null otherwise.
       */
      def($262, 'getReport', function*($, ...args): ECR<Val> {
        throw 'not implemented';
      });
      /**
       * sleep - a function that takes a millisecond argument and
       * sleeps the execution for approximately that duration.
       */
      def($262, 'sleep', function*($, ...args): ECR<Val> {
        throw 'not implemented';
      });
      /**
       * monotonicNow - a function that returns a value that conforms
       * to DOMHighResTimeStamp and is produced in such a way that its
       * semantics conform to Monotonic Clock.
       */
      def($262, 'monotonicNow', function*($, ...args): ECR<Val> {
        throw 'not implemented';
      });
    },
  },
};

// TODO - build a map of all "defined" symbols in harness/
//      - map each to a regexp to run on each test under test/
//      - also read includes field
//      - load the required symbols... do it recursively?
