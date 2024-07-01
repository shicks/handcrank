import { DebugString, ECR, Plugin, VM } from './vm';
import { objectAndFunctionPrototype } from './fundamental';
import { CreateBuiltinFunction, IsFunc, callOrConstruct, method } from './func';
import { prop0, propWC } from './property_descriptor';
import { Obj, OrdinaryCreateFromConstructor, OrdinaryObjectCreate } from './obj';
import { Val } from './val';
import { Assert } from './assert';
import { IsAbrupt } from './completion_record';
import { ToString } from './abstract_conversion';
import { defineProperties } from './realm_record';
import { Get, HasProperty } from './abstract_object';
import { UNUSED } from './enums';

/**
 * 20.5 Error Objects
 *
 * Instances of Error objects are thrown as exceptions when runtime
 * errors occur. The Error objects may also serve as base objects for
 * user-defined exception classes.
 *
 * When an ECMAScript implementation detects a runtime error, it
 * throws a new instance of one of the NativeError objects defined in
 * 20.5.5 or a new instance of AggregateError object defined in
 * 20.5.7. Each of these objects has the structure described below,
 * differing only in the name used as the constructor name instead of
 * NativeError, in the "name" property of the prototype object, in the
 * implementation-defined "message" property of the prototype object,
 * and in the presence of the %AggregateError%-specific "errors"
 * property.
 */
export const errorObject: Plugin = {
  id: 'errorObject',
  deps: () => [objectAndFunctionPrototype],
  realm: {
    CreateIntrinsics(realm, stagedGlobals) {
      /**
       * 20.5.1 The Error Constructor
       *
       * The Error constructor:
       *   - is %Error%.
       *   - is the initial value of the "Error" property of the global object.
       *   - creates and initializes a new Error object when called as a
       *     function rather than as a constructor. Thus the function
       *     call Error(…) is equivalent to the object creation
       *     expression new Error(…) with the same arguments.
       *   - may be used as the value of an extends clause of a class
       *     definition. Subclass constructors that intend to inherit
       *     the specified Error behaviour must include a super call
       *     to the Error constructor to create and initialize
       *     subclass instances with an [[ErrorData]] internal slot.
       */
      const errorCtor = CreateBuiltinFunction(
        callOrConstruct(errorBehavior), 1, 'Error', {Realm: realm});
      realm.Intrinsics.set('%Error%', errorCtor);
      stagedGlobals.set('Error', propWC(errorCtor));

      /**
       * 20.5.3 Properties of the Error Prototype Object
       *
       * The Error prototype object:
       *   - is %Error.prototype%.
       *   - is an ordinary object.
       *   - is not an Error instance and does not have an [[ErrorData]]
       *     internal slot.
       *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
       */
      const errorPrototype = OrdinaryObjectCreate({
        Prototype: realm.Intrinsics.get('%Object.prototype%')!,
      }, {
        constructor: propWC(errorCtor),
      });
      realm.Intrinsics.set('%Error.prototype%', errorPrototype);
      errorCtor.OwnProps.set('prototype', prop0(errorPrototype));

      /**
       * 20.5.1.1 Error ( message [ , options ] )
       *
       * This function performs the following steps when called:
       * 
       * 1. If NewTarget is undefined, let newTarget be the active
       *    function object; else let newTarget be NewTarget.
       * 2. Let O be ? OrdinaryCreateFromConstructor(newTarget,
       *    "%Error.prototype%", « [[ErrorData]] »).
       * 3. If message is not undefined, then
       *     a. Let msg be ? ToString(message).
       *     b. Perform CreateNonEnumerableDataPropertyOrThrow(O, "message", msg).
       * 4. Perform ? InstallErrorCause(O, options).
       * 5. Return O.
       */
      function* errorBehavior($: VM, NewTarget: Val, message: Val, options: Val) {
        const newTarget = NewTarget ?? $.getRunningContext().Function!;
        Assert(IsFunc(newTarget));
        const O = yield* OrdinaryCreateFromConstructor($, newTarget, '%Error.prototype', {
          // NOTE: spec requires [[ErrorData]] = undefined, but that's
          // harder to identify robustly.  It's never used aside from
          // detecting presence, so we just set it to a string instead.
          ErrorData: '',
        });
        if (IsAbrupt(O)) return O;
        if (message != null) {
          const msg = yield* ToString($, message);
          if (IsAbrupt(msg)) return msg;
          O.OwnProps.set('message', propWC(msg));
        }
        const result = yield* InstallErrorCause($, O, options);
        if (IsAbrupt(result)) return result;
        // Non-standard: fill in the stack trace
        $.captureStackTrace(O);
        // End non-standard portion
        return O;
      }

      defineProperties(realm, errorPrototype, {
        /**
         * 20.5.3.2 Error.prototype.message
         *
         * The initial value of Error.prototype.message is the empty String.
         */
        'message': propWC(''),
        /**
         * 20.5.3.3 Error.prototype.name
         *
         * The initial value of Error.prototype.name is "Error".
         */
        'name': propWC('Error'),
        /**
         * 20.5.3.4 Error.prototype.toString ( )
         *
         * This method performs the following steps when called:
         * 
         * 1. Let O be the this value.
         * 2. If O is not an Object, throw a TypeError exception.
         * 3. Let name be ? Get(O, "name").
         * 4. If name is undefined, set name to "Error"; otherwise set
         *    name to ? ToString(name).
         * 5. Let msg be ? Get(O, "message").
         * 6. If msg is undefined, set msg to the empty String;
         *    otherwise set msg to ? ToString(msg).
         * 7. If name is the empty String, return msg.
         * 8. If msg is the empty String, return name.
         * 9. Return the string-concatenation of name, the code unit
         *    0x003A (COLON), the code unit 0x0020 (SPACE), and msg.
         */
        'toString': method(function*($, O) {
          if (!(O instanceof Obj)) {
            return $.throw('TypeError',
                           `Method Error.prototype.toString called on incompatible receiver ${
                            DebugString(O)}`);
          }
          let name = yield* Get($, O, 'name');
          if (IsAbrupt(name)) return name;
          name = (name == null) ? 'Error' : yield* ToString($, name);
          if (IsAbrupt(name)) return name;
          let msg = yield* Get($, O, 'message');
          if (IsAbrupt(msg)) return msg;
          msg = (msg == null) ? '' : yield* ToString($, msg);
          if (IsAbrupt(msg)) return msg;
          if (!name) return msg;
          if (!msg) return name;
          return `${name}: ${msg}`;
        }),
      });

      /**
       * 20.5.5 NativeError Objects
       *
       * The following NativeError objects are provided by the ECMAScript
       * specification:
       *   - EvalError
       *   - RangeError
       *   - ReferenceError
       *   - SyntaxError
       *   - TypeError
       *   - URIError
       */
      [
        'EvalError',
        'RangeError',
        'ReferenceError',
        'SyntaxError',
        'TypeError',
        'URIError',
      ].forEach(makeNativeError);

      /**
       * 20.5.6 NativeError Object Structure
       *
       * When an ECMAScript implementation detects a runtime error, it
       * throws a new instance of one of the NativeError objects
       * defined in 20.5.5. Each of these objects has the structure
       * described below, differing only in the name used as the
       * constructor name instead of NativeError, in the "name"
       * property of the prototype object, and in the
       * implementation-defined "message" property of the prototype
       * object.
       *
       * For each error object, references to NativeError in the
       * definition should be replaced with the appropriate error
       * object name from 20.5.5.
       */
      function makeNativeError(name: string) {
        /**
         * 20.5.6.1 The NativeError Constructors
         *
         * Each NativeError constructor:
         *   - creates and initializes a new NativeError object when
         *     called as a function rather than as a constructor. A call
         *     of the object as a function is equivalent to calling it
         *     as a constructor with the same arguments. Thus the
         *     function call NativeError(…) is equivalent to the object
         *     creation expression new NativeError(…) with the same
         *     arguments.
         *   - may be used as the value of an extends clause of a class
         *     definition. Subclass constructors that intend to inherit
         *     the specified NativeError behaviour must include a super
         *     call to the NativeError constructor to create and
         *     initialize subclass instances with an [[ErrorData]]
         *     internal slot.
         *
         * ---
         *
         * 20.5.6.1.1 NativeError ( message [ , options ] )
         *
         * Each NativeError function performs the following steps when
         * called:
         * 
         * 1. If NewTarget is undefined, let newTarget be the active
         *    function object; else let newTarget be NewTarget.
         * 2. Let O be ? OrdinaryCreateFromConstructor(newTarget,
         *    "%NativeError.prototype%", « [[ErrorData]] »).
         * 3. If message is not undefined, then
         *     a. Let msg be ? ToString(message).
         *     b. Perform CreateNonEnumerableDataPropertyOrThrow(O, "message", msg).
         * 4. Perform ? InstallErrorCause(O, options).
         * 5. Return O.
         *
         * The actual value of the string passed in step 2 is either
         * "%EvalError.prototype%", "%RangeError.prototype%",
         * "%ReferenceError.prototype%", "%SyntaxError.prototype%",
         * "%TypeError.prototype%", or "%URIError.prototype%"
         * corresponding to which NativeError constructor is being
         * defined.
         */
        const ctor = CreateBuiltinFunction(
          callOrConstruct(errorBehavior), 1, name, {Realm: realm});
        realm.Intrinsics.set(`%${name}%`, ctor);
        stagedGlobals.set(name, propWC(ctor));

        /**
         * 20.5.6.3 Properties of the NativeError Prototype Objects
         *
         * Each NativeError prototype object:
         *   - is an ordinary object.
         *   - is not an Error instance and does not have an
         *     [[ErrorData]] internal slot.
         *   - has a [[Prototype]] internal slot whose value is %Error.prototype%.
         */
        const prototype = OrdinaryObjectCreate({
          Prototype: errorPrototype,
        }, {
          'constructor': propWC(ctor),
          /** 20.5.6.3.2 NativeError.prototype.message */
          'message': propWC(''),
          /** 20.5.6.3.3 NativeError.prototype.name */
          'name': propWC(name),
        });
        realm.Intrinsics.set(`%${name}.prototype%`, prototype);
        ctor.OwnProps.set('prototype', prop0(prototype));
      }

      /**
       * 10.2.4.1 %ThrowTypeError% ( )
       *
       * This function is the %ThrowTypeError% intrinsic object.
       *
       * It is an anonymous built-in function object that is defined
       * once for each realm.
       *
       * It performs the following steps when called:
       *
       * 1. Throw a TypeError exception.
       *
       * The value of the [[Extensible]] internal slot of this
       * function is false.
       *
       * The "length" property of this function has the attributes {
       * [[Writable]]: false, [[Enumerable]]: false, [[Configurable]]:
       * false }.
       *
       * The "name" property of this function has the attributes {
       * [[Writable]]: false, [[Enumerable]]: false, [[Configurable]]:
       * false }.
       */
      realm.Intrinsics.set('%ThrowTypeError%', (() => {
        const throwTypeError = CreateBuiltinFunction({
          *Call($) { return $.throw('TypeError', '%ThrowTypeError%'); },
        }, 0, '', {Realm: realm});
        throwTypeError.OwnProps.set('length', prop0(0));
        throwTypeError.OwnProps.set('name', prop0(''));
        return throwTypeError;
      })())

      // TODO - 20.5.7 AggregateError Objects
    },
  },
};

/**
 * 20.5.8 Abstract Operations for Error Objects
 *
 * 20.5.8.1 InstallErrorCause ( O, options )
 *
 * The abstract operation InstallErrorCause takes arguments O (an
 * Object) and options (an ECMAScript language value) and returns
 * either a normal completion containing unused or a throw
 * completion. It is used to create a "cause" property on O when a
 * "cause" property is present on options. It performs the following
 * steps when called:
 *
 * 1. If options is an Object and ? HasProperty(options, "cause") is true, then
 *     a. Let cause be ? Get(options, "cause").
 *     b. Perform CreateNonEnumerableDataPropertyOrThrow(O, "cause", cause).
 * 2. Return unused.
 */
export function* InstallErrorCause($: VM, O: Obj, options: Val): ECR<UNUSED> {
  if (!(options instanceof Obj)) return UNUSED;
  const hasProp = HasProperty($, options, 'cause');
  if (IsAbrupt(hasProp)) return hasProp;
  if (hasProp) {
    const cause = yield* Get($, options, 'cause');
    if (IsAbrupt(cause)) return cause;
    O.OwnProps.set('cause', propWC(cause));
  }
  return UNUSED;
}
