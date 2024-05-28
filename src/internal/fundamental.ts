/**
 * @fileoverview Intrinsic and global definitions for the following sections:
 *   - 20 Fundamental Objects
 *   - 21 Numbers and Dates
 *   - 22 Text Processing
 */

import { SameValue } from './abstract_compare';
import { ToBoolean, ToObject, ToPropertyKey } from './abstract_conversion';
import { Get, HasOwnProperty, Invoke } from './abstract_object';
import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt, Throw } from './completion_record';
import { BuiltinFunction, BuiltinFunctionBehavior, CreateBuiltinFunction, Func, method } from './func';
import { Obj, OrdinaryCreateFromConstructor, OrdinaryObject, OrdinaryObjectCreate } from './obj';
import { prop0, propWC } from './property_descriptor';
import { RealmRecord, defineProperties } from './realm_record';
import { Val } from './val';
import { ECR, Plugin, VM } from './vm';


// TODO:
function IsArray(..._args: unknown[]) { return false; }



/** Slots for basic data type wrapper objects. */
declare global {
  interface ObjectSlots {
    BooleanData?: boolean;
    StringData?: string;
    NumberData?: number;
    BigIntData?: bigint;
    SymbolData?: symbol;
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
      const functionPrototype = OrdinaryObjectCreate({Prototype: objectPrototype});
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
      const objectCtor = CreateBuiltinFunction({
        *Call($, _, [val]) { return ToObject($, val); },
        *Construct() { return OrdinaryObjectCreate(objectPrototype); },
      }, 1, 'Object', realm, functionPrototype);
      objectCtor.OwnProps.set('prototype', propWC(objectPrototype));
      objectPrototype.OwnProps.set('constructor', propWC(objectCtor));

      realm.Intrinsics.set('%Object%', objectCtor);
      stagedGlobals.set('Object', propWC(objectCtor));
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

// TODO - inline this if all wrappers are spec'd this way?
function wrapperBehavior(fn: ($: VM, argumentList: Val[], NewTarget?: Func) => ECR<Val>): BuiltinFunctionBehavior {
  return {
    Call($, _, argumentList) {
      return fn($, argumentList, undefined);
    },
    Construct($, argumentList, NewTarget) {
      return fn($, argumentList, NewTarget as Func) as ECR<Obj>;
    },
  };
}

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
  // We could make these ordinary functions that just assume intrinsics are defined?
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
            wrapperBehavior(function*($, [value], NewTarget) {
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
      function thisBooleanValue(value: Val): CR<boolean> {
        if (typeof value === 'boolean') return value;
        if (value instanceof Obj && value.BooleanData != null) {
          Assert(typeof value.BooleanData === 'boolean');
          return value.BooleanData;
        }
        return Throw('TypeError');
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
          const b = thisBooleanValue(thisValue);
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
          return thisBooleanValue(thisValue);
        }),
      });
    },
  },
};

/**/

export const fundamental: Plugin = {
  deps: [
    objectAndFunctionPrototype,
    objectConstructor,
    functionConstructor,
    booleanObject,
  ],
}
