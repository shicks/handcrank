import { CR, Throw } from './CompletionRecord';
import {SameValue} from './Abstract';
import { FunctionDeclaration } from 'estree';

interface Primitives {
  number: number;
  string: string;
  boolean: boolean;
  symbol: symbol;
  bigint: bigint;
  null: null;
  undefined: undefined;
}
type PrimX = {[K in keyof Primitives]: {Type: K, Value: Primitives[K]}};
export type Prim = PrimX[keyof PrimX];
export type Type = keyof Primitives|'object'|'function';
export type Val = Obj|Prim;

export type PropertyKey = string|number|symbol;

export interface PropertyDescriptor {
  Configurable: boolean;
  Writable: boolean;
  Enumerable: boolean;
  Value: Val;
  Get: Obj;
  Set: Obj;
}

// 7.1.18
export function ToObject(argument: Val): CR<Obj> {
  // TODO - figure out internal slots...
  if (argument == null) return Throw('TypeError');
  //if (typeof argument === 'boolean') return new Obj(BOOLEAN_CTOR, {BooleanData: argument});
  throw 'not implemented: ToObject';
}

export abstract class Obj {
  abstract readonly Type: 'object'|'function';
  abstract GetPrototypeOf(): CR<Obj|undefined>;
  abstract SetPrototypeOf(obj: Obj|undefined): CR<boolean>;
  abstract IsExtensible(): CR<boolean>;
  abstract PreventExtensions(): CR<boolean>;
  abstract GetOwnProperty(prop: PropertyKey): CR<PropertyDescriptor|undefined>;
  abstract DefineOwnProperty(prop: PropertyKey, desc: PropertyDescriptor): CR<boolean>;
  abstract HasProperty(prop: PropertyKey): CR<boolean>;
  abstract Get(prop: PropertyKey, receiver: Val): CR<Val>;
  abstract Set(prop: PropertyKey, val: Val, receiver: Val): CR<boolean>;
  abstract Delete(prop: PropertyKey): CR<boolean>;
  abstract OwnPropertyKeys(): CR<PropertyKey[]>;

  abstract Call?(thisArgument: Val, argumentsList: Val[]): CR<Val>;
  abstract Construct?(argumentsList: Val[], newTarget: Obj): CR<Obj>;
}

class OrdinaryObject extends Obj {
  get Type(): 'object'|'function' { return 'object'; }
  private Prototype: Obj|undefined;

  // TODO - properties (w/ attributes), internal methods/slots, etc

  override GetPrototypeOf(): CR<Obj|undefined> {
    return this.OrdinaryGetPrototypeOf();
  }

  OrdinaryGetPrototypeOf(): CR<Obj|undefined> {
    return this.Prototype;
  }

  override SetPrototypeOf(val: Obj|undefined): CR<boolean> {
    return this.OrdinarySetPrototypeOf(val);
    
  }

  OrdinarySetPrototypeOf(val: Obj|undefined): CR<boolean> {
    let current = this.Prototype;
    if (SameValue(val, current)) {
      // TODO
    }

    return true;
  }

  override IsExtensible(): CR<boolean> {

  }

  override PreventExtensions(): CR<boolean> {

  }

  override GetOwnProperty(prop: PropertyKey): CR<PropertyDescriptor|undefined> {

  }

  override DefineOwnProperty(prop: PropertyKey, desc: PropertyDescriptor): CR<boolean> {

  }

  override HasProperty(prop: PropertyKey): CR<boolean> {
    
  }

  override Get(prop: PropertyKey, receiver: Val): CR<Val> {

  }

  override Set(prop: PropertyKey, val: Val, receiver: Val): CR<boolean> {

  }

  override Delete(prop: PropertyKey): CR<boolean> {

  }

  override OwnPropertyKeys(): CR<PropertyKey[]> {

  }
}

export class VanillaFunc extends OrdinaryObj {
  readonly ECMAScriptCode: FunctionDeclaration;
  Call(thisArgument: Val, argumentsList: Val[]): CR<Val> {
    
  }
  Construct(argumentsList: Val[], newTarget: Obj): CR<Obj>;
}
