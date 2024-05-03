import {CompletionRecord} from './CompletionRecord';
import {Assert} from './Assert';
import type {Obj, Property} from './Obj';

export type PrimType = 'number'|'string'|'boolean'|'symbol'|'bigint'|'null'|'undefined';
export type Type = PrimType|'object'|'function';
export type Prim = number|string|boolean|symbol|bigint|null|undefined;
export type Val = Obj|Prim;

export function HasProperty(object: Obj, prop: Property): CompletionRecord<boolean> {
  return object.HasProperty(prop);
}

export function Type(x: Val): Type {
  if (typeof x === 'object') {
    if (!x) return 'null';
    // Assert: x instanceof Obj
    return x.Type;
  }
  return typeof x as Type;
}

export function SameValue(x: Val, y: Val): CompletionRecord<boolean> {
  const tx = Type(x);
  if (tx !== Type(y)) return CompletionRecord.Normal(false);
  return tx === 'number' ? Number_sameValue(x as number, y as number) : SameValueNonNumber(x, y);
}

export function SameValueZero(x: Val, y: Val): CompletionRecord<boolean> {
  const tx = Type(x);
  if (tx !== Type(y)) return CompletionRecord.Normal(false);
  return tx === 'number' ? Number_sameValueZero(x as number, y as number) : SameValueNonNumber(x, y);
}

export function Number_sameValue(x: Num, y: Num): CompletionRecord<boolean> {
  
}

export function Number_sameValueZero(x: Num, y: Num): CompletionRecord<boolean> {
  
}

export function SameValueNonNumber(x: Val, y: Val): CompletionRecord<boolean> {
  const tx = Type(x);
  Assert(() => tx === Type(y));
  if (tx === 'null' || tx === 'undefined') return CompletionRecord.Normal(true);
  if (tx === 'bigint') return BigInt_equal(x as bigint, y as bigint);
  return CompletionRecord.Normal(x === y); // Note: string and boolean are free.
}

export function IsLessThan(x: Val, y: Val, LeftFirst: boolean): CompletionRecord<boolean> {
  try {
    let px: Prim, py: Prim;
    if (LeftFirst) {
      px = ReturnIfAbrupt(() => ToPrimitive(x));
      py = ReturnIfAbrupt(() => ToPrimitive(y));
    }
  } catch (abrupt) {
    return abrupt;
  }
}
