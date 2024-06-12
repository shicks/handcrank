import { ToObject } from './abstract_conversion';
import { PrivateGet, PrivateSet, Set } from './abstract_object';
import { Assert } from './assert';
import { IsAbrupt } from './completion_record';
import { EMPTY, UNRESOLVABLE, UNUSED } from './enums';
import { EnvironmentRecord } from './environment_record';
import { GetGlobalObject } from './execution_context';
import { PrivateName, ResolvePrivateIdentifier } from './private_environment_record';
import { PropertyKey, Val } from './val';
import { DebugString, ECR, VM } from './vm';

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
 * 
 * 1. If V.[[Base]] is unresolvable, return false.
 * 2. If V.[[Base]] is an Environment Record, return false; otherwise return true.
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
 * 
 * 1. If V.[[Base]] is unresolvable, return true; otherwise return false.
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
 * 
 * 1. If V.[[ThisValue]] is not empty, return true; otherwise return false.
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
 * 
 * 1. If V.[[ReferencedName]] is a Private Name, return true; otherwise return false.
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
 * 
 * 1. If V is not a Reference Record, return V.
 * 2. If IsUnresolvableReference(V) is true, throw a ReferenceError exception.
 * 3. If IsPropertyReference(V) is true, then
 *     a. Let baseObj be ? ToObject(V.[[Base]]).
 *     b. If IsPrivateReference(V) is true, then
 *         i. Return ? PrivateGet(baseObj, V.[[ReferencedName]]).
 *     c. Return ? baseObj.[[Get]](V.[[ReferencedName]], GetThisValue(V)).
 * 4. Else,
 *     a. Let base be V.[[Base]].
 *     b. Assert: base is an Environment Record.
 *     c. Return ? base.GetBindingValue(V.[[ReferencedName]], V.[[Strict]]) (see 9.1).
 * 
 * NOTE: The object that may be created in step 3.a is not accessible
 * outside of the above abstract operation and the ordinary object
 * [[Get]] internal method. An implementation might choose to avoid
 * the actual creation of the object.
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
      return yield* PrivateGet($, baseObj, V.ReferencedName as PrivateName);
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
 * 
 * 1. If V is not a Reference Record, throw a ReferenceError exception.
 * 2. If IsUnresolvableReference(V) is true, then
 *     a. If V.[[Strict]] is true, throw a ReferenceError exception.
 *     b. Let globalObj be GetGlobalObject().
 *     c. Perform ? Set(globalObj, V.[[ReferencedName]], W, false).
 *     d. Return unused.
 * 3. If IsPropertyReference(V) is true, then
 *     a. Let baseObj be ? ToObject(V.[[Base]]).
 *     b. If IsPrivateReference(V) is true, then
 *         i. Return ? PrivateSet(baseObj, V.[[ReferencedName]], W).
 *     c. Let succeeded be ? baseObj.[[Set]](V.[[ReferencedName]], W, GetThisValue(V)).
 *     d. If succeeded is false and V.[[Strict]] is true, throw a TypeError exception.
 *     e. Return unused.
 * 4. Else,
 *     a. Let base be V.[[Base]].
 *     b. Assert: base is an Environment Record.
 *     c. Return ? base.SetMutableBinding(V.[[ReferencedName]], W, V.[[Strict]]) (see 9.1).
 * 
 * NOTE: The object that may be created in step 3.a is not accessible
 * outside of the above abstract operation and the ordinary object
 * [[Set]] internal method. An implementation might choose to avoid
 * the actual creation of that object.
 */
export function* PutValue($: VM, V: ReferenceRecord|Val, W: Val): ECR<UNUSED> {
  if (!(V instanceof ReferenceRecord)) {
    return $.throw('ReferenceError', 'Invalid left-hand side in assignment');
  }
  if (IsUnresolvableReference(V)) {
    if (V.Strict) return $.throw('ReferenceError', `${V.ReferencedName} is not defined`);
    Assert(typeof V.ReferencedName !== 'object'); // class bodies are strict.
    const globalObj = GetGlobalObject($);
    const result = yield* Set($, globalObj, V.ReferencedName, W, false);
    if (IsAbrupt(result)) return result;
    return UNUSED;
  } else if (IsPropertyReference(V)) {
    const baseObj = ToObject($, V.Base);
    if (IsAbrupt(baseObj)) return baseObj;
    if (IsPrivateReference(V)) {
      return yield* PrivateSet($, baseObj, V.ReferencedName as PrivateName, W);
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
 * 
 * 1. Assert: IsPropertyReference(V) is true.
 * 2. If IsSuperReference(V) is true, return V.[[ThisValue]]; otherwise return V.[[Base]].
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
 * 
 * 1. Assert: IsUnresolvableReference(V) is false.
 * 2. Let base be V.[[Base]].
 * 3. Assert: base is an Environment Record.
 * 4. Return ? base.InitializeBinding(V.[[ReferencedName]], W).
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
 * 
 * 1. Let privEnv be the running execution context's PrivateEnvironment.
 * 2. Assert: privEnv is not null.
 * 3. Let privateName be ResolvePrivateIdentifier(privEnv, privateIdentifier).
 * 4. Return the Reference Record { [[Base]]: baseValue,
 *    [[ReferencedName]]: privateName, [[Strict]]: true, [[ThisValue]]:
 *    empty }.
 */
export function MakePrivateReference($: VM, baseValue: Val, privateIdentifier: string): ReferenceRecord {
  const privEnv = null!; // TODO - the running execution context\'s PrivateEnvironment.
  Assert(privEnv != null);
  const privateName = ResolvePrivateIdentifier(privEnv, privateIdentifier);
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
