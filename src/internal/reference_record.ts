import { Assert } from './assert';
import { CR, IsAbrupt, Throw } from './completion_record';
import { EMPTY, UNRESOLVABLE, UNUSED } from './enums';
import { EnvironmentRecord } from './environment_record';
import { makeRecord } from './record';
import { Val } from './values';
import { VM } from './vm';

declare type PrivateName = {__privatename__: true};
declare const PrivateName: any;
declare const ToObject: any;
declare const PrivateGet: any;
declare const GetGlobalObject: any;
declare const Set: any;
declare const PrivateSet: any;
declare const ResolvePrivateIdentifier: any;

/**
 * 6.2.5 The Reference Record Specification Type
 *
 * The Reference Record type is used to explain the behaviour of such
 * operators as delete, typeof, the assignment operators, the super
 * keyword and other language features. For example, the left-hand
 * operand of an assignment is expected to produce a Reference Record.
 *
 * A Reference Record is a resolved name or property binding; its
 * fields are defined by Table 8.
 */
export interface ReferenceRecord {
  __brand__: 'ReferenceRecord';
  /**
   * The value or Environment Record which holds the binding. A
   * [[Base]] of unresolvable indicates that the binding could not
   * be resolved.
   */
  readonly Base: Val|EnvironmentRecord|UNRESOLVABLE;
  /**
   * The name of the binding. Always a String if [[Base]] value is
   * an Environment Record.
   */
  readonly ReferencedName: string|symbol|PrivateName;
  /**
   * true if the Reference Record originated in strict mode code,
   * false otherwise.
   */
  readonly Strict: boolean;
  /**
   * If not empty, the Reference Record represents a property
   * binding that was expressed using the super keyword; it is
   * called a Super Reference Record and its [[Base]] value will
   * never be an Environment Record. In that case, the
   * [[ThisValue]] field holds the this value at the time the
   * Reference Record was created.
   */
  readonly ThisValue: Val|EMPTY;
}
export const ReferenceRecord = makeRecord<ReferenceRecord>();

interface ObjectReferenceRecord extends ReferenceRecord {
  readonly Base: Val|UNRESOLVABLE;
  readonly ReferencedName: string|symbol|PrivateName;
  readonly Strict: boolean;
  readonly ThisValue: Val|EMPTY;
}

interface EnvironmentReferenceRecord extends ReferenceRecord {
  readonly Base: EnvironmentRecord;
  readonly ReferencedName: string;
  readonly Strict: boolean;
  readonly ThisValue: EMPTY;
}

interface PropertyReferenceRecord extends ObjectReferenceRecord {
  readonly Base: Val;
}

interface UnresolvableReferenceRecord extends ObjectReferenceRecord {
  Base: UNRESOLVABLE;
}

interface SuperReferenceRecord extends ObjectReferenceRecord {
  Base: Val|UNRESOLVABLE;
  ThisValue: Val;
}

export function IsEnvironmentReference(V: ReferenceRecord): V is EnvironmentReferenceRecord {
  return V.Base instanceof EnvironmentRecord;
}

/**
 * 6.2.5.1 IsPropertyReference ( V )
 *
 * The abstract operation IsPropertyReference takes argument V (a
 * Reference Record) and returns a Boolean. It performs the following
 * steps when called:
 */
export function IsPropertyReference(V: ReferenceRecord): V is PropertyReferenceRecord {
  return V.Base !== UNRESOLVABLE && !(V.Base instanceof EnvironmentRecord);
}

/**
 * 6.2.5.2 IsUnresolvableReference ( V )
 *
 * The abstract operation IsUnresolvableReference takes argument V
 * (a Reference Record) and returns a Boolean. It performs the
 * following steps when called:
 */
export function IsUnresolvableReference(V: ReferenceRecord): V is UnresolvableReferenceRecord {
  return V.Base === UNRESOLVABLE;
}

/**
 * 6.2.5.3 IsSuperReference ( V )
 *
 * The abstract operation IsSuperReference takes argument V (a
 * Reference Record) and returns a Boolean. It performs the
 * following steps when called:
 */
export function IsSuperReference(V: ReferenceRecord): V is SuperReferenceRecord {
  return V.ThisValue !== EMPTY;
}

/**
 * 6.2.5.4 IsPrivateReference ( V )
 *
 * The abstract operation IsPrivateReference takes argument V
 * (a Reference Record) and returns a Boolean. It performs the
 * following steps when called:
 */
export function IsPrivateReference(V: ReferenceRecord): V is PrivateReferenceRecord {
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
export function GetValue($: VM, V: ReferenceRecord|Val): CR<Val> {
  if (!(V instanceof ReferenceRecord)) return V;
  if (IsUnresolvableReference(V)) return Throw('ReferenceError');
  if (IsPropertyReference(V)) {
    const baseObj = ToObject($, V.Base);
    if (IsAbrupt(baseObj)) return baseObj;
    if (IsPrivateReference(V)) {
      return PrivateGet(baseObj, V.ReferencedName);
    }
    return baseObj.Get(V.ReferencedName, GetThisValue($, V));
  }
  Assert(IsEnvironmentReference(V));
  return V.Base.GetBindingValue($, V.ReferencedName, V.Strict);
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
export function PutValue($: VM, V: ReferenceRecord|Val, W: Val): CR<UNUSED> {
  if (!(V instanceof ReferenceRecord)) return Throw('RefereneError');
  if (IsUnresolvableReference(V)) {
    if (V.Strict) return Throw('ReferenceError');
    const globalObj = GetGlobalObject($);
    const result = Set($, globalObj, V.ReferencedName, W, false);
    if (IsAbrupt(result)) return result;
    return UNUSED;
  } else if (IsPropertyReference(V)) {
    const baseObj = ToObject(V.Base);
    if (IsAbrupt(baseObj)) return baseObj;
    if (IsPrivateReference(V)) {
      return PrivateSet($, baseObj, V.ReferencedName, W);
    }
    const succeeded = baseObj.Set(V.ReferencedName, W, GetThisValue($, V));
    if (IsAbrupt(succeeded)) return succeeded;
    if (!succeeded && V.Strict) return Throw('TypeError');
    return UNUSED;
  } else {
    const base = V.Base;
    Assert(base instanceof EnvironmentRecord);
    Assert(typeof V.ReferencedName === 'string');
    return base.SetMutableBinding($, V.ReferencedName, W, V.Strict);
  }
}

/**
 * 6.2.5.7 GetThisValue ( V )
 *
 * The abstract operation GetThisValue takes argument V (a Reference
 * Record) and returns an ECMAScript language value. It performs the
 * following steps when called:
 */
export function GetThisValue(_$: VM, V: ReferenceRecord): Val {
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
export function InitializeReferencedBinding($: VM, V: ReferenceRecord, W: Val): CR<UNUSED> {
  Assert(!IsUnresolvableReference(V));
  const base = V.Base;
  Assert(base instanceof EnvironmentRecord);
  Assert(typeof V.ReferencedName === 'string');
  return base.InitializeBinding($, V.ReferencedName, W);
}

/**
 * 6.2.5.9 MakePrivateReference ( baseValue, privateIdentifier )
 *
 * The abstract operation MakePrivateReference takes arguments
 * baseValue (an ECMAScript language value) and privateIdentifier (a
 * String) and returns a Reference Record. It performs the following
 * steps when called:
 */
export function MakePrivateReference($: VM, baseValue: Val, privateIdentifier: string): ReferenceRecord {
  const privEnv = null!; // TODO - the running execution context\'s PrivateEnvironment.
  Assert(privEnv != null);
  const privateName = ResolvePrivateIdentifier($, privEnv, privateIdentifier);
  return ReferenceRecord({
    Base: baseValue,
    ReferencedName: privateName,
    Strict: true,
    ThisValue: EMPTY,
  });
}
