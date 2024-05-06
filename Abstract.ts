import { CR, IsAbrupt, Throw } from './CompletionRecord';
import { Assert } from './Assert';
import { type Obj, type Property, type Val, type Prim, type Type, type PrimType, ToObject } from './Obj';
import type { EnvironmentRecord } from './EnvironmentRecord';
import { ReferenceRecord } from './ReferenceRecord';

export function GetIdentifierReference(env: EnvironmentRecord|null, name: string, strict: boolean): CR<ReferenceRecord> {
  if (!env) {
    return new ReferenceRecord
  }
}





////////

export function IsObject(input: Val): input is Obj {
  return typeof input === 'object';
}

export function ToPrimitive(input: Val, preferredType?: 'string'|'number'): CR<Prim> {
  if (!IsObject(input)) return input;
  const exoticToPrim = GetMethod(input, Symbol.toPrimitive);
  if (exoticToPrim != undefined) {
    const hint = preferredType || 'default';
    Assert(() => /^(default|string|number)$/.test(hint));
    const result = Call(exoticToPrim, input, [hint]);
    if (IsAbrupt(result) || !IsObject(result)) return result;
    return Throw('TypeError', 'Cannot convert object to primitive value');
  }
  if (!preferredType) preferredType = 'number';
  return OrdinaryToPrimitive(input, preferredType);
}

export function OrdinaryToPrimitive(O: Obj, hint: 'string'|'number'): CR<Prim> {
  const methodNames = hint === 'string' ? ['toString', 'valueOf'] : ['valueOf', 'toString'];
  for (const name of methodNames) {
    const method = Get(O, name);
    if (IsAbrupt(method)) return method;
    if (IsCallable(method)) {
      const result = Call(method, O);
      if (IsAbrupt(result)) return result;
      if (!IsObject(result)) return result;
    }
  }
  return Throw('TypeError', 'Cannot convert object to primitive value');
}

export function GetMethod(V: Val, P: PropertyKey): CR<Obj> {
  const func = GetV(V, P);
  if (IsAbrupt(func)) return func;
  if (!IsCallable(func)) return Throw('TypeError');
  return func as Obj;
}

export function Get(O: Obj, P: PropertyKey): CR<Val> {
  return O.Get(P, O);
}

export function GetV(V: Val, P: PropertyKey): CR<Val> {
  const O = ToObject(V);
  if (IsAbrupt(O)) return O;
  return O.Get(P, V);
}

export function Call(F: Val, V: Val, argumentsList?: Val[]): CR<Val> {
  // TODO - message `${debugString(F)} is not a function`
  if (!IsCallable(F)) return Throw('TypeError', `Not a function`);
  return (F as Obj).Call!(V, argumentsList || []);
}

export function IsCallable(argument: Val): boolean {
  if (!IsObject(argument)) return false;
  return argument.Call != null;
}

export function IsConstructor(argument: Val): boolean {
  if (!IsObject(argument)) return false;
  return argument.Construct != null;
}

export function HasProperty(object: Obj, prop: Property): CR<boolean> {
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

export function SameValue(x: Val, y: Val): CR<boolean> {
  return Object.is(x, y);
}

export function SameValueZero(x: Val, y: Val): CR<boolean> {
  return Object.is(x, y) || (x === 0 && y === 0);
}

export function IsLessThan(x: Val, y: Val, LeftFirst: boolean): CR<boolean|undefined> {
  let px, py;
  if (LeftFirst) {
    px = ToPrimitive(x);
    if (IsAbrupt(px)) return px;
    py = ToPrimitive(y);
    if (IsAbrupt(py)) return py;
  } else {
    py = ToPrimitive(y);
    if (IsAbrupt(py)) return py;
    px = ToPrimitive(x);
    if (IsAbrupt(px)) return px;
  }
  if (typeof px === 'string' && typeof py === 'string') {
    return px < py;
  } else if (typeof px === 'bigint' && typeof py === 'string') {
    const ny = StringToBigInt(py);
    if (ny == undefined) return undefined;
    return px < ny;
  } else if (typeof px === 'string' && typeof py === 'bigint') {
    const nx = StringToBigInt(px);
    if (nx == undefined) return undefined;
    return nx < py;
  }
  const nx = ToNumeric(px);
  if (IsAbrupt(nx)) return nx;
  const ny = ToNumeric(py);
  if (IsAbrupt(ny)) return ny;
  if (typeof nx === 'number' && isNaN(nx)) return undefined;
  if (typeof ny === 'number' && isNaN(ny)) return undefined;
  return nx < ny;  
}

export function StringToBigInt(str: string): bigint|undefined {
  // NOTE: Rely on host VM for this, rather than implementing the spec
  try {
    return BigInt(str);
  } catch (_) {
    return undefined;
  }
}

export function StringToNumber(str: string): number {
  return Number(str);
}

export function ToNumeric(value: Val): CR<number|bigint> {
  const primValue = ToPrimitive(value, 'number');
  if (IsAbrupt(primValue)) return primValue;
  if (typeof primValue === 'bigint') return primValue;
  return ToNumber(primValue);
}

export function ToNumber(argument: Val): CR<number> {
  if (typeof argument === 'number') return argument;
  if (typeof argument === 'symbol') return Throw('TypeError', 'Cannot convert a Symbol value to a number');
  if (typeof argument === 'bigint') return Throw('TypeError', 'Cannot convert a BigInt value to a number');
  if (argument === undefined) return NaN;
  if (argument === null || argument === false) return 0;
  if (argument === true) return 1;
  if (typeof argument === 'string') return StringToNumber(argument);
  Assert(() => IsObject(argument));
  const primValue = ToPrimitive(argument, 'number');
  if (IsAbrupt(primValue)) return primValue;
  Assert(() => !IsObject(primValue));
  return ToNumber(primValue);
}

