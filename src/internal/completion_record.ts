import { EMPTY } from './enums';
import { Assert } from './assert';
import { Val } from './val';

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
export class Abrupt {
  constructor(
    /** The type of completion that occurred. */
    readonly Type: CompletionType,
    /** The value that was produced. */
    readonly Value: Val|EMPTY,
    /** The target label for directed control transfers. */
    readonly Target: string|EMPTY,
  ) {}
}

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

export type NotGen<T> = T extends Generator ? [never] : [];

/**
 * Abrupt completion refers to any Completion Record with a [[Type]]
 * value other than normal.  NOTE: we do some type shenanigans to
 * give a type checking error if an ECR is passed in without yielding,
 * as well as a runtime check, since this is a common error that is
 * hard to debug.
 */
export function IsAbrupt<T>(x: CR<T>, ..._: NotGen<T>): x is Abrupt {
  if (x && typeof (x as any).next === 'function') {
    throw new Error('IsAbrupt on generator: forgot to yield?');
  }
  return x instanceof Abrupt;
}

export function CastNotAbrupt<T>(x: CR<T>, ..._: NotGen<T>): T {
  try {
    Assert(!IsAbrupt(x as any));
  } catch (e) {
    console.dir(x); // NOTE: This is a debugging aid.
    throw e;
  }
  return x as any;
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
  return new Abrupt(CompletionType.Throw, value, EMPTY);
}

type ThrowCompletion = Abrupt & {Type: CompletionType.Throw, Value: Val};
export function IsThrowCompletion<T>(
  completion: CR<T>,
  ...rest: NotGen<T>
): completion is ThrowCompletion {
  return IsAbrupt(completion, ...rest) && completion.Type === CompletionType.Throw;
}

export function ReturnCompletion(value: Val): CR<never> {
  return new Abrupt(CompletionType.Return, value, EMPTY);
}

type ReturnCompletion = Abrupt & {Type: CompletionType.Return, Value: Val};
export function IsReturnCompletion<T>(
  completion: CR<T>,
  ...rest: NotGen<T>
): completion is ReturnCompletion {
  return IsAbrupt(completion, ...rest) && completion.Type === CompletionType.Return;
}

/**
 * 6.2.4.3 UpdateEmpty ( completionRecord, value )
 *
 * The abstract operation UpdateEmpty takes arguments completionRecord
 * (a Completion Record) and value (any value except a Completion
 * Record) and returns a Completion Record. It performs the following
 * steps when called:
 */
export function UpdateEmpty<T, U extends Val>(
  completionRecord: CR<T|EMPTY>,
  value: U,
): CR<T|U> {
  const crValue = IsAbrupt(completionRecord) ? completionRecord.Value : completionRecord;
  if (crValue !== EMPTY) return completionRecord as CR<T>;
  Assert(IsAbrupt(completionRecord)); // NOTE: this is not in the spec.
  Assert(completionRecord.Type !== 'return' && completionRecord.Type !== 'throw');
  return IsAbrupt(completionRecord) ?
      new Abrupt(completionRecord.Type, value, completionRecord.Target) :
      value;
}

export function CompletionValue<T>(completion: CR<T>, ...rest: NotGen<T>): T|Val|EMPTY {
  return IsAbrupt(completion, ...rest) ? completion.Value : completion;
}
