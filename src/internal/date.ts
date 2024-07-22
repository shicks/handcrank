import { OrdinaryToPrimitive, ToNumber, ToPrimitive, ToString } from './abstract_conversion';
import { Invoke } from './abstract_object';
import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { NUMBER, STRING } from './enums';
import { CreateBuiltinFunction, Func, callOrConstruct, methodO, methodS } from './func';
import { Obj, OrdinaryCreateFromConstructor, OrdinaryObjectCreate } from './obj';
import { prelude } from './prelude';
import { PropertyDescriptor, prop0, propWC } from './property_descriptor';
import { RealmRecord, defineProperties } from './realm_record';
import { Val } from './val';
import { ECR, Plugin, VM } from './vm';

type DateCtorParams = [string|number]|[number, number, number?, number?, number?, number?, number?];

export class UTCDate extends Date {
  constructor(...args: DateCtorParams) {
    if (args.length === 1) {
      if (typeof args[0] === 'string') {
        const string = args[0];
        // NOTE: there is no way to parse a string as UTC in JS, so the best we can do
        // is restrict the format to the bare minimum allowed by the spec, so that we
        // can explicitly request UTC in the string.
        // NOTE: This regex has three capture groups: (1) the date, (2) the time
        // (starting with T, not including the optional timezone specifier), and
        // (3) the timezone.
        const match = dateStringFormat.exec(string);
        if (!match) {
          super(NaN);
        } else {
          // Look for a timezone specifier.
          const [, date, time, tz] = match;
          if (tz) {
            super(Date.parse(string)); // If timezone specified, use it.
          } else {
            const utcStr = `${date}${time || 'T00:00'}Z`;
            super(Date.parse(utcStr));
          }
        }
      } else {
        super(args[0]);
      }
    } else {
      super(Date.UTC(...args));
    }
  }

  getDate(): number { return super.getUTCDate(); }
  getDay(): number { return super.getUTCDay(); }
  getFullYear(): number { return super.getUTCFullYear(); }
  getHours(): number { return super.getUTCHours(); }
  getMilliseconds(): number { return super.getUTCMilliseconds(); }
  getMinutes(): number { return super.getUTCMinutes(); }
  getMonth(): number { return super.getUTCMonth(); }
  getSeconds(): number { return super.getUTCSeconds(); }
  getTimezoneOffset(): number { return 0; }
  setDate(date: number): number { return super.setUTCDate(date); }
  setFullYear(year: number, month?: number, date?: number): number {
    return super.setUTCFullYear(year, month, date);
  }
  setHours(hours: number, min?: number, sec?: number, ms?: number): number {
    return super.setUTCHours(hours, min, sec, ms);
  }
  setMilliseconds(ms: number): number {
    return super.setUTCMilliseconds(ms);
  }
  setMinutes(min: number, sec?: number, ms?: number): number {
    return super.setUTCMinutes(min, sec, ms);
  }
  setMonth(month: number, date?: number): number {
    return super.setUTCMonth(month, date);
  }
  setSeconds(sec: number, ms?: number): number {
    return super.setUTCSeconds(sec, ms);
  }
  toDateString(): string {
    return super.toUTCString().split(' ').slice(0, 4).join(' ');
  }
  toString(): string {
    return super.toUTCString() + '+0000';
  }
  toTimeString(): string {
    return super.toUTCString().split(' ').slice(4).join(' ') + '+0000';
  }
}

const dateStringFormat = new RegExp(
  '^(YYYY(?:-MM(?:-DD)?)?)(?:(THH:mm(?::ss(?:\\.sss)?)?)(Z)?)?$'
  .replace('sss', '\\d{1,3}')
  .replace('ss', '[0-5]\\d')
  .replace('mm', '[0-5]\\d')
  .replace('HH', '(?:[01]\\d|2[01234])')
  .replace('DD', '(?:0[1-9]|[12]\\d|3[01])')
  .replace('MM', '(?:0[1-9]|1[012])')
  .replace('YYYY', '(?:[-+]\\d{2})?\\d{4}')
  // NOTE: The TZ format also allows \u2212 (−) for the sign,
  // but Date.parse doesn't seem to accept it.
  .replace('Z', 'Z|[-+]\\d\\d:\\d\\d')
);

/**
 * 21.4 Date Objects
 * 
 * 21.4.1 Overview of Date Objects and Definitions of Abstract Operations
 * 
 * The following abstract operations operate on time values (defined
 * in 21.4.1.1). Note that, in every case, if any argument to one of
 * these functions is NaN, the result will be NaN.
 */
export const date: Plugin = {
  id: 'date',
  deps: () => [prelude],
  realm: {CreateIntrinsics},
};

export const utc: Plugin = {
  id: 'utc',
  deps: () => [date],
  abstract: {
    LocalDate: UTCDate,
  },
}

// TODO - annexB for getYear, setYear, and toGMTString?

export interface DateSlots {
  DateValue: number;
}
declare global {
  interface ObjectSlots extends Partial<DateSlots> {}
}

export function CreateIntrinsics(
  realm: RealmRecord,
  stagedGlobals: Map<string, PropertyDescriptor>,
): void {
  /**
   * 21.4.2 The Date Constructor
   * 
   * The Date constructor:
   *   - is %Date%.
   *   - is the initial value of the "Date" property of the global object.
   *   - creates and initializes a new Date when called as a constructor.
   *   - returns a String representing the current time (UTC) when called
   *     as a function rather than as a constructor.
   *   - is a function whose behaviour differs based upon the number and
   *     types of its arguments.
   *   - may be used as the value of an extends clause of a class
   *     definition. Subclass constructors that intend to inherit the
   *     specified Date behaviour must include a super call to the Date
   *     constructor to create and initialize the subclass instance with
   *     a [[DateValue]] internal slot.
   *   - has a "length" property whose value is 7𝔽.
   * 
   * ---
   * 
   * 21.4.3 Properties of the Date Constructor
   * 
   * The Date constructor:
   *   - has a [[Prototype]] internal slot whose value is %Function.prototype%.
   *   - has the following properties:
   */
  const dateCtor = CreateBuiltinFunction(
    callOrConstruct(DateConstructor), 7, 'Date', {Realm: realm});
  realm.Intrinsics.set('%Date%', dateCtor);
  stagedGlobals.set('Date', propWC(dateCtor));

  /**
   * 21.4.4 Properties of the Date Prototype Object
   * 
   * The Date prototype object:
   *   - is %Date.prototype%.
   *   - is itself an ordinary object.
   *   - is not a Date instance and does not have a [[DateValue]] internal slot.
   *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
   * 
   * Unless explicitly defined otherwise, the methods of the Date
   * prototype object defined below are not generic and the this value
   * passed to them must be an object that has a [[DateValue]] internal
   * slot that has been initialized to a time value.
   */
  const datePrototype = OrdinaryObjectCreate({
    Prototype: realm.Intrinsics.get('%Object.prototype%')!,
  }, {
    /**
     * 21.4.4.1 Date.prototype.constructor
     * 
     * The initial value of Date.prototype.constructor is %Date%.
     */
    constructor: propWC(dateCtor),
  });
  realm.Intrinsics.set('%Date.prototype%', datePrototype);

  const datePrototypeToUTCString =
    methodO(DatePrototypeToUTCString)(realm, 'toUTCString').Value as Obj;
  realm.Intrinsics.set('%Date.prototype.toUTCString%', datePrototypeToUTCString);

  defineProperties(realm, dateCtor, {
    /** 21.4.3.1 Date.now ( ) */
    'now': methodS(DateCtorNow),
    /** 21.4.3.2 Date.parse ( string ) */
    'parse': methodS(DateCtorParse),
    /**
     * 21.4.3.3 Date.prototype
     * 
     * The initial value of Date.prototype is the Date prototype object.
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: false }.
     */
    'prototype': prop0(datePrototype),

    /** 21.4.3.4 Date.UTC ( ... ) */
    'UTC': methodS(DateCtorUTC),
  });

  defineProperties(realm, datePrototype, {
    /** 21.4.4.2 Date.prototype.getDate ( ) */
    'getDate': methodO(DatePrototypeGetDate),
    /** 21.4.4.3 Date.prototype.getDay ( ) */
    'getDay': methodO(DatePrototypeGetDay),
    /** 21.4.4.4 Date.prototype.getFullYear ( ) */
    'getFullYear': methodO(DatePrototypeGetFullYear),
    /** 21.4.4.5 Date.prototype.getHours ( ) */
    'getHours': methodO(DatePrototypeGetHours),
    /** 21.4.4.6 Date.prototype.getMilliseconds ( ) */
    'getMilliseconds': methodO(DatePrototypeGetMilliseconds),
    /** 21.4.4.7 Date.prototype.getMinutes ( ) */
    'getMinutes': methodO(DatePrototypeGetMinutes),
    /** 21.4.4.8 Date.prototype.getMonth ( ) */
    'getMonth': methodO(DatePrototypeGetMonth),
    /** 21.4.4.9 Date.prototype.getSeconds ( ) */
    'getSeconds': methodO(DatePrototypeGetSeconds),
    /** 21.4.4.10 Date.prototype.getTime ( ) */
    'getTime': methodO(DatePrototypeGetTime),
    /** 21.4.4.11 Date.prototype.getTimezoneOffset ( ) */
    'getTimezoneOffset': methodO(DatePrototypeGetTimezoneOffset),
    /** 21.4.4.12 Date.prototype.getUTCDate ( ) */
    'getUTCDate': methodO(DatePrototypeGetUTCDate),
    /** 21.4.4.13 Date.prototype.getUTCDay ( ) */
    'getUTCDay': methodO(DatePrototypeGetUTCDay),
    /** 21.4.4.14 Date.prototype.getUTCFullYear ( ) */
    'getUTCFullYear': methodO(DatePrototypeGetUTCFullYear),
    /** 21.4.4.15 Date.prototype.getUTCHours ( ) */
    'getUTCHours': methodO(DatePrototypeGetUTCHours),
    /** 21.4.4.16 Date.prototype.getUTCMilliseconds ( ) */
    'getUTCMilliseconds': methodO(DatePrototypeGetUTCMilliseconds),
    /** 21.4.4.17 Date.prototype.getUTCMinutes ( ) */
    'getUTCMinutes': methodO(DatePrototypeGetUTCMinutes),
    /** 21.4.4.18 Date.prototype.getUTCMonth ( ) */
    'getUTCMonth': methodO(DatePrototypeGetUTCMonth),
    /** 21.4.4.19 Date.prototype.getUTCSeconds ( ) */
    'getUTCSeconds': methodO(DatePrototypeGetUTCSeconds),
    /** 21.4.4.20 Date.prototype.setDate ( date ) */
    'setDate': methodO(DatePrototypeSetDate),
    /** 21.4.4.21 Date.prototype.setFullYear ( year [ , month [ , date ] ] ) */
    'setFullYear': methodO(DatePrototypeSetFullYear),
    /** 21.4.4.22 Date.prototype.setHours ( hour [ , min [ , sec [ , ms ] ] ] ) */
    'setHours': methodO(DatePrototypeSetHours),
    /** 21.4.4.23 Date.prototype.setMilliseconds ( ms ) */
    'setMilliseconds': methodO(DatePrototypeSetMilliseconds),
    /** 21.4.4.24 Date.prototype.setMinutes ( min [ , sec [ , ms ] ] ) */
    'setMinutes': methodO(DatePrototypeSetMinutes),
    /** 21.4.4.25 Date.prototype.setMonth ( month [ , date ] ) */
    'setMonth': methodO(DatePrototypeSetMonth),
    /** 21.4.4.26 Date.prototype.setSeconds ( sec [ , ms ] ) */
    'setSeconds': methodO(DatePrototypeSetSeconds),
    /** 21.4.4.27 Date.prototype.setTime ( time ) */
    'setTime': methodO(DatePrototypeSetTime),
    /** 21.4.4.28 Date.prototype.setUTCDate ( date ) */
    'setUTCDate': methodO(DatePrototypeSetUTCDate),
    /** 21.4.4.29 Date.prototype.setUTCFullYear ( year [ , month [ , date ] ] ) */
    'setUTCFullYear': methodO(DatePrototypeSetUTCFullYear),
    /** 21.4.4.30 Date.prototype.setUTCHours ( hour [ , min [ , sec [ , ms ] ] ] ) */
    'setUTCHours': methodO(DatePrototypeSetUTCHours),
    /** 21.4.4.31 Date.prototype.setUTCMilliseconds ( ms ) */
    'setUTCMilliseconds': methodO(DatePrototypeSetUTCMilliseconds),
    /** 21.4.4.32 Date.prototype.setUTCMinutes ( min [ , sec [ , ms ] ] ) */
    'setUTCMinutes': methodO(DatePrototypeSetUTCMinutes),
    /** 21.4.4.33 Date.prototype.setUTCMonth ( month [ , date ] ) */
    'setUTCMonth': methodO(DatePrototypeSetUTCMonth),
    /** 21.4.4.34 Date.prototype.setUTCSeconds ( sec [ , ms ] ) */
    'setUTCSeconds': methodO(DatePrototypeSetUTCSeconds),
    /** 21.4.4.35 Date.prototype.toDateString ( ) */
    'toDateString': methodO(DatePrototypeToDateString),
    /** 21.4.4.36 Date.prototype.toISOString ( ) */
    'toISOString': methodO(DatePrototypeToISOString),
    /** 21.4.4.37 Date.prototype.toJSON ( key ) */
    'toJSON': methodO(DatePrototypeToJSON),
    /** 21.4.4.38 Date.prototype.toLocaleDateString ( [ reserved1 [ , reserved2 ] ] ) */
    'toLocaleDateString': methodO(DatePrototypeToLocaleDateString),
    /** 21.4.4.39 Date.prototype.toLocaleString ( [ reserved1 [ , reserved2 ] ] ) */
    'toLocaleString': methodO(DatePrototypeToLocaleString),
    /** 21.4.4.40 Date.prototype.toLocaleTimeString ( [ reserved1 [ , reserved2 ] ] ) */
    'toLocaleTimeString': methodO(DatePrototypeToLocaleTimeString),
    /** 21.4.4.41 Date.prototype.toString ( ) */
    'toString': methodO(DatePrototypeToString),
    /** 21.4.4.42 Date.prototype.toTimeString ( ) */
    'toTimeString': methodO(DatePrototypeToTimeString),
    /** 21.4.4.43 Date.prototype.toUTCString ( ) */
    'toUTCString': propWC(datePrototypeToUTCString),
    /** 21.4.4.44 Date.prototype.valueOf ( ) */
    'valueOf': methodO(DatePrototypeValueOf),
    /** 21.4.4.45 Date.prototype [ @@toPrimitive ] ( hint ) */
    [Symbol.toPrimitive]: methodO(DatePrototypeSymbolToPrimitive),
  });
}

/**
 * 21.4.2.1 Date ( ...values )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If NewTarget is undefined, then
 *     a. Let now be the time value (UTC) identifying the current time.
 *     b. Return ToDateString(now).
 * 2. Let numberOfArgs be the number of elements in values.
 * 3. If numberOfArgs = 0, then
 *     a. Let dv be the time value (UTC) identifying the current time.
 * 4. Else if numberOfArgs = 1, then
 *     a. Let value be values[0].
 *     b. If value is an Object and value has a [[DateValue]] internal slot, then
 *         i. Let tv be ! thisTimeValue(value).
 *     c. Else,
 *         i. Let v be ? ToPrimitive(value).
 *         ii. If v is a String, then
 *             1. Assert: The next step never returns an abrupt completion because
 *                v is a String.
 *             2. Let tv be the result of parsing v as a date, in exactly the same
 *                manner as for the parse method (21.4.3.2).
 *         iii. Else,
 *             1. Let tv be ? ToNumber(v).
 *     d. Let dv be TimeClip(tv).
 * 5. Else,
 *     a. Assert: numberOfArgs ≥ 2.
 *     b. Let y be ? ToNumber(values[0]).
 *     c. Let m be ? ToNumber(values[1]).
 *     d. If numberOfArgs > 2, let dt be ? ToNumber(values[2]); else let dt be 1𝔽.
 *     e. If numberOfArgs > 3, let h be ? ToNumber(values[3]); else let h be +0𝔽.
 *     f. If numberOfArgs > 4, let min be ? ToNumber(values[4]); else let min be +0𝔽.
 *     g. If numberOfArgs > 5, let s be ? ToNumber(values[5]); else let s be +0𝔽.
 *     h. If numberOfArgs > 6, let milli be ? ToNumber(values[6]); else let milli be +0𝔽.
 *     i. If y is NaN, let yr be NaN.
 *     j. Else,
 *         i. Let yi be ! ToIntegerOrInfinity(y).
 *         ii. If 0 ≤ yi ≤ 99, let yr be 1900𝔽 + 𝔽(yi); otherwise, let yr be y.
 *     k. Let finalDate be MakeDate(MakeDay(yr, m, dt), MakeTime(h, min, s, milli)).
 *     l. Let dv be TimeClip(UTC(finalDate)).
 * 6. Let O be ? OrdinaryCreateFromConstructor(NewTarget, "%Date.prototype%", « [[DateValue]] »).
 * 7. Set O.[[DateValue]] to dv.
 * 8. Return O.
 */
export function* DateConstructor($: VM, NewTarget: Func|undefined, ...values: Val[]): ECR<Val> {
  if (NewTarget === undefined) {
    return newDate($, DateNow($)).toString();
  }
  const numberOfArgs = values.length;
  let dv: number;
  let tv: CR<number>|undefined;
  if (numberOfArgs === 0) {
    dv =  DateNow($);
  } else if (numberOfArgs === 1) {
    // 4.
    const value = values[0];
    if (value instanceof Obj && value.DateValue != null) {
      tv = CastNotAbrupt(thisTimeValue($, value));
    } else {
      const v = yield* ToPrimitive($, value);
      if (IsAbrupt(v)) return v;
      if (typeof v === 'string') {
        // TODO - option to parse as UTC (via some faux approach)
        //      - big wrinkle: only interpret as UTC if there's no explicit TZ.
        tv = Date.parse(v);
      } else {
        tv = yield* ToNumber($, v);
        if (IsAbrupt(tv)) return tv;
      }
    }
    dv = newDate($, tv).getTime();
  } else {
    // 5.
    Assert(numberOfArgs >= 2);
    const y = yield* ToNumber($, values[0]);
    if (IsAbrupt(y)) return y;
    const m = yield* ToNumber($, values[1]);
    if (IsAbrupt(m)) return m;
    const dt = numberOfArgs > 2 ? yield* ToNumber($, values[2]) : 1;
    if (IsAbrupt(dt)) return dt;
    const h = numberOfArgs > 3 ? yield* ToNumber($, values[3]) : 0;
    if (IsAbrupt(h)) return h;
    const min = numberOfArgs > 4 ? yield* ToNumber($, values[4]) : 0;
    if (IsAbrupt(min)) return min;
    const s = numberOfArgs > 5 ? yield* ToNumber($, values[5]) : 0;
    if (IsAbrupt(s)) return s;
    const milli = numberOfArgs > 6 ? yield* ToNumber($, values[6]) : 0;
    if (IsAbrupt(milli)) return milli;
    // 5.k.
    const args = [y, m, dt, h, min, s, milli].slice(0, numberOfArgs) as [
      year: number,
      month: number,
      date?: number,
      hour?: number,
      minute?: number,
      seconds?: number,
      milliseconds?: number,
    ];
    dv = newDate($, ...args).getTime();
  }
  return yield* OrdinaryCreateFromConstructor($, NewTarget, '%Date.prototype%', {
    DateValue: dv,
    DebugString: DateDebugString,
  });
}

export function DateDebugString(this: Obj) {
  return new Date(this.DateValue!).toISOString();
}

/** DateNow operation using the host clock. */
export function DateNow_hostClock($: VM): number {
  return Date.now();
}

function newDate($: VM, value: string): Date;
function newDate($: VM, value: number): Date;
function newDate($: VM, year: number, month: number, date?: number,
                 hours?: number, minutes?: number, seconds?: number, ms?: number): Date;
function newDate($: VM, ...args: any[]): Date {
  return new (($.abstractOperations.LocalDate || Date) as any)(...args);
}

/** Calls DateNow indirected through $, falling back on the host clock. */
export function DateNow($: VM): number {
  return $.abstractOperations.DateNow?.($) ?? DateNow_hostClock($);
}

/**
 * 21.4.3.1 Date.now ( )
 * 
 * This function returns the time value designating the UTC date and
 * time of the occurrence of the call to it.
 */
export function* DateCtorNow($: VM): ECR<number> {
  return DateNow($);
}

/**
 * 21.4.3.2 Date.parse ( string )
 * 
 * This function applies the ToString operator to its argument. If
 * ToString results in an abrupt completion the Completion Record is
 * immediately returned. Otherwise, this function interprets the
 * resulting String as a date and time; it returns a Number, the UTC
 * time value corresponding to the date and time. The String may be
 * interpreted as a local time, a UTC time, or a time in some other
 * time zone, depending on the contents of the String. The function
 * first attempts to parse the String according to the format
 * described in Date Time String Format (21.4.1.18), including
 * expanded years. If the String does not conform to that format the
 * function may fall back to any implementation-specific heuristics or
 * implementation-specific date formats. Strings that are
 * unrecognizable or contain out-of-bounds format element values shall
 * cause this function to return NaN.
 * 
 * If the String conforms to the Date Time String Format, substitute
 * values take the place of absent format elements. When the MM or DD
 * elements are absent, "01" is used. When the HH, mm, or ss elements
 * are absent, "00" is used. When the sss element is absent, "000" is
 * used. When the UTC offset representation is absent, date-only forms
 * are interpreted as a UTC time and date-time forms are interpreted
 * as a local time.
 * 
 * If x is any Date whose milliseconds amount is zero within a
 * particular implementation of ECMAScript, then all of the following
 * expressions should produce the same numeric value in that
 * implementation, if all the properties referenced have their initial
 * values:
 * 
 * x.valueOf()
 * Date.parse(x.toString())
 * Date.parse(x.toUTCString())
 * Date.parse(x.toISOString())
 * 
 * However, the expression
 * 
 * Date.parse(x.toLocaleString())
 * 
 * is not required to produce the same Number value as the preceding
 * three expressions and, in general, the value produced by this
 * function is implementation-defined when given any String value that
 * does not conform to the Date Time String Format (21.4.1.18) and
 * that could not be produced in that implementation by the toString
 * or toUTCString method.
 */
export function* DateCtorParse($: VM, string: Val): ECR<number> {
  const str = yield* ToString($, string);
  if (IsAbrupt(str)) return str;
  return newDate($, str).getTime();
}

/**
 * 21.4.3.3 Date.prototype
 * 
 * The initial value of Date.prototype is the Date prototype object.
 * 
 * This property has the attributes { [[Writable]]: false,
 * [[Enumerable]]: false, [[Configurable]]: false }.
 */

/**
 * 21.4.3.4 Date.UTC ( year [ , month [ , date [ , hours [ , minutes [ , seconds [ , ms ] ] ] ] ] ] )
 * 
 * This function performs the following steps when called:
 * 
 * 1. Let y be ? ToNumber(year).
 * 2. If month is present, let m be ? ToNumber(month); else let m be +0𝔽.
 * 3. If date is present, let dt be ? ToNumber(date); else let dt be 1𝔽.
 * 4. If hours is present, let h be ? ToNumber(hours); else let h be +0𝔽.
 * 5. If minutes is present, let min be ? ToNumber(minutes); else let min be +0𝔽.
 * 6. If seconds is present, let s be ? ToNumber(seconds); else let s be +0𝔽.
 * 7. If ms is present, let milli be ? ToNumber(ms); else let milli be +0𝔽.
 * 8. If y is NaN, let yr be NaN.
 * 9. Else,
 *     a. Let yi be ! ToIntegerOrInfinity(y).
 *     b. If 0 ≤ yi ≤ 99, let yr be 1900𝔽 + 𝔽(yi); otherwise, let yr be y.
 * 10. Return TimeClip(MakeDate(MakeDay(yr, m, dt), MakeTime(h, min, s, milli))).
 * 
 * The "length" property of this function is 7𝔽.
 * 
 * NOTE: This function differs from the Date constructor in two ways:
 * it returns a time value as a Number, rather than creating a Date,
 * and it interprets the arguments in UTC rather than as local time.
 */
export function* DateCtorUTC(
  $: VM,
  ...args: [
    year: Val,
    month?: Val,
    date?: Val,
    hours?: Val,
    minutes?: Val,
    seconds?: Val,
    ms?: Val,
  ]
): ECR<number> {
  const y = yield* ToNumber($, args[0]);
  if (IsAbrupt(y)) return y;
  const month = args.length > 1 ? yield* ToNumber($, args[1]) : 0;
  if (IsAbrupt(month)) return month;
  const date = args.length > 2 ? yield* ToNumber($, args[2]) : 1;
  if (IsAbrupt(date)) return date;
  const hours = args.length > 3 ? yield* ToNumber($, args[3]) : 0;
  if (IsAbrupt(hours)) return hours;
  const minutes = args.length > 4 ? yield* ToNumber($, args[4]) : 0;
  if (IsAbrupt(minutes)) return minutes;
  const seconds = args.length > 5 ? yield* ToNumber($, args[5]) : 0;
  if (IsAbrupt(seconds)) return seconds;
  const milli = args.length > 6 ? yield* ToNumber($, args[6]) : 0;
  if (IsAbrupt(milli)) return milli;
  return Date.UTC(y, month, date, hours, minutes, seconds, milli);
}

/**
 * (21.4.4) The abstract operation thisTimeValue takes argument value. It
 * performs the following steps when called:
 * 
 * 1. If value is an Object and value has a [[DateValue]] internal slot, then
 *     a. Return value.[[DateValue]].
 * 2. Throw a TypeError exception.
 */
function thisTimeValue($: VM, value: Val): CR<number> {
  if (value instanceof Obj && value.DateValue != null) return value.DateValue;
  return $.throw('TypeError', 'not a Date object');
}

// In following descriptions of functions that are properties of the
// Date prototype object, the phrase “this Date object” refers to the
// object that is the this value for the invocation of the
// function. If the Type of the this value is not Object, a TypeError
// exception is thrown. The phrase “this time value” within the
// specification of a method refers to the result returned by calling
// the abstract operation thisTimeValue with the this value of the
// method invocation passed as the argument.

/**
 * 21.4.4.2 Date.prototype.getDate ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return DateFromTime(LocalTime(t)).
 */
export function* DatePrototypeGetDate($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getDate();
}

/**
 * 21.4.4.3 Date.prototype.getDay ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return WeekDay(LocalTime(t)).
 */
export function* DatePrototypeGetDay($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getDay();
}

/**
 * 21.4.4.4 Date.prototype.getFullYear ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return YearFromTime(LocalTime(t)).
 */
export function* DatePrototypeGetFullYear($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getFullYear();
}

/**
 * 21.4.4.5 Date.prototype.getHours ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return HourFromTime(LocalTime(t)).
 */
export function* DatePrototypeGetHours($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getHours();
}

/**
 * 21.4.4.6 Date.prototype.getMilliseconds ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return msFromTime(LocalTime(t)).
 */
export function* DatePrototypeGetMilliseconds($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getMilliseconds();
}

/**
 * 21.4.4.7 Date.prototype.getMinutes ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return MinFromTime(LocalTime(t)).
 */
export function* DatePrototypeGetMinutes($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getMinutes();
}

/**
 * 21.4.4.8 Date.prototype.getMonth ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return MonthFromTime(LocalTime(t)).
 */
export function* DatePrototypeGetMonth($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getMonth();
}

/**
 * 21.4.4.9 Date.prototype.getSeconds ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return SecFromTime(LocalTime(t)).
 */
export function* DatePrototypeGetSeconds($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getSeconds();
}

/**
 * 21.4.4.10 Date.prototype.getTime ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Return ? thisTimeValue(this value).
 */
export function* DatePrototypeGetTime($: VM, thisValue: Val): ECR<number> {
  return thisTimeValue($, thisValue);
}

/**
 * 21.4.4.11 Date.prototype.getTimezoneOffset ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return (t - LocalTime(t)) / msPerMinute.
 */
export function* DatePrototypeGetTimezoneOffset($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getTimezoneOffset();
}

/**
 * 21.4.4.12 Date.prototype.getUTCDate ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return DateFromTime(t).
 */
export function* DatePrototypeGetUTCDate($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getUTCDate();
}

/**
 * 21.4.4.13 Date.prototype.getUTCDay ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return WeekDay(t).
 */
export function* DatePrototypeGetUTCDay($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getUTCDay();
}

/**
 * 21.4.4.14 Date.prototype.getUTCFullYear ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return YearFromTime(t).
 */
export function* DatePrototypeGetUTCFullYear($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getUTCFullYear();
}

/**
 * 21.4.4.15 Date.prototype.getUTCHours ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return HourFromTime(t).
 */
export function* DatePrototypeGetUTCHours($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getUTCHours();
}

/**
 * 21.4.4.16 Date.prototype.getUTCMilliseconds ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return msFromTime(t).
 */
export function* DatePrototypeGetUTCMilliseconds($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getUTCMilliseconds();
}

/**
 * 21.4.4.17 Date.prototype.getUTCMinutes ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return MinFromTime(t).
 */
export function* DatePrototypeGetUTCMinutes($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getUTCMinutes();
}

/**
 * 21.4.4.18 Date.prototype.getUTCMonth ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return MonthFromTime(t).
 */
export function* DatePrototypeGetUTCMonth($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getUTCMonth();
}

/**
 * 21.4.4.19 Date.prototype.getUTCSeconds ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, return NaN.
 * 3. Return SecFromTime(t).
 */
export function* DatePrototypeGetUTCSeconds($: VM, thisValue: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  return newDate($, t).getUTCSeconds();
}

/**
 * 21.4.4.20 Date.prototype.setDate ( date )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. Let dt be ? ToNumber(date).
 * 3. If t is NaN, return NaN.
 * 4. Set t to LocalTime(t).
 * 5. Let newDate be MakeDate(MakeDay(YearFromTime(t),
 *    MonthFromTime(t), dt), TimeWithinDay(t)).
 * 6. Let u be TimeClip(UTC(newDate)).
 * 7. Set the [[DateValue]] internal slot of this Date object to u.
 * 8. Return u.
 */
export function* DatePrototypeSetDate($: VM, thisValue: Obj, date: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const dt = yield* ToNumber($, date);
  if (IsAbrupt(dt)) return dt;
  return thisValue.DateValue = newDate($, t).setDate(dt);
}

/**
 * 21.4.4.21 Date.prototype.setFullYear ( year [ , month [ , date ] ] )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. Let y be ? ToNumber(year).
 * 3. If t is NaN, set t to +0𝔽; otherwise, set t to LocalTime(t).
 * 4. If month is not present, let m be MonthFromTime(t); otherwise,
 *    let m be ? ToNumber(month).
 * 5. If date is not present, let dt be DateFromTime(t); otherwise,
 *    let dt be ? ToNumber(date).
 * 6. Let newDate be MakeDate(MakeDay(y, m, dt), TimeWithinDay(t)).
 * 7. Let u be TimeClip(UTC(newDate)).
 * 8. Set the [[DateValue]] internal slot of this Date object to u.
 * 9. Return u.
 * 
 * The "length" property of this method is 3𝔽.
 * 
 * NOTE: If month is not present, this method behaves as if month was
 * present with the value getMonth(). If date is not present, it
 * behaves as if date was present with the value getDate().
 */
export function* DatePrototypeSetFullYear(
  $: VM,
  thisValue: Obj,
  _year: Val,
  _month: Val,
  _date: Val,
): ECR<number> {
  let t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const args: [number, number?, number?] = [] as any;
  for (let i = 0; i < Math.min(arguments.length - 2, 3); i++) {
    const num = yield* ToNumber($, arguments[i + 2]);
    if (IsAbrupt(num)) return num;
    args[i] = num;
  }
  return thisValue.DateValue = newDate($, t).setFullYear(...args);
}

/**
 * 21.4.4.22 Date.prototype.setHours ( hour [ , min [ , sec [ , ms ] ] ] )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. Let h be ? ToNumber(hour).
 * 3. If min is present, let m be ? ToNumber(min).
 * 4. If sec is present, let s be ? ToNumber(sec).
 * 5. If ms is present, let milli be ? ToNumber(ms).
 * 6. If t is NaN, return NaN.
 * 7. Set t to LocalTime(t).
 * 8. If min is not present, let m be MinFromTime(t).
 * 9. If sec is not present, let s be SecFromTime(t).
 * 10. If ms is not present, let milli be msFromTime(t).
 * 11. Let date be MakeDate(Day(t), MakeTime(h, m, s, milli)).
 * 12. Let u be TimeClip(UTC(date)).
 * 13. Set the [[DateValue]] internal slot of this Date object to u.
 * 14. Return u.
 * 
 * The "length" property of this method is 4𝔽.
 * 
 * NOTE: If min is not present, this method behaves as if min was
 * present with the value getMinutes(). If sec is not present, it
 * behaves as if sec was present with the value getSeconds(). If ms is
 * not present, it behaves as if ms was present with the value
 * getMilliseconds().
 */
export function* DatePrototypeSetHours(
  $: VM,
  thisValue: Obj,
  _hour: Val,
  _min: Val,
  _sec: Val,
  _ms: Val,
): ECR<number> {
  let t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const args: [number, number?, number?, number?] = [] as any;
  for (let i = 0; i < Math.min(arguments.length - 2, 4); i++) {
    const num = yield* ToNumber($, arguments[i + 2]);
    if (IsAbrupt(num)) return num;
    args[i] = num;
  }
  return thisValue.DateValue = newDate($, t).setHours(...args);
}

/**
 * 21.4.4.23 Date.prototype.setMilliseconds ( ms )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. Set ms to ? ToNumber(ms).
 * 3. If t is NaN, return NaN.
 * 4. Set t to LocalTime(t).
 * 5. Let time be MakeTime(HourFromTime(t), MinFromTime(t), SecFromTime(t), ms).
 * 6. Let u be TimeClip(UTC(MakeDate(Day(t), time))).
 * 7. Set the [[DateValue]] internal slot of this Date object to u.
 * 8. Return u.
 */
export function* DatePrototypeSetMilliseconds($: VM, thisValue: Obj, ms: Val): ECR<number> {
  let t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const milli = yield* ToNumber($, ms);
  if (IsAbrupt(milli)) return milli;
  return thisValue.DateValue = newDate($, t).setMilliseconds(milli);
}

/**
 * 21.4.4.24 Date.prototype.setMinutes ( min [ , sec [ , ms ] ] )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. Let m be ? ToNumber(min).
 * 3. If sec is present, let s be ? ToNumber(sec).
 * 4. If ms is present, let milli be ? ToNumber(ms).
 * 5. If t is NaN, return NaN.
 * 6. Set t to LocalTime(t).
 * 7. If sec is not present, let s be SecFromTime(t).
 * 8. If ms is not present, let milli be msFromTime(t).
 * 9. Let date be MakeDate(Day(t), MakeTime(HourFromTime(t), m, s, milli)).
 * 10. Let u be TimeClip(UTC(date)).
 * 11. Set the [[DateValue]] internal slot of this Date object to u.
 * 12. Return u.
 * 
 * The "length" property of this method is 3𝔽.
 * 
 * NOTE: If sec is not present, this method behaves as if sec was
 * present with the value getSeconds(). If ms is not present, this
 * behaves as if ms was present with the value getMilliseconds().
 */
export function* DatePrototypeSetMinutes(
  $: VM,
  thisValue: Obj,
  _min: Val,
  _sec: Val,
  _ms: Val,
): ECR<number> {
  let t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const args: [number, number?, number?] = [] as any;
  for (let i = 0; i < Math.min(arguments.length - 2, 3); i++) {
    const num = yield* ToNumber($, arguments[i + 2]);
    if (IsAbrupt(num)) return num;
    args[i] = num;
  }
  return thisValue.DateValue = newDate($, t).setMinutes(...args);
}

/**
 * 21.4.4.25 Date.prototype.setMonth ( month [ , date ] )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. Let m be ? ToNumber(month).
 * 3. If date is present, let dt be ? ToNumber(date).
 * 4. If t is NaN, return NaN.
 * 5. Set t to LocalTime(t).
 * 6. If date is not present, let dt be DateFromTime(t).
 * 7. Let newDate be MakeDate(MakeDay(YearFromTime(t), m, dt), TimeWithinDay(t)).
 * 8. Let u be TimeClip(UTC(newDate)).
 * 9. Set the [[DateValue]] internal slot of this Date object to u.
 * 10. Return u.
 * 
 * The "length" property of this method is 2𝔽.
 * 
 * NOTE: If date is not present, this method behaves as if date was
 * present with the value getDate().
 */
export function* DatePrototypeSetMonth(
  $: VM,
  thisValue: Obj,
  _month: Val,
  _date: Val,
): ECR<number> {
  let t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const args: [number, number?] = [] as any;
  for (let i = 0; i < Math.min(arguments.length - 2, 2); i++) {
    const num = yield* ToNumber($, arguments[i + 2]);
    if (IsAbrupt(num)) return num;
    args[i] = num;
  }
  return thisValue.DateValue = newDate($, t).setMonth(...args);
}

/**
 * 21.4.4.26 Date.prototype.setSeconds ( sec [ , ms ] )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. Let s be ? ToNumber(sec).
 * 3. If ms is present, let milli be ? ToNumber(ms).
 * 4. If t is NaN, return NaN.
 * 5. Set t to LocalTime(t).
 * 6. If ms is not present, let milli be msFromTime(t).
 * 7. Let date be MakeDate(Day(t), MakeTime(HourFromTime(t), MinFromTime(t), s, milli)).
 * 8. Let u be TimeClip(UTC(date)).
 * 9. Set the [[DateValue]] internal slot of this Date object to u.
 * 10. Return u.
 * 
 * The "length" property of this method is 2𝔽.
 * 
 * NOTE
 * 
 * If ms is not present, this method behaves as if ms was present with the value getMilliseconds().
 */
export function* DatePrototypeSetSeconds(
  $: VM,
  thisValue: Obj,
  _sec: Val,
  _ms: Val,
): ECR<number> {
  let t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const args: [number, number?] = [] as any;
  for (let i = 0; i < Math.min(arguments.length - 2, 2); i++) {
    const num = yield* ToNumber($, arguments[i + 2]);
    if (IsAbrupt(num)) return num;
    args[i] = num;
  }
  return thisValue.DateValue = newDate($, t).setSeconds(...args);
}

/**
 * 21.4.4.27 Date.prototype.setTime ( time )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Perform ? thisTimeValue(this value).
 * 2. Let t be ? ToNumber(time).
 * 3. Let v be TimeClip(t).
 * 4. Set the [[DateValue]] internal slot of this Date object to v.
 * 5. Return v.
 */
export function* DatePrototypeSetTime($: VM, thisValue: Obj, time: Val): ECR<number> {
  const status = thisTimeValue($, thisValue);
  if (IsAbrupt(status)) return status
  const t = yield* ToNumber($, time);
  if (IsAbrupt(t)) return t;
  return thisValue.DateValue = t;
}

/**
 * 21.4.4.28 Date.prototype.setUTCDate ( date )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. Let dt be ? ToNumber(date).
 * 3. If t is NaN, return NaN.
 * 4. Let newDate be MakeDate(MakeDay(YearFromTime(t), MonthFromTime(t), dt), TimeWithinDay(t)).
 * 5. Let v be TimeClip(newDate).
 * 6. Set the [[DateValue]] internal slot of this Date object to v.
 * 7. Return v.
 */
export function* DatePrototypeSetUTCDate($: VM, thisValue: Obj, date: Val): ECR<number> {
  const t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const dt = yield* ToNumber($, date);
  if (IsAbrupt(dt)) return dt;
  return thisValue.DateValue = newDate($, t).setUTCDate(dt);
}

/**
 * 21.4.4.29 Date.prototype.setUTCFullYear ( year [ , month [ , date ] ] )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. If t is NaN, set t to +0𝔽.
 * 3. Let y be ? ToNumber(year).
 * 4. If month is not present, let m be MonthFromTime(t); otherwise, let m be ? ToNumber(month).
 * 5. If date is not present, let dt be DateFromTime(t); otherwise, let dt be ? ToNumber(date).
 * 6. Let newDate be MakeDate(MakeDay(y, m, dt), TimeWithinDay(t)).
 * 7. Let v be TimeClip(newDate).
 * 8. Set the [[DateValue]] internal slot of this Date object to v.
 * 9. Return v.
 * 
 * The "length" property of this method is 3𝔽.
 * 
 * NOTE: If month is not present, this method behaves as if month was
 * present with the value getUTCMonth(). If date is not present, it
 * behaves as if date was present with the value getUTCDate().
 */
export function* DatePrototypeSetUTCFullYear(
  $: VM,
  thisValue: Obj,
  _year: Val,
  _month: Val,
  _date: Val,
): ECR<number> {
  let t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const args: [number, number?, number?] = [] as any;
  for (let i = 0; i < Math.min(arguments.length - 2, 3); i++) {
    const num = yield* ToNumber($, arguments[i + 2]);
    if (IsAbrupt(num)) return num;
    args[i] = num;
  }
  return thisValue.DateValue = newDate($, t).setUTCFullYear(...args);
}

/**
 * 21.4.4.30 Date.prototype.setUTCHours ( hour [ , min [ , sec [ , ms ] ] ] )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. Let h be ? ToNumber(hour).
 * 3. If min is present, let m be ? ToNumber(min).
 * 4. If sec is present, let s be ? ToNumber(sec).
 * 5. If ms is present, let milli be ? ToNumber(ms).
 * 6. If t is NaN, return NaN.
 * 7. If min is not present, let m be MinFromTime(t).
 * 8. If sec is not present, let s be SecFromTime(t).
 * 9. If ms is not present, let milli be msFromTime(t).
 * 10. Let date be MakeDate(Day(t), MakeTime(h, m, s, milli)).
 * 11. Let v be TimeClip(date).
 * 12. Set the [[DateValue]] internal slot of this Date object to v.
 * 13. Return v.
 * 
 * The "length" property of this method is 4𝔽.
 * 
 * NOTE: If min is not present, this method behaves as if min was
 * present with the value getUTCMinutes(). If sec is not present, it
 * behaves as if sec was present with the value getUTCSeconds(). If ms
 * is not present, it behaves as if ms was present with the value
 * getUTCMilliseconds().
 */
export function* DatePrototypeSetUTCHours(
  $: VM,
  thisValue: Obj,
  _hour: Val,
  _min: Val,
  _sec: Val,
  _ms: Val,
): ECR<number> {
  let t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const args: [number, number?, number?, number?] = [] as any;
  for (let i = 0; i < Math.min(arguments.length - 2, 4); i++) {
    const num = yield* ToNumber($, arguments[i + 2]);
    if (IsAbrupt(num)) return num;
    args[i] = num;
  }
  return thisValue.DateValue = newDate($, t).setUTCHours(...args);
}

/**
 * 21.4.4.31 Date.prototype.setUTCMilliseconds ( ms )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. Set ms to ? ToNumber(ms).
 * 3. If t is NaN, return NaN.
 * 4. Let time be MakeTime(HourFromTime(t), MinFromTime(t), SecFromTime(t), ms).
 * 5. Let v be TimeClip(MakeDate(Day(t), time)).
 * 6. Set the [[DateValue]] internal slot of this Date object to v.
 * 7. Return v.
 */
export function* DatePrototypeSetUTCMilliseconds($: VM, thisValue: Obj, ms: Val): ECR<number> {
  let t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const milli = yield* ToNumber($, ms);
  if (IsAbrupt(milli)) return milli;
  return thisValue.DateValue = newDate($, t).setUTCMilliseconds(milli);
}

/**
 * 21.4.4.32 Date.prototype.setUTCMinutes ( min [ , sec [ , ms ] ] )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. Let m be ? ToNumber(min).
 * 3. If sec is present, let s be ? ToNumber(sec).
 * 4. If ms is present, let milli be ? ToNumber(ms).
 * 5. If t is NaN, return NaN.
 * 6. If sec is not present, let s be SecFromTime(t).
 * 7. If ms is not present, let milli be msFromTime(t).
 * 8. Let date be MakeDate(Day(t), MakeTime(HourFromTime(t), m, s, milli)).
 * 9. Let v be TimeClip(date).
 * 10. Set the [[DateValue]] internal slot of this Date object to v.
 * 11. Return v.
 * 
 * The "length" property of this method is 3𝔽.
 * 
 * NOTE: If sec is not present, this method behaves as if sec was
 * present with the value getUTCSeconds(). If ms is not present, it
 * behaves as if ms was present with the value return by
 * getUTCMilliseconds().
 */
export function* DatePrototypeSetUTCMinutes(
  $: VM,
  thisValue: Obj,
  _min: Val,
  _sec: Val,
  _ms: Val,
): ECR<number> {
  let t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const args: [number, number?, number?] = [] as any;
  for (let i = 0; i < Math.min(arguments.length - 2, 3); i++) {
    const num = yield* ToNumber($, arguments[i + 2]);
    if (IsAbrupt(num)) return num;
    args[i] = num;
  }
  return thisValue.DateValue = newDate($, t).setUTCMinutes(...args);
}

/**
 * 21.4.4.33 Date.prototype.setUTCMonth ( month [ , date ] )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. Let m be ? ToNumber(month).
 * 3. If date is present, let dt be ? ToNumber(date).
 * 4. If t is NaN, return NaN.
 * 5. If date is not present, let dt be DateFromTime(t).
 * 6. Let newDate be MakeDate(MakeDay(YearFromTime(t), m, dt), TimeWithinDay(t)).
 * 7. Let v be TimeClip(newDate).
 * 8. Set the [[DateValue]] internal slot of this Date object to v.
 * 9. Return v.
 * 
 * The "length" property of this method is 2𝔽.
 * 
 * NOTE: If date is not present, this method behaves as if date was
 * present with the value getUTCDate().
 */
export function* DatePrototypeSetUTCMonth(
  $: VM,
  thisValue: Obj,
  _month: Val,
  _date: Val,
): ECR<number> {
  let t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const args: [number, number?] = [] as any;
  for (let i = 0; i < Math.min(arguments.length - 2, 2); i++) {
    const num = yield* ToNumber($, arguments[i + 2]);
    if (IsAbrupt(num)) return num;
    args[i] = num;
  }
  return thisValue.DateValue = newDate($, t).setUTCMonth(...args);
}

/**
 * 21.4.4.34 Date.prototype.setUTCSeconds ( sec [ , ms ] )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let t be ? thisTimeValue(this value).
 * 2. Let s be ? ToNumber(sec).
 * 3. If ms is present, let milli be ? ToNumber(ms).
 * 4. If t is NaN, return NaN.
 * 5. If ms is not present, let milli be msFromTime(t).
 * 6. Let date be MakeDate(Day(t), MakeTime(HourFromTime(t), MinFromTime(t), s, milli)).
 * 7. Let v be TimeClip(date).
 * 8. Set the [[DateValue]] internal slot of this Date object to v.
 * 9. Return v.
 * 
 * The "length" property of this method is 2𝔽.
 * 
 * NOTE: If ms is not present, this method behaves as if ms was
 * present with the value getUTCMilliseconds().
 */
export function* DatePrototypeSetUTCSeconds(
  $: VM,
  thisValue: Obj,
  _sec: Val,
  _ms: Val,
): ECR<number> {
  let t = thisTimeValue($, thisValue);
  if (IsAbrupt(t)) return t;
  const args: [number, number?] = [] as any;
  for (let i = 0; i < Math.min(arguments.length - 2, 2); i++) {
    const num = yield* ToNumber($, arguments[i + 2]);
    if (IsAbrupt(num)) return num;
    args[i] = num;
  }
  return thisValue.DateValue = newDate($, t).setUTCSeconds(...args);
}

/**
 * 21.4.4.35 Date.prototype.toDateString ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let O be this Date object.
 * 2. Let tv be ? thisTimeValue(O).
 * 3. If tv is NaN, return "Invalid Date".
 * 4. Let t be LocalTime(tv).
 * 5. Return DateString(t).
 */
export function* DatePrototypeToDateString($: VM, thisValue: Obj): ECR<string> {
  const tv = thisTimeValue($, thisValue);
  if (IsAbrupt(tv)) return tv;
  return newDate($, tv).toDateString();
}

/**
 * 21.4.4.36 Date.prototype.toISOString ( )
 * 
 * If this time value is not a finite Number or if it corresponds with
 * a year that cannot be represented in the Date Time String Format,
 * this method throws a RangeError exception. Otherwise, it returns a
 * String representation of this time value in that format on the UTC
 * time scale, including all format elements and the UTC offset
 * representation "Z".
 */
export function* DatePrototypeToISOString($: VM, thisValue: Obj): ECR<string> {
  const tv = thisTimeValue($, thisValue);
  if (IsAbrupt(tv)) return tv;
  return newDate($, tv).toISOString();
}

/**
 * 21.4.4.37 Date.prototype.toJSON ( key )
 * 
 * This method provides a String representation of a Date for use by JSON.stringify (25.5.2).
 * 
 * It performs the following steps when called:
 * 
 * 1. Let O be ? ToObject(this value).
 * 2. Let tv be ? ToPrimitive(O, number).
 * 3. If tv is a Number and tv is not finite, return null.
 * 4. Return ? Invoke(O, "toISOString").
 * 
 * NOTE 1: The argument is ignored.
 * 
 * NOTE 2: This method is intentionally generic; it does not require
 * that its this value be a Date. Therefore, it can be transferred to
 * other kinds of objects for use as a method. However, it does
 * require that any such object have a toISOString method.
 */
export function* DatePrototypeToJSON($: VM, O: Obj, key: Val): ECR<Val> {
  const tv = yield* ToPrimitive($, O, NUMBER);
  if (IsAbrupt(tv)) return tv;
  if (typeof tv === 'number' && !Number.isFinite(tv)) return null;
  return yield* Invoke($, O, 'toISOString');
}

/**
 * 21.4.4.38 Date.prototype.toLocaleDateString ( [ reserved1 [ , reserved2 ] ] )
 * 
 * An ECMAScript implementation that includes the ECMA-402
 * Internationalization API must implement this method as specified in
 * the ECMA-402 specification. If an ECMAScript implementation does
 * not include the ECMA-402 API the following specification of this
 * method is used:
 * 
 * This method returns a String value. The contents of the String are
 * implementation-defined, but are intended to represent the “date”
 * portion of the Date in the current time zone in a convenient,
 * human-readable form that corresponds to the conventions of the host
 * environment's current locale.
 * 
 * The meaning of the optional parameters to this method are defined
 * in the ECMA-402 specification; implementations that do not include
 * ECMA-402 support must not use those parameter positions for
 * anything else.
 */
export function* DatePrototypeToLocaleDateString($: VM, thisValue: Obj): ECR<string> {
  const tv = thisTimeValue($, thisValue);
  if (IsAbrupt(tv)) return tv;
  return newDate($, tv).toDateString();
}

/**
 * 21.4.4.39 Date.prototype.toLocaleString ( [ reserved1 [ , reserved2 ] ] )
 * 
 * An ECMAScript implementation that includes the ECMA-402
 * Internationalization API must implement this method as specified in
 * the ECMA-402 specification. If an ECMAScript implementation does
 * not include the ECMA-402 API the following specification of this
 * method is used:
 * 
 * This method returns a String value. The contents of the String are
 * implementation-defined, but are intended to represent the Date in
 * the current time zone in a convenient, human-readable form that
 * corresponds to the conventions of the host environment's current
 * locale.
 * 
 * The meaning of the optional parameters to this method are defined
 * in the ECMA-402 specification; implementations that do not include
 * ECMA-402 support must not use those parameter positions for
 * anything else.
 */
export function* DatePrototypeToLocaleString($: VM, thisValue: Obj): ECR<string> {
  const tv = thisTimeValue($, thisValue);
  if (IsAbrupt(tv)) return tv;
  return newDate($, tv).toString();
}

/**
 * 21.4.4.40 Date.prototype.toLocaleTimeString ( [ reserved1 [ , reserved2 ] ] )
 * 
 * An ECMAScript implementation that includes the ECMA-402
 * Internationalization API must implement this method as specified in
 * the ECMA-402 specification. If an ECMAScript implementation does
 * not include the ECMA-402 API the following specification of this
 * method is used:
 * 
 * This method returns a String value. The contents of the String are
 * implementation-defined, but are intended to represent the “time”
 * portion of the Date in the current time zone in a convenient,
 * human-readable form that corresponds to the conventions of the host
 * environment's current locale.
 * 
 * The meaning of the optional parameters to this method are defined
 * in the ECMA-402 specification; implementations that do not include
 * ECMA-402 support must not use those parameter positions for
 * anything else.
 */
export function* DatePrototypeToLocaleTimeString($: VM, thisValue: Obj): ECR<string> {
  const tv = thisTimeValue($, thisValue);
  if (IsAbrupt(tv)) return tv;
  return newDate($, tv).toTimeString();
}

/**
 * 21.4.4.41 Date.prototype.toString ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let tv be ? thisTimeValue(this value).
 * 2. Return ToDateString(tv).
 * 
 * NOTE 1: For any Date d such that d.[[DateValue]] is evenly
 * divisible by 1000, the result of Date.parse(d.toString()) =
 * d.valueOf(). See 21.4.3.2.
 * 
 * NOTE 2: This method is not generic; it throws a TypeError exception
 * if its this value is not a Date. Therefore, it cannot be
 * transferred to other kinds of objects for use as a method.
 */
export function* DatePrototypeToString($: VM, thisValue: Obj): ECR<string> {
  const tv = thisTimeValue($, thisValue);
  if (IsAbrupt(tv)) return tv;
  return newDate($, tv).toString();
}

/**
 * 21.4.4.42 Date.prototype.toTimeString ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let O be this Date object.
 * 2. Let tv be ? thisTimeValue(O).
 * 3. If tv is NaN, return "Invalid Date".
 * 4. Let t be LocalTime(tv).
 * 5. Return the string-concatenation of TimeString(t) and TimeZoneString(tv).
 */
export function* DatePrototypeToTimeString($: VM, thisValue: Obj): ECR<string> {
  const tv = thisTimeValue($, thisValue);
  if (IsAbrupt(tv)) return tv;
  return newDate($, tv).toTimeString();
}

/**
 * 21.4.4.43 Date.prototype.toUTCString ( )
 * 
 * This method returns a String value representing the instance in
 * time corresponding to this time value. The format of the String is
 * based upon "HTTP-date" from RFC 7231, generalized to support the
 * full range of times supported by ECMAScript Dates.
 * 
 * It performs the following steps when called:
 * 
 * 1. Let O be this Date object.
 * 2. Let tv be ? thisTimeValue(O).
 * 3. If tv is NaN, return "Invalid Date".
 * 4. Let weekday be the Name of the entry in Table 61 with the Number WeekDay(tv).
 * 5. Let month be the Name of the entry in Table 62 with the Number MonthFromTime(tv).
 * 6. Let day be ToZeroPaddedDecimalString(ℝ(DateFromTime(tv)), 2).
 * 7. Let yv be YearFromTime(tv).
 * 8. If yv is +0𝔽 or yv > +0𝔽, let yearSign be the empty String; otherwise, let yearSign be "-".
 * 9. Let paddedYear be ToZeroPaddedDecimalString(abs(ℝ(yv)), 4).
 * 10. Return the string-concatenation of weekday, ",", the code unit
 *     0x0020 (SPACE), day, the code unit 0x0020 (SPACE), month, the code
 *     unit 0x0020 (SPACE), yearSign, paddedYear, the code unit 0x0020
 *     (SPACE), and TimeString(tv).
 */
export function* DatePrototypeToUTCString($: VM, thisValue: Obj): ECR<string> {
  const tv = thisTimeValue($, thisValue);
  if (IsAbrupt(tv)) return tv;
  return newDate($, tv).toUTCString();
}

/**
 * 21.4.4.44 Date.prototype.valueOf ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Return ? thisTimeValue(this value).
 */
export function* DatePrototypeValueOf($: VM, thisValue: Obj): ECR<number> {
  return thisTimeValue($, thisValue);
}

/**
 * 21.4.4.45 Date.prototype [ @@toPrimitive ] ( hint )
 * 
 * This method is called by ECMAScript language operators to convert a
 * Date to a primitive value. The allowed values for hint are
 * "default", "number", and "string". Dates are unique among built-in
 * ECMAScript object in that they treat "default" as being equivalent
 * to "string", All other built-in ECMAScript objects treat "default"
 * as being equivalent to "number".
 * 
 * It performs the following steps when called:
 * 
 * 1. Let O be the this value.
 * 2. If O is not an Object, throw a TypeError exception.
 * 3. If hint is either "string" or "default", then
 *     a. Let tryFirst be string.
 * 4. Else if hint is "number", then
 *     a. Let tryFirst be number.
 * 5. Else, throw a TypeError exception.
 * 6. Return ? OrdinaryToPrimitive(O, tryFirst).
 * 
 * This property has the attributes { [[Writable]]: false,
 * [[Enumerable]]: false, [[Configurable]]: true }.
 * 
 * The value of the "name" property of this method is "[Symbol.toPrimitive]".
 */
export function* DatePrototypeSymbolToPrimitive($: VM, thisValue: Obj, hint: Val): ECR<Val> {
  const h = yield* ToString($, hint);
  if (IsAbrupt(h)) return h;
  if (h === 'string' || h === 'default') {
    return yield* OrdinaryToPrimitive($, thisValue, STRING);
  } else if (h === 'number') {
    return yield* OrdinaryToPrimitive($, thisValue, NUMBER);
  } else {
    return $.throw('TypeError', 'invalid hint');
  }
}

/**
 * 21.4.5 Properties of Date Instances
 * 
 * Date instances are ordinary objects that inherit properties from
 * the Date prototype object. Date instances also have a [[DateValue]]
 * internal slot. The [[DateValue]] internal slot is the time value
 * represented by this Date.
 */
