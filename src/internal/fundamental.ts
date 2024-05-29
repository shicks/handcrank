/**
 * @fileoverview Intrinsic and global definitions for the following sections:
 *   - 20 Fundamental Objects
 *   - 21 Numbers and Dates
 *   - 22 Text Processing
 */

import { SameValue } from './abstract_compare';
import { ToBoolean, ToObject, ToPropertyKey, ToString } from './abstract_conversion';
import { Get, HasOwnProperty, HasProperty, Invoke } from './abstract_object';
import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { UNUSED } from './enums';
import { BuiltinFunction, BuiltinFunctionBehavior, CreateBuiltinFunction, Func, IsFunc, getter, method } from './func';
import { Obj, OrdinaryCreateFromConstructor, OrdinaryObject, OrdinaryObjectCreate } from './obj';
import { prop0, propC, propWC } from './property_descriptor';
import { RealmRecord, defineProperties } from './realm_record';
import { Val } from './val';
import { DebugString, ECR, Plugin, VM } from './vm';


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
          wrapperBehavior(function*($, [description], NewTarget) {
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
      function SymbolDescriptiveString(sym: symbol): string {
        const desc = sym.description;
        if (desc == null) return 'Symbol()';
        Assert(typeof desc === 'string');
        return `Symbol(${desc})`;
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
  deps: [objectAndFunctionPrototype],
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
       *
       * ---
       *
       * 20.5.3 Properties of the Error Prototype Object
       *
       * The Error prototype object:
       *   - is %Error.prototype%.
       *   - is an ordinary object.
       *   - is not an Error instance and does not have an [[ErrorData]]
       *     internal slot.
       *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
       */
      const [errorCtor, errorPrototype] =
        makeWrapper(
          realm, 'Error', '%Object.prototype',
          wrapperBehavior(errorBehavior));
      stagedGlobals.set('Error', propWC(errorCtor));

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
      function* errorBehavior($: VM, [message, options]: Val[], NewTarget: Val) {
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
            return $.throw('TypeError', `Method Error.prototype.toString called on incompatible receiver ${DebugString(O)}`);
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
        const [ctor, prototype] = makeWrapper(realm, name, '%Error.prototype',
          wrapperBehavior(errorBehavior));
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
        defineProperties(realm, prototype, {
          /** 20.5.6.3.2 NativeError.prototype.message */
          'message': propWC(''),
          /** 20.5.6.3.3 NativeError.prototype.name */
          'name': propWC(name),
        });
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
          *Call($) { return $.throw('TypeError'); },
        }, 0, '', realm, realm.Intrinsics.get('%Function.prototype%')!);
        throwTypeError.OwnProps.set('length', prop0(0));
        throwTypeError.OwnProps.set('name', prop0(''));
        return throwTypeError;
      })())
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


/**/

export const fundamental: Plugin = {
  deps: [
    objectAndFunctionPrototype,
    objectConstructor,
    functionConstructor,
    booleanObject,
    symbolObject,
    errorObject,
  ],
}
