import { EMPTY } from './enums';
import { RecordFor, makeRecord } from './record';
import { Assert } from './assert';
import { Val } from './values';

/**
 * 6.2.4 The Completion Record Specification Type
 *
 * The Completion Record specification type is used to explain the
 * runtime propagation of values and control flow such as the
 * behaviour of statements (break, continue, return and throw) that
 * perform nonlocal transfers of control.
 */
export type CR<T> = T|Abrupt;

/**
 * Abrupt completion refers to any Completion Record with a [[Type]]
 * value other than normal.
 */
export interface Abrupt extends RecordFor<{
  /** The type of completion that occurred. */
  readonly Type: CompletionType;
  /** The value that was produced. */
  readonly Value: unknown;
  /** The target label for directed control transfers. */
  readonly Target: string|EMPTY;
}> {}
export const Abrupt = makeRecord<Abrupt>('Abrupt');

export enum CompletionType {
  /**
   * A normal completion containing some type of value refers to a
   * normal completion that has a value of that type in its [[Value]]
   * field.
   */
  Normal = 'normal',
  /**
   * A return completion refers to any Completion Record with a [[Type]]
   * value of return.
   */
  Return = 'return',
  /**
   * A throw completion refers to any Completion Record with a [[Type]]
   * value of throw.
   */
  Throw = 'throw',
  /**
   * A continue completion refers to any Completion Record with a
   * [[Type]] value of continue.
   */
  Continue = 'continue',
  /**
   * A break completion refers to any Completion Record with a
   * [[Type]] value of break.
   */
  Break = 'break',
}

/**
 * Abrupt completion refers to any Completion Record with a [[Type]]
 * value other than normal.
 */
export function IsAbrupt(x: CR<unknown>): x is Abrupt {
  return x instanceof Abrupt;
}

/**
 * 6.2.4.1 NormalCompletion ( value )
 *
 * The abstract operation NormalCompletion takes argument value (any
 * value except a Completion Record) and returns a normal
 * completion. It performs the following steps when called:
 */
export function NormalCompletion<T>(value: T): CR<T> {
  return value;
}

/**
 * 6.2.4.2 ThrowCompletion ( value )
 *
 * The abstract operation ThrowCompletion takes argument value (an
 * ECMAScript language value) and returns a throw completion. It
 * performs the following steps when called:
 */
export function ThrowCompletion(value: Val): CR<never> {
  return Abrupt({Type: CompletionType.Throw, Value: value, Target: EMPTY});
}

// NOTE: This is a convenience for throwing an error
export function Throw(name: string, msg?: string): Abrupt {
  // TODO - actual errors
  return ThrowCompletion(msg ? `${name}: ${msg}` : name);
}

/**
 * 6.2.4.3 UpdateEmpty ( completionRecord, value )
 *
 * The abstract operation UpdateEmpty takes arguments completionRecord
 * (a Completion Record) and value (any value except a Completion
 * Record) and returns a Completion Record. It performs the following
 * steps when called:
 */
export function UpdateEmpty<T, U>(completionRecord: CR<T|EMPTY>, value: U): CR<T|U> {
  const crValue = IsAbrupt(completionRecord) ? completionRecord.Value : completionRecord;
  if (crValue !== EMPTY) return completionRecord as CR<T>;
  Assert(IsAbrupt(completionRecord)); // NOTE: this is not in the spec.
  Assert(completionRecord.Type !== 'return' && completionRecord.Type !== 'throw');
  return IsAbrupt(completionRecord) ? Abrupt({...completionRecord, Value: value}) : value;
}
