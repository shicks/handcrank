/**
 * @fileoverview Intrinsic and global definitions for the following sections:
 *   - 20 Fundamental Objects
 *   - 21 Numbers and Dates
 */

import { ToBigInt, ToBoolean, ToInt32, ToIntegerOrInfinity, ToNumeric, ToPrimitive, ToString } from './abstract_conversion';
import { Assert } from './assert';
import { CR, IsAbrupt } from './completion_record';
import { BuiltinFunction, BuiltinFunctionBehavior, CreateBuiltinFunction, Func, callOrConstruct, getter, method } from './func';
import { Obj, OrdinaryCreateFromConstructor, OrdinaryObject, OrdinaryObjectCreate } from './obj';
import { prop0, propC, propWC } from './property_descriptor';
import { RealmRecord, defineProperties } from './realm_record';
import { Val } from './val';
import { DebugString, Plugin, VM } from './vm';
import { prelude } from './prelude';
import { NUMBER } from './enums';

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

function makeWrapper(
  realm: RealmRecord,
  name: string,
  superClass: string|null,
  behavior: BuiltinFunctionBehavior,
): [BuiltinFunction, OrdinaryObject] {
  const ctor = CreateBuiltinFunction(behavior, 1, name, {Realm: realm});
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
  deps: () => [prelude],
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
          callOrConstruct(function*($, NewTarget, value) {
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
  deps: () => [prelude],
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
          callOrConstruct(function*($, NewTarget, description) {
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
  deps: () => [prelude],
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
      }, 1, 'parseFloat', {Realm: realm});
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
      }, 2, 'parseInt', {Realm: realm});
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
          callOrConstruct(function*($, NewTarget, value) {
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

/**
 * 21.2 BigInt Objects
 * 
 * 21.2.1 The BigInt Constructor
 * 
 * The BigInt constructor:
 *   - is %BigInt%.
 *   - is the initial value of the "BigInt" property of the global object.
 *   - performs a type conversion when called as a function rather than
 *     as a constructor.
 *   - is not intended to be used with the new operator or to be
 *     subclassed. It may be used as the value of an extends clause of
 *     a class definition but a super call to the BigInt constructor
 *     will cause an exception.
 */
export const bigintObject: Plugin = {
  id: 'bigintObject',
  deps: () => [prelude],
  realm: {
    CreateIntrinsics(realm, stagedGlobals) {
      // function adapt(fn: (arg: bigint) => Val) {
      //   return method(function*(_$, _, value) {
      //     return fn(BigInt(value));
      //   });
      // }

      /**
       * 21.2.1.1 BigInt ( value )
       * 
       * This function performs the following steps when called:
       * 
       * 1. If NewTarget is not undefined, throw a TypeError exception.
       * 2. Let prim be ? ToPrimitive(value, number).
       * 3. If prim is a Number, return ? NumberToBigInt(prim).
       * 4. Otherwise, return ? ToBigInt(prim).
       */
      const [bigintCtor, bigintPrototype] =
        makeWrapper(
          realm, 'BigInt', '%Object.prototype',
          callOrConstruct(function*($: VM, NewTarget: Func|undefined, value: Val) {
            if (NewTarget != null) return $.throw('TypeError', 'not a constructor');
            const prim = yield* ToPrimitive($, value, NUMBER);
            if (IsAbrupt(prim)) return prim;
            if (typeof prim === 'number') {
              return BigInt(prim);
            }
            return ToBigInt($, prim);
          }));


      /**
       * 21.2.1.1.1 NumberToBigInt ( number )
       * 
       * The abstract operation NumberToBigInt takes argument number (a
       * Number) and returns either a normal completion containing a BigInt
       * or a throw completion. It performs the following steps when called:
       * 
       * 1. If IsIntegralNumber(number) is false, throw a RangeError exception.
       * 2. Return the BigInt value that represents ℝ(number).
       */

      /**
       * 21.2.2 Properties of the BigInt Constructor
       * 
       * The BigInt constructor:
       * 
       * has a [[Prototype]] internal slot whose value is %Function.prototype%.
       * has the following properties:
       */

      /**
       * 21.2.2.1 BigInt.asIntN ( bits, bigint )
       * 
       * This function performs the following steps when called:
       * 
       * 1. Set bits to ? ToIndex(bits).
       * 2. Set bigint to ? ToBigInt(bigint).
       * 3. Let mod be ℝ(bigint) modulo 2bits.
       * 4. If mod ≥ 2bits - 1, return ℤ(mod - 2bits); otherwise, return ℤ(mod).
       */

      /**
       * 21.2.2.2 BigInt.asUintN ( bits, bigint )
       * 
       * This function performs the following steps when called:
       * 
       * 1. Set bits to ? ToIndex(bits).
       * 2. Set bigint to ? ToBigInt(bigint).
       * 3. Return the BigInt value that represents ℝ(bigint) modulo 2bits.
       */

      /**
       * 21.2.2.3 BigInt.prototype
       * 
       * The initial value of BigInt.prototype is the BigInt prototype object.
       * 
       * This property has the attributes { [[Writable]]: false,
       * [[Enumerable]]: false, [[Configurable]]: false }.
       */

      /**
       * 21.2.3 Properties of the BigInt Prototype Object
       * 
       * The BigInt prototype object:
       *   - is %BigInt.prototype%.
       *   - is an ordinary object.
       *   - is not a BigInt object; it does not have a [[BigIntData]] internal slot.
       *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
       * 
       * The abstract operation thisBigIntValue takes argument value. It
       * performs the following steps when called:
       * 
       * 1. If value is a BigInt, return value.
       * 2. If value is an Object and value has a [[BigIntData]] internal slot, then
       *     a. Assert: value.[[BigIntData]] is a BigInt.
       *     b. Return value.[[BigIntData]].
       * 3. Throw a TypeError exception.
       * 
       * The phrase “this BigInt value” within the specification of a method
       * refers to the result returned by calling the abstract operation
       * thisBigIntValue with the this value of the method invocation passed
       * as the argument.
       */

      /**
       * 21.2.3.1 BigInt.prototype.constructor
       * 
       * The initial value of BigInt.prototype.constructor is %BigInt%.
       */

      /**
       * 21.2.3.2 BigInt.prototype.toLocaleString ( [ reserved1 [ , reserved2 ] ] )
       * 
       * An ECMAScript implementation that includes the ECMA-402
       * Internationalization API must implement this method as specified in
       * the ECMA-402 specification. If an ECMAScript implementation does
       * not include the ECMA-402 API the following specification of this
       * method is used:
       * 
       * This method produces a String value that represents this BigInt
       * value formatted according to the conventions of the host
       * environment's current locale. This method is
       * implementation-defined, and it is permissible, but not encouraged,
       * for it to return the same thing as toString.
       * 
       * The meanings of the optional parameters to this method are defined
       * in the ECMA-402 specification; implementations that do not include
       * ECMA-402 support must not use those parameter positions for
       * anything else.
       */

      /**
       * 21.2.3.3 BigInt.prototype.toString ( [ radix ] )
       * 
       * NOTE: The optional radix should be an integral Number value in the
       * inclusive interval from 2𝔽 to 36𝔽. If radix is undefined then 10𝔽
       * is used as the value of radix.
       * 
       * This method performs the following steps when called:
       * 
       * 1. Let x be ? thisBigIntValue(this value).
       * 2. If radix is undefined, let radixMV be 10.
       * 3. Else, let radixMV be ? ToIntegerOrInfinity(radix).
       * 4. If radixMV is not in the inclusive interval from 2 to 36, throw a RangeError exception.
       * 5. Return BigInt::toString(x, radixMV).
       * 
       * This method is not generic; it throws a TypeError exception if its
       * this value is not a BigInt or a BigInt object. Therefore, it cannot
       * be transferred to other kinds of objects for use as a method.
       */

      /**
       * 21.2.3.4 BigInt.prototype.valueOf ( )
       * 1. Return ? thisBigIntValue(this value).
       */

      /**
       * 21.2.3.5 BigInt.prototype [ @@toStringTag ]
       * 
       * The initial value of the @@toStringTag property is the String value "BigInt".
       * 
       * This property has the attributes { [[Writable]]: false,
       * [[Enumerable]]: false, [[Configurable]]: true }.
       */
    }
  },
};




/**
 * 19.2.1.2 HostEnsureCanCompileStrings ( calleeRealm )
 * 
 * The host-defined abstract operation HostEnsureCanCompileStrings
 * takes argument calleeRealm (a Realm Record) and returns either a
 * normal completion containing unused or a throw completion. It
 * allows host environments to block certain ECMAScript functions
 * which allow developers to interpret and evaluate strings as
 * ECMAScript code.
 * 
 * An implementation of HostEnsureCanCompileStrings must conform to
 * the following requirements:
 * 
 * If the returned Completion Record is a normal completion, it must
 * be a normal completion containing unused.
 * 
 * The default implementation of HostEnsureCanCompileStrings is to
 * return NormalCompletion(unused).
 */
export function HostEnsureCanCompileStrings(_$: VM, _calleeRealm: RealmRecord): CR<undefined> {
  // TODO - provide a mechanism to override this? maybe via plugin?
  return undefined;
}

// TODO - BigInt object 21.2
// TODO - Math object 21.3
// TODO - Date object 21.4

export const fundamental: Plugin = {
  deps: () => [
    booleanObject,
    symbolObject,
    numberObject,
  ],
}
