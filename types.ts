import { EMPTY, UNRESOLVABLE, UNUSED } from './InternalSymbols';
import { RecordFor, makeRecord } from './record';

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
  Normal: 'normal',
  /**
   * A return completion refers to any Completion Record with a [[Type]]
   * value of return.
   */
  Return: 'return',
  /**
   * A throw completion refers to any Completion Record with a [[Type]]
   * value of throw.
   */
  Throw: 'throw',
  /**
   * A continue completion refers to any Completion Record with a
   * [[Type]] value of continue.
   */
  Continue: 'continue',
  /**
   * A break completion refers to any Completion Record with a
   * [[Type]] value of break.
   */
  Break: 'break',
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
  return Abrupt({Type: 'throw', Value: value, Target: EMPTY});
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
  if (crValue !== EMPTY) return completionRecord;
  Assert(completionRecord.Type !== 'return' && completionRecord.Type !== 'throw');
  return IsAbrupt(completionRecord) ? Abrupt({...completionRecord, Value: value}) : value;
}

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
interface ReferenceRecord extends RecordFor<{
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
}> {}
const ReferenceRecord = makeRecord<ReferenceRecord>('ReferenceRecord');


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

function Str(s: string): {Type: 'string', Value: string} {
  return {Type: 'string', Value: s};
}
function Num(n: number): {Type: 'number', Value: number} {
  return {Type: 'number', Value: n};
}
function Int(i: bigint): {Type: 'bigint', Value: bigint} {
  return {Type: 'bigint', Value: i};
}
function Bool(b: boolean): {Type: 'boolean', Value: boolean} {
  return {Type: 'boolean', Value: b};
}
function Sym(s: symbol): {Type: 'symbol', Value: symbol} {
  return {Type: 'symbol', Value: s};
}
const Null = {Type: 'null', Value: null} as const;
const Undefined = {Type: 'undefined', Value: undefined} as const;

export class Obj {
  Type: 'object'|'function';
  // slots and methods...?
  // 
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

export interface RecordType {
  readonly [RECORD]: string;
}

export const RECORD: unique symbol = Symbol('Record');

export abstract class EnvironmentRecord implements RecordType {
  
  // TODO - root node?
  // TODO - something for stack trace?
  abstract readonly OuterEnv: EnvironmentRecord|undefined;
  abstract HasBinding(name: string): CompletionRecord<boolean>;
  abstract CreateMutableBinding(name: string, deletable: boolean): CompletionRecord<void>;
  abstract CreateImmutableBinding(name: string, strict: boolean): CompletionRecord<void>;
  abstract InitializeBinding(name: string, val: Val): CompletionRecord<void>;
  abstract SetMutableBinding(name: string, val: Val, strict: boolean): CompletionRecord<void>;
  abstract GetBindingValue(name: string, strict: boolean): CompletionRecord<Val>;
  abstract DeleteBinding(name: string): CompletionRecord<boolean>;
  abstract HasThisBinding(): CompletionRecord<boolean>;
  abstract HasSuperBinding(): CompletionRecord<boolean>;
  abstract WithBaseObject(): CompletionRecord<Val|undefined>;
}

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
export class ReferenceRecord implements RecordType {
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
     * True if the Reference Record originated in strict mode code,
     * false otherwise.
     */
    readonly Strict: boolean,
    /**
     * If not empty, the Reference Record represents a property
     * binding that was expressed using the super keyword; it is
     * called a Super Reference Record and its [[Base]] value will
     * never be an Environment Record. In that case, the [[ThisValue]]
     * field holds the this value at the time the Reference Record was
     * created.
     */
    readonly ThisValue: Val|EMPTY,
  ) {}
  get [RECORD]() { return 'ReferenceRecord' as const; }
}

export class EnvironmentReferenceRecord extends ReferenceRecord {
  declare readonly Base: EnvironmentRecord;
  declare readonly ReferenceName: string;
  declare readonly ThisVal: EMPTY;
}

export class SuperReferenceRecord extends ReferenceRecord {
  declare readonly Base: Val|UNRESOLVABLE;
  declare readonly ThisValue: Val;
}
