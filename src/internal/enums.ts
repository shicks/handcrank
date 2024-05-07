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

export const UNRESOLVABLE: unique symbol = Symbol('unresolvable');
export type UNRESOLVABLE = typeof UNRESOLVABLE;

export const UNUSED: unique symbol = Symbol('unused');
export type UNUSED = typeof UNUSED;

export const EMPTY: unique symbol = Symbol('empty');
export type EMPTY = typeof EMPTY;
