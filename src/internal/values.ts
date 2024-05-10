import { CR } from './completion_record';
import { VM } from './vm';
import { LEXICAL } from './enums';
import { EnvironmentRecord } from './environment_record';

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

// class Primitive<in out T extends PrimitiveType> {
//   constructor(readonly Value: T) {}
// }
// type PrimitiveType = undefined|null|boolean|string|number|bigint|Sym;
// type Box<T extends PrimitiveType> = T extends symbol ? Sym : T;
// type Unbox<T extends Prim> = T extends Sym ? symbol : T;

export type PropertyKey = string|symbol;

const OBJECT_BRAND = Symbol('Object');
type OBJECT_BRAND = typeof OBJECT_BRAND;

export interface Obj {
  [OBJECT_BRAND]: true;
  GetPrototypeOf($: VM): CR<Obj|undefined>;
  SetPrototypeOf($: VM, obj: Obj|undefined): CR<boolean>;
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
  HomeObject: Obj|undefined;
  ThisMode: LEXICAL|unknown;
  Environment: EnvironmentRecord;
}
