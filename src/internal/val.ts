import { BIGINT, BOOLEAN, NULL, NUMBER, OBJECT, STRING, SYMBOL, UNDEFINED } from './enums';
import type { Obj } from './obj';

/**
 * 6.1 ECMAScript Language Types
 *
 * An ECMAScript language type corresponds to values that are directly
 * manipulated by an ECMAScript programmer using the ECMAScript
 * language. The ECMAScript language types are Undefined, Null,
 * Boolean, String, Symbol, Number, BigInt, and Object. An ECMAScript
 * language value is a value that is characterized by an ECMAScript
 * language type.
 */

export type Prim = undefined|null|boolean|string|symbol|number|bigint;
export type Val = Prim|Obj;

export type TypeOf<V extends Val> =
  V extends undefined ? UNDEFINED :
  V extends boolean ? BOOLEAN :
  V extends null ? NULL :
  V extends string ? STRING :
  V extends symbol ? SYMBOL :
  V extends number ? NUMBER :
  V extends bigint ? BIGINT :
  OBJECT;

export type Type = UNDEFINED|NULL|BOOLEAN|STRING|SYMBOL|NUMBER|BIGINT|OBJECT;
export function Type<T extends Val>(v: T): TypeOf<T> {
  switch (typeof v) {
    case 'undefined': return UNDEFINED as TypeOf<T>;
    case 'boolean': return BOOLEAN as TypeOf<T>;
    case 'string': return STRING as TypeOf<T>;
    case 'symbol': return SYMBOL as TypeOf<T>;
    case 'number': return NUMBER as TypeOf<T>;
    case 'bigint': return BIGINT as TypeOf<T>;
    case 'object':
      if (!v) return NULL as TypeOf<T>;
      // fall-through
    case 'function': // TODO - is this even possible?
      return OBJECT as TypeOf<T>;
  }
}

export type PropertyKey = string|symbol;
