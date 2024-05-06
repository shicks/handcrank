const ID = Symbol('InternalSymbol');

export const UNRESOLVABLE = {[ID]: 'unresolvable'} as const;
export type UNRESOLVABLE = typeof UNRESOLVABLE;

export const UNUSED = {[ID]: 'unused'} as const;
export type UNUSED = typeof UNUSED;

export const EMPTY = {[ID]: 'empty'} as const;
export type EMPTY = typeof EMPTY;
