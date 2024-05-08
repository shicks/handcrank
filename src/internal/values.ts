import { CR } from "./completion_record";
import { VM } from "./vm";

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

export interface Void extends PrimBase<undefined> {}
export interface Null extends PrimBase<null> {}
export interface Bool extends PrimBase<boolean> {}
export interface Str extends PrimBase<string> {}
export interface Sym extends PrimBase<symbol> {}
export interface Num extends PrimBase<number> {}
export interface Int extends PrimBase<bigint> {}
export type Prim = Void|Null|Bool|Str|Sym|Num|Int;
export type Val = Prim|Obj;

class Primitive<in out T extends PrimitiveType> {
  constructor(readonly Value: T) {}
}
type PrimitiveType = undefined|null|boolean|string|symbol|number|bigint;

type Box<T> =
  T extends undefined ? Void :
  T extends null ? Null :
  T extends boolean ? Bool :
  T extends string ? Str :
  T extends symbol ? Sym :
  T extends number ? Num :
  T extends bigint ? Int : never;

class PrimBase<T extends PrimitiveType> {
  // @ts-ignore
  private primitiveBrand!: never;
  constructor(readonly Value: T) {}
}

function mkPrim<T extends PrimitiveType>(
  typ: string|((arg: unknown) => boolean),
  fn = (value: T) => new PrimBase<T>(value),
): {
  (value: T): Box<T>;
  [Symbol.hasInstance](arg: unknown): arg is Box<T>;
} {
  const check =
    typeof typ === 'function' ?
    (arg: unknown) => arg instanceof PrimBase && typ(arg.Value) :
    (arg: unknown) => arg instanceof PrimBase && typeof arg.Value === typ;
  Object.defineProperty(fn, Symbol.hasInstance, {value: check});
  return fn as any;
}

export const UNDEFINED: Void = new PrimBase(undefined);
export const NULL: Null = new PrimBase(null);
export const FALSE: Bool = new PrimBase(false);
export const TRUE: Bool = new PrimBase(true);

export const Prim: {
  <T extends PrimitiveType>(x: T): Box<T>
  [Symbol.hasInstance](x: unknown): x is Prim;
} = ((x: any) => new Primitive(x)) as any;
Object.defineProperty(Prim, Symbol.hasInstance, {value: (arg: unknown): arg is Prim => arg instanceof PrimBase});

export const Void = mkPrim<undefined>((arg) => arg === undefined, () => UNDEFINED);
export const Null = mkPrim<null>((arg) => arg === null, () => NULL);
export const Bool = mkPrim<boolean>('boolean', (arg) => arg ? TRUE : FALSE);
export const Str = mkPrim<string>('string');
export const Sym = mkPrim<symbol>('symbol');
export const Num = mkPrim<number>('number');
export const Int = mkPrim<bigint>('bigint');

export function IsNullish(v: Val): v is Null|Void {
  return v instanceof Primitive && v.Value == null;
}
export function IsNull(v: Val): v is Null {
  return v instanceof Primitive && v.Value === null;
}
export function IsUndefined(v: Val): v is Void {
  return v instanceof Primitive && v.Value === undefined;
}
export function IsPrim(v: Val): v is Void {
  return v instanceof Primitive;
}

export type PropertyKey = string|symbol;

const OBJECT_BRAND = Symbol('Object');
type OBJECT_BRAND = typeof OBJECT_BRAND;

export interface Obj {
  [OBJECT_BRAND]: true;
  GetPrototypeOf($: VM): CR<Obj|Void>;
  SetPrototypeOf($: VM, obj: Obj|Void): CR<boolean>;
  IsExtensible($: VM): CR<boolean>;
  PreventExtensions($: VM): CR<boolean>;
  GetOwnProperty($: VM, prop: PropertyKey): CR<PropertyDescriptor|undefined>;
  DefineOwnProperty($: VM, prop: PropertyKey, desc: PropertyDescriptor): CR<boolean>;
  HasProperty($: VM, prop: PropertyKey): CR<boolean>;
  Get($: VM, prop: PropertyKey, receiver: Val): CR<Val>;
  Set($: VM, prop: PropertyKey, val: Val, receiver: Val): CR<boolean>;
  Delete($: VM, prop: PropertyKey): CR<boolean>;
  OwnPropertyKeys($: VM): CR<PropertyKey[]>;

  Call?($: VM, thisArgument: Val, argumentsList: Val[]): CR<Val>;
  Construct?($: VM, argumentsList: Val[], newTarget: Obj): CR<Obj>;

  // TODO - slots?
}
interface ObjStatic {
  (obj: Omit<Obj, OBJECT_BRAND>): Obj;
  [Symbol.hasInstance]: (arg: unknown) => arg is Obj;
}
export const Obj: ObjStatic = (obj: Omit<Obj, OBJECT_BRAND>): Obj => {
  (obj as Obj)[OBJECT_BRAND] = true;
  return obj as Obj;
};
Obj[Symbol.hasInstance] = (arg: unknown): arg is Obj => {
  return arg && typeof arg === 'object' && (arg as any)[OBJECT_BRAND];
};

export interface Func extends Obj {
  Call($: VM, thisArgument: Val, argumentsList: Val[]): CR<Val>;
  Construct($: VM, argumentsList: Val[], newTarget: Obj): CR<Obj>;
  HomeObject: Obj;
}
