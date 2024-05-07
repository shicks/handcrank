import { Assert } from './Assert';
import { EnvironmentRecord } from './EnvironmentRecord';
import { ExecutionContext } from './ExecutionContext';
import { PrivateName } from './PrivateName';
import * as ESTree from 'estree';
import { IsAbrupt, CR, Throw, Obj, ReferenceRecord, Val } from './types';
import { EMPTY, UNRESOLVABLE, UNUSED } from './InternalSymbols';



interface VM {
  evaluate(program: ESTree.Program): CR<Val>;
}

export function vm(): VM {
  // VM-wide globals here
  const execStack: ExecutionContext[] = [];

  // TODO - how to plug in different syntax forms from separate module....?





  // 6.2.5 The Reference Record Specification Type

  /**
   * 6.2.5.1 IsPropertyReference ( V )
   *
   * The abstract operation IsPropertyReference takes argument V (a
   * Reference Record) and returns a Boolean. It performs the following
   * steps when called:
   */
  function IsPropertyReference(V: ReferenceRecord): V is PropertyReferenceRecord {
    return V.Base !== UNRESOLVABLE && !(V.Base instanceof EnvironmentRecord);
  }
  interface PropertyReferenceRecord extends ReferenceRecord {
    readonly Base: Val;
  }

  /**
   * 6.2.5.2 IsUnresolvableReference ( V )
   *
   * The abstract operation IsUnresolvableReference takes argument V
   * (a Reference Record) and returns a Boolean. It performs the
   * following steps when called:
   */
  function IsUnresolvableReference(V: ReferenceRecord): V is UnresolvableReferenceRecord {
    return V.Base === UNRESOLVABLE;
  }
  interface UnresolvableReferenceRecord extends ReferenceRecord {
    Base: UNRESOLVABLE;
  }

  /**
   * 6.2.5.3 IsSuperReference ( V )
   *
   * The abstract operation IsSuperReference takes argument V (a
   * Reference Record) and returns a Boolean. It performs the
   * following steps when called:
   */
  function IsSuperReference(V: ReferenceRecord): V is SuperReferenceRecord {
    return V.ThisValue !== EMPTY;
  }
  interface SuperReferenceRecord extends ReferenceRecord {
    Base: Val|UNRESOLVABLE;
    ThisValue: Val;
  }

  /**
   * 6.2.5.4 IsPrivateReference ( V )
   *
   * The abstract operation IsPrivateReference takes argument V
   * (a Reference Record) and returns a Boolean. It performs the
   * following steps when called:
   */
  function IsPrivateReference(V: ReferenceRecord): V is PrivateReferenceRecord {
    return V.ReferencedName instanceof PrivateName;
  }
  interface PrivateReferenceRecord extends ReferenceRecord {
    Base: Val|UNRESOLVABLE;
    ReferenedName: PrivateName;
  }

  /**
   * 6.2.5.5 GetValue ( V )
   *
   * The abstract operation GetValue takes argument V (a Reference
   * Record or an ECMAScript language value) and returns either a normal
   * completion containing an ECMAScript language value or an abrupt
   * completion. It performs the following steps when called:
   */
  function GetValue(V: ReferenceRecord|Val): CR<Val> {
    if (!(V instanceof ReferenceRecord)) return V;
    if (IsUnresolvableReference(V)) return Throw('ReferenceError');
    if (IsPropertyReference(V)) {
      const baseObj = ToObject(V.Base);
      if (IsAbrupt(baseObj)) return baseObj;
      if (IsPrivateReference(V)) {
        return PrivateGet(baseObj, V.ReferencedName);
      }
      return baseObj.Get(V.ReferencedName, GetThisValue(V));
    }
    const base = V.Base;
    Assert(base instanceof EnvironmentRecord);
    return base.GetBindingValue(V.ReferencedName, V.Strict);
  }

  /**
   * 6.2.5.6 PutValue ( V, W )
   *
   * The abstract operation PutValue takes arguments V (a Reference
   * Record or an ECMAScript language value) and W (an ECMAScript
   * language value) and returns either a normal completion containing
   * unused or an abrupt completion. It performs the following steps
   * when called:
   */
  function PutValue(V: ReferenceRecord|Val, W: Val): CR<UNUSED> {
    if (!(V instanceof ReferenceRecord)) return Throw('RefereneError');
    if (IsUnresolvableReference(V)) {
      if (V.Strict) return Throw('ReferenceError');
      const globalObj = GetGlobalObject();
      const result = Set(globalObj, V.ReferencedName, W, false);
      if (IsAbrupt(result)) return result;
      return UNUSED;
    } else if (IsPropertyReference(V)) {
      const baseObj = ToObject(V.Base);
      if (IsAbrupt(baseObj)) return baseObj;
      if (IsPrivateReference(V)) {
        return PrivateSet(baseObj, V.ReferencedName, W);
      }
      const succeeded = baseObj.Set(V.ReferencedName, W, GetThisValue(V));
      if (IsAbrupt(succeeded)) return succeeded;
      if (!succeeded && V.Strict) return Throw('TypeError');
      return UNUSED;
    } else {
      const base = V.Base;
      Assert(base instanceof EnvironmentRecord);
      return base.SetMutableBinding(V.ReferencedName, W, V.Strict);
    }
  }

  /**
   * 6.2.5.7 GetThisValue ( V )
   *
   * The abstract operation GetThisValue takes argument V (a Reference
   * Record) and returns an ECMAScript language value. It performs the
   * following steps when called:
   */
  function GetThisValue(V: ReferenceRecord): Val {
    Assert(IsPropertyReference(V));
    if (IsSuperReference(V)) return V.ThisValue;
    return V.Base;
  }

  /**
   * 6.2.5.8 InitializeReferencedBinding ( V, W )
   *
   * The abstract operation InitializeReferencedBinding takes arguments
   * V (a Reference Record) and W (an ECMAScript language value) and
   * returns either a normal completion containing unused or an abrupt
   * completion. It performs the following steps when called:
   */
  function InitializeReferencedBinding(V: ReferenceRecord, W: Val): CR<UNUSED> {
    Assert(!IsUnresolvableReference(V));
    const base = V.Base;
    Assert(base instanceof EnvironmentRecord);
    return base.InitializeBinding(V.ReferencedName, W);
  }

  /**
   * 6.2.5.9 MakePrivateReference ( baseValue, privateIdentifier )
   *
   * The abstract operation MakePrivateReference takes arguments
   * baseValue (an ECMAScript language value) and privateIdentifier (a
   * String) and returns a Reference Record. It performs the following
   * steps when called:
   */
  function MakePrivateReference(baseValue: Val, privateIdentifier: string): ReferenceRecord {
    const privEnv = null!; // TODO - the running execution context\'s PrivateEnvironment.
    Assert(privEnv != null);
    const privateName = ResolvePrivateIdentifier(privEnv, privateIdentifier);
    return ReferenceRecord.of({
      Base: baseValue,
      ReferencedName: privateName,
      Strict: true,
      ThisValue: EMPTY,
    });
  }





  /**
   * 9.4.6 GetGlobalObject ()
   *
   * The abstract operation GetGlobalObject takes no arguments and
   * returns an Object. It returns the global object used by the
   * currently running execution context. It performs the following
   * steps when called:
   */
  export function GetGlobalObject(): CR<Obj> {
    const exec = execStack[execStack.length - 1];
    const currentRealm = exec.Realm
  }




  function evaluate(program: ESTree.Program): CR<Val> {
    
  }

  return {evaluate};
}
