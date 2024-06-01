import { ToObject } from './abstract_conversion';
import { Set } from './abstract_object';
import { Assert } from './assert';
import { IsAbrupt } from './completion_record';
import { EMPTY, UNRESOLVABLE, UNUSED } from './enums';
import { EnvironmentRecord } from './environment_record';
import { GetGlobalObject } from './execution_context';
import { PropertyKey, Val } from './val';
import { DebugString, ECR, VM } from './vm';

declare type PrivateName = {__privatename__: true};
declare const PrivateName: any;
declare const PrivateGet: any;
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
export class ReferenceRecord {
  __brand__!: 'ReferenceRecord';
  constructor(
    /**
     * The value or Environment Record which holds the binding. A
     * [[Base]] of unresolvable indicates that the binding could not
     * be resolved.
     */
    readonly Base: Val|EnvironmentRecord|UNRESOLVABLE,
    /**
     * The name of the binding. Always a String if [[Base]] value is
     * an Environment Record.
     */
    readonly ReferencedName: string|symbol|PrivateName,
    /**
     * true if the Reference Record originated in strict mode code,
     * false otherwise.
     */
    readonly Strict: boolean,
    /**
     * If not empty, the Reference Record represents a property
     * binding that was expressed using the super keyword; it is
     * called a Super Reference Record and its [[Base]] value will
     * never be an Environment Record. In that case, the
     * [[ThisValue]] field holds the this value at the time the
     * Reference Record was created.
     */
    readonly ThisValue: Val|EMPTY,
  ) {}
}

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
  if (typeof PrivateName !== 'function') return false;
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
export function* GetValue($: VM, V: ReferenceRecord|Val): ECR<Val> {
  if (!(V instanceof ReferenceRecord)) return V;
  if (IsUnresolvableReference(V)) {
    return $.throw('ReferenceError', `${DebugString(V)} is not defined`);
  }
  if (IsPropertyReference(V)) {
    const baseObj = ToObject($, V.Base);
    if (IsAbrupt(baseObj)) return baseObj;
    if (IsPrivateReference(V)) {
      return PrivateGet(baseObj, V.ReferencedName);
    }
    return yield* baseObj.Get($, V.ReferencedName as PropertyKey, GetThisValue($, V));
  }
  Assert(IsEnvironmentReference(V));
  return yield* V.Base.GetBindingValue($, V.ReferencedName, V.Strict);
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
export function* PutValue($: VM, V: ReferenceRecord|Val, W: Val): ECR<UNUSED> {
  if (!(V instanceof ReferenceRecord)) return $.throw('ReferenceError');
  if (IsUnresolvableReference(V)) {
    if (V.Strict) return $.throw('ReferenceError');
    Assert(typeof V.ReferencedName !== 'object'); // class bodies are strict.
    const globalObj = GetGlobalObject($);
    const result = yield* Set($, globalObj, V.ReferencedName, W, false);
    if (IsAbrupt(result)) return result;
    return UNUSED;
  } else if (IsPropertyReference(V)) {
    const baseObj = ToObject($, V.Base);
    if (IsAbrupt(baseObj)) return baseObj;
    if (IsPrivateReference(V)) {
      return PrivateSet($, baseObj, V.ReferencedName, W);
    }
    const succeeded = yield* baseObj.Set(
      $, V.ReferencedName as PropertyKey, W, GetThisValue($, V));
    if (IsAbrupt(succeeded)) return succeeded;
    if (!succeeded && V.Strict) return $.throw('TypeError');
    return UNUSED;
  } else {
    const base = V.Base;
    Assert(base instanceof EnvironmentRecord);
    Assert(typeof V.ReferencedName === 'string');
    return yield* base.SetMutableBinding($, V.ReferencedName, W, V.Strict);
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
export function* InitializeReferencedBinding($: VM, V: ReferenceRecord, W: Val): ECR<UNUSED> {
  Assert(!IsUnresolvableReference(V));
  const base = V.Base;
  Assert(base instanceof EnvironmentRecord);
  Assert(typeof V.ReferencedName === 'string');
  return yield* base.InitializeBinding($, V.ReferencedName, W);
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
  return new ReferenceRecord(baseValue, privateName, true, EMPTY);
}

/**
 * Unwraps a reference record into a value.
 *
 * Note that this is not strictly included in the spec, but we need
 * it here because we cannot distingish the
 * `IdentifierReference : Identifier` syntax pattern, since ESTree
 * just treats all identifers in their own separate way, regardless
 * of whether they're lvalues or rvalues.
 *
 * ---
 *
 * 13.1.3 Runtime Semantics: Evaluation
 *
 * IdentifierReference : Identifier
 * 1. Return ? ResolveBinding(StringValue of Identifier).
 *
 * NOTE 1: The result of evaluating an IdentifierReference is always a
 * value of type Reference.
 *
 * NOTE 2: In non-strict code, the keyword yield may be used as an
 * identifier. Evaluating the IdentifierReference resolves the binding
 * of yield as if it was an Identifier. Early Error restriction
 * ensures that such an evaluation only can occur for non-strict code.
 *
 * ---
 *
 * 13.3.2.1 Runtime Semantics: Evaluation
 *
 * MemberExpression : MemberExpression [ Expression ]
 * 1. Let baseReference be ? Evaluation of MemberExpression.
 * 2. Let baseValue be ? GetValue(baseReference).
 * 3. If the source text matched by this MemberExpression is strict
 *    mode code, let strict be true; else let strict be false.
 * 4. Return ? EvaluatePropertyAccessWithExpressionKey(baseValue,
 *    Expression, strict).
 *
 * MemberExpression : MemberExpression . IdentifierName
 * 1. Let baseReference be ? Evaluation of MemberExpression.
 * 2. Let baseValue be ? GetValue(baseReference).
 * 3. If the source text matched by this MemberExpression is strict
 *    mode code, let strict be true; else let strict be false.
 * 4. Return EvaluatePropertyAccessWithIdentifierKey(baseValue,
 *    IdentifierName, strict).
 *
 * MemberExpression : MemberExpression . PrivateIdentifier
 * 1. Let baseReference be ? Evaluation of MemberExpression.
 * 2. Let baseValue be ? GetValue(baseReference).
 * 3. Let fieldNameString be the StringValue of PrivateIdentifier.
 * 4. Return MakePrivateReference(baseValue, fieldNameString).
 */
// export function RValue<T>(ref: ReferenceRecord|T): CR<Val>|T {
//   return ref instanceof ReferenceRecord ? ResolveBinding($, ref.
//   }
// }
