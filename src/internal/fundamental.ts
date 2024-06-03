/**
 * @fileoverview Intrinsic and global definitions for the following sections:
 *   - 20 Fundamental Objects
 *   - 21 Numbers and Dates
 *   - 22 Text Processing
 */

import { IsCallable, IsExtensible, RequireObjectCoercible, SameValue } from './abstract_compare';
import { ToBoolean, ToInt32, ToIntegerOrInfinity, ToNumeric, ToObject, ToPropertyKey, ToString } from './abstract_conversion';
import { Call, CreateArrayFromList, CreateDataPropertyOrThrow, DefinePropertyOrThrow, EnumerableOwnProperties, Get, HasOwnProperty, Invoke, OrdinaryHasInstance, Set, SetIntegrityLevel, TestIntegrityLevel } from './abstract_object';
import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { FROZEN, SEALED, STRING, SYMBOL } from './enums';
import { BoundFunctionCreate } from './exotic_bind';
import { BuiltinFunction, BuiltinFunctionBehavior, CreateBuiltinFunction, SetFunctionLength, SetFunctionName, callOrConstruct, getter, method } from './func';
import { Obj, OrdinaryCreateFromConstructor, OrdinaryObject, OrdinaryObjectCreate } from './obj';
import { FromPropertyDescriptor, PropertyDescriptor, ToPropertyDescriptor, prop0, propC, propWC, propWEC } from './property_descriptor';
import { RealmRecord, defineProperties } from './realm_record';
import { PropertyKey, Val } from './val';
import { DebugString, ECR, Plugin, VM } from './vm';


// TODO:
function IsArray(..._args: unknown[]) { return false; }
function PrepareForTailCall(...args: unknown[]) {}


/** Slots for basic data type wrapper objects. */
declare global {
  interface ObjectSlots {
    BooleanData?: boolean;
    StringData?: string;
    NumberData?: number;
    BigIntData?: bigint;
    SymbolData?: symbol;
    ErrorData?: string; // NOTE: spec just has undefined but we repurpose
  }
}

export const objectAndFunctionPrototype: Plugin = {
  id: 'objectAndFunctionPrototype',
  realm: {
    CreateIntrinsics(realm) {
      // First add the two intrinsics.  %Function.prototype% depends on %Object.prototype%,
      // but all the methods on them depend on being able to access %Function.prototype%
      // to create the builtin functions.
      const objectPrototype = OrdinaryObjectCreate();
      realm.Intrinsics.set('%Object.prototype%', objectPrototype);
      const functionPrototype = CreateBuiltinFunction(
        {*Call() { return undefined; }}, 0, '', realm, objectPrototype);
      realm.Intrinsics.set('%Function.prototype%', functionPrototype);

      // Now populate the methods.
      // TODO - implement these correctly
      defineProperties(realm, objectPrototype, {
        /**
         * 20.1.3.2 Object.prototype.hasOwnProperty ( V )
         *
         * This method performs the following steps when called:
         *
         * 1. Let P be ? ToPropertyKey(V).
         * 2. Let O be ? ToObject(this value).
         * 3. Return ? HasOwnProperty(O, P).
         *
         * NOTE: The ordering of steps 1 and 2 is chosen to ensure
         * that any exception that would have been thrown by step 1 in
         * previous editions of this specification will continue to be
         * thrown even if the this value is undefined or null.
         */
        'hasOwnProperty': method(function*($, thisValue, V) {
          const P = yield* ToPropertyKey($, V);
          if (IsAbrupt(P)) return P;
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          return HasOwnProperty($, O, P);
        }),

        /**
         * 20.1.3.3 Object.prototype.isPrototypeOf ( V )
         *
         * This method performs the following steps when called:
         *
         * 1. If V is not an Object, return false.
         * 2. Let O be ? ToObject(this value).
         * 3. Repeat,
         *     a. Set V to ? V.[[GetPrototypeOf]]().
         *     b. If V is null, return false.
         *     c. If SameValue(O, V) is true, return true.
         *
         * NOTE: The ordering of steps 1 and 2 preserves the behaviour
         * specified by previous editions of this specification for
         * the case where V is not an object and the this value is
         * undefined or null.
         */
        'isPrototypeOf': method(function*($, thisValue, V) {
          if (!(V instanceof Obj)) return false;
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          while (true) {
            V = V.Prototype;
            if (V == null) return false;
            if (SameValue(O, V)) return true;
          }
        }),

        /**
         * 20.1.3.4 Object.prototype.propertyIsEnumerable ( V )
         *
         * This method performs the following steps when called:
         *
         * 1. Let P be ? ToPropertyKey(V).
         * 2. Let O be ? ToObject(this value).
         * 3. Let desc be ? O.[[GetOwnProperty]](P).
         * 4. If desc is undefined, return false.
         * 5. Return the value of desc.[[Enumerable]].
         *
         * NOTE 1: This method does not consider objects in the
         * prototype chain.
         *
         * NOTE 2: The ordering of steps 1 and 2 is chosen to ensure
         * that any exception that would have been thrown by step 1 in
         * previous editions of this specification will continue to be
         * thrown even if the this value is undefined or null.
         */
        'propertyIsEnumerable': method(function*($, thisValue, V) {
          const P = yield* ToPropertyKey($, V);
          if (IsAbrupt(P)) return P;
          const O = ToObject($, thisValue);
          if (IsAbrupt(O)) return O;
          const desc = O.GetOwnProperty($, P);
          if (IsAbrupt(desc)) return desc;
          if (desc == null) return false;
          // TODO - I've added `|| false` just in case incomplete
          // descriptors end up in the map.
          return desc.Enumerable || false;
        }),

        /**
         * 20.1.3.5 Object.prototype.toLocaleString ( [ reserved1 [ , reserved2 ] ] )
         *
         * This method performs the following steps when called:
         * 
         * 1. Let O be the this value.
         * 2. Return ? Invoke(O, "toString").
         * 
         * The optional parameters to this method are not used but are
         * intended to correspond to the parameter pattern used by
         * ECMA-402 toLocaleString methods. Implementations that do
         * not include ECMA-402 support must not use those parameter
         * positions for other purposes.
         * 
         * NOTE 1: This method provides a generic toLocaleString
         * implementation for objects that have no locale-sensitive
         * toString behaviour. Array, Number, Date, and %TypedArray%
         * provide their own locale-sensitive toLocaleString methods.
         * 
         * NOTE 2: ECMA-402 intentionally does not provide an
         * alternative to this default implementation.
         */
        'toLocaleString': method(function*($, thisValue) {
          return yield* Invoke($, thisValue, 'toString');
        }),

        /**
         * 20.1.3.6 Object.prototype.toString ( )
         * 
         * This method performs the following steps when called:
         * 
         * 1. If the this value is undefined, return "[object Undefined]".
         * 2. If the this value is null, return "[object Null]".
         * 3. Let O be ! ToObject(this value).
         * 4. Let isArray be ? IsArray(O).
         * 5. If isArray is true, let builtinTag be "Array".
         * 6. Else if O has a [[ParameterMap]] internal slot, let
         *    builtinTag be "Arguments".
         * 7. Else if O has a [[Call]] internal method, let builtinTag
         *    be "Function".
         * 8. Else if O has an [[ErrorData]] internal slot, let
         *    builtinTag be "Error".
         * 9. Else if O has a [[BooleanData]] internal slot, let
         *    builtinTag be "Boolean".
         * 10. Else if O has a [[NumberData]] internal slot, let
         *     builtinTag be "Number".
         * 11. Else if O has a [[StringData]] internal slot, let
         *     builtinTag be "String".
         * 12. Else if O has a [[DateValue]] internal slot, let
         *     builtinTag be "Date".
         * 13. Else if O has a [[RegExpMatcher]] internal slot, let
         *     builtinTag be "RegExp".
         * 14. Else, let builtinTag be "Object".
         * 15. Let tag be ? Get(O, @@toStringTag).
         * 16. If tag is not a String, set tag to builtinTag.
         * 17. Return the string-concatenation of "[object ", tag, and "]".
         *
         * NOTE: Historically, this method was occasionally used to
         * access the String value of the [[Class]] internal slot that
         * was used in previous editions of this specification as a
         * nominal type tag for various built-in objects. The above
         * definition of toString preserves compatibility for legacy
         * code that uses toString as a test for those specific kinds
         * of built-in objects. It does not provide a reliable type
         * testing mechanism for other kinds of built-in or program
         * defined objects. In addition, programs can use
         * @@toStringTag in ways that will invalidate the reliability
         * of such legacy type tests.
         */
        'toString': method(function*($, thisValue) {
          if (thisValue === undefined) return '[object Undefined]';
          if (thisValue === null) return '[object Null]';
          const O = CastNotAbrupt(ToObject($, thisValue)) as any;
          const isArray = IsArray($, O);
          if (IsAbrupt(isArray)) return isArray;
          const builtinTag =
            isArray ? 'Array' :
            O.ParameterMap != null ? 'Arguments' :
            O.Call != null ? 'Function' : 
            O.ErrorData != null ? 'Error' :
            O.BooleanData != null ? 'Boolean' :
            O.NumberData != null ? 'Number' :
            O.StringData != null ? 'String' :
            O.DateValue != null ? 'Date' :
            O.RegExpMatcher != null ? 'RegExp' :
            'Object';
          let tag = yield* Get($, O, Symbol.toStringTag);
          if (IsAbrupt(tag)) return tag;
          if (typeof tag !== 'string') tag = builtinTag;
          return `[object ${tag}]`;
        }),

        /**
         * 20.1.3.7 Object.prototype.valueOf ( )
         *
         * This method performs the following steps when called:
         *
         * 1. Return ? ToObject(this value).
         */
        'valueOf': method(function*($, thisValue) {
          return ToObject($, thisValue);
        }),
      });

      defineProperties(realm, functionPrototype, {
        /**
         * 20.2.3.1 Function.prototype.apply ( thisArg, argArray )
         *
         * This method performs the following steps when called:
         * 
         * 1. Let func be the this value.
         * 2. If IsCallable(func) is false, throw a TypeError exception.
         * 3. If argArray is either undefined or null, then
         *     a. Perform PrepareForTailCall().
         *     b. Return ? Call(func, thisArg).
         * 4. Let argList be ? CreateListFromArrayLike(argArray).
         * 5. Perform PrepareForTailCall().
         * 6. Return ? Call(func, thisArg, argList).
         * 
         * NOTE 1: The thisArg value is passed without modification as
         * the this value. This is a change from Edition 3, where an
         * undefined or null thisArg is replaced with the global
         * object and ToObject is applied to all other values and that
         * result is passed as the this value. Even though the thisArg
         * is passed without modification, non-strict functions still
         * perform these transformations upon entry to the function.
         * 
         * NOTE 2: If func is either an arrow function or a bound
         * function exotic object, then the thisArg will be ignored by
         * the function [[Call]] in step 6.
         */
        'apply': method(function*($, thisValue, thisArg, argArray) {
          throw new Error('NOT IMPLEMENTED: ARRAY');
          // const func = thisValue;
          // if (!IsCallable(func)) throw new TypeError('Function.prototype.apply called on non-callable');
          // if (argArray == null) {
          //   return yield* Call($, func, thisArg);
          // }
          // const argList = yield* CreateListFromArrayLike($, argArray);
          // return yield* Call($, func, thisArg, argList);
        }),

        /**
         * 20.2.3.2 Function.prototype.bind ( thisArg, ...args )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let Target be the this value.
         * 2. If IsCallable(Target) is false, throw a TypeError exception.
         * 3. Let F be ? BoundFunctionCreate(Target, thisArg, args).
         * 4. Let L be 0.
         * 5. Let targetHasLength be ? HasOwnProperty(Target, "length").
         * 6. If targetHasLength is true, then
         *     a. Let targetLen be ? Get(Target, "length").
         *     b. If targetLen is a Number, then
         *         i. If targetLen is +∞𝔽, set L to +∞.
         *         ii. Else if targetLen is -∞𝔽, set L to 0.
         *         iii. Else,
         *             1. Let targetLenAsInt be ! ToIntegerOrInfinity(targetLen).
         *             2. Assert: targetLenAsInt is finite.
         *             3. Let argCount be the number of elements in args.
         *             4. Set L to max(targetLenAsInt - argCount, 0).
         * 7. Perform SetFunctionLength(F, L).
         * 8. Let targetName be ? Get(Target, "name").
         * 9. If targetName is not a String, set targetName to the empty String.
         * 10. Perform SetFunctionName(F, targetName, "bound").
         * 11. Return F.
         * 
         * NOTE 1: Function objects created using
         * Function.prototype.bind are exotic objects. They also do
         * not have a "prototype" property.
         * 
         * NOTE 2: If Target is either an arrow function or a bound
         * function exotic object, then the thisArg passed to this
         * method will not be used by subsequent calls to F.
         */
        'bind': method(function*($, thisValue, thisArg, ...args) {
          const Target = thisValue;
          if (!IsCallable(Target)) return $.throw('TypeError', 'not a function');
          const F = BoundFunctionCreate($, Target, thisArg, args);
          if (IsAbrupt(F)) return F;
          let L = 0;
          if (typeof Target.OwnProps?.get('length')?.Value === 'number') {
            L = Target.OwnProps!.get('length')!.Value as number - args.length;
          } else if (HasOwnProperty($, Target, 'length')) {
            const targetLen = yield* Get($, Target, 'length');
            if (typeof targetLen === 'number') {
              if (targetLen === +Infinity) {
                L = +Infinity;
              } else {
                const targetLenAsInt = CastNotAbrupt(yield* ToIntegerOrInfinity($, targetLen));
                L = Math.max(targetLenAsInt - args.length, 0);
              }
            }
          }
          SetFunctionLength(F, L);
          SetFunctionName(F, 'bound');
          return F;
        }),

        /**
         * 20.2.3.3 Function.prototype.call ( thisArg, ...args )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let func be the this value.
         * 2. If IsCallable(func) is false, throw a TypeError exception.
         * 3. Perform PrepareForTailCall().
         * 4. Return ? Call(func, thisArg, args).
         * 
         * NOTE 1: The thisArg value is passed without modification as
         * the this value. This is a change from Edition 3, where an
         * undefined or null thisArg is replaced with the global
         * object and ToObject is applied to all other values and that
         * result is passed as the this value. Even though the thisArg
         * is passed without modification, non-strict functions still
         * perform these transformations upon entry to the function.
         *
         * NOTE 2: If func is either an arrow function or a bound
         * function exotic object, then the thisArg will be ignored by
         * the function [[Call]] in step 4.
         */
        'call': method(function*($, thisValue, thisArg, ...args) {
          const func = thisValue;
          if (!IsCallable(func)) return $.throw('TypeError', 'not a function');
          PrepareForTailCall($);
          return yield* Call($, func, thisArg, args);
        }),

        /**
         * 20.2.3.5 Function.prototype.toString ( )
         *          
         * This method performs the following steps when called:
         * 
         * 1. Let func be the this value.
         * 2. If func is an Object, func has a [[SourceText]] internal
         *    slot, func.[[SourceText]] is a sequence of Unicode code
         *    points, and HostHasSourceTextAvailable(func) is true, then
         *     a. Return CodePointsToString(func.[[SourceText]]).
         * 3. If func is a built-in function object, return an
         *    implementation-defined String source code representation of
         *    func. The representation must have the syntax of a
         *    NativeFunction. Additionally, if func has an
         *    [[InitialName]] internal slot and func.[[InitialName]] is a
         *    String, the portion of the returned String that would be
         *    matched by NativeFunctionAccessoropt PropertyName must be
         *    the value of func.[[InitialName]].
         * 4. If func is an Object and IsCallable(func) is true,
         *    return an implementation-defined String source code
         *    representation of func. The representation must have the
         *    syntax of a NativeFunction.
         * 5. Throw a TypeError exception.
         */
        'toString': method(function*($, thisValue) {
          const func = thisValue;
          if (func instanceof Obj) {
            if (typeof func.SourceText === 'string'
                // && HostHasSourceTextAvailable(func)
               ) {
              return func.SourceText;
            }
            if (typeof func.InitialName === 'string') {
              return `function ${func.InitialName}() { [native code] }`;
            }
            if (IsCallable(func)) {
              // TODO - not sure if this is correct?
              return `function() { [unavailable] }`;
            }
          }
          return $.throw('TypeError',
                         `Function.prototype.toString requires that 'this' be a function`);
        }),

        /**
         * 20.2.3.6 Function.prototype [ @@hasInstance ] ( V )
         *
         * This method performs the following steps when called:
         * 
         * 1. Let F be the this value.
         * 2. Return ? OrdinaryHasInstance(F, V).
         * 
         * This property has the attributes { [[Writable]]: false,
         * [[Enumerable]]: false, [[Configurable]]: false }.
         * 
         * NOTE: This is the default implementation of @@hasInstance
         * that most functions inherit. @@hasInstance is called by the
         * instanceof operator to determine whether a value is an
         * instance of a specific constructor. An expression such as
         * 
         *     v instanceof F
         * 
         * evaluates as
         * 
         *     F[@@hasInstance](v)
         * 
         * A constructor function can control which objects are
         * recognized as its instances by instanceof by exposing a
         * different @@hasInstance method on the function.
         * 
         * This property is non-writable and non-configurable to
         * prevent tampering that could be used to globally expose
         * the target function of a bound function.
         *
         * The value of the "name" property of this method is
         * "[Symbol.hasInstance]".
         */
        [Symbol.hasInstance]: {...method(function*($, thisValue, V) {
          return yield* OrdinaryHasInstance($, thisValue, V);
        }), Writable: false, Enumerable: false, Configurable: false},
      });
    },
  },
};

/**
 * 20.1 Object Objects
 *
 * 20.1.1 The Object Constructor
 *
 * The Object constructor:
 *   - is %Object%.
 *   - is the initial value of the "Object" property of the global object.
 *   - creates a new ordinary object when called as a constructor.
 *   - performs a type conversion when called as a function rather than as a constructor.
 *   - may be used as the value of an extends clause of a class definition.
 *
 * 20.1.1.1 Object ( [ value ] )
 *
 * This function performs the following steps when called:
 * 
 * 1. If NewTarget is neither undefined nor the active function object, then
 *     a. Return ? OrdinaryCreateFromConstructor(NewTarget, "%Object.prototype%").
 * 2. If value is either undefined or null, return
 *    OrdinaryObjectCreate(%Object.prototype%).
 * 3. Return ! ToObject(value).
 * 
 * The "length" property of this function is 1𝔽.
 * 
 * 20.1.2 Properties of the Object Constructor
 * 
 * The Object constructor:
 *   - has a [[Prototype]] internal slot whose value is %Function.prototype%.
 *   - has a "length" property.
 *   - has the following additional properties:
 */
export const objectConstructor: Plugin = {
  id: 'objectConstructor',
  deps: [objectAndFunctionPrototype],
  realm: {
    CreateIntrinsics(realm, stagedGlobals) {
      const objectPrototype = realm.Intrinsics.get('%Object.prototype%')!;
      const functionPrototype = realm.Intrinsics.get('%Function.prototype%')!;
      const objectCtor = CreateBuiltinFunction(
        callOrConstruct(function*($, [value], NewTarget) {
          if (NewTarget !== undefined && NewTarget !== $.getActiveFunctionObject()) {
            return yield* OrdinaryCreateFromConstructor($, NewTarget, '%Object.prototype%');
          }
          if (value == null) return OrdinaryObjectCreate(objectPrototype);
          return ToObject($, value);
        }),
        1, 'Object', realm, functionPrototype);
      objectCtor.OwnProps.set('prototype', propWC(objectPrototype));
      objectPrototype.OwnProps.set('constructor', propWC(objectCtor));

      realm.Intrinsics.set('%Object%', objectCtor);
      stagedGlobals.set('Object', propWC(objectCtor));

      defineProperties(realm, objectCtor, {
        /**
         * 20.1.2.1 Object.assign ( target, ...sources )
         * 
         * This function copies the values of all of the enumerable
         * own properties from one or more source objects to a target
         * object.
         * 
         * It performs the following steps when called:
         * 
         * 1. Let to be ? ToObject(target).
         * 2. If only one argument was passed, return to.
         * 3. For each element nextSource of sources, do
         *     a. If nextSource is neither undefined nor null, then
         *         i. Let from be ! ToObject(nextSource).
         *         ii. Let keys be ? from.[[OwnPropertyKeys]]().
         *         iii. For each element nextKey of keys, do
         *             1. Let desc be ? from.[[GetOwnProperty]](nextKey).
         *             2. If desc is not undefined and desc.[[Enumerable]] is true, then
         *                 a. Let propValue be ? Get(from, nextKey).
         *                 b. Perform ? Set(to, nextKey, propValue, true).
         * 4. Return to.
         * 
         * The "length" property of this function is 2𝔽.
         */
        'assign': method(function*($, _thisValue, target, ...sources) {
          const to = ToObject($, target);
          if (IsAbrupt(to)) return to;
          for (const nextSource of sources) {
            if (nextSource == null) continue;
            const from = CastNotAbrupt(ToObject($, nextSource));
            const keys = from.OwnPropertyKeys($);
            if (IsAbrupt(keys)) return keys;
            for (const nextKey of keys) {
              const desc = from.GetOwnProperty($, nextKey);
              if (IsAbrupt(desc)) return desc;
              if (desc == null || !desc.Enumerable) continue;
              const propValue = yield* Get($, from, nextKey);
              if (IsAbrupt(propValue)) return propValue;
              const setStatus = yield* Set($, to, nextKey, propValue, true);
              if (IsAbrupt(setStatus)) return setStatus;
            }
          }
          return to;
        }, 2),

        /**
         * 20.1.2.2 Object.create ( O, Properties )
         * 
         * This function creates a new object with a specified prototype.
         * 
         * It performs the following steps when called:
         * 
         * 1. If O is not an Object and O is not null, throw a
         *    TypeError exception.
         * 2. Let obj be OrdinaryObjectCreate(O).
         * 3. If Properties is not undefined, then
         *     a. Return ? ObjectDefineProperties(obj, Properties).
         * 4. Return obj.
         */
        'create': method(function*($, _thisValue, O, Properties) {
          if (O !== null && !(O instanceof Obj)) {
            return $.throw(
              'TypeError',
              `Object prototype may only be an object or null: ${DebugString(O)}`);
          }
          const obj = OrdinaryObjectCreate({Prototype: O});
          if (Properties != null) {
            return yield* ObjectDefineProperties($, obj, Properties);
          }
          return obj;
        }),

        /**
         * 20.1.2.3 Object.defineProperties ( O, Properties )
         * 
         * This function adds own properties and/or updates the
         * attributes of existing own properties of an object.
         * 
         * It performs the following steps when called:
         * 
         * 1. If O is not an Object, throw a TypeError exception.
         * 2. Return ? ObjectDefineProperties(O, Properties).
         */
        'defineProperties': method(function*($, _thisValue, O, Properties) {
          if (!(O instanceof Obj)) {
            return $.throw('TypeError', 'Object.defineProperties called on non-object');
          }
          return yield* ObjectDefineProperties($, O, Properties);
        }),

        /**
         * 20.1.2.4 Object.defineProperty ( O, P, Attributes )
         * 
         * This function adds an own property and/or updates the
         * attributes of an existing own property of an object.
         * 
         * It performs the following steps when called:
         * 
         * 1. If O is not an Object, throw a TypeError exception.
         * 2. Let key be ? ToPropertyKey(P).
         * 3. Let desc be ? ToPropertyDescriptor(Attributes).
         * 4. Perform ? DefinePropertyOrThrow(O, key, desc).
         * 5. Return O.
         */
        'defineProperty': method(function*($, _thisValue, O, P, Attributes) {
          if (!(O instanceof Obj)) {
            return $.throw('TypeError', 'Object.defineProperty called on non-object');
          }
          const key = yield* ToPropertyKey($, P);
          if (IsAbrupt(key)) return key;
          const desc = yield* ToPropertyDescriptor($, Attributes);
          if (IsAbrupt(desc)) return desc;
          const defineStatus = DefinePropertyOrThrow($, O, key, desc);
          if (IsAbrupt(defineStatus)) return defineStatus;
          return O;
        }),

        /**
         * 20.1.2.5 Object.entries ( O )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Let obj be ? ToObject(O).
         * 2. Let entryList be ? EnumerableOwnProperties(obj, key+value).
         * 3. Return CreateArrayFromList(entryList).
         */
        'entries': method(function*($, _thisValue, O) {
          const obj = ToObject($, O);
          if (IsAbrupt(obj)) return obj;
          const entryList = yield* EnumerableOwnProperties($, obj, 'key+value');
          if (IsAbrupt(entryList)) return entryList;
          return CreateArrayFromList($, entryList);
        }),

        /**
         * 20.1.2.6 Object.freeze ( O )
         * 
         * This function performs the following steps when called:
         * 
         * 1. If O is not an Object, return O.
         * 2. Let status be ? SetIntegrityLevel(O, frozen).
         * 3. If status is false, throw a TypeError exception.
         * 4. Return O.
         */
        'freeze': method(function*($, _thisValue, O) {
          if (!(O instanceof Obj)) return O;
          const status = SetIntegrityLevel($, O, FROZEN);
          if (IsAbrupt(status)) return status;
          if (status === false) return $.throw('TypeError', 'Object.freeze failed');
          return O;
        }),

        /**
         * 20.1.2.7 Object.fromEntries ( iterable )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Perform ? RequireObjectCoercible(iterable).
         * 2. Let obj be OrdinaryObjectCreate(%Object.prototype%).
         * 3. Assert: obj is an extensible ordinary object with no own properties.
         * 4. Let closure be a new Abstract Closure with parameters
         *    (key, value) that captures obj and performs the following
         *    steps when called:
         *     a. Let propertyKey be ? ToPropertyKey(key).
         *     b. Perform ! CreateDataPropertyOrThrow(obj, propertyKey, value).
         *     c. Return undefined.
         * 5. Let adder be CreateBuiltinFunction(closure, 2, "", « »).
         * 6. Return ? AddEntriesFromIterable(obj, iterable, adder).
         * 
         * NOTE: The function created for adder is never directly
         * accessible to ECMAScript code.
         */
        'fromEntries': method(function*($, _thisValue, iterable) {

          throw new Error('NOT IMPLEMENTED - need iterators');

          // const coercibleStatus = RequireObjectCoercible($, iterable);
          // if (IsAbrupt(coercibleStatus)) return coercibleStatus;
          // const obj = OrdinaryObjectCreate({Prototype: objectPrototype});
          // const closure = new AbstractClosure((key, value) => {
          //   const propertyKey = ToPropertyKey($, key);
          //   CreateDataPropertyOrThrow($, obj, propertyKey, value);
          // });
          // const adder = CreateBuiltinFunction(closure, 2, '', realm);
          // return yield* AddEntriesFromIterable($, obj, iterable, adder);
        }),

        /**
         * 20.1.2.8 Object.getOwnPropertyDescriptor ( O, P )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Let obj be ? ToObject(O).
         * 2. Let key be ? ToPropertyKey(P).
         * 3. Let desc be ? obj.[[GetOwnProperty]](key).
         * 4. Return FromPropertyDescriptor(desc).
         */
        'getOwnPropertyDescriptor': method(function*($, _thisValue, O, P) {
          const obj = ToObject($, O);
          if (IsAbrupt(obj)) return obj;
          const key = yield* ToPropertyKey($, P);
          if (IsAbrupt(key)) return key;
          const desc = obj.GetOwnProperty($, key);
          if (IsAbrupt(desc)) return desc;
          return FromPropertyDescriptor($, desc);
        }),

        /**
         * 20.1.2.9 Object.getOwnPropertyDescriptors ( O )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Let obj be ? ToObject(O).
         * 2. Let ownKeys be ? obj.[[OwnPropertyKeys]]().
         * 3. Let descriptors be OrdinaryObjectCreate(%Object.prototype%).
         * 4. For each element key of ownKeys, do
         *     a. Let desc be ? obj.[[GetOwnProperty]](key).
         *     b. Let descriptor be FromPropertyDescriptor(desc).
         *     c. If descriptor is not undefined, perform
         *        ! CreateDataPropertyOrThrow(descriptors, key,
         *        descriptor).
         * 5. Return descriptors.
         */
        'getOwnPropertyDescriptors': method(function*($, _thisValue, O) {
          const obj = ToObject($, O);
          if (IsAbrupt(obj)) return obj;
          const ownKeys = obj.OwnPropertyKeys($);
          if (IsAbrupt(ownKeys)) return ownKeys;
          const descriptors = OrdinaryObjectCreate({Prototype: objectPrototype});
          for (const key of ownKeys) {
            const desc = obj.GetOwnProperty($, key);
            if (IsAbrupt(desc)) return desc;
            const descriptor = FromPropertyDescriptor($, desc);
            if (descriptor != null) {
              descriptors.OwnProps.set(key, propWEC(descriptor));
            }
          }
          return descriptors;
        }),

        /**
         * 20.1.2.10 Object.getOwnPropertyNames ( O )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Return CreateArrayFromList(? GetOwnPropertyKeys(O, string)).
         */
        'getOwnPropertyNames': method(function*($, _thisValue, O) {
          const keys = GetOwnPropertyKeys($, O, STRING);
          if (IsAbrupt(keys)) return keys;
          return CreateArrayFromList($, keys);
        }),

        /**
         * 20.1.2.11 Object.getOwnPropertySymbols ( O )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Return CreateArrayFromList(? GetOwnPropertyKeys(O, symbol)).
         */
        'getOwnPropertySymbols': method(function*($, _thisValue, O) {
          const keys = GetOwnPropertyKeys($, O, SYMBOL);
          if (IsAbrupt(keys)) return keys;
          return CreateArrayFromList($, keys);
        }),

        /**
         * 20.1.2.12 Object.getPrototypeOf ( O )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Let obj be ? ToObject(O).
         * 2. Return ? obj.[[GetPrototypeOf]]().
         */
        'getPrototypeOf': method(function*($, _thisValue, O) {
          const obj = ToObject($, O);
          if (IsAbrupt(obj)) return obj;
          return obj.GetPrototypeOf($);
        }),

        /**
         * 20.1.2.13 Object.hasOwn ( O, P )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Let obj be ? ToObject(O).
         * 2. Let key be ? ToPropertyKey(P).
         * 3. Return ? HasOwnProperty(obj, key).
         */
        'hasOwn': method(function*($, _thisValue, O, P) {
          const obj = ToObject($, O);
          if (IsAbrupt(obj)) return obj;
          const key = yield* ToPropertyKey($, P);
          if (IsAbrupt(key)) return key;
          return HasOwnProperty($, obj, key);
        }),

        /**
         * 20.1.2.14 Object.is ( value1, value2 )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Return SameValue(value1, value2).
         */
        'is': method(function*($, _thisValue, value1, value2) {
          return SameValue(value1, value2);
        }),

        /**
         * 20.1.2.15 Object.isExtensible ( O )
         * 
         * This function performs the following steps when called:
         * 
         * 1. If O is not an Object, return false.
         * 2. Return ? IsExtensible(O).
         */
        'isExtensible': method(function*($, _thisValue, O) {
          if (!(O instanceof Obj)) return false;
          return IsExtensible($, O);
        }),

        /**
         * 20.1.2.16 Object.isFrozen ( O )
         * 
         * This function performs the following steps when called:
         * 
         * 1. If O is not an Object, return true.
         * 2. Return ? TestIntegrityLevel(O, frozen).
         */
        'isFrozen': method(function*($, _thisValue, O) {
          if (!(O instanceof Obj)) return true;
          return TestIntegrityLevel($, O, FROZEN);
        }),

        /**
         * 20.1.2.17 Object.isSealed ( O )
         * 
         * This function performs the following steps when called:
         * 
         * 1. If O is not an Object, return true.
         * 2. Return ? TestIntegrityLevel(O, sealed).
         */
        'isSealed': method(function*($, _thisValue, O) {
          if (!(O instanceof Obj)) return true;
          return TestIntegrityLevel($, O, SEALED);
        }),

        /**
         * 20.1.2.18 Object.keys ( O )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Let obj be ? ToObject(O).
         * 2. Let keyList be ? EnumerableOwnProperties(obj, key).
         * 3. Return CreateArrayFromList(keyList).
         */
        'keys': method(function*($, _thisValue, O) {
          const obj = ToObject($, O);
          if (IsAbrupt(obj)) return obj;
          const keyList = yield* EnumerableOwnProperties($, obj, 'key');
          if (IsAbrupt(keyList)) return keyList;
          return CreateArrayFromList($, keyList);
        }),

        /**
         * 20.1.2.19 Object.preventExtensions ( O )
         * 
         * This function performs the following steps when called:
         * 
         * 1. If O is not an Object, return O.
         * 2. Let status be ? O.[[PreventExtensions]]().
         * 3. If status is false, throw a TypeError exception.
         * 4. Return O.
         */
        'preventExtensions': method(function*($, _thisValue, O) {
          if (!(O instanceof Obj)) return O;
          const status = O.PreventExtensions($);
          if (status === false) return $.throw('TypeError', 'Object.preventExtensions failed');
          return O;
        }),

        // 20.1.2.20 Object.prototype

        /**
         * 20.1.2.21 Object.seal ( O )
         * 
         * This function performs the following steps when called:
         * 
         * 1. If O is not an Object, return O.
         * 2. Let status be ? SetIntegrityLevel(O, sealed).
         * 3. If status is false, throw a TypeError exception.
         * 4. Return O.
         */
        'seal': method(function*($, _thisValue, O) {
          if (!(O instanceof Obj)) return O;
          const status = SetIntegrityLevel($, O, SEALED);
          if (IsAbrupt(status)) return status;
          if (status === false) return $.throw('TypeError', 'Object.seal failed');
          return O;
        }),

        /**
         * 20.1.2.22 Object.setPrototypeOf ( O, proto )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Set O to ? RequireObjectCoercible(O).
         * 2. If proto is not an Object and proto is not null, throw a
         *    TypeError exception.
         * 3. If O is not an Object, return O.
         * 4. Let status be ? O.[[SetPrototypeOf]](proto).
         * 5. If status is false, throw a TypeError exception.
         * 6. Return O.
         */
        'setPrototypeOf': method(function*($, _thisValue, O, proto) {
          const coercibleStatus = RequireObjectCoercible($, O);
          if (IsAbrupt(coercibleStatus)) return coercibleStatus;
          if (proto !== null && !(proto instanceof Obj)) {
            return $.throw(
              'TypeError',
              `Object prototype may only be an object or null: ${DebugString(proto)}`);
          }
          if (!(O instanceof Obj)) return O;
          const status = O.SetPrototypeOf($, proto);
          if (IsAbrupt(status)) return status;
          if (status === false) return $.throw('TypeError', 'Object.setPrototypeOf failed');
          return O;
        }),

        /**
         * 20.1.2.23 Object.values ( O )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Let obj be ? ToObject(O).
         * 2. Let valueList be ? EnumerableOwnProperties(obj, value).
         * 3. Return CreateArrayFromList(valueList).
         */
        'values': method(function*($, _thisValue, O) {
          const obj = ToObject($, O);
          if (IsAbrupt(obj)) return obj;
          const valueList = yield* EnumerableOwnProperties($, obj, 'value');
          if (IsAbrupt(valueList)) return valueList;
          return CreateArrayFromList($, valueList);
        }),
      });

      /**
       * 20.1.2.3.1 ObjectDefineProperties ( O, Properties )
       * 
       * The abstract operation ObjectDefineProperties takes
       * arguments O (an Object) and Properties (an ECMAScript
       * language value) and returns either a normal completion
       * containing an Object or a throw completion. It performs the
       * following steps when called:
       * 
       * 1. Let props be ? ToObject(Properties).
       * 2. Let keys be ? props.[[OwnPropertyKeys]]().
       * 3. Let descriptors be a new empty List.
       * 4. For each element nextKey of keys, do
       *     a. Let propDesc be ? props.[[GetOwnProperty]](nextKey).
       *     b. If propDesc is not undefined and
       *        propDesc.[[Enumerable]] is true, then
       *         i. Let descObj be ? Get(props, nextKey).
       *         ii. Let desc be ? ToPropertyDescriptor(descObj).
       *         iii. Append the pair (a two element List)
       *              consisting of nextKey and desc to the end of
       *              descriptors.
       * 5. For each element pair of descriptors, do
       *     a. Let P be the first element of pair.
       *     b. Let desc be the second element of pair.
       *     c. Perform ? DefinePropertyOrThrow(O, P, desc).
       * 6. Return O.
       */
      function* ObjectDefineProperties($: VM, O: Obj, Properties: Val): ECR<Obj> {
        const props = ToObject($, Properties);
        if (IsAbrupt(props)) return props;
        const keys = props.OwnPropertyKeys($);
        if (IsAbrupt(keys)) return keys;
        const descriptors: [PropertyKey, PropertyDescriptor][] = [];
        for (const nextKey of keys) {
          const propDesc = props.GetOwnProperty($, nextKey);
          if (IsAbrupt(propDesc)) return propDesc;
          if (propDesc == null || !propDesc.Enumerable) continue;
          const descObj = yield* Get($, props, nextKey);
          if (IsAbrupt(descObj)) return descObj;
          const desc = yield* ToPropertyDescriptor($, descObj);
          if (IsAbrupt(desc)) return desc;
          descriptors.push([nextKey, desc]);
        }
        for (const [P, desc] of descriptors) {
          const defineStatus = DefinePropertyOrThrow($, O, P, desc);
          if (IsAbrupt(defineStatus)) return defineStatus;
        }
        return O;
      }

      /**
       * 20.1.2.11.1 GetOwnPropertyKeys ( O, type )
       * 
       * The abstract operation GetOwnPropertyKeys takes arguments O
       * (an ECMAScript language value) and type (string or symbol)
       * and returns either a normal completion containing a List of
       * property keys or a throw completion. It performs the
       * following steps when called:
       * 
       * 1. Let obj be ? ToObject(O).
       * 2. Let keys be ? obj.[[OwnPropertyKeys]]().
       * 3. Let nameList be a new empty List.
       * 4. For each element nextKey of keys, do
       *     a. If nextKey is a Symbol and type is symbol, or if
       *        nextKey is a String and type is string, then
       *         i. Append nextKey to nameList.
       * 5. Return nameList.
       */
      function GetOwnPropertyKeys($: VM, O: Val, type: STRING|SYMBOL): CR<PropertyKey[]> {
        const obj = ToObject($, O);
        if (IsAbrupt(obj)) return obj;
        const keys = obj.OwnPropertyKeys($);
        if (IsAbrupt(keys)) return keys;
        const nameList: PropertyKey[] = [];
        for (const nextKey of keys) {
          if (typeof nextKey === (STRING.is(type) ? 'string' : 'symbol')) {
            nameList.push(nextKey);
          }
        }
        return nameList;
      }
    },
  },
};

/**
 * 20.2.2 Properties of the Function Constructor
 *
 * The Function constructor:
 *   - is itself a built-in function object.
 *   - has a [[Prototype]] internal slot whose value is %Function.prototype%.
 *   - has the following properties:
 *
 * 20.2.2.1 Function.length
 *
 * This is a data property with a value of 1. This property has the
 * attributes { [[Writable]]: false, [[Enumerable]]: false,
 * [[Configurable]]: true }.
 *
 * 20.2.2.2 Function.prototype
 * 
 * The value of Function.prototype is the Function prototype object.
 * 
 * This property has the attributes { [[Writable]]: false,
 * [[Enumerable]]: false, [[Configurable]]: false }.
 */
export const functionConstructor: Plugin = {
  id: 'functionConstructor',
  deps: [objectAndFunctionPrototype],
  realm: {
    CreateIntrinsics(realm, stagedGlobals) {
      const functionPrototype = realm.Intrinsics.get('%Function.prototype%')!;
      const functionCtor = CreateBuiltinFunction({
        // TODO - implement dynamic functions
        *Call() { throw new Error('NOT IMPLEMENTED'); },
        *Construct() { throw new Error('NOT IMPLEMENTED'); },
      }, 1, 'Function', realm, functionPrototype);
      functionCtor.OwnProps.set('prototype', propWC(functionPrototype));
      functionPrototype.OwnProps.set('constructor', propWC(functionCtor));

      realm.Intrinsics.set('%Function%', functionCtor);
      stagedGlobals.set('Function', propWC(functionCtor));
    },
  },
};

function makeWrapper(
  realm: RealmRecord,
  name: string,
  superClass: string|null,
  behavior: BuiltinFunctionBehavior,
): [BuiltinFunction, OrdinaryObject] {
  const ctor = CreateBuiltinFunction(
    behavior, 1, name, realm, realm.Intrinsics.get('%Function.prototype%')!);
  const prototype = OrdinaryObjectCreate({
    Prototype: superClass != null ? realm.Intrinsics.get(superClass) : null,
  }, {
    constructor: propWC(ctor),
  });
  ctor.OwnProps.set('prototype', prop0(prototype));
  realm.Intrinsics.set(`%${name}%`, ctor);
  realm.Intrinsics.set(`%${name}.prototype%`, prototype);
  return [ctor, prototype];
}

/**
 * 20.3 Boolean Objects
 * 
 * 20.3.1 The Boolean Constructor
 *
 * The Boolean constructor:
 *   - is %Boolean%.
 *   - is the initial value of the "Boolean" property of the global object.
 *   - creates and initializes a new Boolean object when called as a constructor.
 *   - performs a type conversion when called as a function rather than as a constructor.
 *   - may be used as the value of an extends clause of a class
 *     definition. Subclass constructors that intend to inherit the
 *     specified Boolean behaviour must include a super call to the
 *     Boolean constructor to create and initialize the subclass
 *     instance with a [[BooleanData]] internal slot.
 */
export const booleanObject: Plugin = {
  id: 'booleanObject',
  deps: [objectAndFunctionPrototype],
  realm: {
    CreateIntrinsics(realm, stagedGlobals) {
      /**
       * 20.3.1.1 Boolean ( value )
       *
       * This function performs the following steps when called:
       * 
       * 1. Let b be ToBoolean(value).
       * 2. If NewTarget is undefined, return b.
       * 3. Let O be ? OrdinaryCreateFromConstructor(NewTarget,
       *    "%Boolean.prototype%", « [[BooleanData]] »).
       * 4. Set O.[[BooleanData]] to b.
       * 5. Return O.
       */
      const [booleanCtor, booleanPrototype] =
        makeWrapper(
          realm, 'Boolean', '%Object.prototype',
          callOrConstruct(function*($, [value], NewTarget) {
            const b = ToBoolean(value);
            if (NewTarget == null) return b;
            return yield* OrdinaryCreateFromConstructor(
              $, NewTarget, '%Boolean.prototype%', {
                BooleanData: b,
              });
          }));
      stagedGlobals.set('Boolean', propWC(booleanCtor));

      /**
       * 20.3.3 Properties of the Boolean Prototype Object
       *
       * The Boolean prototype object:
       *       
       *   - is %Boolean.prototype%.
       *   - is an ordinary object.
       *   - is itself a Boolean object; it has a [[BooleanData]]
       *     internal slot with the value false.
       *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
       *
       * The abstract operation thisBooleanValue takes argument
       * value. It performs the following steps when called:
       * 
       * 1. If value is a Boolean, return value.
       * 2. If value is an Object and value has a [[BooleanData]] internal slot, then
       * a. Let b be value.[[BooleanData]].
       * b. Assert: b is a Boolean.
       * c. Return b.
       * 3. Throw a TypeError exception.
       */
      function thisBooleanValue($: VM, value: Val): CR<boolean> {
        if (typeof value === 'boolean') return value;
        if (value instanceof Obj && value.BooleanData != null) {
          Assert(typeof value.BooleanData === 'boolean');
          return value.BooleanData;
        }
        return $.throw('TypeError');
      }

      defineProperties(realm, booleanPrototype, {
        /**
         * 20.3.3.2 Boolean.prototype.toString ( )
         *
         * This method performs the following steps when called:
         * 
         * 1. Let b be ? thisBooleanValue(this value).
         * 2. If b is true, return "true"; else return "false".
         */
        'toString': method(function*($, thisValue) {
          const b = thisBooleanValue($, thisValue);
          if (IsAbrupt(b)) return b;
          return b ? 'true' : 'false';
        }),
  
        /**
         * 20.3.3.3 Boolean.prototype.valueOf ( )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Return ? thisBooleanValue(this value).
         */
        'valueOf': method(function*($, thisValue) {
          debugger;
          return thisBooleanValue($, thisValue);
        }),
      });
    },
  },
};

/**
 * 20.4 Symbol Objects
 *
 * 20.4.1 The Symbol Constructor
 *
 * The Symbol constructor:
 *   - is %Symbol%.
 *   - is the initial value of the "Symbol" property of the global object.
 *   - returns a new Symbol value when called as a function.
 *   - is not intended to be used with the new operator.
 *   - is not intended to be subclassed.
 *   - may be used as the value of an extends clause of a class
 *     definition but a super call to it will cause an exception.
 */
export const symbolObject: Plugin = {
  id: 'symbolObject',
  deps: [objectAndFunctionPrototype],
  realm: {
    CreateIntrinsics(realm, stagedGlobals) {
      /**
       * 20.4.1.1 Symbol ( [ description ] )
       *
       * This function performs the following steps when called:
       * 
       * 1. If NewTarget is not undefined, throw a TypeError exception.
       * 2. If description is undefined, let descString be undefined.
       * 3. Else, let descString be ? ToString(description).
       * 4. Return a new Symbol whose [[Description]] is descString.
       *
       * ---
       *
       * 20.4.2.9 Symbol.prototype
       *
       * The initial value of Symbol.prototype is the Symbol prototype object.
       *
       * This property has the attributes { [[Writable]]: false,
       * [[Enumerable]]: false, [[Configurable]]: false }.
       *
       * ---
       *
       * 20.4.3 Properties of the Symbol Prototype Object
       *
       * The Symbol prototype object:
       *   - is %Symbol.prototype%.
       *   - is an ordinary object.
       *   - is not a Symbol instance and does not have a
       *     [[SymbolData]] internal slot.
       *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
       */
      const [symbolCtor, symbolPrototype] =
        makeWrapper(
          realm, 'Symbol', '%Object.prototype',
          callOrConstruct(function*($, [description], NewTarget) {
            if (NewTarget != null) {
              return $.throw('TypeError', 'Symbol is not a constructor');
            }
            const descString =
              description == null ? undefined : yield* ToString($, description);
            if (IsAbrupt(descString)) return descString;
            return Symbol(descString);
          }));
      stagedGlobals.set('Symbol', propWC(symbolCtor));

      /**
       * 20.4.2 Properties of the Symbol Constructor
       *
       * The Symbol constructor:
       *   - has a [[Prototype]] internal slot whose value is %Function.prototype%.
       *   - has the following properties:
       */
      defineProperties(realm, symbolCtor, {
        /** 20.4.2.1 Symbol.asyncIterator */
        'asyncIterator': prop0(Symbol.asyncIterator),

        /** 20.4.2.3 Symbol.hasInstance */
        'hasInstance': prop0(Symbol.hasInstance),

        /** 20.4.2.4 Symbol.isConcatSpreadable */
        'isConcatSpreadable': prop0(Symbol.isConcatSpreadable),

        /** 20.4.2.5 Symbol.iterator */
        'iterator': prop0(Symbol.iterator),

        /** 20.4.2.7 Symbol.match */
        'match': prop0(Symbol.match),

        /** 20.4.2.8 Symbol.matchAll */
        'matchAll': prop0(Symbol.matchAll),

        /** 20.4.2.10 Symbol.replace */
        'replace': prop0(Symbol.replace),

        /** 20.4.2.11 Symbol.search */
        'search': prop0(Symbol.search),

        /** 20.4.2.12 Symbol.species */
        'species': prop0(Symbol.species),

        /** 20.4.2.13 Symbol.split */
        'split': prop0(Symbol.split),

        /** 20.4.2.14 Symbol.toPrimitive */
        'toPrimitive': prop0(Symbol.toPrimitive),

        /** 20.4.2.15 Symbol.toStringTag */
        'toStringTag': prop0(Symbol.toStringTag),

        /** 20.4.2.16 Symbol.unscopables */
        'unscopables': prop0(Symbol.unscopables),

        /**
         * 20.4.2.2 Symbol.for ( key )
         *
         * This function performs the following steps when called:
         * 
         * 1. Let stringKey be ? ToString(key).
         * 2. For each element e of the GlobalSymbolRegistry List, do
         *     a. If SameValue(e.[[Key]], stringKey) is true, return e.[[Symbol]].
         * 3. Assert: GlobalSymbolRegistry does not currently contain an
         *    entry for stringKey.
         * 4. Let newSymbol be a new Symbol whose [[Description]] is stringKey.
         * 5. Append the Record { [[Key]]: stringKey, [[Symbol]]:
         *    newSymbol } to the GlobalSymbolRegistry List.
         * 6. Return newSymbol.
         *
         * The GlobalSymbolRegistry is an append-only List that is
         * globally available. It is shared by all realms. Prior to the
         * evaluation of any ECMAScript code, it is initialized as a new
         * empty List. Elements of the GlobalSymbolRegistry are Records
         * with the structure defined in Table 59.
         *
         * Table 59: GlobalSymbolRegistry Record Fields
         * [[Key]], a String - A string key used to globally identify a Symbol.
         * [[Symbol]], a Symbol - A symbol that can be retrieved from any realm.
         *
         * NOTE: We reuse the host's registry.
         */
        'for': method(function*($, _, key) {
          const stringKey = yield* ToString($, key);
          if (IsAbrupt(stringKey)) return stringKey;
          return Symbol.for(stringKey);
        }),

        /**
         * 20.4.2.6 Symbol.keyFor ( sym )
         *
         * This function performs the following steps when called:
         *
         * 1. If sym is not a Symbol, throw a TypeError exception.
         * 2. Return KeyForSymbol(sym).
         */
        'keyFor': method(function*($, _, sym) {
          if (typeof sym !== 'symbol') {
            return $.throw('TypeError', `${DebugString(sym)} is not a symbol`);
          }
          return Symbol.keyFor(sym);
        }),
      });

      /**
       * (20.4.3) The abstract operation thisSymbolValue takes argument
       * value. It performs the following steps when called:
       * 
       * 1. If value is a Symbol, return value.
       * 2. If value is an Object and value has a [[SymbolData]] internal slot, then
       *     a. Let s be value.[[SymbolData]].
       *     b. Assert: s is a Symbol.
       *     c. Return s.
       * 3. Throw a TypeError exception.
       */
      function thisSymbolValue($: VM, value: Val, method: string): CR<symbol> {
        if (typeof value === 'symbol') return value;
        if (value instanceof Obj && value.SymbolData != null) {
          Assert(typeof value.SymbolData === 'symbol');
          return value.SymbolData;
        }
        return $.throw('TypeError', `Symbol.prototype${method} requires that 'this' be a Symbol`);
      }

      defineProperties(realm, symbolPrototype, {
        /**
         * 20.4.3.2 get Symbol.prototype.description
         *
         * Symbol.prototype.description is an accessor property whose
         * set accessor function is undefined. Its get accessor
         * function performs the following steps when called:
         * 
         * 1. Let s be the this value.
         * 2. Let sym be ? thisSymbolValue(s).
         * 3. Return sym.[[Description]].
         */
        'description': getter(function*($, thisValue) {
          const s = thisSymbolValue($, thisValue, '.description');
          if (IsAbrupt(s)) return s;
          return s.description;
        }),
        
        /**
         * 20.4.3.3 Symbol.prototype.toString ( )
         *
         * This method performs the following steps when called:
         * 
         * 1. Let sym be ? thisSymbolValue(this value).
         * 2. Return SymbolDescriptiveString(sym).
         */
        ['toString' as string]: method(function*($, thisValue) {
          const s = thisSymbolValue($, thisValue, '.toString');
          if (IsAbrupt(s)) return s;
          return SymbolDescriptiveString(s);
        }),

        /**
         * 20.4.3.4 Symbol.prototype.valueOf ( )
         *
         * This method performs the following steps when called:
         *
         * 1. Return ? thisSymbolValue(this value).
         */
        ['valueOf' as string]: method(function*($, thisValue) {
          return thisSymbolValue($, thisValue, '.valueOf');
        }),

        /**
         * 20.4.3.5 Symbol.prototype [ @@toPrimitive ] ( hint )
         *
         * This method is called by ECMAScript language operators to
         * convert a Symbol object to a primitive value.
         *
         * It performs the following steps when called:
         *
         * 1. Return ? thisSymbolValue(this value).
         *
         * NOTE: The argument is ignored.
         *
         * This property has the attributes { [[Writable]]: false,
         * [[Enumerable]]: false, [[Configurable]]: true }.
         * The value of the "name" property of this method is
         * "[Symbol.toPrimitive]".
         */
        [Symbol.toPrimitive]: method(function*($, thisValue, _hint) {
          return thisSymbolValue($, thisValue, ' [ @@toPrimitive ]');
        }),

        /**
         * 20.4.3.6 Symbol.prototype [ @@toStringTag ]
         *
         * The initial value of the @@toStringTag property is the
         * String value "Symbol".
         *
         * This property has the attributes { [[Writable]]: false,
         * [[Enumerable]]: false, [[Configurable]]: true }.
         */
        [Symbol.toStringTag]: propC('Symbol'),
      });
    },
  },
};

/**
 * 20.4.3.3.1 SymbolDescriptiveString ( sym )
 *
 * The abstract operation SymbolDescriptiveString takes
 * argument sym (a Symbol) and returns a String. It performs
 * the following steps when called:
 * 
 * 1. Let desc be sym's [[Description]] value.
 * 2. If desc is undefined, set desc to the empty String.
 * 3. Assert: desc is a String.
 * 4. Return the string-concatenation of "Symbol(", desc, and ")".
 */
export function SymbolDescriptiveString(sym: symbol): string {
  const desc = sym.description;
  if (desc == null) return 'Symbol()';
  Assert(typeof desc === 'string');
  return `Symbol(${desc})`;
}

/**
 * 21.1 Number Objects
 *
 * 21.1.1 The Number Constructor
 *
 * The Number constructor:
 *   - is %Number%.
 *   - is the initial value of the "Number" property of the global object.
 *   - creates and initializes a new Number object when called as a constructor.
 *   - performs a type conversion when called as a function rather than as a constructor.
 *   - may be used as the value of an extends clause of a class
 *     definition. Subclass constructors that intend to inherit the
 *     specified Number behaviour must include a super call to the
 *     Number constructor to create and initialize the subclass
 *     instance with a [[NumberData]] internal slot.
 */
export const numberObject: Plugin = {
  id: 'numberObject',
  deps: [objectAndFunctionPrototype],
  realm: {
    CreateIntrinsics(realm, stagedGlobals) {

      /**
       * 19.2.4 parseFloat ( string )
       *
       * This function produces a Number value dictated by
       * interpretation of the contents of the string argument as a
       * decimal literal.
       *
       * It is the %parseFloat% intrinsic object.
       *
       * It performs the following steps when called:
       * 
       * 1. Let inputString be ? ToString(string).
       * 2. Let trimmedString be ! TrimString(inputString, start).
       * 3. Let trimmed be StringToCodePoints(trimmedString).
       * 4. Let trimmedPrefix be the longest prefix of trimmed that
       *    satisfies the syntax of a StrDecimalLiteral, which might be
       *    trimmed itself. If there is no such prefix, return NaN.
       * 5. Let parsedNumber be ParseText(trimmedPrefix, StrDecimalLiteral).
       * 6. Assert: parsedNumber is a Parse Node.
       * 7. Return StringNumericValue of parsedNumber.
       *
       * NOTE: This function may interpret only a leading portion of
       * string as a Number value; it ignores any code units that
       * cannot be interpreted as part of the notation of a decimal
       * literal, and no indication is given that any such code units
       * were ignored.
       */
      const parseFloatIntrinsic = CreateBuiltinFunction({
        *Call($, _, [string]) {
          const inputString = yield* ToString($, string);
          if (IsAbrupt(inputString)) return inputString;
          return Number.parseFloat(inputString);
        },
      }, 1, 'parseFloat', realm, realm.Intrinsics.get('%Function.prototype%')!);
      realm.Intrinsics.set('%parseFloat%', parseFloatIntrinsic);

      /**
       * 19.2.5 parseInt ( string, radix )
       *
       * This function produces an integral Number dictated by
       * interpretation of the contents of string according to the
       * specified radix. Leading white space in string is ignored. If
       * radix coerces to 0 (such as when it is undefined), it is
       * assumed to be 10 except when the number representation begins
       * with "0x" or "0X", in which case it is assumed to be 16. If
       * radix is 16, the number representation may optionally begin
       * with "0x" or "0X".
       *
       * It is the %parseInt% intrinsic object.
       *
       * It performs the following steps when called:
       * 
       * 1. Let inputString be ? ToString(string).
       * 2. Let S be ! TrimString(inputString, start).
       * 3. Let sign be 1.
       * 4. If S is not empty and the first code unit of S is the code
       *    unit 0x002D (HYPHEN-MINUS), set sign to -1.
       * 5. If S is not empty and the first code unit of S is either
       *    the code unit 0x002B (PLUS SIGN) or the code unit 0x002D
       *    (HYPHEN-MINUS), set S to the substring of S from index 1.
       * 6. Let R be ℝ(? ToInt32(radix)).
       * 7. Let stripPrefix be true.
       * 8. If R ≠ 0, then
       *     a. If R < 2 or R > 36, return NaN.
       *     b. If R ≠ 16, set stripPrefix to false.
       * 9. Else,
       *     a. Set R to 10.
       * 10. If stripPrefix is true, then
       *     a. If the length of S is at least 2 and the first two code
       *        units of S are either "0x" or "0X", then
       *         i. Set S to the substring of S from index 2.
       *         ii. Set R to 16.
       * 11. If S contains a code unit that is not a radix-R digit,
       *     let end be the index within S of the first such code unit;
       *     otherwise, let end be the length of S.
       * 12. Let Z be the substring of S from 0 to end.
       * 13. If Z is empty, return NaN.
       * 14. Let mathInt be the integer value that is represented by Z
       *     in radix-R notation, using the letters A-Z and a-z for digits
       *     with values 10 through 35. (However, if R = 10 and Z contains
       *     more than 20 significant digits, every significant digit
       *     after the 20th may be replaced by a 0 digit, at the option of
       *     the implementation; and if R is not one of 2, 4, 8, 10, 16,
       *     or 32, then mathInt may be an implementation-approximated
       *     integer representing the integer value denoted by Z in
       *     radix-R notation.)
       * 15. If mathInt = 0, then
       *     a. If sign = -1, return -0𝔽.
       *     b. Return +0𝔽.
       * 16. Return 𝔽(sign × mathInt).
       *
       * NOTE: This function may interpret only a leading portion of
       * string as an integer value; it ignores any code units that
       * cannot be interpreted as part of the notation of an integer,
       * and no indication is given that any such code units were
       * ignored.
       */
      const parseIntIntrinsic = CreateBuiltinFunction({
        *Call($, _, [string, radix]) {
          const inputString = yield* ToString($, string);
          if (IsAbrupt(inputString)) return inputString;
          let R = yield* ToInt32($, radix);
          if (IsAbrupt(R)) return R;
          return Number.parseInt(inputString, R);
        },
      }, 2, 'parseInt', realm, realm.Intrinsics.get('%Function.prototype%')!);
      realm.Intrinsics.set('%parseInt%', parseIntIntrinsic);

      function adapt(fn: (arg: number) => Val) {
        return method(function*(_$, _, value) {
          return fn(Number(value));
        });
      }

      /**
       * 21.1.1.1 Number ( value )
       *
       * This function performs the following steps when called:
       * 
       * 1. If value is present, then
       *     a. Let prim be ? ToNumeric(value).
       *     b. If prim is a BigInt, let n be 𝔽(ℝ(prim)).
       *     c. Otherwise, let n be prim.
       * 2. Else,
       *     a. Let n be +0𝔽.
       * 3. If NewTarget is undefined, return n.
       * 4. Let O be ? OrdinaryCreateFromConstructor(NewTarget,
       *    "%Number.prototype%", « [[NumberData]] »).
       * 5. Set O.[[NumberData]] to n.
       * 6. Return O.
       */
      const [numberCtor, numberPrototype] =
        makeWrapper(
          realm, 'Number', '%Object.prototype',
          callOrConstruct(function*($, [value], NewTarget) {
            let n = 0;
            if (value != null) {
              const prim = yield* ToNumeric($, value);
              if (IsAbrupt(prim)) return prim;
              n = Number(prim);
            }
            if (NewTarget == null) return n;
            return yield* OrdinaryCreateFromConstructor(
              $, NewTarget, '%Number.prototype%', {
                NumberData: n,
              });
          }));
      stagedGlobals.set('Number', propWC(numberCtor));

      /**
       * 21.1.2 Properties of the Number Constructor
       *
       * The Number constructor:
       *   - has a [[Prototype]] internal slot whose value is
       *     %Function.prototype%.
       *   - has the following properties:
       */
      defineProperties(realm, numberCtor, {
        /** 21.1.2.1 Number.EPSILON */
        'EPSILON': prop0(Number.EPSILON),

        /** 21.1.2.2 Number.isFinite ( number ) */
        'isFinite': adapt(Number.isFinite),

        /** 21.1.2.3 Number.isInteger ( number ) */
        'isInteger': adapt(Number.isInteger),

        /** 21.1.2.4 Number.isNaN ( number ) */
        'isNaN': adapt(Number.isNaN),

        /** 21.1.2.5 Number.isSafeInteger ( number ) */
        'isSafeInteger': adapt(Number.isSafeInteger),

        /** 21.1.2.6 Number.MAX_SAFE_INTEGER */
        'MAX_SAFE_INTEGER': prop0(Number.MAX_SAFE_INTEGER),

        /** 21.1.2.7 Number.MAX_VALUE */
        'MAX_VALUE': prop0(Number.MAX_VALUE),

        /** 21.1.2.8 Number.MIN_SAFE_INTEGER */
        'MIN_SAFE_INTEGER': prop0(Number.MIN_SAFE_INTEGER),

        /** 21.1.2.9 Number.MIN_VALUE */
        'MIN_VALUE': prop0(Number.MIN_VALUE),

        /** 21.1.2.10 Number.NaN */
        'NaN': prop0(Number.NaN),

        /** 21.1.2.11 Number.NEGATIVE_INFINITY */
        'NEGATIVE_INFINITY': prop0(Number.NEGATIVE_INFINITY),

        /**
         * 21.1.2.12 Number.parseFloat ( string )
         * 
         * The initial value of the "parseFloat" property is %parseFloat%.
         */
        'parseFloat': propWC(parseFloatIntrinsic),

        /**
         * 21.1.2.13 Number.parseInt ( string, radix )
         * 
         * The initial value of the "parseInt" property is %parseInt%.
         */
        'parseInt': propWC(parseIntIntrinsic),

        /** 21.1.2.14 Number.POSITIVE_INFINITY */
        'POSITIVE_INFINITY': prop0(Number.POSITIVE_INFINITY),
      });

      /**
       * (21.1.3) The abstract operation thisNumberValue takes argument
       * value. It performs the following steps when called:
       * 
       * 1. If value is a Number, return value.
       * 2. If value is an Object and value has a [[NumberData]] internal slot, then
       *     a. Let n be value.[[NumberData]].
       *     b. Assert: n is a Number.
       *     c. Return n.
       * 3. Throw a TypeError exception.
       *
       * The phrase “this Number value” within the specification of a
       * method refers to the result returned by calling the abstract
       * operation thisNumberValue with the this value of the method
       * invocation passed as the argument.
       */
      function thisNumberValue($: VM, value: Val, method: string): CR<number> {
        if (typeof value === 'number') return value;
        if (value instanceof Obj && value.NumberData != null) {
          Assert(typeof value.NumberData === 'number');
          return value.NumberData;
        }
        return $.throw('TypeError', `Number.prototype${method} requires that 'this' be a Number`);
      }

      /**
       * 21.1.3 Properties of the Number Prototype Object
       *
       * The Number prototype object:
       *   - is %Number.prototype%.
       *   - is an ordinary object.
       *   - is itself a Number object; it has a [[NumberData]] internal
       *     slot with the value +0𝔽.
       *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
       *
       * Unless explicitly stated otherwise, the methods of the Number
       * prototype object defined below are not generic and the this
       * value passed to them must be either a Number value or an
       * object that has a [[NumberData]] internal slot that has been
       * initialized to a Number value.
       */
      defineProperties(realm, numberPrototype, {
        /**
         * 21.1.3.2 Number.prototype.toExponential ( fractionDigits )
         *
         * This method returns a String containing this Number value
         * represented in decimal exponential notation with one digit
         * before the significand\'s decimal point and fractionDigits
         * digits after the significand\'s decimal point. If
         * fractionDigits is undefined, it includes as many
         * significand digits as necessary to uniquely specify the
         * Number (just like in ToString except that in this case the
         * Number is always output in exponential notation).
         *
         * It performs the following steps when called:
         * 
         * 1. Let x be ? thisNumberValue(this value).
         * 2. Let f be ? ToIntegerOrInfinity(fractionDigits).
         * 3. Assert: If fractionDigits is undefined, then f is 0.
         * 4. If x is not finite, return Number::toString(x, 10).
         * 5. If f < 0 or f > 100, throw a RangeError exception.
         * ... (elided since we just defer to the host at this point) ...
         */
        'toExponential': method(function*($, thisValue, fractionDigits) {
          const x = thisNumberValue($, thisValue, '.toExponential');
          if (IsAbrupt(x)) return x;
          const f = yield* ToIntegerOrInfinity($, fractionDigits);
          if (IsAbrupt(f)) return f;
          Assert(fractionDigits != null || f === 0);
          if (Number.isFinite(x)) {
            if (f < 0 || f > 100) {
              return $.throw('RangeError', 'toExponential() argument must be between 0 and 100');
            }
          }
          return x.toExponential(f);
        }),

        /**
         * 21.1.3.3 Number.prototype.toFixed ( fractionDigits )
         *
         * NOTE 1: This method returns a String containing this Number
         * value represented in decimal fixed-point notation with
         * fractionDigits digits after the decimal point. If
         * fractionDigits is undefined, 0 is assumed.
         *
         * It performs the following steps when called:
         * 
         * 1. Let x be ? thisNumberValue(this value).
         * 2. Let f be ? ToIntegerOrInfinity(fractionDigits).
         * 3. Assert: If fractionDigits is undefined, then f is 0.
         * 4. If f is not finite, throw a RangeError exception.
         * 5. If f < 0 or f > 100, throw a RangeError exception.
         * ... (elided since we just defer to the host at this point) ...
         */
        'toFixed': method(function*($, thisValue, fractionDigits) {
          const x = thisNumberValue($, thisValue, '.toFixed');
          if (IsAbrupt(x)) return x;
          const f = yield* ToIntegerOrInfinity($, fractionDigits);
          if (IsAbrupt(f)) return f;
          Assert(fractionDigits != null || f === 0);
          if (!Number.isFinite(f) || f < 0 || f > 100) {
            return $.throw('RangeError', 'toFixed() digits argument must be between 0 and 100');
          }
          return x.toFixed(f);
        }),

        /**
         * 21.1.3.4 Number.prototype.toLocaleString ( [ reserved1 [ , reserved2 ] ] )
         *
         * An ECMAScript implementation that includes the ECMA-402
         * Internationalization API must implement this method as
         * specified in the ECMA-402 specification. If an ECMAScript
         * implementation does not include the ECMA-402 API the
         * following specification of this method is used:
         *
         * This method produces a String value that represents this
         * Number value formatted according to the conventions of the
         * host environment's current locale. This method is
         * implementation-defined, and it is permissible, but not
         * encouraged, for it to return the same thing as toString.
         *
         * The meanings of the optional parameters to this method are
         * defined in the ECMA-402 specification; implementations that
         * do not include ECMA-402 support must not use those
         * parameter positions for anything else.
         */
        'toLocaleString': method(function*($, thisValue) {
          const x = thisNumberValue($, thisValue, '.toLocaleString');
          if (IsAbrupt(x)) return x;
          return String(x);
        }),

        /**
         * 21.1.3.5 Number.prototype.toPrecision ( precision )
         *
         * This method returns a String containing this Number value
         * represented either in decimal exponential notation with one
         * digit before the significand\'s decimal point and precision
         * - 1 digits after the significand\'s decimal point or in
         * decimal fixed notation with precision significant
         * digits. If precision is undefined, it calls ToString
         * instead.
         *
         * It performs the following steps when called:
         * 
         * 1. Let x be ? thisNumberValue(this value).
         * 2. If precision is undefined, return ! ToString(x).
         * 3. Let p be ? ToIntegerOrInfinity(precision).
         * 4. If x is not finite, return Number::toString(x, 10).
         * 5. If p < 1 or p > 100, throw a RangeError exception.
         * ... (elided since we just defer to the host at this point) ...
         */
        'toPrecision': method(function*($, thisValue, precision) {
          const x = thisNumberValue($, thisValue, '.toPrecision');
          if (IsAbrupt(x)) return x;
          if (precision == null) return String(x);
          const p = yield* ToIntegerOrInfinity($, precision);
          if (IsAbrupt(p)) return p;
          if (!Number.isFinite(x)) return String(x);
          if (p < 1 || p > 100) {
            return $.throw('RangeError', 'toPrecision() argument must be between 1 and 100');
          }
          return x.toPrecision(p);
        }),

        /**
         * 21.1.3.6 Number.prototype.toString ( [ radix ] )
         *
         * NOTE: The optional radix should be an integral Number value
         * in the inclusive interval from 2𝔽 to 36𝔽. If radix is
         * undefined then 10𝔽 is used as the value of radix.
         *
         * This method performs the following steps when called:
         * 
         * 1. Let x be ? thisNumberValue(this value).
         * 2. If radix is undefined, let radixMV be 10.
         * 3. Else, let radixMV be ? ToIntegerOrInfinity(radix).
         * 4. If radixMV is not in the inclusive interval from 2 to
         *    36, throw a RangeError exception.
         * 5. Return Number::toString(x, radixMV).
         *
         * This method is not generic; it throws a TypeError exception if
         * its this value is not a Number or a Number object. Therefore, it
         * cannot be transferred to other kinds of objects for use as a method.
         *
         * The "length" property of this method is 1𝔽.
         */
        'toString': method(function*($, thisValue, radix) {
          const x = thisNumberValue($, thisValue, '.toString');
          if (IsAbrupt(x)) return x;
          let radixMV = 10;
          if (radix != null) {
            const r = yield* ToIntegerOrInfinity($, radix);
            if (IsAbrupt(r)) return r;
            radixMV = r;
          }
          if (radixMV < 2 || radixMV > 36) {
            return $.throw('RangeError', 'toString() radix argument must be between 2 and 36');
          }
          return x.toString(radixMV);
        }),

        /**
         * 21.1.3.7 Number.prototype.valueOf ( )
         *
         * 1. Return ? thisNumberValue(this value).
         */
        'valueOf': method(function*($, thisValue) {
          return thisNumberValue($, thisValue, '.valueOf');
        }),
      });
    },
  },
};

// TODO - BigInt object 21.2
// TODO - Math object 21.3
// TODO - Date object 21.4

export const fundamental: Plugin = {
  deps: [
    objectAndFunctionPrototype,
    objectConstructor,
    functionConstructor,
    booleanObject,
    symbolObject,
    numberObject,
  ],
}
