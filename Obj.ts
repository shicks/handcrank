import {CompletionRecord} from './CompletionRecord';
import {SameValue} from './Abstract';
import {Func} from './Func';
import {Val} from './Val';

export type PropertyKey = string|number|symbol;

export interface PropertyDescriptor {
  Configurable: boolean;
  Writable: boolean;
  Enumerable: boolean;
  Value: Val;
  Get: Func;
  Set: Func;
}

export class Obj {
  abstract GetPrototypeOf(): CompletionRecord<Obj|undefined>;
  abstract SetPrototypeOf(obj: Obj|undefined): CompletionRecord<boolean>;
  abstract IsExtensible(): CompletionRecord<boolean>;
  abstract PreventExtensions(): CompletionRecord<boolean>;
  abstract GetOwnProperty(prop: PropertyKey): CompletionRecord<PropertyDescriptor|undefined>;
  abstract DefineOwnProperty(prop: PropertyKey, desc: PropertyDescriptor): CompletionRecord<boolean>;
  abstract HasProperty(prop: PropertyKey): CompletionRecord<CompletionRecord<boolean>>;
  abstract Get(prop: PropertyKey, receiver: Val): CompletionRecord<Val>;
  abstract Set(prop: PropertyKey, val: Val, receiver: Val): CompletionRecord<boolean>;
  abstract Delete(prop: PropertyKey): CompletionRecord<boolean>;
  abstract OwnPropertyKeys(): CompletionRecord<PropertyKey[]>;
}

class OrdinaryObject extends Obj {
  private Prototype: Obj|undefined;

  override GetPrototypeOf(): CompletionRecord<Obj|undefined> {
    return this.OrdinaryGetPrototypeOf();
  }

  OrdinaryGetPrototypeOf(): CompletionRecord<Obj|undefined> {
    return CompletionRecord.Normal(this.Prototype);
  }

  override SetPrototypeOf(val: Obj|undefined): CompletionRecord<boolean> {
    return this.OrdinarySetPrototypeOf(val);
    
  }

  OrdinarySetPrototypeOf(val: Obj|undefined): CompletionRecord<boolean> {
    let current = this.Prototype;
    if (SameValue(val, current)) {
      // TODO
    }

    return CompletionRecord.Normal(true);
  }

  override IsExtensible(): CompletionRecord<boolean> {

  }

  override PreventExtensions(): CompletionRecord<boolean> {

  }

  override GetOwnProperty(prop: PropertyKey): CompletionRecord<PropertyDescriptor|undefined> {

  }

  override DefineOwnProperty(prop: PropertyKey, desc: PropertyDescriptor): CompletionRecord<boolean> {

  }

  override HasProperty(prop: PropertyKey): CompletionRecord<CompletionRecord<boolean>> {
    
  }

  override Get(prop: PropertyKey, receiver: Val): CompletionRecord<Val> {

  }

  override Set(prop: PropertyKey, val: Val, receiver: Val): CompletionRecord<boolean> {

  }

  override Delete(prop: PropertyKey): CompletionRecord<boolean> {

  }

  override OwnPropertyKeys(): CompletionRecord<PropertyKey[]> {

  }

}
