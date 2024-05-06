import { Assert } from './Assert';
import { CR, IsAbrupt, Throw } from './CompletionRecord';
import { EnvironmentRecord } from './EnvironmentRecord';
import { EMPTY, UNRESOLVABLE, UNUSED } from './InternalSymbols';
import { ToObject, Val } from './Obj';
import { PrivateName } from './PrivateName';

// 6.2.5 The Reference Record Specification Type
export class ReferenceRecord {
  constructor(
    readonly Base: Val|EnvironmentRecord|UNRESOLVABLE,
    readonly ReferencedName: string|symbol|PrivateName,
    readonly Strict: boolean,
    readonly ThisValue: Val|EMPTY,
  ) {}

  // 6.2.5.1
  IsPropertyReference(): this is {Base: Val} {
    if (this.Base === UNRESOLVABLE) return false;
    // TODO - use a common property symbol for types of records?
    if (this.Base instanceof EnvironmentRecord) return false;
    return true;
  }

  // 6.2.5.2
  IsUnresolvableReference(): this is {Base: UNRESOLVABLE} {
    return this.Base === UNRESOLVABLE;
  }

  // 6.2.5.3
  IsSuperReference(): this is {ThisValue: Val} {
    return this.ThisValue !== EMPTY;
  }

  // 6.2.5.4
  IsPrivateReference(): this is {ReferencedName: PrivateName} {
    return this.ReferencedName instanceof PrivateName;
  }

  // 6.2.5.7
  GetThisValue(): Val {
    Assert(() => this.IsPropertyReference());
    if (this.IsSuperReference()) return this.ThisValue;
    if (this.Base === UNRESOLVABLE || this.Base instanceof EnvironmentRecord) {
      throw 'assertion error - wrong type of base';
    }
    return this.Base as Val;
  }
}

// 6.2.5.5
export function GetValue(V: ReferenceRecord|Val): CR<Val> {
  if (!(V instanceof ReferenceRecord)) return V;
  if (V.IsUnresolvableReference()) return Throw('ReferenceError');
  if (V.IsPropertyReference()) {
    const baseObj = ToObject(V.Base); // NOTE: we could inline this object.
    if (IsAbrupt(baseObj)) return baseObj;
    if (V.IsPrivateReference()) {
      throw 'not implemented: 6.2.5.5/3.b.i GetValue(PrivateReference)';
      // return PrivateGet(baseObj, V.ReferencedName)
    }
    return baseObj.Get(V.ReferencedName as string|symbol, V.GetThisValue());
  } else {
    const base = V.Base;
    Assert(() => base instanceof EnvironmentRecord);
    if (typeof V.ReferencedName !== 'string') throw 'invariant';
    return (base as EnvironmentRecord).GetBindingValue(V.ReferencedName, V.Strict);
  }
}

// 6.2.5.6
export function PutValue(V: ReferenceRecord|Val, W: Val): CR<UNUSED> {
  if (!(V instanceof ReferenceRecord)) return Throw('ReferenceError');
  if (V.IsUnresolvableReference()) {
    if (V.Strict) return Throw('ReferenceError');
    const globalObj = 
  }

}
