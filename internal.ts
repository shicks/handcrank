import { GetIdentifierReference } from './Abstract';
import { Assert } from './Assert';
import { EnvironmentRecord } from './EnvironmentRecord';
import { ExecutionContext } from './ExecutionContext';
import { Obj, Val } from './Obj';
import { ReferenceRecord } from './ReferenceRecord';
import { CR, IsAbrupt, Throw } from './CompletionRecord';
import { EMPTY, UNRESOLVABLE, UNUSED } from './InternalSymbols';
import { PrivateName } from './PrivateName';
import * as ESTree from 'estree';

interface ReferenceRecord {
  readonly Base: Val|EnvironmentRecord|UNRESOLVABLE,


interface VM {
  evaluate(program: ESTree.Program): CR<Val>;
}

export function vm(): VM {
  // VM-wide globals here
  const executionContextStack: ExecutionContext[] = [];
  

  




}



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



export class InternalVM {
  executionContextStack: ExecutionContext[] = [];

  // GetActiveScriptOrModule(): ScriptRecord|ModuleRecord|null {
  //   // 9.4.1
  //   for (let i = this.executionContextStack.length - 1; i >= 0; i--) {
  //     const ec = this.executionContextStack[i];
  //     if (ec.ScriptOrModule) return ec.ScriptOrModule;
  //   }
  //   return null;
  // }

  ResolveBinding(name: string, env?: EnvironmentRecord): CR<ReferenceRecord> {
    // 9.4.2
    const ec = this.executionContextStack[this.executionContextStack.length - 1];
    if (!env) {
      if (!ec) throw new Error(`Expected to have a running context...?`);
      env = ec.LexicalEnvironment;
    }
    Assert(() => env instanceof EnvironmentRecord);
    const strict = ec ? ec.isStrict : false;
    return GetIdentifierReference(env, name, strict);
  }
}

