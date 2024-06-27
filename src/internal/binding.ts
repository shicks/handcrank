import { RequireObjectCoercible } from './abstract_compare';
import { ToPropertyKey } from './abstract_conversion';
import { GetIterator, IteratorClose, IteratorRecord, IteratorStep, IteratorValue } from './abstract_iterator';
import { CopyDataProperties, CreateArrayFromList, GetV } from './abstract_object';
import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { SYNC, UNUSED } from './enums';
import { EnvironmentRecord } from './environment_record';
import { ResolveBinding } from './execution_context';
import { OrdinaryObjectCreate } from './obj';
import { InitializeReferencedBinding, PutValue, ReferenceRecord } from './reference_record';
import { IsAnonymousFunctionDefinition } from './static/functions';
import { PropertyKey, Val } from './val';
import { ECR, VM } from './vm';
import * as ESTree from 'estree';

/**
 * 8.6.2 Runtime Semantics: BindingInitialization
 * 
 * The syntax-directed operation BindingInitialization takes arguments
 * value (an ECMAScript language value) and environment (an
 * Environment Record or undefined) and returns either a normal
 * completion containing unused or an abrupt completion.
 * 
 * NOTE: undefined is passed for environment to indicate that a
 * PutValue operation should be used to assign the initialization
 * value. This is the case for var statements and formal parameter
 * lists of some non-strict functions (See 10.2.11). In those cases a
 * lexical binding is hoisted and preinitialized prior to evaluation
 * of its initializer.
 * 
 * It is defined piecewise over the following productions:
 */

/**
 * BindingIdentifier : Identifier
 * 1. Let name be StringValue of Identifier.
 * 2. Return ? InitializeBoundName(name, value, environment).
 */
export function BindingInitialization_Identifier(
  $: VM,
  n: ESTree.Identifier,
  value: Val,
  environment: EnvironmentRecord|undefined,
): ECR<UNUSED> {
  return InitializeBoundName($, n.name, value, environment);
}

/**
 * NOTE: This is not actually legit in the spec, but we've repurposed
 * the BindingIdentifier production to handle all kinds of destructured
 * assignments, so this additional production is required.
 */
export function* BindingInitialization_MemberExpression(
  $: VM,
  n: ESTree.MemberExpression,
  value: Val,
  environment: EnvironmentRecord|undefined,
): ECR<UNUSED> {
  Assert(environment == null);
  const lref = yield* $.Evaluation(n);
  if (IsAbrupt(lref)) return lref;
  Assert(lref instanceof ReferenceRecord);
  return yield* PutValue($, lref, value);
}

/** 
 * BindingPattern : ObjectBindingPattern
 * 1. Perform ? RequireObjectCoercible(value).
 * 2. Return ? BindingInitialization of ObjectBindingPattern with
 *    arguments value and environment.
 * 
 * ObjectBindingPattern : { }
 * 1. Return unused.
 * 
 * ObjectBindingPattern :
 * { BindingPropertyList }
 * { BindingPropertyList , }
 * 1. Perform ? PropertyBindingInitialization of BindingPropertyList
 *    with arguments value and environment.
 * 2. Return unused.
 * 
 * ObjectBindingPattern : { BindingRestProperty }
 * 1. Let excludedNames be a new empty List.
 * 2. Return ? RestBindingInitialization of BindingRestProperty with
 *    arguments value, environment, and excludedNames.
 * 
 * ObjectBindingPattern : { BindingPropertyList , BindingRestProperty }
 * 1. Let excludedNames be ? PropertyBindingInitialization of
 *    BindingPropertyList with arguments value and environment.
 * 2. Return ? RestBindingInitialization of BindingRestProperty with
 *    arguments value, environment, and excludedNames.
 *
 * ---
 *
 * 14.3.3.1 Runtime Semantics: PropertyBindingInitialization
 *
 * The syntax-directed operation PropertyBindingInitialization takes
 * arguments value (an ECMAScript language value) and environment (an
 * Environment Record or undefined) and returns either a normal
 * completion containing a List of property keys or an abrupt
 * completion. It collects a list of all bound property names. It is
 * defined piecewise over the following productions:
 * 
 * BindingPropertyList : BindingPropertyList , BindingProperty
 * 1. Let boundNames be ? PropertyBindingInitialization of
 *    BindingPropertyList with arguments value and environment.
 * 2. Let nextNames be ? PropertyBindingInitialization of
 *    BindingProperty with arguments value and environment.
 * 3. Return the list-concatenation of boundNames and nextNames.
 * 
 * BindingProperty : SingleNameBinding
 * 1. Let name be the sole element of the BoundNames of SingleNameBinding.
 * 2. Perform ? KeyedBindingInitialization of SingleNameBinding with
 *    arguments value, environment, and name.
 * 3. Return « name ».
 * 
 * BindingProperty : PropertyName : BindingElement
 * 1. Let P be ? Evaluation of PropertyName.
 * 2. Perform ? KeyedBindingInitialization of BindingElement with
 *    arguments value, environment, and P.
 * 3. Return « P ».
 */
export function* BindingInitialization_ObjectPattern(
  $: VM,
  n: ESTree.ObjectPattern,
  value: Val,
  environment: EnvironmentRecord|undefined,
): ECR<UNUSED> {
  const coercible = RequireObjectCoercible($, value);
  if (IsAbrupt(coercible)) return coercible;
  // excluded names is for rest pattern
  const excludedNames = new Set<PropertyKey>();
  for (const prop of n.properties) {
    if (prop.type === 'Property') {
      // handle key
      let P: PropertyKey;
      if (prop.computed) {
        const kr = yield* $.evaluateValue(prop.key);
        if (IsAbrupt(kr)) return kr;
        const krp = yield* ToPropertyKey($, kr);
        if (IsAbrupt(krp)) return krp;
        P = krp;
      } else if (prop.key.type === 'Literal') {
        P = String(prop.key.value);
      } else if (prop.key.type === 'Identifier') {
        P = prop.key.name;
      } else {
        throw new Error(`bad key type for non-computed property: ${prop.key.type}`);
      }
      excludedNames.add(P);
      // handle value, which could be an identifier, assignment pattern, object pattern, etc
      const status = yield* KeyedBindingInitialization($, prop.value, value, environment, P);
      if (IsAbrupt(status)) return status;
    } else {
      Assert(prop.type === 'RestElement');
      const status = yield* RestBindingInitialization($, prop, value, environment, excludedNames);
      if (IsAbrupt(status)) return status;
    }
  }
  return UNUSED;
}

/**
 * 14.3.3.2 Runtime Semantics: RestBindingInitialization
 *
 * The syntax-directed operation RestBindingInitialization takes
 * arguments value (an ECMAScript language value), environment (an
 * Environment Record or undefined), and excludedNames (a List of
 * property keys) and returns either a normal completion containing
 * unused or an abrupt completion. It is defined piecewise over the
 * following productions:
 * 
 * BindingRestProperty : ... BindingIdentifier
 * 1. Let lhs be ? ResolveBinding(StringValue of BindingIdentifier, environment).
 * 2. Let restObj be OrdinaryObjectCreate(%Object.prototype%).
 * 3. Perform ? CopyDataProperties(restObj, value, excludedNames).
 * 4. If environment is undefined, return ? PutValue(lhs, restObj).
 * 5. Return ? InitializeReferencedBinding(lhs, restObj).
 */
function* RestBindingInitialization(
  $: VM,
  rest: ESTree.RestElement,
  value: Val,
  environment: EnvironmentRecord|undefined,
  excludedNames: Set<PropertyKey>,
): ECR<UNUSED> {
  if (rest.argument.type !== 'Identifier') {
    return $.throw('SyntaxError', '`...` must be followed by an identifier');
  }
  const lhs = ResolveBinding($, rest.argument.name);
  if (IsAbrupt(lhs)) return lhs;
  const restObj = OrdinaryObjectCreate({Prototype: $.getIntrinsic('%Object.prototype%')});
  const copyStatus = yield* CopyDataProperties($, restObj, value, excludedNames);
  if (IsAbrupt(copyStatus)) return copyStatus;
  if (environment === undefined) {
    return yield* PutValue($, lhs, restObj);
  } else {
    return yield* InitializeReferencedBinding($, lhs, restObj);
  }
}

/**
 * 14.3.3.3 Runtime Semantics: KeyedBindingInitialization
 * 
 * The syntax-directed operation KeyedBindingInitialization takes
 * arguments value (an ECMAScript language value), environment (an
 * Environment Record or undefined), and propertyName (a property key)
 * and returns either a normal completion containing unused or an
 * abrupt completion.
 * 
 * NOTE: When undefined is passed for environment it indicates that a
 * PutValue operation should be used to assign the initialization
 * value. This is the case for formal parameter lists of non-strict
 * functions. In that case the formal parameter bindings are
 * preinitialized in order to deal with the possibility of multiple
 * parameters with the same name.
 * 
 * It is defined piecewise over the following productions:
 * 
 * BindingElement : BindingPattern Initializeropt
 * 1. Let v be ? GetV(value, propertyName).
 * 2. If Initializer is present and v is undefined, then
 *     a. Let defaultValue be ? Evaluation of Initializer.
 *     b. Set v to ? GetValue(defaultValue).
 * 3. Return ? BindingInitialization of BindingPattern with arguments v and environment.
 * 
 * SingleNameBinding : BindingIdentifier Initializeropt
 * 1. Let bindingId be StringValue of BindingIdentifier.
 * 2. Let lhs be ? ResolveBinding(bindingId, environment).
 * 3. Let v be ? GetV(value, propertyName).
 * 4. If Initializer is present and v is undefined, then
 *     a. If IsAnonymousFunctionDefinition(Initializer) is true, then
 *         i. Set v to ? NamedEvaluation of Initializer with argument bindingId.
 *     b. Else,
 *         i. Let defaultValue be ? Evaluation of Initializer.
 *         ii. Set v to ? GetValue(defaultValue).
 * 5. If environment is undefined, return ? PutValue(lhs, v).
 * 6. Return ? InitializeReferencedBinding(lhs, v).
 */
function* KeyedBindingInitialization(
  $: VM,
  pattern: ESTree.Pattern,
  value: Val,
  environment: EnvironmentRecord|undefined,
  propertyName: PropertyKey,
): ECR<UNUSED> {
  let init: ESTree.Expression|undefined;
  if (pattern.type === 'AssignmentPattern') {
    init = pattern.right;
    pattern = pattern.left;
  }
  Assert(pattern.type !== 'AssignmentPattern');
  Assert(pattern.type !== 'RestElement'); // already handled
  if (pattern.type === 'Identifier') {
    // SingleNameBinding : BindingIdentifier Initializer(opt)
    const bindingId = pattern.name;
    const lhs = ResolveBinding($, bindingId);
    if (IsAbrupt(lhs)) return lhs;
    let v = yield* GetV($, value, propertyName);
    if (IsAbrupt(v)) return v;
    if (init && v === undefined) {
      if (IsAnonymousFunctionDefinition(init)) {
        v = yield* $.NamedEvaluation(init, bindingId);
      } else {
        v = yield* $.evaluateValue(init);
      }
    }
    if (IsAbrupt(v)) return v;
    if (!environment) {
      return yield* PutValue($, lhs, v);
    } else {
      return yield* InitializeReferencedBinding($, lhs, v);
    }
  } else {
    let v = yield* GetV($, value, propertyName);
    if (init && v === undefined) {
      v = yield* $.evaluateValue(init);
    }
    if (IsAbrupt(v)) return v;
    return yield* $.BindingInitialization(pattern, v, environment);
  }
}

/**
 * 8.6.2 Runtime Semantics: BindingInitialization
 * 
 * BindingPattern : ArrayBindingPattern
 * 1. Let iteratorRecord be ? GetIterator(value, sync).
 * 2. Let result be Completion(IteratorBindingInitialization of
 *    ArrayBindingPattern with arguments iteratorRecord and environment).
 * 3. If iteratorRecord.[[Done]] is false, return ? IteratorClose(iteratorRecord, result).
 * 4. Return ? result.
 */
export function* BindingInitialization_ArrayPattern(
  $: VM,
  pattern: ESTree.ArrayPattern,
  value: Val,
  environment: EnvironmentRecord|undefined,
): ECR<UNUSED> {
  const iteratorRecord = yield* GetIterator($, value, SYNC);
  if (IsAbrupt(iteratorRecord)) return iteratorRecord;
  const result = yield* IteratorBindingInitialization(
    $, pattern.elements, iteratorRecord, environment);
  if (!iteratorRecord.Done) {
    return yield* IteratorClose($, iteratorRecord, result);
  }
  return result;
}

/**
 * 8.6.2.1 InitializeBoundName ( name, value, environment )
 * 
 * The abstract operation InitializeBoundName takes arguments name (a
 * String), value (an ECMAScript language value), and environment (an
 * Environment Record or undefined) and returns either a normal
 * completion containing unused or an abrupt completion. It performs
 * the following steps when called:
 * 
 * 1. If environment is not undefined, then
 *     a. Perform ! environment.InitializeBinding(name, value).
 *     b. Return unused.
 * 2. Else,
 *     a. Let lhs be ? ResolveBinding(name).
 *     b. Return ? PutValue(lhs, value).
 */
export function* InitializeBoundName(
  $: VM,
  name: string,
  value: Val,
  environment: EnvironmentRecord|undefined,
): ECR<UNUSED> {
  if (environment !== undefined) {
    return CastNotAbrupt(yield* environment.InitializeBinding($, name, value));
  }
  const lhs = ResolveBinding($, name);
  if (IsAbrupt(lhs)) return lhs;
  return yield* PutValue($, lhs, value);
}

/**
 * 8.6.3 Runtime Semantics: IteratorBindingInitialization
 * 
 * The syntax-directed operation IteratorBindingInitialization takes
 * arguments iteratorRecord (an Iterator Record) and environment (an
 * Environment Record or undefined) and returns either a normal
 * completion containing unused or an abrupt completion.
 * 
 * NOTE: When undefined is passed for environment it indicates that a
 * PutValue operation should be used to assign the initialization
 * value. This is the case for formal parameter lists of non-strict
 * functions. In that case the formal parameter bindings are
 * preinitialized in order to deal with the possibility of multiple
 * parameters with the same name.
 * 
 * It is defined piecewise over the following productions:
 * 
 * ArrayBindingPattern : [ ]
 * 1. Return unused.
 * 
 * ArrayBindingPattern : [ Elision ]
 * 1. Return ? IteratorDestructuringAssignmentEvaluation of Elision
 *    with argument iteratorRecord.
 * 
 * SingleNameBinding : BindingIdentifier Initializeropt
 * 1. Let bindingId be StringValue of BindingIdentifier.
 * 2. Let lhs be ? ResolveBinding(bindingId, environment).
 * 3. Let v be undefined.
 * 4. If iteratorRecord.[[Done]] is false, then
 *     a. Let next be Completion(IteratorStep(iteratorRecord)).
 *     b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *     c. ReturnIfAbrupt(next).
 *     d. If next is false, set iteratorRecord.[[Done]] to true.
 *     e. Else,
 *         i. Set v to Completion(IteratorValue(next)).
 *         ii. If v is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *         iii. ReturnIfAbrupt(v).
 * 5. If Initializer is present and v is undefined, then
 *     a. If IsAnonymousFunctionDefinition(Initializer) is true, then
 *         i. Set v to ? NamedEvaluation of Initializer with argument bindingId.
 *     b. Else,
 *         i. Let defaultValue be ? Evaluation of Initializer.
 *         ii. Set v to ? GetValue(defaultValue).
 * 6. If environment is undefined, return ? PutValue(lhs, v).
 * 7. Return ? InitializeReferencedBinding(lhs, v).
 * 
 * BindingElement : BindingPattern Initializeropt
 * 1. Let v be undefined.
 * 2. If iteratorRecord.[[Done]] is false, then
 *     a. Let next be Completion(IteratorStep(iteratorRecord)).
 *     b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *     c. ReturnIfAbrupt(next).
 *     d. If next is false, set iteratorRecord.[[Done]] to true.
 *     e. Else,
 *         i. Set v to Completion(IteratorValue(next)).
 *         ii. If v is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *         iii. ReturnIfAbrupt(v).
 * 3. If Initializer is present and v is undefined, then
 *     a. Let defaultValue be ? Evaluation of Initializer.
 *     b. Set v to ? GetValue(defaultValue).
 * 4. Return ? BindingInitialization of BindingPattern with arguments v and environment.
 * 
 * BindingRestElement : ... BindingIdentifier
 * 1. Let lhs be ? ResolveBinding(StringValue of BindingIdentifier, environment).
 * 2. Let A be ! ArrayCreate(0).
 * 3. Let n be 0.
 * 4. Repeat,
 *     a. If iteratorRecord.[[Done]] is false, then
 *         i. Let next be Completion(IteratorStep(iteratorRecord)).
 *         ii. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *         iii. ReturnIfAbrupt(next).
 *         iv. If next is false, set iteratorRecord.[[Done]] to true.
 *     b. If iteratorRecord.[[Done]] is true, then
 *         i. If environment is undefined, return ? PutValue(lhs, A).
 *         ii. Return ? InitializeReferencedBinding(lhs, A).
 *     c. Let nextValue be Completion(IteratorValue(next)).
 *     d. If nextValue is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *     e. ReturnIfAbrupt(nextValue).
 *     f. Perform ! CreateDataPropertyOrThrow(A, ! ToString(𝔽(n)), nextValue).
 *     g. Set n to n + 1.
 * 
 * BindingRestElement : ... BindingPattern
 * 1. Let A be ! ArrayCreate(0).
 * 2. Let n be 0.
 * 3. Repeat,
 *     a. If iteratorRecord.[[Done]] is false, then
 *         i. Let next be Completion(IteratorStep(iteratorRecord)).
 *         ii. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *         iii. ReturnIfAbrupt(next).
 *         iv. If next is false, set iteratorRecord.[[Done]] to true.
 *     b. If iteratorRecord.[[Done]] is true, then
 *         i. Return ? BindingInitialization of BindingPattern with
 *            arguments A and environment.
 *     c. Let nextValue be Completion(IteratorValue(next)).
 *     d. If nextValue is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *     e. ReturnIfAbrupt(nextValue).
 *     f. Perform ! CreateDataPropertyOrThrow(A, ! ToString(𝔽(n)), nextValue).
 *     g. Set n to n + 1.
 */
export function* IteratorBindingInitialization(
  $: VM,
  elements: ESTree.ArrayPattern['elements'],
  iteratorRecord: IteratorRecord,
  environment: EnvironmentRecord|undefined,
): ECR<UNUSED> {
  for (let element of elements) {
    // TODO - unify this with IteratorDestructuringAssignmentEvaluation
    if (!element) {
      const next = yield* IteratorStep($, iteratorRecord);
      if (IsAbrupt(next)) return (iteratorRecord.Done = true, next);
      if (!next) iteratorRecord.Done = true;
      continue;
    } else if (element.type === 'RestElement') {
      // rest element
      const lhs: ESTree.Pattern|CR<ReferenceRecord> =
        element.argument.type === 'Identifier' ?
        ResolveBinding($, element.argument.name) :
        element.argument;
      if (IsAbrupt(lhs)) return lhs;
      const A: Val[] = [];
      while (!iteratorRecord.Done) {
        const next = yield* IteratorStep($, iteratorRecord);
        if (IsAbrupt(next)) return (iteratorRecord.Done = true, next);
        if (!next) {
          iteratorRecord.Done = true;
        } else {
          const nextValue = yield* IteratorValue($, next);
          if (IsAbrupt(nextValue)) return (iteratorRecord.Done = true, nextValue);
          A.push(nextValue);
        }
      }
      const status = yield* (lhs instanceof ReferenceRecord ?
        InitializeReferencedBinding($, lhs, CreateArrayFromList($, A)) :
        $.BindingInitialization(lhs, CreateArrayFromList($, A), environment));
      if (IsAbrupt(status)) return status;
      continue;
    }
    // ordinary element (may be a pattern, initializer, etc)
    let init: ESTree.Expression|undefined;
    if (element.type === 'AssignmentPattern') {
      init = element.right;
      element = element.left;
    }
    const lhs: ESTree.Pattern|CR<ReferenceRecord> =
      element.type === 'Identifier' ? ResolveBinding($, element.name) : element;
    if (IsAbrupt(lhs)) return lhs;
    let v: CR<Val> = undefined;
    if (!iteratorRecord.Done) {
      const next = yield* IteratorStep($, iteratorRecord);
      if (IsAbrupt(next)) return (iteratorRecord.Done = true, next);
      if (!next) {
        iteratorRecord.Done = true;
      } else {
        v = yield* IteratorValue($, next);
        if (IsAbrupt(v)) return (iteratorRecord.Done = true, v);
      }
    }
    if (init && v === undefined) {
      if (IsAnonymousFunctionDefinition(init) && element.type === 'Identifier') {
        v = yield* $.NamedEvaluation(init, element.name);
      } else {
        v = yield* $.evaluateValue(init);
      }
    }
    if (IsAbrupt(v)) return v;
    let op;
    if (lhs instanceof ReferenceRecord) {
      if (!environment) {
        op = PutValue($, lhs, v);
      } else {
        op = InitializeReferencedBinding($, lhs, v);
      }
    } else {
      op = $.BindingInitialization(lhs, v, environment);
    }
    const status = yield* op;
    if (IsAbrupt(status)) return status;
  }
  return UNUSED;
}

/**
 * 13.15.5.2 Runtime Semantics: DestructuringAssignmentEvaluation
 * 
 * The syntax-directed operation DestructuringAssignmentEvaluation
 * takes argument value (an ECMAScript language value) and returns
 * either a normal completion containing unused or an abrupt
 * completion. It is defined piecewise over the following productions:
 * 
 * ObjectAssignmentPattern : { }
 * 1. Perform ? RequireObjectCoercible(value).
 * 2. Return unused.
 * 
 * ObjectAssignmentPattern :
 * { AssignmentPropertyList }
 * { AssignmentPropertyList , }
 * 1. Perform ? RequireObjectCoercible(value).
 * 2. Perform ? PropertyDestructuringAssignmentEvaluation of
 *    AssignmentPropertyList with argument value.
 * 3. Return unused.
 * 
 * ObjectAssignmentPattern : { AssignmentRestProperty }
 * 1. Perform ? RequireObjectCoercible(value).
 * 2. Let excludedNames be a new empty List.
 * 3. Return ? RestDestructuringAssignmentEvaluation of
 *    AssignmentRestProperty with arguments value and excludedNames.
 * 
 * ObjectAssignmentPattern : { AssignmentPropertyList , AssignmentRestProperty }
 * 1. Perform ? RequireObjectCoercible(value).
 * 2. Let excludedNames be ? PropertyDestructuringAssignmentEvaluation
 *    of AssignmentPropertyList with argument value.
 * 3. Return ? RestDestructuringAssignmentEvaluation of
 *    AssignmentRestProperty with arguments value and excludedNames.
 * 
 * ArrayAssignmentPattern : [ ]
 * 1. Let iteratorRecord be ? GetIterator(value, sync).
 * 2. Return ? IteratorClose(iteratorRecord, NormalCompletion(unused)).
 * 
 * ArrayAssignmentPattern : [ Elision ]
 * 1. Let iteratorRecord be ? GetIterator(value, sync).
 * 2. Let result be
 *    Completion(IteratorDestructuringAssignmentEvaluation of Elision
 *    with argument iteratorRecord).
 * 3. If iteratorRecord.[[Done]] is false, return ? IteratorClose(iteratorRecord, result).
 * 4. Return result.
 * 
 * ArrayAssignmentPattern : [ Elisionopt AssignmentRestElement ]
 * 1. Let iteratorRecord be ? GetIterator(value, sync).
 * 2. If Elision is present, then
 *     a. Let status be Completion(IteratorDestructuringAssignmentEvaluation of Elision
 *        with argument iteratorRecord).
 *     b. If status is an abrupt completion, then
 *         i. Assert: iteratorRecord.[[Done]] is true.
 *         ii. Return ? status.
 * 3. Let result be
 *    Completion(IteratorDestructuringAssignmentEvaluation of
 *    AssignmentRestElement with argument iteratorRecord).
 * 4. If iteratorRecord.[[Done]] is false, return ? IteratorClose(iteratorRecord, result).
 * 5. Return result.
 * 
 * ArrayAssignmentPattern : [ AssignmentElementList ]
 * 1. Let iteratorRecord be ? GetIterator(value, sync).
 * 2. Let result be
 *    Completion(IteratorDestructuringAssignmentEvaluation of
 *    AssignmentElementList with argument iteratorRecord).
 * 3. If iteratorRecord.[[Done]] is false, return ? IteratorClose(iteratorRecord, result).
 * 4. Return result.
 * 
 * ArrayAssignmentPattern : [ AssignmentElementList , Elisionopt AssignmentRestElementopt ]
 * 1. Let iteratorRecord be ? GetIterator(value, sync).
 * 2. Let status be
 *    Completion(IteratorDestructuringAssignmentEvaluation of
 *    AssignmentElementList with argument iteratorRecord).
 * 3. If status is an abrupt completion, then
 *     a. If iteratorRecord.[[Done]] is false, return ? IteratorClose(iteratorRecord, status).
 *     b. Return ? status.
 * 4. If Elision is present, then
 *     a. Set status to
 *        Completion(IteratorDestructuringAssignmentEvaluation of Elision
 *        with argument iteratorRecord).
 *     b. If status is an abrupt completion, then
 *         i. Assert: iteratorRecord.[[Done]] is true.
 *         ii. Return ? status.
 * 5. If AssignmentRestElement is present, then
 *     a. Set status to
 *        Completion(IteratorDestructuringAssignmentEvaluation of
 *        AssignmentRestElement with argument iteratorRecord).
 * 6. If iteratorRecord.[[Done]] is false, return ? IteratorClose(iteratorRecord, status).
 * 7. Return ? status.
 */
export function* DestructuringAssignmentEvaluation(
  $: VM,
  pattern: ESTree.Pattern,
  value: Val,
): ECR<UNUSED> {
  return yield* $.BindingInitialization(pattern, value, undefined);
}

/**
 * 13.15.5.3 Runtime Semantics: PropertyDestructuringAssignmentEvaluation
 * 
 * The syntax-directed operation
 * PropertyDestructuringAssignmentEvaluation takes argument value (an
 * ECMAScript language value) and returns either a normal completion
 * containing a List of property keys or an abrupt completion. It
 * collects a list of all destructured property keys. It is defined
 * piecewise over the following productions:
 * 
 * AssignmentPropertyList : AssignmentPropertyList , AssignmentProperty
 * 1. Let propertyNames be ? PropertyDestructuringAssignmentEvaluation
 *    of AssignmentPropertyList with argument value.
 * 2. Let nextNames be ? PropertyDestructuringAssignmentEvaluation of
 *    AssignmentProperty with argument value.
 * 3. Return the list-concatenation of propertyNames and nextNames.
 * 
 * AssignmentProperty : IdentifierReference Initializeropt
 * 1. Let P be StringValue of IdentifierReference.
 * 2. Let lref be ? ResolveBinding(P).
 * 3. Let v be ? GetV(value, P).
 * 4. If Initializeropt is present and v is undefined, then
 *     a. If IsAnonymousFunctionDefinition(Initializer) is true, then
 *         i. Set v to ? NamedEvaluation of Initializer with argument P.
 *     b. Else,
 *         i. Let defaultValue be ? Evaluation of Initializer.
 *         ii. Set v to ? GetValue(defaultValue).
 * 5. Perform ? PutValue(lref, v).
 * 6. Return « P ».
 * 
 * AssignmentProperty : PropertyName : AssignmentElement
 * 1. Let name be ? Evaluation of PropertyName.
 * 2. Perform ? KeyedDestructuringAssignmentEvaluation of
 *    AssignmentElement with arguments value and name.
 * 3. Return « name ».
 */


/**
 * 13.15.5.4 Runtime Semantics: RestDestructuringAssignmentEvaluation
 * 
 * The syntax-directed operation RestDestructuringAssignmentEvaluation
 * takes arguments value (an ECMAScript language value) and
 * excludedNames (a List of property keys) and returns either a normal
 * completion containing unused or an abrupt completion. It is defined
 * piecewise over the following productions:
 * 
 * AssignmentRestProperty : ... DestructuringAssignmentTarget
 * 1. Let lref be ? Evaluation of DestructuringAssignmentTarget.
 * 2. Let restObj be OrdinaryObjectCreate(%Object.prototype%).
 * 3. Perform ? CopyDataProperties(restObj, value, excludedNames).
 * 4. Return ? PutValue(lref, restObj).
 */


/**
 * 13.15.5.5 Runtime Semantics: IteratorDestructuringAssignmentEvaluation
 * 
 * The syntax-directed operation
 * IteratorDestructuringAssignmentEvaluation takes argument
 * iteratorRecord (an Iterator Record) and returns either a normal
 * completion containing unused or an abrupt completion. It is defined
 * piecewise over the following productions:
 * 
 * Elision : ,
 * 1. If iteratorRecord.[[Done]] is false, then
 *     a. Let next be Completion(IteratorStep(iteratorRecord)).
 *     b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *     c. ReturnIfAbrupt(next).
 *     d. If next is false, set iteratorRecord.[[Done]] to true.
 * 2. Return unused.
 *
 * AssignmentElement : DestructuringAssignmentTarget Initializeropt
 * 1. If DestructuringAssignmentTarget is neither an ObjectLiteral nor
 *    an ArrayLiteral, then
 *     a. Let lref be ? Evaluation of DestructuringAssignmentTarget.
 * 2. If iteratorRecord.[[Done]] is false, then
 *     a. Let next be Completion(IteratorStep(iteratorRecord)).
 *     b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *     c. ReturnIfAbrupt(next).
 *     d. If next is false, set iteratorRecord.[[Done]] to true.
 *     e. Else,
 *         i. Let value be Completion(IteratorValue(next)).
 *         ii. If value is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *         iii. ReturnIfAbrupt(value).
 * 3. If iteratorRecord.[[Done]] is true, let value be undefined.
 * 4. If Initializer is present and value is undefined, then
 *     a. If IsAnonymousFunctionDefinition(Initializer) is true and
 *        IsIdentifierRef of DestructuringAssignmentTarget is true, then
 *         i. Let v be ? NamedEvaluation of Initializer with argument lref.[[ReferencedName]].
 *     b. Else,
 *         i. Let defaultValue be ? Evaluation of Initializer.
 *         ii. Let v be ? GetValue(defaultValue).
 * 5. Else, let v be value.
 * 6. If DestructuringAssignmentTarget is either an ObjectLiteral or an ArrayLiteral, then
 *     a. Let nestedAssignmentPattern be the AssignmentPattern that is
 *        covered by DestructuringAssignmentTarget.
 *     b. Return ? DestructuringAssignmentEvaluation of
 *        nestedAssignmentPattern with argument v.
 * 7. Return ? PutValue(lref, v).
 *
 * NOTE: Left to right evaluation order is maintained by evaluating a
 * DestructuringAssignmentTarget that is not a destructuring pattern
 * prior to accessing the iterator or evaluating the Initializer.
 *
 * AssignmentRestElement : ... DestructuringAssignmentTarget
 * 1. If DestructuringAssignmentTarget is neither an ObjectLiteral nor an ArrayLiteral, then
 *     a. Let lref be ? Evaluation of DestructuringAssignmentTarget.
 * 2. Let A be ! ArrayCreate(0).
 * 3. Let n be 0.
 * 4. Repeat, while iteratorRecord.[[Done]] is false,
 *     a. Let next be Completion(IteratorStep(iteratorRecord)).
 *     b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *     c. ReturnIfAbrupt(next).
 *     d. If next is false, set iteratorRecord.[[Done]] to true.
 *     e. Else,
 *         i. Let nextValue be Completion(IteratorValue(next)).
 *         ii. If nextValue is an abrupt completion, set iteratorRecord.[[Done]] to true.
 *         iii. ReturnIfAbrupt(nextValue).
 *         iv. Perform ! CreateDataPropertyOrThrow(A, ! ToString(𝔽(n)), nextValue).
 *         v. Set n to n + 1.
 * 5. If DestructuringAssignmentTarget is neither an ObjectLiteral nor
 *    an ArrayLiteral, then
 *     a. Return ? PutValue(lref, A).
 * 6. Let nestedAssignmentPattern be the AssignmentPattern that is
 *    covered by DestructuringAssignmentTarget.
 * 7. Return ? DestructuringAssignmentEvaluation of
 *    nestedAssignmentPattern with argument A.
 */
// function* IteratorDestructuringAssignmentEvaluation(
//   $: VM,
//   pattern: ESTree.Pattern|null,
//   iteratorRecord: IteratorRecord,
// ): ECR<UNUSED> {
//   if (!pattern) {
//     // elision
//     if (!iteratorRecord.Done) {
//       const next = yield* IteratorStep($, iteratorRecord);
//       if (IsAbrupt(next)) return (iteratorRecord.Done = true, next);
//       if (!next) iteratorRecord.Done = true;
//     }
//     return UNUSED;
//   } else if (pattern.type === 'RestElement') {
//     // rest element
//     let lref: CR<ReferenceRecord|undefined>;
//     const isSubpattern =
//       pattern.argument.type === 'ObjectPattern' || pattern.argument.type === 'ArrayPattern';
//     if (!isSubpattern) {
//       const result = yield* $.Evaluation(pattern.argument);
//       if (IsAbrupt(result)) return result;
//       Assert(result instanceof ReferenceRecord);
//       lref = result;
//     }
//     const A = CastNotAbrupt(ArrayCreate($, 0));
//     let n = 0;
//     while (!iteratorRecord.Done) {
//       const next = yield* IteratorStep($, iteratorRecord);
//       if (IsAbrupt(next)) return (iteratorRecord.Done = true, next);
//       if (!next) {
//         iteratorRecord.Done = true;
//       } else {
//         const nextValue = yield* IteratorValue($, next);
//         if (IsAbrupt(nextValue)) return (iteratorRecord.Done = true, nextValue);
//         CastNotAbrupt(CreateDataPropertyOrThrow($, A, String(n), nextValue));
//         n++;
//       }
//     }
//     if (!isSubpattern) {
//       Assert(lref instanceof ReferenceRecord);
//       return yield* PutValue($, lref, A);
//     }
//     return yield* DestructuringAssignmentEvaluation(pattern.argument, A, undefined);
//   }
//   // ordinary element (may be a pattern, initializer, etc)
//   let init: ESTree.Expression|undefined;
//   Assert(pattern);
//   if (pattern.type === 'AssignmentPattern') {
//     init = pattern.right;
//     pattern = pattern.left;
//   }
//   const isSubpattern =
//     pattern.type === 'ObjectPattern' || pattern.type === 'ArrayPattern';
//   let lref: ReferenceRecord|undefined;
//   if (!isSubpattern) {
//     const result = yield* $.Evaluation(pattern);
//     if (IsAbrupt(result)) return result;
//     Assert(result instanceof ReferenceRecord);
//     lref = result;
//   }
//   let v: CR<Val>;
//   if (!iteratorRecord.Done) {
//     const next = yield* IteratorStep($, iteratorRecord);
//     if (IsAbrupt(next)) return (iteratorRecord.Done = true, next);
//     if (!next) {
//       iteratorRecord.Done = true;
//     } else {
//       v = yield* IteratorValue($, next);
//       if (IsAbrupt(v)) return (iteratorRecord.Done = true, v);
//     }
//   }
//   if (iteratorRecord.Done) v = undefined;
//   if (init && v === undefined) {
//     if (IsAnonymousFunctionDefinition(init) && pattern.type === 'Identifier') {
//       v = yield* $.NamedEvaluation(init, lref!.ReferencedName as string);
//     } else {
//       v = yield* $.evaluateValue(init);
//     }
//   }
//   if (IsAbrupt(v)) return v;
//   if (isSubpattern) {
//     return yield* DestructuringAssignmentEvaluation(pattern, v, undefined);
//   }
//   return yield* PutValue($, lref!, v);
// }


/**
 * 13.15.5.6 Runtime Semantics: KeyedDestructuringAssignmentEvaluation
 * 
 * The syntax-directed operation
 * KeyedDestructuringAssignmentEvaluation takes arguments value (an
 * ECMAScript language value) and propertyName (a property key) and
 * returns either a normal completion containing unused or an abrupt
 * completion. It is defined piecewise over the following productions:
 * 
 * AssignmentElement : DestructuringAssignmentTarget Initializeropt
 * 1. If DestructuringAssignmentTarget is neither an ObjectLiteral nor
 *    an ArrayLiteral, then
 *     a. Let lref be ? Evaluation of DestructuringAssignmentTarget.
 * 2. Let v be ? GetV(value, propertyName).
 * 3. If Initializer is present and v is undefined, then
 *     a. If IsAnonymousFunctionDefinition(Initializer) and IsIdentifierRef
 *        of DestructuringAssignmentTarget are both true, then
 *         i. Let rhsValue be ? NamedEvaluation of Initializer with
 *            argument lref.[[ReferencedName]].
 *     b. Else,
 *         i. Let defaultValue be ? Evaluation of Initializer.
 *         ii. Let rhsValue be ? GetValue(defaultValue).
 * 4. Else, let rhsValue be v.
 * 5. If DestructuringAssignmentTarget is either an ObjectLiteral or
 *    an ArrayLiteral, then
 *     a. Let assignmentPattern be the AssignmentPattern that is
 *        covered by DestructuringAssignmentTarget.
 *     b. Return ? DestructuringAssignmentEvaluation of
 *        assignmentPattern with argument rhsValue.
 * 6. Return ? PutValue(lref, rhsValue).
 */
// function KeyedDestructuringAssignmentEvaluation(
//   $: VM,
//   pattern: ESTree.Pattern,
//   value: Val,
//   propertyName: PropertyKey,
// ): ECR<UNUSED> {
//   let init: ESTree.Expression|undefined;
//   if (pattern.type === 'AssignmentPattern') {
//     init = pattern.right;
//     pattern = pattern.left;
//   }
//   const isSubpattern =
//     pattern.type === 'ObjectPattern' || pattern.type === 'ArrayPattern';
//   let lref: ReferenceRecord|undefined;
//   if (!isSubpattern) {
//     lref = yield* $.Evaluation(pattern);
//     if (IsAbrupt(lref)) return lref;
//   }
//   let v = yield* GetV($, value, propertyName);
//   if (IsAbrupt(v)) return v;
//   let rhsValue: CR<Val>;
//   if (init && v === undefined) {
//     if (IsAnonymousFunctionDefinition(init) && pattern.type === 'Identifier') {
//       rhsValue = yield* $.NamedEvaluation(init, lref!.ReferencedName as string);
//     } else {
//       rhsValue = yield* $.evaluateValue(init);
//     }
//   } else {
//     rhsValue = v;
//   }
//   if (IsAbrupt(rhsValue)) return rhsValue;
//   if (isSubpattern) {
//     return yield* DestructuringAssignmentEvaluation(pattern, rhsValue, undefined);
//   }
//   return yield* PutValue($, lref!, rhsValue);
// }
