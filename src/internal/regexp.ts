import { IsCallable, IsRegExp, SameValue } from './abstract_compare';
import { ToBoolean, ToIntegerOrInfinity, ToLength, ToObject, ToString } from './abstract_conversion';
import { Call, Construct, CreateArrayFromList, DefinePropertyOrThrow, Get, LengthOfArrayLike, Set, SpeciesConstructor } from './abstract_object';
import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { ExecutionContext } from './execution_context';
import { CreateBuiltinFunction, Func, callOrConstruct, getter, method } from './func';
import { objectAndFunctionPrototype } from './fundamental';
import { Obj, OrdinaryCreateFromConstructor, OrdinaryObjectCreate } from './obj';
import { PropertyDescriptor, prop0, propWC } from './property_descriptor';
import { RealmRecord, defineProperties } from './realm_record';
import { Val } from './val';
import { ECR, Plugin, VM, just } from './vm';

/**
 * 22.2.8 Properties of RegExp Instances
 * 
 * RegExp instances are ordinary objects that inherit properties from
 * the RegExp prototype object. RegExp instances have internal slots
 * [[OriginalSource]], [[OriginalFlags]], [[RegExpRecord]], and
 * [[RegExpMatcher]]. The value of the [[RegExpMatcher]] internal slot
 * is an Abstract Closure representation of the Pattern of the RegExp
 * object.
 * 
 * NOTE: Prior to ECMAScript 2015, RegExp instances were specified as
 * having the own data properties "source", "global", "ignoreCase",
 * and "multiline". Those properties are now specified as accessor
 * properties of RegExp.prototype.
 * 
 * RegExp instances also have the following property:
 */
interface RegExpInstanceSlots {
  OriginalSource?: string;
  OriginalFlags?: string;
  RegExpRecord?: never;
  RegExpMatcher?: RegExp;
}
declare global {
  interface ObjectSlots extends RegExpInstanceSlots {}
}

// 22.2.3 Abstract Operations for RegExp Creation

/**
 * 22.2.3.1 RegExpCreate ( P, F )
 * 
 * The abstract operation RegExpCreate takes arguments P (an
 * ECMAScript language value) and F (a String or undefined) and
 * returns either a normal completion containing an Object or a throw
 * completion. It performs the following steps when called:
 * 
 * 1. Let obj be ! RegExpAlloc(%RegExp%).
 * 2. Return ? RegExpInitialize(obj, P, F).
 */
export function* RegExpCreate($: VM, P: Val, F: string): ECR<Obj> {
  const obj = CastNotAbrupt(yield* RegExpAlloc($, $.getIntrinsic('%RegExp%') as Func));
  return yield* RegExpInitialize($, obj, P, F);
}

/**
 * 22.2.3.2 RegExpAlloc ( newTarget )
 * 
 * The abstract operation RegExpAlloc takes argument newTarget (a
 * constructor) and returns either a normal completion containing an
 * Object or a throw completion. It performs the following steps when
 * called:
 * 
 * 1. Let obj be ? OrdinaryCreateFromConstructor(newTarget,
 *    "%RegExp.prototype%", « [[OriginalSource]], [[OriginalFlags]],
 *    [[RegExpRecord]], [[RegExpMatcher]] »).
 * 2. Perform ! DefinePropertyOrThrow(obj, "lastIndex",
 *    PropertyDescriptor { [[Writable]]: true, [[Enumerable]]: false,
 *    [[Configurable]]: false }).
 * 3. Return obj.
 */
export function* RegExpAlloc($: VM, newTarget: Func): ECR<Obj> {
  const obj = yield* OrdinaryCreateFromConstructor($, newTarget, '%RegExp.prototype%', {
    OriginalSource: undefined,
    OriginalFlags: undefined,
    RegExpRecord: undefined,
    RegExpMatcher: undefined,
  });
  if (IsAbrupt(obj)) return obj;
  // TODO - what if newtarget makes lastIndex non-writable?
  CastNotAbrupt(DefinePropertyOrThrow($, obj, 'lastIndex', {
    Writable: false,
    Enumerable: false,
    Configurable: false,
  }));
  return obj;
}

/**
 * 22.2.3.3 RegExpInitialize ( obj, pattern, flags )
 * 
 * The abstract operation RegExpInitialize takes arguments obj (an
 * Object), pattern (an ECMAScript language value), and flags (an
 * ECMAScript language value) and returns either a normal completion
 * containing an Object or a throw completion. It performs the
 * following steps when called:
 * 
 * 1. If pattern is undefined, let P be the empty String.
 * 2. Else, let P be ? ToString(pattern).
 * 3. If flags is undefined, let F be the empty String.
 * 4. Else, let F be ? ToString(flags).
 * 5. If F contains any code unit other than "d", "g", "i", "m", "s",
 *    "u", or "y", or if F contains any code unit more than once, throw a
 *    SyntaxError exception.
 * 6. If F contains "i", let i be true; else let i be false.
 * 7. If F contains "m", let m be true; else let m be false.
 * 8. If F contains "s", let s be true; else let s be false.
 * 9. If F contains "u", let u be true; else let u be false.
 * 10. If u is true, then
 *     a. Let patternText be StringToCodePoints(P).
 * 11. Else,
 *     a. Let patternText be the result of interpreting each of P's
 *     16-bit elements as a Unicode BMP code point. UTF-16 decoding is
 *     not applied to the elements.
 * 12. Let parseResult be ParsePattern(patternText, u).
 * 13. If parseResult is a non-empty List of SyntaxError objects,
 *     throw a SyntaxError exception.
 * 14. Assert: parseResult is a Pattern Parse Node.
 * 15. Set obj.[[OriginalSource]] to P.
 * 16. Set obj.[[OriginalFlags]] to F.
 * 17. Let capturingGroupsCount be CountLeftCapturingParensWithin(parseResult).
 * 18. Let rer be the RegExp Record { [[IgnoreCase]]: i,
 *     [[Multiline]]: m, [[DotAll]]: s, [[Unicode]]: u,
 *     [[CapturingGroupsCount]]: capturingGroupsCount }.
 * 19. Set obj.[[RegExpRecord]] to rer.
 * 20. Set obj.[[RegExpMatcher]] to CompilePattern of parseResult with argument rer.
 * 21. Perform ? Set(obj, "lastIndex", +0𝔽, true).
 * 22. Return obj.
 */
export function* RegExpInitialize($: VM, obj: Obj, pattern: Val, flags: Val): ECR<Obj> {
  const P = pattern === undefined ? '' : yield* ToString($, pattern);
  if (IsAbrupt(P)) return P;
  const F = flags === undefined ? '' : yield* ToString($, flags);
  if (IsAbrupt(F)) return F;
  if (F.match(/[^dgimsuy]/) || F.match(/(.).*\1/)) {
    return $.throw('SyntaxError', 'Invalid flags');
  }
  // skip tracking flags
  obj.OriginalSource = P;
  obj.OriginalFlags = F;
  obj.RegExpMatcher = new RegExp(P, F);
  const setStatus = yield* Set($, obj, 'lastIndex', 0, true);
  if (IsAbrupt(setStatus)) return setStatus;
  return obj;
}

/**
 * 22.2.4 The RegExp Constructor
 * 
 * The RegExp constructor:
 * 
 *   - is %RegExp%.
 *   - is the initial value of the "RegExp" property of the global object.
 *   - creates and initializes a new RegExp object when called as a
 *     function rather than as a constructor. Thus the function call
 *     RegExp(…) is equivalent to the object creation expression new
 *     RegExp(…) with the same arguments.
 *   - may be used as the value of an extends clause of a class
 *     definition. Subclass constructors that intend to inherit the
 *     specified RegExp behaviour must include a super call to the RegExp
 *     constructor to create and initialize subclass instances with the
 *     necessary internal slots.
 *
 * ---
 *
 * 22.2.4.1 RegExp ( pattern, flags )
 *
 * This function performs the following steps when called:
 * 
 * 1. Let patternIsRegExp be ? IsRegExp(pattern).
 * 2. If NewTarget is undefined, then
 *     a. Let newTarget be the active function object.
 *     b. If patternIsRegExp is true and flags is undefined, then
 *         i. Let patternConstructor be ? Get(pattern, "constructor").
 *         ii. If SameValue(newTarget, patternConstructor) is true, return pattern.
 * 3. Else, let newTarget be NewTarget.
 * 4. If pattern is an Object and pattern has a [[RegExpMatcher]] internal slot, then
 *     a. Let P be pattern.[[OriginalSource]].
 *     b. If flags is undefined, let F be pattern.[[OriginalFlags]].
 *     c. Else, let F be flags.
 * 5. Else if patternIsRegExp is true, then
 *     a. Let P be ? Get(pattern, "source").
 *     b. If flags is undefined, then
 *         i. Let F be ? Get(pattern, "flags").
 *     c. Else, let F be flags.
 * 6. Else,
 *     a. Let P be pattern.
 *     b. Let F be flags.
 * 7. Let O be ? RegExpAlloc(newTarget).
 * 8. Return ? RegExpInitialize(O, P, F).
 * 
 * NOTE: If pattern is supplied using a StringLiteral, the usual
 * escape sequence substitutions are performed before the String is
 * processed by this function. If pattern must contain an escape
 * sequence to be recognized by this function, an U+005C (REVERSE
 * SOLIDUS) code points must be escaped within the StringLiteral to
 * prevent them being removed when the contents of the StringLiteral
 * are formed.
 */
export function* RegExpConstructor(
  $: VM, NewTarget: Func|undefined,
  pattern: Val, flags: Val,
): ECR<Obj> {
  const patternIsRegExp = yield* IsRegExp($, pattern);
  if (NewTarget === undefined) {
    NewTarget = $.getActiveFunctionObject()!;
    if (patternIsRegExp && flags === undefined) {
      Assert(pattern instanceof Obj);
      const patternConstructor = yield* Get($, pattern, 'constructor');
      if (IsAbrupt(patternConstructor)) return patternConstructor;
      if (SameValue(NewTarget, patternConstructor)) return pattern;
    }
  }
  let P: CR<Val>;
  let F: CR<Val>;
  if (pattern instanceof Obj && pattern.RegExpMatcher) {
    P = pattern.OriginalSource!;
    F = flags === undefined ? pattern.OriginalFlags : flags;
  } else if (patternIsRegExp) {
    Assert(pattern instanceof Obj);
    P = yield* Get($, pattern, 'source');
    if (IsAbrupt(P)) return P;
    F = flags === undefined ? yield* Get($, pattern, 'flags') : flags;
    if (IsAbrupt(F)) return F;
  } else {
    P = pattern;
    F = flags;
  }
  const O = yield* RegExpAlloc($, NewTarget);
  if (IsAbrupt(O)) return O;
  return yield* RegExpInitialize($, O, P, F);
}

export const regexp: Plugin = {
  id: 'regexp',
  deps: () => [objectAndFunctionPrototype],
  realm: {
    CreateIntrinsics(realm: RealmRecord, stagedGlobals: Map<string, PropertyDescriptor>) {

      /**
       * 22.2.5 Properties of the RegExp Constructor
       * 
       * The RegExp constructor:
       *   - has a [[Prototype]] internal slot whose value is %Function.prototype%.
       *   - has the following properties:
       */
      const regexpCtor = CreateBuiltinFunction(
        callOrConstruct(RegExpConstructor), 2, 'RegExp', realm,
        realm.Intrinsics.get('%Function.prototype%')!);
      realm.Intrinsics.set('%RegExp%', regexpCtor);
      stagedGlobals.set('RegExp', propWC(regexpCtor));


      /**
       * 22.2.6 Properties of the RegExp Prototype Object
       * 
       * The RegExp prototype object:
       *   - is %RegExp.prototype%.
       *   - is an ordinary object.
       *   - is not a RegExp instance and does not have a
       *     [[RegExpMatcher]] internal slot or any of the other
       *     internal slots of RegExp instance objects.
       *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
       * 
       * NOTE: The RegExp prototype object does not have a "valueOf"
       * property of its own; however, it inherits the "valueOf"
       * property from the Object prototype object.
       */
      const regexpPrototype = OrdinaryObjectCreate({
        Prototype: realm.Intrinsics.get('%Object.prototype%')!,
      });
      realm.Intrinsics.set('%RegExp.prototype%', regexpPrototype);

      defineProperties(realm, regexpCtor, {
        /**
         * 22.2.5.1 RegExp.prototype
         * 
         * The initial value of RegExp.prototype is the RegExp prototype object.
         * 
         * This property has the attributes { [[Writable]]: false,
         * [[Enumerable]]: false, [[Configurable]]: false }.
         */
        'prototype': prop0(regexpPrototype),

        /**
         * 22.2.5.2 get RegExp [ @@species ]
         * 
         * RegExp[@@species] is an accessor property whose set accessor
         * function is undefined. Its get accessor function performs the
         * following steps when called:
         * 
         * 1. Return the this value.
         * 
         * The value of the "name" property of this function is "get [Symbol.species]".
         * 
         * NOTE: RegExp prototype methods normally use their this value's
         * constructor to create a derived object. However, a subclass
         * constructor may over-ride that default behaviour by redefining
         * its @@species property.
         */      
        [Symbol.species]: getter(function*(_$, thisValue) {
          return thisValue;
        }),
      });

      defineProperties(realm, regexpPrototype, {
        /**
         * 22.2.6.1 RegExp.prototype.constructor
         * 
         * The initial value of RegExp.prototype.constructor is %RegExp%.
         */
        'constructor': propWC(regexpCtor),

        /**
         * 22.2.6.2 RegExp.prototype.exec ( string )
         * 
         * This method searches string for an occurrence of the
         * regular expression pattern and returns an Array containing
         * the results of the match, or null if string did not match.
         * 
         * It performs the following steps when called:
         * 
         * 1. Let R be the this value.
         * 2. Perform ? RequireInternalSlot(R, [[RegExpMatcher]]).
         * 3. Let S be ? ToString(string).
         * 4. Return ? RegExpBuiltinExec(R, S).
         */
        'exec': method(function*($, R, string): ECR<Val> {
          const status = RequireInternalSlot($, R, 'RegExpMatcher');
          if (IsAbrupt(status)) return status;
          const S = yield* ToString($, string);
          if (IsAbrupt(S)) return S;
          return yield* RegExpBuiltinExec($, R, S);
        }),

        /**
         * 22.2.6.3 get RegExp.prototype.dotAll
         * 
         * RegExp.prototype.dotAll is an accessor property whose set
         * accessor function is undefined. Its get accessor function
         * performs the following steps when called:
         * 
         * 1. Let R be the this value.
         * 2. Let cu be the code unit 0x0073 (LATIN SMALL LETTER S).
         * 3. Return ? RegExpHasFlag(R, cu).
         */
        'dotAll': getter((_$, R) => just(RegExpHasFlag($, R, 's'))),

        /**
         * 22.2.6.4 get RegExp.prototype.flags
         * 
         * RegExp.prototype.flags is an accessor property whose set
         * accessor function is undefined. Its get accessor function
         * performs the following steps when called:
         * 
         * 1. Let R be the this value.
         * 2. If R is not an Object, throw a TypeError exception.
         * 3. Let codeUnits be a new empty List.
         * 4. Let hasIndices be ToBoolean(? Get(R, "hasIndices")).
         * 5. If hasIndices is true, append the code unit 0x0064
         *    (LATIN SMALL LETTER D) to codeUnits.
         * 6. Let global be ToBoolean(? Get(R, "global")).
         * 7. If global is true, append the code unit 0x0067 (LATIN
         *    SMALL LETTER G) to codeUnits.
         * 8. Let ignoreCase be ToBoolean(? Get(R, "ignoreCase")).
         * 9. If ignoreCase is true, append the code unit 0x0069
         *    (LATIN SMALL LETTER I) to codeUnits.
         * 10. Let multiline be ToBoolean(? Get(R, "multiline")).
         * 11. If multiline is true, append the code unit 0x006D
         *     (LATIN SMALL LETTER M) to codeUnits.
         * 12. Let dotAll be ToBoolean(? Get(R, "dotAll")).
         * 13. If dotAll is true, append the code unit 0x0073 (LATIN
         *     SMALL LETTER S) to codeUnits.
         * 14. Let unicode be ToBoolean(? Get(R, "unicode")).
         * 15. If unicode is true, append the code unit 0x0075 (LATIN
         *     SMALL LETTER U) to codeUnits.
         * 16. Let sticky be ToBoolean(? Get(R, "sticky")).
         * 17. If sticky is true, append the code unit 0x0079 (LATIN
         *     SMALL LETTER Y) to codeUnits.
         * 18. Return the String value whose code units are the
         *     elements of the List codeUnits. If codeUnits has no
         *     elements, the empty String is returned.
         */
        'flags': getter(function*($, thisValue) {
          Assert(thisValue instanceof Obj);
          const props = [
            ['hasIndices', 'd'],
            ['global', 'g'],
            ['ignoreCase', 'i'],
            ['multiline', 'm'],
            ['dotAll', 's'],
            ['unicode', 'u'],
            ['sticky', 'y'],
          ];
          let flags = '';
          for (const [p, f] of props) {
            const val = yield* Get($, thisValue, p);
            if (IsAbrupt(val)) return val;
            if (ToBoolean(val)) flags += f;
          }
          return flags;
        }),

        // TODO - given that regexps read the current value from the getters,
        // we may have a hard time avoiding reimplementing the entire engine...?

        /**
         * 22.2.6.5 get RegExp.prototype.global
         * 
         * RegExp.prototype.global is an accessor property whose set
         * accessor function is undefined. Its get accessor function
         * performs the following steps when called:
         * 
         * 1. Let R be the this value.
         * 2. Let cu be the code unit 0x0067 (LATIN SMALL LETTER G).
         * 3. Return ? RegExpHasFlag(R, cu).
         */
        'global': getter(($, R) => just(RegExpHasFlag($, R, 'g'))),

        /**
         * 22.2.6.6 get RegExp.prototype.hasIndices
         * 
         * RegExp.prototype.hasIndices is an accessor property whose
         * set accessor function is undefined. Its get accessor
         * function performs the following steps when called:
         * 
         * 1. Let R be the this value.
         * 2. Let cu be the code unit 0x0064 (LATIN SMALL LETTER D).
         * 3. Return ? RegExpHasFlag(R, cu).
         */
        'hasIndices': getter(($, R) => just(RegExpHasFlag($, R, 'd'))),

        /**
         * 22.2.6.7 get RegExp.prototype.ignoreCase
         * 
         * RegExp.prototype.ignoreCase is an accessor property whose
         * set accessor function is undefined. Its get accessor
         * function performs the following steps when called:
         * 
         * 1. Let R be the this value.
         * 2. Let cu be the code unit 0x0069 (LATIN SMALL LETTER I).
         * 3. Return ? RegExpHasFlag(R, cu).
         */
        'ignoreCase': getter(($, R) => just(RegExpHasFlag($, R, 'i'))),

        /** 22.2.6.8 RegExp.prototype [ @@match ] ( string ) */
        [Symbol.match]: method(RegExpPrototypeMatch),

        /** 22.2.6.9 RegExp.prototype [ @@matchAll ] ( string ) */
        [Symbol.matchAll]: method(RegExpPrototypeMatchAll),

        /**
         * 22.2.6.10 get RegExp.prototype.multiline
         * 
         * RegExp.prototype.multiline is an accessor property whose
         * set accessor function is undefined. Its get accessor
         * function performs the following steps when called:
         * 
         * 1. Let R be the this value.
         * 2. Let cu be the code unit 0x006D (LATIN SMALL LETTER M).
         * 3. Return ? RegExpHasFlag(R, cu).
         */
        'multiline': getter(($, R) => just(RegExpHasFlag($, R, 'm'))),

        /** 22.2.6.11 RegExp.prototype [ @@replace ] ( string, replaceValue ) */
        [Symbol.replace]: method(RegExpPrototypeReplace),

        /**
         * 22.2.6.12 RegExp.prototype [ @@search ] ( string )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let rx be the this value.
         * 2. If rx is not an Object, throw a TypeError exception.
         * 3. Let S be ? ToString(string).
         * 4. Let previousLastIndex be ? Get(rx, "lastIndex").
         * 5. If SameValue(previousLastIndex, +0𝔽) is false, then
         *     a. Perform ? Set(rx, "lastIndex", +0𝔽, true).
         * 6. Let result be ? RegExpExec(rx, S).
         * 7. Let currentLastIndex be ? Get(rx, "lastIndex").
         * 8. If SameValue(currentLastIndex, previousLastIndex) is false, then
         *     a. Perform ? Set(rx, "lastIndex", previousLastIndex, true).
         * 9. If result is null, return -1𝔽.
         * 10. Return ? Get(result, "index").
         * 
         * The value of the "name" property of this method is "[Symbol.search]".
         * 
         * NOTE: The "lastIndex" and "global" properties of this
         * RegExp object are ignored when performing the search. The
         * "lastIndex" property is left unchanged.
         */

        /**
         * 22.2.6.13 get RegExp.prototype.source
         * 
         * RegExp.prototype.source is an accessor property whose set
         * accessor function is undefined. Its get accessor function
         * performs the following steps when called:
         * 
         * 1. Let R be the this value.
         * 2. If R is not an Object, throw a TypeError exception.
         * 3. If R does not have an [[OriginalSource]] internal slot, then
         *     a. If SameValue(R, %RegExp.prototype%) is true, return "(?:)".
         *     b. Otherwise, throw a TypeError exception.
         * 4. Assert: R has an [[OriginalFlags]] internal slot.
         * 5. Let src be R.[[OriginalSource]].
         * 6. Let flags be R.[[OriginalFlags]].
         * 7. Return EscapeRegExpPattern(src, flags).
         */

        /**
         * 22.2.6.13.1 EscapeRegExpPattern ( P, F )
         * 
         * The abstract operation EscapeRegExpPattern takes arguments
         * P (a String) and F (a String) and returns a String. It
         * performs the following steps when called:
         * 
         * 1. Let S be a String in the form of a Pattern[~UnicodeMode]
         *    (Pattern[+UnicodeMode] if F contains "u") equivalent to P
         *    interpreted as UTF-16 encoded Unicode code points (6.1.4),
         *    in which certain code points are escaped as described
         *    below. S may or may not differ from P; however, the
         *    Abstract Closure that would result from evaluating S as a
         *    Pattern[~UnicodeMode] (Pattern[+UnicodeMode] if F contains
         *    "u") must behave identically to the Abstract Closure given
         *    by the constructed object's [[RegExpMatcher]] internal
         *    slot. Multiple calls to this abstract operation using the
         *    same values for P and F must produce identical results.
         * 2. The code points / or any LineTerminator occurring in the
         *    pattern shall be escaped in S as necessary to ensure that
         *    the string-concatenation of "/", S, "/", and F can be
         *    parsed (in an appropriate lexical context) as a
         *    RegularExpressionLiteral that behaves identically to the
         *    constructed regular expression. For example, if P is "/",
         *    then S could be "\\/" or "\\u002F", among other
         *    possibilities, but not "/", because /// followed by F would
         *    be parsed as a SingleLineComment rather than a
         *    RegularExpressionLiteral. If P is the empty String, this
         *    specification can be met by letting S be "(?:)".
         * 3. Return S.
         */

        /**
         * 22.2.6.14 RegExp.prototype [ @@split ] ( string, limit )
         * 
         * NOTE 1: This method returns an Array into which substrings
         * of the result of converting string to a String have been
         * stored. The substrings are determined by searching from
         * left to right for matches of the this value regular
         * expression; these occurrences are not part of any String in
         * the returned array, but serve to divide up the String
         * value.
         * 
         * The this value may be an empty regular expression or a
         * regular expression that can match an empty String. In this
         * case, the regular expression does not match the empty
         * substring at the beginning or end of the input String, nor
         * does it match the empty substring at the end of the
         * previous separator match. (For example, if the regular
         * expression matches the empty String, the String is split up
         * into individual code unit elements; the length of the
         * result array equals the length of the String, and each
         * substring contains one code unit.) Only the first match at
         * a given index of the String is considered, even if
         * backtracking could yield a non-empty substring match at
         * that index. (For example, /a*?/[Symbol.split]("ab")
         * evaluates to the array ["a", "b"], while / a *
         * /[Symbol.split]("ab") evaluates to the array ["","b"].)
         * 
         * If string is (or converts to) the empty String, the result
         * depends on whether the regular expression can match the
         * empty String. If it can, the result array contains no
         * elements. Otherwise, the result array contains one element,
         * which is the empty String.
         * 
         * If the regular expression contains capturing parentheses,
         * then each time separator is matched the results (including
         * any undefined results) of the capturing parentheses are
         * spliced into the output array. For example,
         * 
         * /<(\\/)?([^<>]+)>/[Symbol.split]("A<B>bold</B>and<CODE>coded</CODE>")
         * 
         * evaluates to the array
         * 
         * ["A", undefined, "B", "bold", "/", "B", "and", undefined,
         *  "CODE", "coded", "/", "CODE", ""]
         * 
         * If limit is not undefined, then the output array is
         * truncated so that it contains no more than limit elements.
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let rx be the this value.
         * 2. If rx is not an Object, throw a TypeError exception.
         * 3. Let S be ? ToString(string).
         * 4. Let C be ? SpeciesConstructor(rx, %RegExp%).
         * 5. Let flags be ? ToString(? Get(rx, "flags")).
         * 6. If flags contains "u", let unicodeMatching be true.
         * 7. Else, let unicodeMatching be false.
         * 8. If flags contains "y", let newFlags be flags.
         * 9. Else, let newFlags be the string-concatenation of flags and "y".
         * 10. Let splitter be ? Construct(C, « rx, newFlags »).
         * 11. Let A be ! ArrayCreate(0).
         * 12. Let lengthA be 0.
         * 13. If limit is undefined, let lim be 232 - 1; else let lim
         *     be ℝ(? ToUint32(limit)).
         * 14. If lim = 0, return A.
         * 15. If S is the empty String, then
         *     a. Let z be ? RegExpExec(splitter, S).
         *     b. If z is not null, return A.
         *     c. Perform ! CreateDataPropertyOrThrow(A, "0", S).
         *     d. Return A.
         * 16. Let size be the length of S.
         * 17. Let p be 0.
         * 18. Let q be p.
         * 19. Repeat, while q < size,
         *     a. Perform ? Set(splitter, "lastIndex", 𝔽(q), true).
         *     b. Let z be ? RegExpExec(splitter, S).
         *     c. If z is null, set q to AdvanceStringIndex(S, q, unicodeMatching).
         *     d. Else,
         *         i. Let e be ℝ(? ToLength(? Get(splitter, "lastIndex"))).
         *         ii. Set e to min(e, size).
         *         iii. If e = p, set q to AdvanceStringIndex(S, q, unicodeMatching).
         *         iv. Else,
         *             1. Let T be the substring of S from p to q.
         *             2. Perform ! CreateDataPropertyOrThrow(A, ! ToString(𝔽(lengthA)), T).
         *             3. Set lengthA to lengthA + 1.
         *             4. If lengthA = lim, return A.
         *             5. Set p to e.
         *             6. Let numberOfCaptures be ? LengthOfArrayLike(z).
         *             7. Set numberOfCaptures to max(numberOfCaptures - 1, 0).
         *             8. Let i be 1.
         *             9. Repeat, while i ≤ numberOfCaptures,
         *                 a. Let nextCapture be ? Get(z, ! ToString(𝔽(i))).
         *                 b. Perform ! CreateDataPropertyOrThrow(A,
         *                    ! ToString(𝔽(lengthA)), nextCapture).
         *                 c. Set i to i + 1.
         *                 d. Set lengthA to lengthA + 1.
         *                 e. If lengthA = lim, return A.
         *             10. Set q to p.
         * 20. Let T be the substring of S from p to size.
         * 21. Perform ! CreateDataPropertyOrThrow(A, ! ToString(𝔽(lengthA)), T).
         * 22. Return A.
         * 
         * The value of the "name" property of this method is "[Symbol.split]".
         * 
         * NOTE 2: This method ignores the value of the "global" and
         * "sticky" properties of this RegExp object.
         */

        /**
         * 22.2.6.15 get RegExp.prototype.sticky
         * 
         * RegExp.prototype.sticky is an accessor property whose set
         * accessor function is undefined. Its get accessor function
         * performs the following steps when called:
         * 
         * 1. Let R be the this value.
         * 2. Let cu be the code unit 0x0079 (LATIN SMALL LETTER Y).
         * 3. Return ? RegExpHasFlag(R, cu).
         */

        /**
         * 22.2.6.16 RegExp.prototype.test ( S )
         * 
         * This method performs the following steps when called:
         * 
         * 1. Let R be the this value.
         * 2. If R is not an Object, throw a TypeError exception.
         * 3. Let string be ? ToString(S).
         * 4. Let match be ? RegExpExec(R, string).
         * 5. If match is not null, return true; else return false.
         */

        /**
         * 22.2.6.17 RegExp.prototype.toString ( )
         * 1. Let R be the this value.
         * 2. If R is not an Object, throw a TypeError exception.
         * 3. Let pattern be ? ToString(? Get(R, "source")).
         * 4. Let flags be ? ToString(? Get(R, "flags")).
         * 5. Let result be the string-concatenation of "/", pattern, "/", and flags.
         * 6. Return result.
         * 
         * NOTE: The returned String has the form of a
         * RegularExpressionLiteral that evaluates to another RegExp
         * object with the same behaviour as this object.
         */

        /**
         * 22.2.6.18 get RegExp.prototype.unicode
         * 
         * RegExp.prototype.unicode is an accessor property whose set
         * accessor function is undefined. Its get accessor function
         * performs the following steps when called:
         * 
         * 1. Let R be the this value.
         * 2. Let cu be the code unit 0x0075 (LATIN SMALL LETTER U).
         * 3. Return ? RegExpHasFlag(R, cu).
         */
        'unicode': getter(($, R) => just(RegExpHasFlag($, R, 'u'))),
      });
    },
  },
};

/**
 * 22.2.6.4.1 RegExpHasFlag ( R, codeUnit )
 * 
 * The abstract operation RegExpHasFlag takes arguments R (an
 * ECMAScript language value) and codeUnit (a code unit) and
 * returns either a normal completion containing either a
 * Boolean or undefined, or a throw completion. It performs
 * the following steps when called:
 * 
 * 1. If R is not an Object, throw a TypeError exception.
 * 2. If R does not have an [[OriginalFlags]] internal slot, then
 *     a. If SameValue(R, %RegExp.prototype%) is true, return undefined.
 *     b. Otherwise, throw a TypeError exception.
 * 3. Let flags be R.[[OriginalFlags]].
 * 4. If flags contains codeUnit, return true.
 * 5. Return false.
 */
export function RegExpHasFlag($: VM, R: Val, codeUnit: string): CR<boolean|undefined> {
  if (!(R instanceof Obj)) return $.throw('TypeError', 'not an object');
  if (R.OriginalFlags == null) {
    if (SameValue(R, $.getRealm()!.Intrinsics.get('%RegExp.prototype%'))) {
      return undefined;
    }
    return $.throw('TypeError', 'invalid RegExp');
  }
  return R.OriginalFlags.includes(codeUnit);
}

/**
 * 22.2.6.8 RegExp.prototype [ @@match ] ( string )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let rx be the this value.
 * 2. If rx is not an Object, throw a TypeError exception.
 * 3. Let S be ? ToString(string).
 * 4. Let flags be ? ToString(? Get(rx, "flags")).
 * 5. If flags does not contain "g", then
 *     a. Return ? RegExpExec(rx, S).
 * 6. Else,
 *     a. If flags contains "u", let fullUnicode be
 *        true. Otherwise, let fullUnicode be false.
 *     b. Perform ? Set(rx, "lastIndex", +0𝔽, true).
 *     c. Let A be ! ArrayCreate(0).
 *     d. Let n be 0.
 *     e. Repeat,
 *         i. Let result be ? RegExpExec(rx, S).
 *         ii. If result is null, then
 *             1. If n = 0, return null.
 *             2. Return A.
 *         iii. Else,
 *             1. Let matchStr be ? ToString(? Get(result, "0")).
 *             2. Perform ! CreateDataPropertyOrThrow(A,
 *                ! ToString(𝔽(n)), matchStr).
 *             3. If matchStr is the empty String, then
 *                 a. Let thisIndex be ℝ(? ToLength(? Get(rx, "lastIndex"))).
 *                 b. Let nextIndex be AdvanceStringIndex(S,
 *                    thisIndex, fullUnicode).
 *                 c. Perform ? Set(rx, "lastIndex", 𝔽(nextIndex), true).
 *             4. Set n to n + 1.
 * 
 * The value of the "name" property of this method is "[Symbol.match]".
 * 
 * NOTE: The @@match property is used by the IsRegExp abstract
 * operation to identify objects that have the basic behaviour
 * of regular expressions. The absence of a @@match property
 * or the existence of such a property whose value does not
 * Boolean coerce to true indicates that the object is not
 * intended to be used as a regular expression object.
 */
export function* RegExpPrototypeMatch(
  $: VM,
  rx: Val,
  string: Val,
): ECR<Val> {
  if (!(rx instanceof Obj)) return $.throw('TypeError', 'not an object');
  const S = yield* ToString($, string);
  if (IsAbrupt(S)) return S;
  const flagsVal = yield* Get($, rx, 'flags');
  if (IsAbrupt(flagsVal)) return flagsVal;
  const flags = yield* ToString($, flagsVal);
  if (IsAbrupt(flags)) return flags;
  if (!flags.includes('g')) {
    return yield* RegExpExec($, rx, S);
  }
  const fullUnicode = flags.includes('u');
  yield* Set($, rx, 'lastIndex', 0, true);
  const A: string[] = [];
  while (true) {
    const result = yield* RegExpExec($, rx, S);
    if (IsAbrupt(result)) return result;
    if (result === null) {
      if (!A.length) return null;
      return CreateArrayFromList($, A);
    }
    const matchVal = yield* Get($, result, '0');
    if (IsAbrupt(matchVal)) return matchVal;
    const matchStr = yield* ToString($, matchVal);
    if (IsAbrupt(matchStr)) return matchStr
    A.push(matchStr);
    if (matchStr === '') {
      const lastIndex = yield* Get($, rx, 'lastIndex');
      if (IsAbrupt(lastIndex)) return lastIndex;
      const thisIndex = yield* ToLength($, lastIndex);
      if (IsAbrupt(thisIndex)) return thisIndex;
      const nextIndex = AdvanceStringIndex(S, thisIndex, fullUnicode);
      const setStatus = yield* Set($, rx, 'lastIndex', nextIndex, true);
      if (IsAbrupt(setStatus)) return setStatus;
    }
  }
}

/**
 * 22.2.6.9 RegExp.prototype [ @@matchAll ] ( string )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let R be the this value.
 * 2. If R is not an Object, throw a TypeError exception.
 * 3. Let S be ? ToString(string).
 * 4. Let C be ? SpeciesConstructor(R, %RegExp%).
 * 5. Let flags be ? ToString(? Get(R, "flags")).
 * 6. Let matcher be ? Construct(C, « R, flags »).
 * 7. Let lastIndex be ? ToLength(? Get(R, "lastIndex")).
 * 8. Perform ? Set(matcher, "lastIndex", lastIndex, true).
 * 9. If flags contains "g", let global be true.
 * 10. Else, let global be false.
 * 11. If flags contains "u", let fullUnicode be true.
 * 12. Else, let fullUnicode be false.
 * 13. Return CreateRegExpStringIterator(matcher, S, global, fullUnicode).
 * 
 * The value of the "name" property of this method is "[Symbol.matchAll]".
 */
export function* RegExpPrototypeMatchAll($: VM, R: Val, string: Val): ECR<Val> {
  if (!(R instanceof Obj)) return $.throw('TypeError', 'not an object');
  const S = yield* ToString($, string);
  if (IsAbrupt(S)) return S;
  const C = yield* SpeciesConstructor($, R, $.getIntrinsic('%RegExp%') as Func);
  if (IsAbrupt(C)) return C;
  const flagsVal = yield* Get($, R, 'flags');
  if (IsAbrupt(flagsVal)) return flagsVal;
  const flags = yield* ToString($, flagsVal);
  if (IsAbrupt(flags)) return flags;
  const matcher = yield* Construct($, C, [R, flags]);
  if (IsAbrupt(matcher)) return matcher;
  const getResult = yield* Get($, R, 'lastIndex')
  if (IsAbrupt(getResult)) return getResult;
  const lastIndex = yield* ToLength($, getResult);
  if (IsAbrupt(lastIndex)) return lastIndex;
  const setStatus = yield* Set($, matcher, 'lastIndex', lastIndex, true);
  if (IsAbrupt(setStatus)) return setStatus;
  const global = flags.includes('g');
  const fullUnicode = flags.includes('u');
  return yield* CreateRegExpStringIterator($, matcher, S, global, fullUnicode);
}

/**
 * 22.2.6.11 RegExp.prototype [ @@replace ] ( string, replaceValue )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let rx be the this value.
 * 2. If rx is not an Object, throw a TypeError exception.
 * 3. Let S be ? ToString(string).
 * 4. Let lengthS be the length of S.
 * 5. Let functionalReplace be IsCallable(replaceValue).
 * 6. If functionalReplace is false, then
 *     a. Set replaceValue to ? ToString(replaceValue).
 * 7. Let flags be ? ToString(? Get(rx, "flags")).
 * 8. If flags contains "g", let global be true. Otherwise, let global be false.
 * 9. If global is true, then
 *     a. If flags contains "u", let fullUnicode be
 *        true. Otherwise, let fullUnicode be false.
 *     b. Perform ? Set(rx, "lastIndex", +0𝔽, true).
 * 10. Let results be a new empty List.
 * 11. Let done be false.
 * 12. Repeat, while done is false,
 *     a. Let result be ? RegExpExec(rx, S).
 *     b. If result is null, set done to true.
 *     c. Else,
 *         i. Append result to results.
 *         ii. If global is false, set done to true.
 *         iii. Else,
 *             1. Let matchStr be ? ToString(? Get(result, "0")).
 *             2. If matchStr is the empty String, then
 *                 a. Let thisIndex be ℝ(? ToLength(? Get(rx, "lastIndex"))).
 *                 b. Let nextIndex be AdvanceStringIndex(S, thisIndex, fullUnicode).
 *                 c. Perform ? Set(rx, "lastIndex", 𝔽(nextIndex), true).
 * 13. Let accumulatedResult be the empty String.
 * 14. Let nextSourcePosition be 0.
 * 15. For each element result of results, do
 *     a. Let resultLength be ? LengthOfArrayLike(result).
 *     b. Let nCaptures be max(resultLength - 1, 0).
 *     c. Let matched be ? ToString(? Get(result, "0")).
 *     d. Let matchLength be the length of matched.
 *     e. Let position be ? ToIntegerOrInfinity(? Get(result, "index")).
 *     f. Set position to the result of clamping position between 0 and lengthS.
 *     g. Let captures be a new empty List.
 *     h. Let n be 1.
 *     i. Repeat, while n ≤ nCaptures,
 *         i. Let capN be ? Get(result, ! ToString(𝔽(n))).
 *         ii. If capN is not undefined, then
 *             1. Set capN to ? ToString(capN).
 *         iii. Append capN to captures.
 *         iv. NOTE: When n = 1, the preceding step puts the
 *             first element into captures (at index 0). More
 *             generally, the nth capture (the characters captured
 *             by the nth set of capturing parentheses) is at
 *             captures[n - 1].
 *         v. Set n to n + 1.
 *     j. Let namedCaptures be ? Get(result, "groups").
 *     k. If functionalReplace is true, then
 *         i. Let replacerArgs be the list-concatenation of « matched »,
 *            captures, and « 𝔽(position), S ».
 *         ii. If namedCaptures is not undefined, then
 *             1. Append namedCaptures to replacerArgs.
 *         iii. Let replValue be ? Call(replaceValue, undefined, replacerArgs).
 *         iv. Let replacement be ? ToString(replValue).
 *     l. Else,
 *         i. If namedCaptures is not undefined, then
 *             1. Set namedCaptures to ? ToObject(namedCaptures).
 *         ii. Let replacement be ? GetSubstitution(matched,
 *             S, position, captures, namedCaptures,
 *             replaceValue).
 *     m. If position ≥ nextSourcePosition, then
 *         i. NOTE: position should not normally move
 *            backwards. If it does, it is an indication of an
 *            ill-behaving RegExp subclass or use of an access
 *            triggered side-effect to change the global flag or
 *            other characteristics of rx. In such cases, the
 *            corresponding substitution is ignored.
 *         ii. Set accumulatedResult to the
 *             string-concatenation of accumulatedResult, the
 *             substring of S from nextSourcePosition to position,
 *             and replacement.
 *         iii. Set nextSourcePosition to position + matchLength.
 * 16. If nextSourcePosition ≥ lengthS, return accumulatedResult.
 * 17. Return the string-concatenation of accumulatedResult
 *     and the substring of S from nextSourcePosition.
 * 
 * The value of the "name" property of this method is "[Symbol.replace]".
 */
export function* RegExpPrototypeReplace(
  $: VM,
  rx: Val,
  string: Val,
  rv: Val,
): ECR<Val> {
  let replaceValue: CR<Val> = rv;
  if (!(rx instanceof Obj)) return $.throw('TypeError', 'not an object');
  const S = yield* ToString($, string);
  if (IsAbrupt(S)) return S;
  const lengthS = S.length;
  // 5.
  const functionalReplace = IsCallable(replaceValue);
  if (!functionalReplace) {
    replaceValue = yield* ToString($, replaceValue);
    if (IsAbrupt(replaceValue)) return replaceValue;
  }
  const flagsVal = yield* Get($, rx, 'flags');
  if (IsAbrupt(flagsVal)) return flagsVal;
  const flags = yield* ToString($, flagsVal);
  if (IsAbrupt(flags)) return flags;
  const global = flags.includes('g');
  let fullUnicode = false;
  if (global) {
    fullUnicode = flags.includes('u');
    const setStatus = yield* Set($, rx, 'lastIndex', 0, true);
    if (IsAbrupt(setStatus)) return setStatus;
  }
  // 10.
  const results: Obj[] = [];
  let done = false;
  while (!done) {
    const result = yield* RegExpExec($, rx, S);
    if (IsAbrupt(result)) return result;
    if (result === null) {
      done = true;
    } else {
      results.push(result);
      if (!global) {
        done = true;
      } else {
        // 12.c.iii.1
        const matchVal = yield* Get($, result, '0');
        if (IsAbrupt(matchVal)) return matchVal;
        const matchStr = yield* ToString($, matchVal);
        if (IsAbrupt(matchStr)) return matchStr;
        if (matchStr === '') {
          const lastIndex = yield* Get($, rx, 'lastIndex');
          if (IsAbrupt(lastIndex)) return lastIndex;
          const thisIndex = yield* ToLength($, lastIndex);
          if (IsAbrupt(thisIndex)) return thisIndex;
          const nextIndex = yield* AdvanceStringIndex(S, thisIndex, fullUnicode);
          const setStatus = yield* Set($, rx, 'lastIndex', nextIndex, true);
          if (IsAbrupt(setStatus)) return setStatus;
        }
      }
    }
  }
  // 13.
  let accumulatedResult = '';
  let nextSourcePosition = 0;
  for (const result of results) {
    const resultLength = yield* LengthOfArrayLike($, result);
    if (IsAbrupt(resultLength)) return resultLength;
    const nCaptures = Math.max(resultLength - 1, 0);
    const matchedVal = yield* Get($, result, '0');
    if (IsAbrupt(matchedVal)) return matchedVal;
    const matched = yield* ToString($, matchedVal);
    if (IsAbrupt(matched)) return matched;
    const matchLength = matched.length;
    const positionVal = yield* Get($, result, 'index');
    if (IsAbrupt(positionVal)) return positionVal;
    let position = yield* ToIntegerOrInfinity($, positionVal);
    if (IsAbrupt(position)) return position;
    position = Math.min(Math.max(position, 0), lengthS);
    // 15.g.
    const captures = [];
    for (let n = 1; n <= nCaptures; n++) {
      let capN = yield* Get($, result, String(n));
      if (IsAbrupt(capN)) return capN;
      if (capN !== undefined) {
        capN = yield* ToString($, capN);
        if (IsAbrupt(capN)) return capN;
      }
      captures.push(capN);
    }
    // 15.j.
    let namedCaptures = yield* Get($, result, 'groups');
    if (IsAbrupt(namedCaptures)) return namedCaptures;
    let replacement: CR<string>;
    if (functionalReplace) {
      const replacerArgs = [matched, ...captures, position, S];
      if (namedCaptures !== undefined) {
        replacerArgs.push(namedCaptures as string);
      }
      const replValue = yield* Call($, replaceValue, undefined, replacerArgs);
      if (IsAbrupt(replValue)) return replValue;
      replacement = yield* ToString($, replValue);
      if (IsAbrupt(replacement)) return replacement;
    } else {
      // 15.l.i.
      if (namedCaptures !== undefined) {
        namedCaptures = ToObject($, namedCaptures);
        if (IsAbrupt(namedCaptures)) return namedCaptures;
      }
      replacement = yield* GetSubstitution(
        $, matched, S, position, captures, namedCaptures, replaceValue);
      if (IsAbrupt(replacement)) return replacement;
    }
    // 15.m.
    if (position >= nextSourcePosition) {
      accumulatedResult += S.substring(nextSourcePosition, position) + replacement;
      nextSourcePosition = position + matchLength;
    }
  }
  // 16.
  if (nextSourcePosition >= lengthS) return accumulatedResult;
  return accumulatedResult + S.substring(nextSourcePosition);
}
