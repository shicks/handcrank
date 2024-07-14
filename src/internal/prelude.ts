import { IsArray, IsCallable, IsExtensible, RequireObjectCoercible, SameValue } from './abstract_compare';
import { ToIntegerOrInfinity, ToObject, ToPropertyKey, ToString } from './abstract_conversion';
import { AddEntriesFromIterable } from './abstract_iterator';
import { Call, CreateArrayFromList, CreateListFromArrayLike, DefinePropertyOrThrow, EnumerableOwnProperties, Get, HasOwnProperty, Invoke, OrdinaryHasInstance, Set, SetIntegrityLevel, TestIntegrityLevel } from './abstract_object';
import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { FROZEN, NON_LEXICAL_THIS, SEALED, STRING, SYMBOL } from './enums';
import { BoundFunctionCreate } from './exotic_bind';
import { CreateBuiltinFunction, IsFunc, MakeConstructor, OrdinaryFunctionCreate, SetFunctionLength, SetFunctionName, callOrConstruct, method, methodS } from './func';
import { HostEnsureCanCompileStrings } from './fundamental';
import { GetPrototypeFromConstructor, Obj, OrdinaryCreateFromConstructor, OrdinaryObjectCreate } from './obj';
import { FromPropertyDescriptor, PropertyDescriptor, ToPropertyDescriptor, prop0, propW, propWC, propWEC } from './property_descriptor';
import { RealmRecord, defineProperties } from './realm_record';
import { PropertyKey, Val } from './val';
import { DebugString, ECR, Plugin, VM } from './vm';

// TODO:
function PrepareForTailCall(...args: unknown[]) {}

export const objectAndFunctionPrototype: Plugin = {
  id: 'objectAndFunctionPrototype',
  realm: {CreateIntrinsics: CreatePrototypeIntrinsics},
};

export const objectConstructor: Plugin = {
  id: 'objectConstructor',
  deps: () => [objectAndFunctionPrototype],
  realm: {CreateIntrinsics: CreateObjectIntrinsics},
};

export const functionConstructor: Plugin = {
  id: 'functionConstructor',
  deps: () => [objectAndFunctionPrototype],
  realm: {CreateIntrinsics: CreateFunctionIntrinsics},
};

export const prelude: Plugin = {
  id: 'prelude',
  // NOTE: really the only thing any prelude deps require is the prototypes...
  //  - we should consider pulling that out as a more appropriate dep.
  //  - is it reasonable to have separate object and function modules, and to
  //    make all the methods optional?
  //  - worth separating objectPrototype from functionPrototype?
  deps: () => [objectAndFunctionPrototype, objectConstructor, functionConstructor],
};

export function CreatePrototypeIntrinsics(realm: RealmRecord) {
  // First add the two intrinsics.  %Function.prototype% depends on %Object.prototype%,
  // but all the methods on them depend on being able to access %Function.prototype%
  // to create the builtin functions.
  const objectPrototype = OrdinaryObjectCreate();
  realm.Intrinsics.set('%Object.prototype%', objectPrototype);

  const functionPrototype = CreateBuiltinFunction(
    {*Call() { return undefined; }}, 0, '', {Realm: realm, Prototype: objectPrototype});
  realm.Intrinsics.set('%Function.prototype%', functionPrototype);

  const objectPrototypeToString =
    CreateBuiltinFunction({Call: ObjectPrototypeToString}, 0, 'toString', {Realm: realm});
  realm.Intrinsics.set('%Object.prototype.toString%', objectPrototypeToString);


  // Now populate the methods.
  // TODO - implement these correctly
  defineProperties(realm, objectPrototype, {
    /** 20.1.3.2 Object.prototype.hasOwnProperty ( V ) */
    'hasOwnProperty': method(ObjectPrototypeHasOwnProperty),

    /** 20.1.3.3 Object.prototype.isPrototypeOf ( V ) */
    'isPrototypeOf': method(ObjectPrototypeIsPrototypeOf),

    /** 20.1.3.4 Object.prototype.propertyIsEnumerable ( V ) */
    'propertyIsEnumerable': method(ObjectPrototypePropertyIsEnumerable),

    /** 20.1.3.5 Object.prototype.toLocaleString ( [ reserved1 [ , reserved2 ] ] ) */
    'toLocaleString': method(ObjectPrototypeToLocaleString),

    /** 20.1.3.6 Object.prototype.toString ( ) */
    'toString': propWC(objectPrototypeToString),

    /** 20.1.3.7 Object.prototype.valueOf ( ) */
    'valueOf': method(ObjectPrototypeValueOf),
  });

  defineProperties(realm, functionPrototype, {
    /** 20.2.3.1 Function.prototype.apply ( thisArg, argArray ) */
    'apply': method(FunctionPrototypeApply),

    /** 20.2.3.2 Function.prototype.bind ( thisArg, ...args ) */
    'bind': method(FunctionPrototypeBind),

    /** 20.2.3.3 Function.prototype.call ( thisArg, ...args ) */
    'call': method(FunctionPrototypeCall),

    /** 20.2.3.5 Function.prototype.toString ( ) */
    'toString': method(FunctionPrototypeToString),

    /**
     * 20.2.3.6 Function.prototype [ @@hasInstance ] ( V )
     *
     * This method performs the following steps when called:
     * 
     * 1. Let F be the this value.
     * 2. Return ? OrdinaryHasInstance(F, V).
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: false }.
     * 
     * NOTE: This is the default implementation of @@hasInstance
     * that most functions inherit. @@hasInstance is called by the
     * instanceof operator to determine whether a value is an
     * instance of a specific constructor. An expression such as
     * 
     *     v instanceof F
     * 
     * evaluates as
     * 
     *     F[@@hasInstance](v)
     * 
     * A constructor function can control which objects are
     * recognized as its instances by instanceof by exposing a
     * different @@hasInstance method on the function.
     * 
     * This property is non-writable and non-configurable to
     * prevent tampering that could be used to globally expose
     * the target function of a bound function.
     *
     * The value of the "name" property of this method is
     * "[Symbol.hasInstance]".
     */
    [Symbol.hasInstance]: method(OrdinaryHasInstance, {desc: prop0}),
  });
}

/**
 * 20.1 Object Objects
 *
 * 20.1.1 The Object Constructor
 *
 * The Object constructor:
 *   - is %Object%.
 *   - is the initial value of the "Object" property of the global object.
 *   - creates a new ordinary object when called as a constructor.
 *   - performs a type conversion when called as a function rather than as a constructor.
 *   - may be used as the value of an extends clause of a class definition.
 *
 * 20.1.1.1 Object ( [ value ] )
 *
 * This function performs the following steps when called:
 * 
 * 1. If NewTarget is neither undefined nor the active function object, then
 *     a. Return ? OrdinaryCreateFromConstructor(NewTarget, "%Object.prototype%").
 * 2. If value is either undefined or null, return
 *    OrdinaryObjectCreate(%Object.prototype%).
 * 3. Return ! ToObject(value).
 * 
 * The "length" property of this function is 1𝔽.
 * 
 * 20.1.2 Properties of the Object Constructor
 * 
 * The Object constructor:
 *   - has a [[Prototype]] internal slot whose value is %Function.prototype%.
 *   - has a "length" property.
 *   - has the following additional properties:
 */
export function CreateObjectIntrinsics(
  realm: RealmRecord,
  stagedGlobals: Map<string, PropertyDescriptor>,
) {
  const objectPrototype = realm.Intrinsics.get('%Object.prototype%')!;
  const functionPrototype = realm.Intrinsics.get('%Function.prototype%')!;
  const objectCtor = CreateBuiltinFunction(
    callOrConstruct(function*($, NewTarget, value) {
      if (NewTarget !== undefined && NewTarget !== $.getActiveFunctionObject()) {
        return yield* OrdinaryCreateFromConstructor($, NewTarget, '%Object.prototype%');
      }
      if (value == null) return OrdinaryObjectCreate(objectPrototype);
      return ToObject($, value);
    }),
    1, 'Object', {Realm: realm, Prototype: functionPrototype});
  objectCtor.OwnProps.set('prototype', propWC(objectPrototype));
  objectPrototype.OwnProps.set('constructor', propWC(objectCtor));

  realm.Intrinsics.set('%Object%', objectCtor);
  stagedGlobals.set('Object', propWC(objectCtor));

  defineProperties(realm, objectCtor, {
    /**
     * 20.1.2.1 Object.assign ( target, ...sources ) 
     * The "length" property of this function is 2𝔽.
     */
    'assign': methodS(ObjectCtorAssign, {length: 2}),

    /** 20.1.2.2 Object.create ( O, Properties ) */
    'create': methodS(ObjectCtorCreate),

    /** 20.1.2.3 Object.defineProperties ( O, Properties ) */
    'defineProperties': methodS(ObjectCtorDefineProperties),

    /** 20.1.2.4 Object.defineProperty ( O, P, Attributes ) */
    'defineProperty': methodS(ObjectCtorDefineProperty),

    /** 20.1.2.5 Object.entries ( O ) */
    'entries': methodS(ObjectCtorEntries),

    /** 20.1.2.6 Object.freeze ( O ) */
    'freeze': methodS(ObjectCtorFreeze),

    /** 20.1.2.7 Object.fromEntries ( iterable ) */
    'fromEntries': methodS(ObjectCtorFromEntries),

    /** 20.1.2.8 Object.getOwnPropertyDescriptor ( O, P ) */
    'getOwnPropertyDescriptor': methodS(ObjectCtorGetOwnPropertyDescriptor),

    /** 20.1.2.9 Object.getOwnPropertyDescriptors ( O ) */
    'getOwnPropertyDescriptors': methodS(ObjectCtorGetOwnPropertyDescriptors),

    /** 20.1.2.10 Object.getOwnPropertyNames ( O ) */
    'getOwnPropertyNames': methodS(ObjectCtorGetOwnPropertyNames),

    /** 20.1.2.11 Object.getOwnPropertySymbols ( O ) */
    'getOwnPropertySymbols': methodS(ObjectCtorGetOwnPropertySymbols),

    /** 20.1.2.12 Object.getPrototypeOf ( O ) */
    'getPrototypeOf': methodS(ObjectCtorGetPrototypeOf),

    /** 20.1.2.13 Object.hasOwn ( O, P ) */
    'hasOwn': methodS(ObjectCtorHasOwn),

    /** 20.1.2.14 Object.is ( value1, value2 ) */
    'is': methodS(ObjectCtorIs),

    /** 20.1.2.15 Object.isExtensible ( O ) */
    'isExtensible': methodS(ObjectCtorIsExtensible),

    /** 20.1.2.16 Object.isFrozen ( O ) */
    'isFrozen': methodS(ObjectCtorIsFrozen),

    /** 20.1.2.17 Object.isSealed ( O ) */
    'isSealed': methodS(ObjectCtorIsSealed),

    /** 20.1.2.18 Object.keys ( O ) */
    'keys': methodS(ObjectCtorKeys),

    /** 20.1.2.19 Object.preventExtensions ( O ) */
    'preventExtensions': methodS(ObjectCtorPreventExtensions),

    // 20.1.2.20 Object.prototype

    /** 20.1.2.21 Object.seal ( O ) */
    'seal': methodS(ObjectCtorSeal),

    /** 20.1.2.22 Object.setPrototypeOf ( O, proto ) */
    'setPrototypeOf': methodS(ObjectCtorSetPrototypeOf),

    /** 20.1.2.23 Object.values ( O ) */
    'values': methodS(ObjectCtorValues),
  });
}

/**
 * 20.2.2 Properties of the Function Constructor
 *
 * The Function constructor:
 *   - is itself a built-in function object.
 *   - has a [[Prototype]] internal slot whose value is %Function.prototype%.
 *   - has the following properties:
 *
 * 20.2.2.1 Function.length
 *
 * This is a data property with a value of 1. This property has the
 * attributes { [[Writable]]: false, [[Enumerable]]: false,
 * [[Configurable]]: true }.
 *
 * 20.2.2.2 Function.prototype
 * 
 * The value of Function.prototype is the Function prototype object.
 * 
 * This property has the attributes { [[Writable]]: false,
 * [[Enumerable]]: false, [[Configurable]]: false }.
 */
export function CreateFunctionIntrinsics(
  realm: RealmRecord,
  stagedGlobals: Map<string, PropertyDescriptor>,
) {
  const functionPrototype = realm.Intrinsics.get('%Function.prototype%')!;
  const functionCtor = CreateBuiltinFunction(
    callOrConstruct(FunctionConstructor),
    1, 'Function', {Realm: realm, Prototype: functionPrototype});
  functionCtor.OwnProps.set('prototype', propWC(functionPrototype));
  functionPrototype.OwnProps.set('constructor', propWC(functionCtor));
  
  realm.Intrinsics.set('%Function%', functionCtor);
  stagedGlobals.set('Function', propWC(functionCtor));
}

/**
 * 20.1.2.1 Object.assign ( target, ...sources )
 * 
 * This function copies the values of all of the enumerable
 * own properties from one or more source objects to a target
 * object.
 * 
 * It performs the following steps when called:
 * 
 * 1. Let to be ? ToObject(target).
 * 2. If only one argument was passed, return to.
 * 3. For each element nextSource of sources, do
 *     a. If nextSource is neither undefined nor null, then
 *         i. Let from be ! ToObject(nextSource).
 *         ii. Let keys be ? from.[[OwnPropertyKeys]]().
 *         iii. For each element nextKey of keys, do
 *             1. Let desc be ? from.[[GetOwnProperty]](nextKey).
 *             2. If desc is not undefined and desc.[[Enumerable]] is true, then
 *                 a. Let propValue be ? Get(from, nextKey).
 *                 b. Perform ? Set(to, nextKey, propValue, true).
 * 4. Return to.
 * 
 * The "length" property of this function is 2𝔽.
 */
export function* ObjectCtorAssign($: VM, target: Val, ...sources: Val[]): ECR<Val> {
  const to = ToObject($, target);
  if (IsAbrupt(to)) return to;
  for (const nextSource of sources) {
    if (nextSource == null) continue;
    const from = CastNotAbrupt(ToObject($, nextSource));
    const keys = from.OwnPropertyKeys($);
    if (IsAbrupt(keys)) return keys;
    for (const nextKey of keys) {
      const desc = from.GetOwnProperty($, nextKey);
      if (IsAbrupt(desc)) return desc;
      if (desc == null || !desc.Enumerable) continue;
      const propValue = yield* Get($, from, nextKey);
      if (IsAbrupt(propValue)) return propValue;
      const setStatus = yield* Set($, to, nextKey, propValue, true);
      if (IsAbrupt(setStatus)) return setStatus;
    }
  }
  return to;
}

/**
 * 20.1.2.2 Object.create ( O, Properties )
 * 
 * This function creates a new object with a specified prototype.
 * 
 * It performs the following steps when called:
 * 
 * 1. If O is not an Object and O is not null, throw a
 *    TypeError exception.
 * 2. Let obj be OrdinaryObjectCreate(O).
 * 3. If Properties is not undefined, then
 *     a. Return ? ObjectDefineProperties(obj, Properties).
 * 4. Return obj.
 */
export function* ObjectCtorCreate($: VM, O: Val, Properties: Val): ECR<Val> {
  if (O !== null && !(O instanceof Obj)) {
    return $.throw(
      'TypeError',
      `Object prototype may only be an object or null: ${DebugString(O)}`);
  }
  const obj = OrdinaryObjectCreate({Prototype: O});
  if (Properties != null) {
    return yield* ObjectDefineProperties($, obj, Properties);
  }
  return obj;
}

/**
 * 20.1.2.3 Object.defineProperties ( O, Properties )
 * 
 * This function adds own properties and/or updates the
 * attributes of existing own properties of an object.
 * 
 * It performs the following steps when called:
 * 
 * 1. If O is not an Object, throw a TypeError exception.
 * 2. Return ? ObjectDefineProperties(O, Properties).
 */
export function* ObjectCtorDefineProperties($: VM, O: Val, Properties: Val): ECR<Val> {
  if (!(O instanceof Obj)) {
    return $.throw('TypeError', 'Object.defineProperties called on non-object');
  }
  return yield* ObjectDefineProperties($, O, Properties);
}

/**
 * 20.1.2.3.1 ObjectDefineProperties ( O, Properties )
 * 
 * The abstract operation ObjectDefineProperties takes
 * arguments O (an Object) and Properties (an ECMAScript
 * language value) and returns either a normal completion
 * containing an Object or a throw completion. It performs the
 * following steps when called:
 * 
 * 1. Let props be ? ToObject(Properties).
 * 2. Let keys be ? props.[[OwnPropertyKeys]]().
 * 3. Let descriptors be a new empty List.
 * 4. For each element nextKey of keys, do
 *     a. Let propDesc be ? props.[[GetOwnProperty]](nextKey).
 *     b. If propDesc is not undefined and
 *        propDesc.[[Enumerable]] is true, then
 *         i. Let descObj be ? Get(props, nextKey).
 *         ii. Let desc be ? ToPropertyDescriptor(descObj).
 *         iii. Append the pair (a two element List)
 *              consisting of nextKey and desc to the end of
 *              descriptors.
 * 5. For each element pair of descriptors, do
 *     a. Let P be the first element of pair.
 *     b. Let desc be the second element of pair.
 *     c. Perform ? DefinePropertyOrThrow(O, P, desc).
 * 6. Return O.
 */
function* ObjectDefineProperties($: VM, O: Obj, Properties: Val): ECR<Obj> {
  const props = ToObject($, Properties);
  if (IsAbrupt(props)) return props;
  const keys = props.OwnPropertyKeys($);
  if (IsAbrupt(keys)) return keys;
  const descriptors: [PropertyKey, PropertyDescriptor][] = [];
  for (const nextKey of keys) {
    const propDesc = props.GetOwnProperty($, nextKey);
    if (IsAbrupt(propDesc)) return propDesc;
    if (propDesc == null || !propDesc.Enumerable) continue;
    const descObj = yield* Get($, props, nextKey);
    if (IsAbrupt(descObj)) return descObj;
    const desc = yield* ToPropertyDescriptor($, descObj);
    if (IsAbrupt(desc)) return desc;
    descriptors.push([nextKey, desc]);
  }
  for (const [P, desc] of descriptors) {
    const defineStatus = DefinePropertyOrThrow($, O, P, desc);
    if (IsAbrupt(defineStatus)) return defineStatus;
  }
  return O;
}

/**
 * 20.1.2.4 Object.defineProperty ( O, P, Attributes )
 * 
 * This function adds an own property and/or updates the
 * attributes of an existing own property of an object.
 * 
 * It performs the following steps when called:
 * 
 * 1. If O is not an Object, throw a TypeError exception.
 * 2. Let key be ? ToPropertyKey(P).
 * 3. Let desc be ? ToPropertyDescriptor(Attributes).
 * 4. Perform ? DefinePropertyOrThrow(O, key, desc).
 * 5. Return O.
 */
export function* ObjectCtorDefineProperty($: VM, O: Val, P: Val, Attributes: Val): ECR<Val> {
  if (!(O instanceof Obj)) {
    return $.throw('TypeError', 'Object.defineProperty called on non-object');
  }
  const key = yield* ToPropertyKey($, P);
  if (IsAbrupt(key)) return key;
  const desc = yield* ToPropertyDescriptor($, Attributes);
  if (IsAbrupt(desc)) return desc;
  const defineStatus = DefinePropertyOrThrow($, O, key, desc);
  if (IsAbrupt(defineStatus)) return defineStatus;
  return O;
}

/**
 * 20.1.2.5 Object.entries ( O )
 * 
 * This function performs the following steps when called:
 * 
 * 1. Let obj be ? ToObject(O).
 * 2. Let entryList be ? EnumerableOwnProperties(obj, key+value).
 * 3. Return CreateArrayFromList(entryList).
 */
export function* ObjectCtorEntries($: VM, O: Val): ECR<Val> {
  const obj = ToObject($, O);
  if (IsAbrupt(obj)) return obj;
  const entryList = yield* EnumerableOwnProperties($, obj, 'key+value');
  if (IsAbrupt(entryList)) return entryList;
  return CreateArrayFromList($, entryList);
}

/**
 * 20.1.2.6 Object.freeze ( O )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If O is not an Object, return O.
 * 2. Let status be ? SetIntegrityLevel(O, frozen).
 * 3. If status is false, throw a TypeError exception.
 * 4. Return O.
 */
export function* ObjectCtorFreeze($: VM, O: Val): ECR<Val> {
  if (!(O instanceof Obj)) return O;
  const status = SetIntegrityLevel($, O, FROZEN);
  if (IsAbrupt(status)) return status;
  if (status === false) return $.throw('TypeError', 'Object.freeze failed');
  return O;
}

/**
 * 20.1.2.7 Object.fromEntries ( iterable )
 * 
 * This function performs the following steps when called:
 * 
 * 1. Perform ? RequireObjectCoercible(iterable).
 * 2. Let obj be OrdinaryObjectCreate(%Object.prototype%).
 * 3. Assert: obj is an extensible ordinary object with no own properties.
 * 4. Let closure be a new Abstract Closure with parameters
 *    (key, value) that captures obj and performs the following
 *    steps when called:
 *     a. Let propertyKey be ? ToPropertyKey(key).
 *     b. Perform ! CreateDataPropertyOrThrow(obj, propertyKey, value).
 *     c. Return undefined.
 * 5. Let adder be CreateBuiltinFunction(closure, 2, "", « »).
 * 6. Return ? AddEntriesFromIterable(obj, iterable, adder).
 * 
 * NOTE: The function created for adder is never directly
 * accessible to ECMAScript code.
 */
export function* ObjectCtorFromEntries($: VM, iterable: Val): ECR<Val> {
  const coercibleStatus = RequireObjectCoercible($, iterable);
  if (IsAbrupt(coercibleStatus)) return coercibleStatus;

  const obj = OrdinaryObjectCreate({Prototype: $.getIntrinsic('%Object.prototype%')});
  const status = yield* AddEntriesFromIterable(
    $, iterable,
    function*(key: Val, value: Val): ECR<undefined> {
      const propertyKey = yield* ToPropertyKey($, key);
      if (IsAbrupt(propertyKey)) return propertyKey;
      obj.OwnProps.set(propertyKey, propWEC(value));
      return undefined;
    });
  if (IsAbrupt(status)) return status;
  return obj;
}

/**
 * 20.1.2.8 Object.getOwnPropertyDescriptor ( O, P )
 * 
 * This function performs the following steps when called:
 * 
 * 1. Let obj be ? ToObject(O).
 * 2. Let key be ? ToPropertyKey(P).
 * 3. Let desc be ? obj.[[GetOwnProperty]](key).
 * 4. Return FromPropertyDescriptor(desc).
 */
export function* ObjectCtorGetOwnPropertyDescriptor($: VM, O: Val, P: Val): ECR<Val> {
  const obj = ToObject($, O);
  if (IsAbrupt(obj)) return obj;
  const key = yield* ToPropertyKey($, P);
  if (IsAbrupt(key)) return key;
  const desc = obj.GetOwnProperty($, key);
  if (IsAbrupt(desc)) return desc;
  return FromPropertyDescriptor($, desc);
}

/**
 * 20.1.2.9 Object.getOwnPropertyDescriptors ( O )
 * 
 * This function performs the following steps when called:
 * 
 * 1. Let obj be ? ToObject(O).
 * 2. Let ownKeys be ? obj.[[OwnPropertyKeys]]().
 * 3. Let descriptors be OrdinaryObjectCreate(%Object.prototype%).
 * 4. For each element key of ownKeys, do
 *     a. Let desc be ? obj.[[GetOwnProperty]](key).
 *     b. Let descriptor be FromPropertyDescriptor(desc).
 *     c. If descriptor is not undefined, perform
 *        ! CreateDataPropertyOrThrow(descriptors, key,
 *        descriptor).
 * 5. Return descriptors.
 */
export function* ObjectCtorGetOwnPropertyDescriptors($: VM, O: Val): ECR<Val> {
  const obj = ToObject($, O);
  if (IsAbrupt(obj)) return obj;
  const ownKeys = obj.OwnPropertyKeys($);
  if (IsAbrupt(ownKeys)) return ownKeys;
  const descriptors = OrdinaryObjectCreate({Prototype: $.getIntrinsic('%Object.prototype%')});
  for (const key of ownKeys) {
    const desc = obj.GetOwnProperty($, key);
    if (IsAbrupt(desc)) return desc;
    const descriptor = FromPropertyDescriptor($, desc);
    if (descriptor != null) {
      descriptors.OwnProps.set(key, propWEC(descriptor));
    }
  }
  return descriptors;
}

/**
 * 20.1.2.10 Object.getOwnPropertyNames ( O )
 * 
 * This function performs the following steps when called:
 * 
 * 1. Return CreateArrayFromList(? GetOwnPropertyKeys(O, string)).
 */
export function* ObjectCtorGetOwnPropertyNames($: VM, O: Val): ECR<Val> {
  const keys = GetOwnPropertyKeys($, O, STRING);
  if (IsAbrupt(keys)) return keys;
  return CreateArrayFromList($, keys);
}

/**
 * 20.1.2.11 Object.getOwnPropertySymbols ( O )
 * 
 * This function performs the following steps when called:
 * 
 * 1. Return CreateArrayFromList(? GetOwnPropertyKeys(O, symbol)).
 */
export function* ObjectCtorGetOwnPropertySymbols($: VM, O: Val): ECR<Val> {
  const keys = GetOwnPropertyKeys($, O, SYMBOL);
  if (IsAbrupt(keys)) return keys;
  return CreateArrayFromList($, keys);
}

/**
 * 20.1.2.11.1 GetOwnPropertyKeys ( O, type )
 * 
 * The abstract operation GetOwnPropertyKeys takes arguments O
 * (an ECMAScript language value) and type (string or symbol)
 * and returns either a normal completion containing a List of
 * property keys or a throw completion. It performs the
 * following steps when called:
 * 
 * 1. Let obj be ? ToObject(O).
 * 2. Let keys be ? obj.[[OwnPropertyKeys]]().
 * 3. Let nameList be a new empty List.
 * 4. For each element nextKey of keys, do
 *     a. If nextKey is a Symbol and type is symbol, or if
 *        nextKey is a String and type is string, then
 *         i. Append nextKey to nameList.
 * 5. Return nameList.
 */
function GetOwnPropertyKeys($: VM, O: Val, type: STRING|SYMBOL): CR<PropertyKey[]> {
  const obj = ToObject($, O);
  if (IsAbrupt(obj)) return obj;
  const keys = obj.OwnPropertyKeys($);
  if (IsAbrupt(keys)) return keys;
  const nameList: PropertyKey[] = [];
  for (const nextKey of keys) {
    if (typeof nextKey === (STRING.is(type) ? 'string' : 'symbol')) {
      nameList.push(nextKey);
    }
  }
  return nameList;
}

/**
 * 20.1.2.12 Object.getPrototypeOf ( O )
 * 
 * This function performs the following steps when called:
 * 
 * 1. Let obj be ? ToObject(O).
 * 2. Return ? obj.[[GetPrototypeOf]]().
 */
export function* ObjectCtorGetPrototypeOf($: VM, O: Val): ECR<Val> {
  const obj = ToObject($, O);
  if (IsAbrupt(obj)) return obj;
  return obj.GetPrototypeOf($);
}

/**
 * 20.1.2.13 Object.hasOwn ( O, P )
 * 
 * This function performs the following steps when called:
 * 
 * 1. Let obj be ? ToObject(O).
 * 2. Let key be ? ToPropertyKey(P).
 * 3. Return ? HasOwnProperty(obj, key).
 */
export function* ObjectCtorHasOwn($: VM, O: Val, P: Val): ECR<Val> {
  const obj = ToObject($, O);
  if (IsAbrupt(obj)) return obj;
  const key = yield* ToPropertyKey($, P);
  if (IsAbrupt(key)) return key;
  return HasOwnProperty($, obj, key);
}

/**
 * 20.1.2.14 Object.is ( value1, value2 )
 * 
 * This function performs the following steps when called:
 * 
 * 1. Return SameValue(value1, value2).
 */
export function* ObjectCtorIs(_: VM, value1: Val, value2: Val): ECR<Val> {
  return SameValue(value1, value2);
}

/**
 * 20.1.2.15 Object.isExtensible ( O )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If O is not an Object, return false.
 * 2. Return ? IsExtensible(O).
 */
export function* ObjectCtorIsExtensible($: VM, O: Val): ECR<Val> {
  if (!(O instanceof Obj)) return false;
  return IsExtensible($, O);
}

/**
 * 20.1.2.16 Object.isFrozen ( O )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If O is not an Object, return true.
 * 2. Return ? TestIntegrityLevel(O, frozen).
 */
export function* ObjectCtorIsFrozen($: VM, O: Val): ECR<Val> {
  if (!(O instanceof Obj)) return true;
  return TestIntegrityLevel($, O, FROZEN);
}

/**
 * 20.1.2.17 Object.isSealed ( O )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If O is not an Object, return true.
 * 2. Return ? TestIntegrityLevel(O, sealed).
 */
export function* ObjectCtorIsSealed($: VM, O: Val): ECR<Val> {
  if (!(O instanceof Obj)) return true;
  return TestIntegrityLevel($, O, SEALED);
}

/**
 * 20.1.2.18 Object.keys ( O )
 * 
 * This function performs the following steps when called:
 * 
 * 1. Let obj be ? ToObject(O).
 * 2. Let keyList be ? EnumerableOwnProperties(obj, key).
 * 3. Return CreateArrayFromList(keyList).
 */
export function* ObjectCtorKeys($: VM, O: Val): ECR<Val> {
  const obj = ToObject($, O);
  if (IsAbrupt(obj)) return obj;
  const keyList = yield* EnumerableOwnProperties($, obj, 'key');
  if (IsAbrupt(keyList)) return keyList;
  return CreateArrayFromList($, keyList);
}

/**
 * 20.1.2.19 Object.preventExtensions ( O )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If O is not an Object, return O.
 * 2. Let status be ? O.[[PreventExtensions]]().
 * 3. If status is false, throw a TypeError exception.
 * 4. Return O.
 */
export function* ObjectCtorPreventExtensions($: VM, O: Val): ECR<Val> {
  if (!(O instanceof Obj)) return O;
  const status = O.PreventExtensions($);
  if (status === false) return $.throw('TypeError', 'Object.preventExtensions failed');
  return O;
}

/**
 * 20.1.2.21 Object.seal ( O )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If O is not an Object, return O.
 * 2. Let status be ? SetIntegrityLevel(O, sealed).
 * 3. If status is false, throw a TypeError exception.
 * 4. Return O.
 */
export function* ObjectCtorSeal($: VM, O: Val): ECR<Val> {
  if (!(O instanceof Obj)) return O;
  const status = SetIntegrityLevel($, O, SEALED);
  if (IsAbrupt(status)) return status;
  if (status === false) return $.throw('TypeError', 'Object.seal failed');
  return O;
}

/**
 * 20.1.2.22 Object.setPrototypeOf ( O, proto )
 * 
 * This function performs the following steps when called:
 * 
 * 1. Set O to ? RequireObjectCoercible(O).
 * 2. If proto is not an Object and proto is not null, throw a
 *    TypeError exception.
 * 3. If O is not an Object, return O.
 * 4. Let status be ? O.[[SetPrototypeOf]](proto).
 * 5. If status is false, throw a TypeError exception.
 * 6. Return O.
 */
export function* ObjectCtorSetPrototypeOf($: VM, O: Val, proto: Val): ECR<Val> {
  const coercibleStatus = RequireObjectCoercible($, O);
  if (IsAbrupt(coercibleStatus)) return coercibleStatus;
  if (proto !== null && !(proto instanceof Obj)) {
    return $.throw(
      'TypeError',
      `Object prototype may only be an object or null: ${DebugString(proto)}`);
  }
  if (!(O instanceof Obj)) return O;
  const status = O.SetPrototypeOf($, proto);
  if (IsAbrupt(status)) return status;
  if (status === false) return $.throw('TypeError', 'Object.setPrototypeOf failed');
  return O;
}

/**
 * 20.1.2.23 Object.values ( O )
 * 
 * This function performs the following steps when called:
 * 
 * 1. Let obj be ? ToObject(O).
 * 2. Let valueList be ? EnumerableOwnProperties(obj, value).
 * 3. Return CreateArrayFromList(valueList).
 */
export function* ObjectCtorValues($: VM, O: Val): ECR<Val> {
  const obj = ToObject($, O);
  if (IsAbrupt(obj)) return obj;
  const valueList = yield* EnumerableOwnProperties($, obj, 'value');
  if (IsAbrupt(valueList)) return valueList;
  return CreateArrayFromList($, valueList);
}

/**
 * 20.1.3.2 Object.prototype.hasOwnProperty ( V )
 *
 * This method performs the following steps when called:
 *
 * 1. Let P be ? ToPropertyKey(V).
 * 2. Let O be ? ToObject(this value).
 * 3. Return ? HasOwnProperty(O, P).
 *
 * NOTE: The ordering of steps 1 and 2 is chosen to ensure
 * that any exception that would have been thrown by step 1 in
 * previous editions of this specification will continue to be
 * thrown even if the this value is undefined or null.
 */
export function* ObjectPrototypeHasOwnProperty($: VM, thisValue: Val, V: Val): ECR<Val> {
  const P = yield* ToPropertyKey($, V);
  if (IsAbrupt(P)) return P;
  const O = ToObject($, thisValue);
  if (IsAbrupt(O)) return O;
  return HasOwnProperty($, O, P);
}

/**
 * 20.1.3.3 Object.prototype.isPrototypeOf ( V )
 *
 * This method performs the following steps when called:
 *
 * 1. If V is not an Object, return false.
 * 2. Let O be ? ToObject(this value).
 * 3. Repeat,
 *     a. Set V to ? V.[[GetPrototypeOf]]().
 *     b. If V is null, return false.
 *     c. If SameValue(O, V) is true, return true.
 *
 * NOTE: The ordering of steps 1 and 2 preserves the behaviour
 * specified by previous editions of this specification for
 * the case where V is not an object and the this value is
 * undefined or null.
 */
export function* ObjectPrototypeIsPrototypeOf($: VM, thisValue: Val, V: Val): ECR<Val> {
  if (!(V instanceof Obj)) return false;
  const O = ToObject($, thisValue);
  if (IsAbrupt(O)) return O;
  while (true) {
    V = V.Prototype;
    if (V == null) return false;
    if (SameValue(O, V)) return true;
  }
}

/**
 * 20.1.3.4 Object.prototype.propertyIsEnumerable ( V )
 *
 * This method performs the following steps when called:
 *
 * 1. Let P be ? ToPropertyKey(V).
 * 2. Let O be ? ToObject(this value).
 * 3. Let desc be ? O.[[GetOwnProperty]](P).
 * 4. If desc is undefined, return false.
 * 5. Return the value of desc.[[Enumerable]].
 *
 * NOTE 1: This method does not consider objects in the
 * prototype chain.
 *
 * NOTE 2: The ordering of steps 1 and 2 is chosen to ensure
 * that any exception that would have been thrown by step 1 in
 * previous editions of this specification will continue to be
 * thrown even if the this value is undefined or null.
 */
export function* ObjectPrototypePropertyIsEnumerable($: VM, thisValue: Val, V: Val): ECR<Val> {
  const P = yield* ToPropertyKey($, V);
  if (IsAbrupt(P)) return P;
  const O = ToObject($, thisValue);
  if (IsAbrupt(O)) return O;
  const desc = O.GetOwnProperty($, P);
  if (IsAbrupt(desc)) return desc;
  if (desc == null) return false;
  // TODO - I've added `|| false` just in case incomplete
  // descriptors end up in the map.
  return desc.Enumerable || false;
}

/**
 * 20.1.3.5 Object.prototype.toLocaleString ( [ reserved1 [ , reserved2 ] ] )
 *
 * This method performs the following steps when called:
 * 
 * 1. Let O be the this value.
 * 2. Return ? Invoke(O, "toString").
 * 
 * The optional parameters to this method are not used but are
 * intended to correspond to the parameter pattern used by
 * ECMA-402 toLocaleString methods. Implementations that do
 * not include ECMA-402 support must not use those parameter
 * positions for other purposes.
 * 
 * NOTE 1: This method provides a generic toLocaleString
 * implementation for objects that have no locale-sensitive
 * toString behaviour. Array, Number, Date, and %TypedArray%
 * provide their own locale-sensitive toLocaleString methods.
 * 
 * NOTE 2: ECMA-402 intentionally does not provide an
 * alternative to this default implementation.
 */
export function* ObjectPrototypeToLocaleString($: VM, thisValue: Val): ECR<Val> {
  return yield* Invoke($, thisValue, 'toString');
}

/**
 * 20.1.3.6 Object.prototype.toString ( )
 * 
 * This method performs the following steps when called:
 * 
 * 1. If the this value is undefined, return "[object Undefined]".
 * 2. If the this value is null, return "[object Null]".
 * 3. Let O be ! ToObject(this value).
 * 4. Let isArray be ? IsArray(O).
 * 5. If isArray is true, let builtinTag be "Array".
 * 6. Else if O has a [[ParameterMap]] internal slot, let
 *    builtinTag be "Arguments".
 * 7. Else if O has a [[Call]] internal method, let builtinTag
 *    be "Function".
 * 8. Else if O has an [[ErrorData]] internal slot, let
 *    builtinTag be "Error".
 * 9. Else if O has a [[BooleanData]] internal slot, let
 *    builtinTag be "Boolean".
 * 10. Else if O has a [[NumberData]] internal slot, let
 *     builtinTag be "Number".
 * 11. Else if O has a [[StringData]] internal slot, let
 *     builtinTag be "String".
 * 12. Else if O has a [[DateValue]] internal slot, let
 *     builtinTag be "Date".
 * 13. Else if O has a [[RegExpMatcher]] internal slot, let
 *     builtinTag be "RegExp".
 * 14. Else, let builtinTag be "Object".
 * 15. Let tag be ? Get(O, @@toStringTag).
 * 16. If tag is not a String, set tag to builtinTag.
 * 17. Return the string-concatenation of "[object ", tag, and "]".
 *
 * NOTE: Historically, this method was occasionally used to
 * access the String value of the [[Class]] internal slot that
 * was used in previous editions of this specification as a
 * nominal type tag for various built-in objects. The above
 * definition of toString preserves compatibility for legacy
 * code that uses toString as a test for those specific kinds
 * of built-in objects. It does not provide a reliable type
 * testing mechanism for other kinds of built-in or program
 * defined objects. In addition, programs can use
 * @@toStringTag in ways that will invalidate the reliability
 * of such legacy type tests.
 */
export function* ObjectPrototypeToString($: VM, thisValue: Val): ECR<Val> {
  if (thisValue === undefined) return '[object Undefined]';
  if (thisValue === null) return '[object Null]';
  const O = CastNotAbrupt(ToObject($, thisValue)) as any;
  const isArray = IsArray($, O);
  if (IsAbrupt(isArray)) return isArray;
  const builtinTag =
    isArray ? 'Array' :
    O.ParameterMap !== undefined ? 'Arguments' :
    O.Call != null ? 'Function' : 
    O.ErrorData != null ? 'Error' :
    O.BooleanData != null ? 'Boolean' :
    O.NumberData != null ? 'Number' :
    O.StringData != null ? 'String' :
    O.DateValue != null ? 'Date' :
    O.RegExpMatcher != null ? 'RegExp' :
    'Object';
  let tag = yield* Get($, O, Symbol.toStringTag);
  if (IsAbrupt(tag)) return tag;
  if (typeof tag !== 'string') tag = builtinTag;
  return `[object ${tag}]`;
}

/**
 * 20.1.3.7 Object.prototype.valueOf ( )
 *
 * This method performs the following steps when called:
 *
 * 1. Return ? ToObject(this value).
 */
export function* ObjectPrototypeValueOf($: VM, thisValue: Val): ECR<Val> {
  return ToObject($, thisValue);
}

/**
 * 20.2.1.1 Function ( ...parameterArgs, bodyArg )
 * 
 * The last argument (if any) specifies the body (executable code) of
 * a function; any preceding arguments specify formal parameters.
 * 
 * This function performs the following steps when called:
 * 
 * 1. Let C be the active function object.
 * 2. If bodyArg is not present, set bodyArg to the empty String.
 * 3. Return ? CreateDynamicFunction(C, NewTarget, normal,
 *    parameterArgs, bodyArg).
 * 
 * NOTE: It is permissible but not necessary to have one argument for
 * each formal parameter to be specified. For example, all three of
 * the following expressions produce the same result:
 * 
 * new Function("a", "b", "c", "return a+b+c")
 * new Function("a, b, c", "return a+b+c")
 * new Function("a,b", "c", "return a+b+c")
 */
export function* FunctionConstructor($: VM, NewTarget: Val, ...args: Val[]): ECR<Obj> {
  Assert(NewTarget === undefined || NewTarget instanceof Obj);
  const C = $.getActiveFunctionObject()!;
  const bodyArg = args.pop() ?? '';
  return yield* CreateDynamicFunction($, C, NewTarget, 'normal', args, bodyArg);
}

/**
 * 20.2.1.1.1 CreateDynamicFunction ( constructor, newTarget, kind, parameterArgs, bodyArg )
 * 
 * The abstract operation CreateDynamicFunction takes arguments
 * constructor (a constructor), newTarget (a constructor), kind
 * (normal, generator, async, or asyncGenerator), parameterArgs (a
 * List of ECMAScript language values), and bodyArg (an ECMAScript
 * language value) and returns either a normal completion containing a
 * function object or a throw completion. constructor is the
 * constructor function that is performing this action. newTarget is
 * the constructor that new was initially applied to. parameterArgs
 * and bodyArg reflect the argument values that were passed to
 * constructor. It performs the following steps when called:
 * 
 * 1. Let currentRealm be the current Realm Record.
 * 2. Perform ? HostEnsureCanCompileStrings(currentRealm).
 * 3. If newTarget is undefined, set newTarget to constructor.
 * 4. If kind is normal, then
 *     a. Let prefix be "function".
 *     b. Let exprSym be the grammar symbol FunctionExpression.
 *     c. Let bodySym be the grammar symbol FunctionBody[~Yield, ~Await].
 *     d. Let parameterSym be the grammar symbol FormalParameters[~Yield, ~Await].
 *     e. Let fallbackProto be "%Function.prototype%".
 * 5. Else if kind is generator, then
 *     a. Let prefix be "function*".
 *     b. Let exprSym be the grammar symbol GeneratorExpression.
 *     c. Let bodySym be the grammar symbol GeneratorBody.
 *     d. Let parameterSym be the grammar symbol FormalParameters[+Yield, ~Await].
 *     e. Let fallbackProto be "%GeneratorFunction.prototype%".
 * 6. Else if kind is async, then
 *     a. Let prefix be "async function".
 *     b. Let exprSym be the grammar symbol AsyncFunctionExpression.
 *     c. Let bodySym be the grammar symbol AsyncFunctionBody.
 *     d. Let parameterSym be the grammar symbol FormalParameters[~Yield, +Await].
 *     e. Let fallbackProto be "%AsyncFunction.prototype%".
 * 7. Else,
 *     a. Assert: kind is asyncGenerator.
 *     b. Let prefix be "async function*".
 *     c. Let exprSym be the grammar symbol AsyncGeneratorExpression.
 *     d. Let bodySym be the grammar symbol AsyncGeneratorBody.
 *     e. Let parameterSym be the grammar symbol FormalParameters[+Yield, +Await].
 *     f. Let fallbackProto be "%AsyncGeneratorFunction.prototype%".
 * 8. Let argCount be the number of elements in parameterArgs.
 * 9. Let P be the empty String.
 * 10. If argCount > 0, then
 *     a. Let firstArg be parameterArgs[0].
 *     b. Set P to ? ToString(firstArg).
 *     c. Let k be 1.
 *     d. Repeat, while k < argCount,
 *         i. Let nextArg be parameterArgs[k].
 *         ii. Let nextArgString be ? ToString(nextArg).
 *         iii. Set P to the string-concatenation of P, "," (a comma), and nextArgString.
 *         iv. Set k to k + 1.
 * 11. Let bodyString be the string-concatenation of 0x000A (LINE
 *     FEED), ? ToString(bodyArg), and 0x000A (LINE FEED).
 * 12. Let sourceString be the string-concatenation of prefix, "
 *     anonymous(", P, 0x000A (LINE FEED), ") {", bodyString, and "}".
 * 13. Let sourceText be StringToCodePoints(sourceString).
 * 14. Let parameters be ParseText(StringToCodePoints(P), parameterSym).
 * 15. If parameters is a List of errors, throw a SyntaxError exception.
 * 16. Let body be ParseText(StringToCodePoints(bodyString), bodySym).
 * 17. If body is a List of errors, throw a SyntaxError exception.
 * 18. NOTE: The parameters and body are parsed separately to ensure
 *     that each is valid alone. For example, new Function("/*", "* / )
 *     {") does not evaluate to a function.
 * 19. NOTE: If this step is reached, sourceText must have the syntax
 *     of exprSym (although the reverse implication does not hold). The
 *     purpose of the next two steps is to enforce any Early Error rules
 *     which apply to exprSym directly.
 * 20. Let expr be ParseText(sourceText, exprSym).
 * 21. If expr is a List of errors, throw a SyntaxError exception.
 * 22. Let proto be ? GetPrototypeFromConstructor(newTarget, fallbackProto).
 * 23. Let realmF be the current Realm Record.
 * 24. Let env be realmF.[[GlobalEnv]].
 * 25. Let privateEnv be null.
 * 26. Let F be OrdinaryFunctionCreate(proto, sourceText, parameters,
 *     body, non-lexical-this, env, privateEnv).
 * 27. Perform SetFunctionName(F, "anonymous").
 * 28. If kind is generator, then
 *     a. Let prototype be OrdinaryObjectCreate(%GeneratorFunction.prototype.prototype%).
 *     b. Perform ! DefinePropertyOrThrow(F, "prototype",
 *        PropertyDescriptor { [[Value]]: prototype, [[Writable]]: true,
 *        [[Enumerable]]: false, [[Configurable]]: false }).
 * 29. Else if kind is asyncGenerator, then
 *     a. Let prototype be OrdinaryObjectCreate(
 *        %AsyncGeneratorFunction.prototype.prototype%).
 *     b. Perform ! DefinePropertyOrThrow(F, "prototype",
 *        PropertyDescriptor { [[Value]]: prototype, [[Writable]]: true,
 *        [[Enumerable]]: false, [[Configurable]]: false }).
 * 30. Else if kind is normal, perform MakeConstructor(F).
 * 31. NOTE: Functions whose kind is async are not constructible and
 *     do not have a [[Construct]] internal method or a "prototype"
 *     property.
 * 32. Return F.
 * 
 * NOTE: CreateDynamicFunction defines a "prototype" property on any
 * function it creates whose kind is not async to provide for the
 * possibility that the function will be used as a constructor.
 */
export function* CreateDynamicFunction(
  $: VM,
  constructor: Obj,
  newTarget: Obj|undefined,
  kind: FunctionKind,
  parameterArgs: Val[],
  bodyArg: Val,
): ECR<Obj> {
  const currentRealm = $.getRealm()!;
  const status = HostEnsureCanCompileStrings($, currentRealm);
  if (IsAbrupt(status)) return status;
  if (newTarget === undefined) newTarget = constructor;
  let prefix: string;
  let fallbackProto: string;
  switch (kind) {
    case 'normal':
      prefix = 'function';
      fallbackProto = '%Function.prototype%';
      break;
    case 'generator':
      prefix = 'function*';
      fallbackProto = '%GeneratorFunction.prototype%';
      break;
    case 'async':
      prefix = 'async function';
      fallbackProto = '%AsyncFunction.prototype%';
      break;
    case 'asyncGenerator':
      prefix = 'async function*';
      fallbackProto = '%AsyncGeneratorFunction.prototype%';
      break;
  }
  let bodyString = yield* ToString($, bodyArg);
  if (IsAbrupt(bodyString)) return bodyString;
  const P: string[] = [];
  for (const arg of parameterArgs) {
    const str = yield* ToString($, arg);
    if (IsAbrupt(str)) return str;
    P.push(str);
  }
  // 11.
  const joinedParams = P.join(',');
  const sourceText = `${prefix} anonymous(${joinedParams
                      }\n) {\n${bodyString}\n}`;
  const parameterText = `${prefix} anonymous(${joinedParams}\n) {}`;
  const bodyText = `${prefix} anonymous() {\n${bodyString}\n}`;
  // 14.
  const parameterTree = $.parseScript(parameterText);
  if (IsAbrupt(parameterTree)) return parameterTree;
  const bodyTree = $.parseScript(bodyText);
  if (IsAbrupt(bodyTree)) return bodyTree;
  // 20.
  const exprTree = $.parseScript(sourceText);
  if (IsAbrupt(exprTree)) return exprTree;
  Assert(exprTree.body[0].type === 'FunctionDeclaration');
  const parameters = exprTree.body[0].params;
  const body = exprTree.body[0].body;
  // 22.
  Assert(IsFunc(newTarget));
  const proto = yield* GetPrototypeFromConstructor($, newTarget, fallbackProto);
  if (IsAbrupt(proto)) return proto;
  const realmF = $.getRealm()!;
  const env = realmF.GlobalEnv!;
  // 26.
  const F = OrdinaryFunctionCreate(
    $, proto, sourceText, parameters, body, NON_LEXICAL_THIS, env, null);
  if (IsAbrupt(F)) return F;
  SetFunctionName(F, 'anonymous');
  // 28.
  if (kind === 'generator') {
    const prototype = OrdinaryObjectCreate({
      Prototype: $.getIntrinsic('%GeneratorFunction.prototype.prototype%'),
    });
    F.OwnProps.set('prototype', propW(prototype));
  } else if (kind === 'asyncGenerator') {
    const prototype = OrdinaryObjectCreate({
      Prototype: $.getIntrinsic('%AsyncGeneratorFunction.prototype.prototype%'),
    });
    F.OwnProps.set('prototype', propW(prototype));
  } else if (kind === 'normal') {
    MakeConstructor($, F);
  }
  return F;
}
type FunctionKind = 'normal'|'generator'|'async'|'asyncGenerator';

/**
 * 20.2.3.1 Function.prototype.apply ( thisArg, argArray )
 *
 * This method performs the following steps when called:
 * 
 * 1. Let func be the this value.
 * 2. If IsCallable(func) is false, throw a TypeError exception.
 * 3. If argArray is either undefined or null, then
 *     a. Perform PrepareForTailCall().
 *     b. Return ? Call(func, thisArg).
 * 4. Let argList be ? CreateListFromArrayLike(argArray).
 * 5. Perform PrepareForTailCall().
 * 6. Return ? Call(func, thisArg, argList).
 * 
 * NOTE 1: The thisArg value is passed without modification as
 * the this value. This is a change from Edition 3, where an
 * undefined or null thisArg is replaced with the global
 * object and ToObject is applied to all other values and that
 * result is passed as the this value. Even though the thisArg
 * is passed without modification, non-strict functions still
 * perform these transformations upon entry to the function.
 * 
 * NOTE 2: If func is either an arrow function or a bound
 * function exotic object, then the thisArg will be ignored by
 * the function [[Call]] in step 6.
 */
export function* FunctionPrototypeApply(
  $: VM,
  thisValue: Val,
  thisArg: Val,
  argArray: Val,
): ECR<Val> {
  const func = thisValue;
  if (!IsCallable(func)) return $.throw('TypeError', 'not a function');
  if (argArray == null) {
    return yield* Call($, func, thisArg);
  }
  const argList = yield* CreateListFromArrayLike($, argArray);
  if (IsAbrupt(argList)) return argList;
  return yield* Call($, func, thisArg, argList);
}

/**
 * 20.2.3.2 Function.prototype.bind ( thisArg, ...args )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let Target be the this value.
 * 2. If IsCallable(Target) is false, throw a TypeError exception.
 * 3. Let F be ? BoundFunctionCreate(Target, thisArg, args).
 * 4. Let L be 0.
 * 5. Let targetHasLength be ? HasOwnProperty(Target, "length").
 * 6. If targetHasLength is true, then
 *     a. Let targetLen be ? Get(Target, "length").
 *     b. If targetLen is a Number, then
 *         i. If targetLen is +∞𝔽, set L to +∞.
 *         ii. Else if targetLen is -∞𝔽, set L to 0.
 *         iii. Else,
 *             1. Let targetLenAsInt be ! ToIntegerOrInfinity(targetLen).
 *             2. Assert: targetLenAsInt is finite.
 *             3. Let argCount be the number of elements in args.
 *             4. Set L to max(targetLenAsInt - argCount, 0).
 * 7. Perform SetFunctionLength(F, L).
 * 8. Let targetName be ? Get(Target, "name").
 * 9. If targetName is not a String, set targetName to the empty String.
 * 10. Perform SetFunctionName(F, targetName, "bound").
 * 11. Return F.
 * 
 * NOTE 1: Function objects created using
 * Function.prototype.bind are exotic objects. They also do
 * not have a "prototype" property.
 * 
 * NOTE 2: If Target is either an arrow function or a bound
 * function exotic object, then the thisArg passed to this
 * method will not be used by subsequent calls to F.
 */
export function* FunctionPrototypeBind(
  $: VM,
  thisValue: Val,
  thisArg: Val,
  ...args: Val[]
): ECR<Val> {
  const Target = thisValue;
  if (!IsCallable(Target)) return $.throw('TypeError', 'not a function');
  const F = BoundFunctionCreate($, Target, thisArg, args);
  if (IsAbrupt(F)) return F;
  let L = 0;
  if (typeof Target.OwnProps?.get('length')?.Value === 'number') {
    L = Target.OwnProps!.get('length')!.Value as number - args.length;
  } else if (HasOwnProperty($, Target, 'length')) {
    const targetLen = yield* Get($, Target, 'length');
    if (typeof targetLen === 'number') {
      if (targetLen === +Infinity) {
        L = +Infinity;
      } else {
        const targetLenAsInt = CastNotAbrupt(yield* ToIntegerOrInfinity($, targetLen));
        L = Math.max(targetLenAsInt - args.length, 0);
      }
    }
  }
  SetFunctionLength(F, L);
  SetFunctionName(F, 'bound');
  return F;
}

/**
 * 20.2.3.3 Function.prototype.call ( thisArg, ...args )
 * 
 * This method performs the following steps when called:
 * 
 * 1. Let func be the this value.
 * 2. If IsCallable(func) is false, throw a TypeError exception.
 * 3. Perform PrepareForTailCall().
 * 4. Return ? Call(func, thisArg, args).
 * 
 * NOTE 1: The thisArg value is passed without modification as
 * the this value. This is a change from Edition 3, where an
 * undefined or null thisArg is replaced with the global
 * object and ToObject is applied to all other values and that
 * result is passed as the this value. Even though the thisArg
 * is passed without modification, non-strict functions still
 * perform these transformations upon entry to the function.
 *
 * NOTE 2: If func is either an arrow function or a bound
 * function exotic object, then the thisArg will be ignored by
 * the function [[Call]] in step 4.
 */
export function* FunctionPrototypeCall(
  $: VM,
  thisValue: Val,
  thisArg: Val,
  ...args: Val[]
): ECR<Val> {
  const func = thisValue;
  if (!IsCallable(func)) return $.throw('TypeError', 'not a function');
  PrepareForTailCall($);
  return yield* Call($, func, thisArg, args);
}

/**
 * 20.2.3.5 Function.prototype.toString ( )
 *          
 * This method performs the following steps when called:
 * 
 * 1. Let func be the this value.
 * 2. If func is an Object, func has a [[SourceText]] internal
 *    slot, func.[[SourceText]] is a sequence of Unicode code
 *    points, and HostHasSourceTextAvailable(func) is true, then
 *     a. Return CodePointsToString(func.[[SourceText]]).
 * 3. If func is a built-in function object, return an
 *    implementation-defined String source code representation of
 *    func. The representation must have the syntax of a
 *    NativeFunction. Additionally, if func has an
 *    [[InitialName]] internal slot and func.[[InitialName]] is a
 *    String, the portion of the returned String that would be
 *    matched by NativeFunctionAccessoropt PropertyName must be
 *    the value of func.[[InitialName]].
 * 4. If func is an Object and IsCallable(func) is true,
 *    return an implementation-defined String source code
 *    representation of func. The representation must have the
 *    syntax of a NativeFunction.
 * 5. Throw a TypeError exception.
 */
export function* FunctionPrototypeToString($: VM, thisValue: Val): ECR<Val> {
  const func = thisValue;
  if (func instanceof Obj) {
    if (typeof func.SourceText === 'string'
        // && HostHasSourceTextAvailable(func)
       ) {
      return func.SourceText;
    }
    if (typeof func.InitialName === 'string') {
      return `function ${func.InitialName}() { [native code] }`;
    }
    if (IsCallable(func)) {
      // TODO - not sure if this is correct?
      return `function() { [unavailable] }`;
    }
  }
  return $.throw('TypeError',
                 `Function.prototype.toString requires that 'this' be a function`);
}
