/**
 * @fileoverview
 * 6.2.1 The Enum Specification Type
 *
 * Enums are values which are internal to the specification and not
 * directly observable from ECMAScript code. Enums are denoted using a
 * sans-serif typeface. For instance, a Completion Record's [[Type]]
 * field takes on values like normal, return, or throw. Enums have no
 * characteristics other than their name. The name of an enum serves
 * no purpose other than to distinguish it from other enums, and
 * implies nothing about its usage or meaning in context.
 */

class EnumSym<const S extends string> {
  constructor(readonly Symbol: S) {}
  is<T>(this: T, arg: unknown): arg is T {
    return arg === this;
  }
}

export const UNRESOLVABLE: UNRESOLVABLE = new EnumSym('unresolvable');
export interface UNRESOLVABLE extends EnumSym<'unresolvable'> {}

export const UNUSED: UNUSED = new EnumSym('unused');
export interface UNUSED extends EnumSym<'unused'> {}

export const EMPTY: EMPTY = new EnumSym('empty');
export interface EMPTY extends EnumSym<'empty'> {}

// Used by FunctionEnvironmentRecord [[ThisBindingStatus]] and [[ThisMode]]
export const LEXICAL: LEXICAL = new EnumSym('lexical');
export interface LEXICAL extends EnumSym<'lexical'> {}

// Used by FunctionEnvironmentRecord [[ThisMode]]
export const STRICT: STRICT = new EnumSym('strict');
export interface STRICT extends EnumSym<'strict'> {}

// Used by FunctionEnvironmentRecord [[ThisMode]]
export const GLOBAL: GLOBAL = new EnumSym('global');
export interface GLOBAL extends EnumSym<'global'> {}

// Used by FunctionEnvironmentRecord [[ThisBindingStatus]]
export const INITIALIZED: INITIALIZED = new EnumSym('initialized');
export interface INITIALIZED extends EnumSym<'initialized'> {}

// Used by FunctionEnvironmentRecord [[ThisBindingStatus]]
export const UNINITIALIZED: UNINITIALIZED = new EnumSym('uninitialized');
export interface UNINITIALIZED extends EnumSym<'uninitialized'> {}

// Indicates that a syntax operation implementation is not applicable
export const NOT_APPLICABLE: NOT_APPLICABLE = new EnumSym('not applicable');
export interface NOT_APPLICABLE extends EnumSym<'not applicable'> {}

/**
 * 6.1.1 The Undefined Type
 *
 * The Undefined type has exactly one value, called undefined. Any
 * variable that has not been assigned a value has the value
 * undefined.
 */
export const UNDEFINED: UNDEFINED = new EnumSym('undefined');
export interface UNDEFINED extends EnumSym<'undefined'> {}

/**
 * 6.1.2 The Null Type
 *
 * The Null type has exactly one value, called null.
 */
export const NULL: NULL = new EnumSym('null');
export interface NULL extends EnumSym<'null'> {}

/**
 * 6.1.3 The Boolean Type
 *
 * The Boolean type represents a logical entity having two values,
 * called true and false.
 */
export const BOOLEAN: BOOLEAN = new EnumSym('boolean');
export interface BOOLEAN extends EnumSym<'boolean'> {}

/**
 * 6.1.4 The String Type
 *
 * The String type is the set of all ordered sequences of zero or more
 * 16-bit unsigned integer values (“elements”) up to a maximum length
 * of 253 - 1 elements. The String type is generally used to represent
 * textual data in a running ECMAScript program, in which case each
 * element in the String is treated as a UTF-16 code unit value. Each
 * element is regarded as occupying a position within the
 * sequence. These positions are indexed with non-negative
 * integers. The first element (if any) is at index 0, the next
 * element (if any) at index 1, and so on. The length of a String is
 * the number of elements (i.e., 16-bit values) within it. The empty
 * String has length zero and therefore contains no elements.
 */
export const STRING: STRING = new EnumSym('string');
export interface STRING extends EnumSym<'string'> {}

/**
 * 6.1.5 The Symbol Type
 *
 * The Symbol type is the set of all non-String values that may be
 * used as the key of an Object property (6.1.7).
 *
 * Each possible Symbol value is unique and immutable.
 *
 * Each Symbol value immutably holds an associated value called
 * [[Description]] that is either undefined or a String value.
 */
export const SYMBOL: SYMBOL = new EnumSym('symbol');
export interface SYMBOL extends EnumSym<'symbol'> {}

/**
 * 6.1.6.1 The Number Type
 *
 * The Number type has exactly 18,437,736,874,454,810,627 (that is,
 * 264 - 253 + 3) values, representing the double-precision 64-bit
 * format IEEE 754-2019 values as specified in the IEEE Standard for
 * Binary Floating-Point Arithmetic, except that the
 * 9,007,199,254,740,990 (that is, 253 - 2) distinct “Not-a-Number”
 * values of the IEEE Standard are represented in ECMAScript as a
 * single special NaN value. (Note that the NaN value is produced by
 * the program expression NaN.) In some implementations, external code
 * might be able to detect a difference between various Not-a-Number
 * values, but such behaviour is implementation-defined; to ECMAScript
 * code, all NaN values are indistinguishable from each other.
 */
export const NUMBER: NUMBER = new EnumSym('number');
export interface NUMBER extends EnumSym<'number'> {}

/**
 * 6.1.6.2 The BigInt Type
 *
 * The BigInt type represents an integer value. The value may be any
 * size and is not limited to a particular bit-width. Generally, where
 * not otherwise noted, operations are designed to return exact
 * mathematically-based answers. For binary operations, BigInts act as
 * two's complement binary strings, with negative numbers treated as
 * having bits set infinitely to the left.
 */
export const BIGINT: BIGINT = new EnumSym('bigint');
export interface BIGINT extends EnumSym<'bigint'> {}

/**
 * 6.1.7 The Object Type
 *
 * An Object is logically a collection of properties.
 */
export const OBJECT: OBJECT = new EnumSym('object');
export interface OBJECT extends EnumSym<'object'> {}

// Parameter type for 10.2.3 OrdinaryFunctionCreate
export const LEXICAL_THIS: LEXICAL_THIS = new EnumSym('lexical-this');
export interface LEXICAL_THIS extends EnumSym<'lexical-this'> {}

// Parameter type for 10.2.3 OrdinaryFunctionCreate
export const NON_LEXICAL_THIS: NON_LEXICAL_THIS = new EnumSym('non-lexical-this');
export interface NON_LEXICAL_THIS extends EnumSym<'non-lexical-this'> {}

// Integrity level: sealed (7.3.16)
export const SEALED: SEALED = new EnumSym('sealed');
export interface SEALED extends EnumSym<'sealed'> {}

// Integrity level: frozen (7.3.16)
export const FROZEN: FROZEN = new EnumSym('frozen');
export interface FROZEN extends EnumSym<'frozen'> {}


/**
 * ???
 */
export const BASE: BASE = new EnumSym('base');
export interface BASE extends EnumSym<'base'> {}

export const DERIVED: DERIVED = new EnumSym('derived');
export interface DERIVED extends EnumSym<'derived'> {}
