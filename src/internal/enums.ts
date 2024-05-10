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

// Used by FunctionEnvironmentRecord
export const LEXICAL: LEXICAL = new EnumSym('lexical');
export interface LEXICAL extends EnumSym<'lexical'> {}

// Used by FunctionEnvironmentRecord
export const INITIALIZED: INITIALIZED = new EnumSym('initialized');
export interface INITIALIZED extends EnumSym<'initialized'> {}

// Used by FunctionEnvironmentRecord
export const UNINITIALIZED: UNINITIALIZED = new EnumSym('uninitialized');
export interface UNINITIALIZED extends EnumSym<'uninitialized'> {}
