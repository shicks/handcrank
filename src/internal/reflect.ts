import { IsCallable, IsConstructor } from './abstract_compare';
import { ToPropertyKey } from './abstract_conversion';
import { Call, Construct, CreateArrayFromList, CreateListFromArrayLike } from './abstract_object';
import { IsAbrupt } from './completion_record';
import { method } from './func';
import { Obj, OrdinaryObjectCreate } from './obj';
import { prelude } from './prelude';
import { FromPropertyDescriptor, PropertyDescriptor, ToPropertyDescriptor, propC, propWC } from './property_descriptor';
import { RealmRecord, defineProperties } from './realm_record';
import { Val } from './val';
import { ECR, Plugin, VM } from './vm';

function PrepareForTailCall($: VM) {};

export const reflect: Plugin = {
  id: 'reflect',
  deps: () => [prelude],
  realm: {CreateIntrinsics},
};

/**
 * 28.1 The Reflect Object
 * 
 * The Reflect object:
 *   - is %Reflect%.
 *   - is the initial value of the "Reflect" property of the global object.
 *   - is an ordinary object.
 *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
 *   - is not a function object.
 *   - does not have a [[Construct]] internal method; it cannot be used
 *     as a constructor with the new operator.
 *   - does not have a [[Call]] internal method; it cannot be invoked as a function.
 */
export function CreateIntrinsics(
  realm: RealmRecord,
  stagedGlobals: Map<string, PropertyDescriptor>,
): void {
  const reflect = OrdinaryObjectCreate({
    Prototype: realm.Intrinsics.get('%Object.prototype%')!,
  });
  realm.Intrinsics.set('%Reflect%', reflect);
  stagedGlobals.set('Reflect', propWC(reflect));

  defineProperties(realm, reflect, {
    /** 28.1.1 Reflect.apply ( target, thisArgument, argumentsList ) */
    'apply': method(ReflectApply),
    /** 28.1.2 Reflect.construct ( target, argumentsList [ , newTarget ] ) */
    'construct': method(ReflectConstruct),
    /** 28.1.3 Reflect.defineProperty ( target, propertyKey, attributes ) */
    'defineProperty': method(ReflectDefineProperty),
    /** 28.1.4 Reflect.deleteProperty ( target, propertyKey ) */
    'deleteProperty': method(ReflectDeleteProperty),
    /** 28.1.5 Reflect.get ( target, propertyKey [ , receiver ] ) */
    'get': method(ReflectGet),
    /** 28.1.6 Reflect.getOwnPropertyDescriptor ( target, propertyKey ) */
    'getOwnPropertyDescriptor': method(ReflectGetOwnPropertyDescriptor),
    /** 28.1.7 Reflect.getPrototypeOf ( target ) */
    'getPrototypeOf': method(ReflectGetPrototypeOf),
    /** 28.1.8 Reflect.has ( target, propertyKey ) */
    'has': method(ReflectHas),
    /** 28.1.9 Reflect.isExtensible ( target ) */
    'isExtensible': method(ReflectIsExtensible),
    /** 28.1.10 Reflect.ownKeys ( target ) */
    'ownKeys': method(ReflectOwnKeys),
    /** 28.1.11 Reflect.preventExtensions ( target ) */
    'preventExtensions': method(ReflectPreventExtensions),
    /** 28.1.12 Reflect.set ( target, propertyKey, V [ , receiver ] ) */
    'set': method(ReflectSet),
    /** 28.1.13 Reflect.setPrototypeOf ( target, proto ) */
    'setPrototypeOf': method(ReflectSetPrototypeOf),
    /**
     * 28.1.14 Reflect [ @@toStringTag ]
     * 
     * The initial value of the @@toStringTag property is the String value "Reflect".
     * 
     * This property has the attributes { [[Writable]]: false,
     * [[Enumerable]]: false, [[Configurable]]: true }.
     */
    [Symbol.toStringTag]: propC('Reflect'),
  });
}

/**
 * 28.1.1 Reflect.apply ( target, thisArgument, argumentsList )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If IsCallable(target) is false, throw a TypeError exception.
 * 2. Let args be ? CreateListFromArrayLike(argumentsList).
 * 3. Perform PrepareForTailCall().
 * 4. Return ? Call(target, thisArgument, args).
 */
export function* ReflectApply(
  $: VM,
  _: Val,
  target: Val,
  thisArgument: Val,
  argumentsList: Val,
): ECR<Val> {
  if (!IsCallable(target)) return $.throw('TypeError', 'not a function');
  const args = yield* CreateListFromArrayLike($, argumentsList);
  if (IsAbrupt(args)) return args;
  PrepareForTailCall($);
  return yield* Call($, target, thisArgument, args);
}

/**
 * 28.1.2 Reflect.construct ( target, argumentsList [ , newTarget ] )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If IsConstructor(target) is false, throw a TypeError exception.
 * 2. If newTarget is not present, set newTarget to target.
 * 3. Else if IsConstructor(newTarget) is false, throw a TypeError exception.
 * 4. Let args be ? CreateListFromArrayLike(argumentsList).
 * 5. Return ? Construct(target, args, newTarget).
 */
export function* ReflectConstruct(
  $: VM,
  _: Val,
  target: Val,
  argumentsList: Val,
  newTarget?: Val,
): ECR<Val> {
  if (!IsConstructor(target)) return $.throw('TypeError', 'not a constructor');
  if (newTarget !== undefined && !IsConstructor(newTarget)) {
    return $.throw('TypeError', 'not a constructor');
  }
  const args = yield* CreateListFromArrayLike($, argumentsList);
  if (IsAbrupt(args)) return args;
  return yield* Construct($, target, args, newTarget);
}

/**
 * 28.1.3 Reflect.defineProperty ( target, propertyKey, attributes )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If target is not an Object, throw a TypeError exception.
 * 2. Let key be ? ToPropertyKey(propertyKey).
 * 3. Let desc be ? ToPropertyDescriptor(attributes).
 * 4. Return ? target.[[DefineOwnProperty]](key, desc).
 */
export function* ReflectDefineProperty(
  $: VM,
  _: Val,
  target: Val,
  propertyKey: Val,
  attributes: Val,
): ECR<Val> {
  if (!(target instanceof Obj)) return $.throw('TypeError', 'not an object');
  const key = yield* ToPropertyKey($, propertyKey);
  if (IsAbrupt(key)) return key;
  const desc = yield* ToPropertyDescriptor($, attributes);
  if (IsAbrupt(desc)) return desc;
  return target.DefineOwnProperty($, key, desc);
}

/**
 * 28.1.4 Reflect.deleteProperty ( target, propertyKey )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If target is not an Object, throw a TypeError exception.
 * 2. Let key be ? ToPropertyKey(propertyKey).
 * 3. Return ? target.[[Delete]](key).
 */
export function* ReflectDeleteProperty(
  $: VM,
  _: Val,
  target: Val,
  propertyKey: Val,
): ECR<Val> {
  if (!(target instanceof Obj)) return $.throw('TypeError', 'not an object');
  const key = yield* ToPropertyKey($, propertyKey);
  if (IsAbrupt(key)) return key;
  return target.Delete($, key);
}

/**
 * 28.1.5 Reflect.get ( target, propertyKey [ , receiver ] )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If target is not an Object, throw a TypeError exception.
 * 2. Let key be ? ToPropertyKey(propertyKey).
 * 3. If receiver is not present, then
 *     a. Set receiver to target.
 * 4. Return ? target.[[Get]](key, receiver).
 */
export function* ReflectGet(
  $: VM,
  _: Val,
  target: Val,
  propertyKey: Val,
  receiver?: Val,
): ECR<Val> {
  if (!(target instanceof Obj)) return $.throw('TypeError', 'not an object');
  const key = yield* ToPropertyKey($, propertyKey);
  if (IsAbrupt(key)) return key;
  if (arguments.length < 5) receiver = target;
  return yield* target.Get($, key, receiver);
}

/**
 * 28.1.6 Reflect.getOwnPropertyDescriptor ( target, propertyKey )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If target is not an Object, throw a TypeError exception.
 * 2. Let key be ? ToPropertyKey(propertyKey).
 * 3. Let desc be ? target.[[GetOwnProperty]](key).
 * 4. Return FromPropertyDescriptor(desc).
 */
export function* ReflectGetOwnPropertyDescriptor(
  $: VM,
  _: Val,
  target: Val,
  propertyKey: Val,
): ECR<Val> {
  if (!(target instanceof Obj)) return $.throw('TypeError', 'not an object');
  const key = yield* ToPropertyKey($, propertyKey);
  if (IsAbrupt(key)) return key;
  const desc = target.GetOwnProperty($, key);
  if (IsAbrupt(desc)) return desc;
  return FromPropertyDescriptor($, desc);
}

/**
 * 28.1.7 Reflect.getPrototypeOf ( target )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If target is not an Object, throw a TypeError exception.
 * 2. Return ? target.[[GetPrototypeOf]]().
 */
export function* ReflectGetPrototypeOf(
  $: VM,
  _: Val,
  target: Val,
): ECR<Val> {
  if (!(target instanceof Obj)) return $.throw('TypeError', 'not an object');
  return target.GetPrototypeOf($);
}

/**
 * 28.1.8 Reflect.has ( target, propertyKey )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If target is not an Object, throw a TypeError exception.
 * 2. Let key be ? ToPropertyKey(propertyKey).
 * 3. Return ? target.[[HasProperty]](key).
 */
export function* ReflectHas(
  $: VM,
  _: Val,
  target: Val,
  propertyKey: Val,
): ECR<Val> {
  if (!(target instanceof Obj)) return $.throw('TypeError', 'not an object');
  const key = yield* ToPropertyKey($, propertyKey);
  if (IsAbrupt(key)) return key;
  return target.HasProperty($, key);
}

/**
 * 28.1.9 Reflect.isExtensible ( target )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If target is not an Object, throw a TypeError exception.
 * 2. Return ? target.[[IsExtensible]]().
 */
export function* ReflectIsExtensible(
  $: VM,
  _: Val,
  target: Val,
): ECR<Val> {
  if (!(target instanceof Obj)) return $.throw('TypeError', 'not an object');
  return target.IsExtensible($);
}

/**
 * 28.1.10 Reflect.ownKeys ( target )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If target is not an Object, throw a TypeError exception.
 * 2. Let keys be ? target.[[OwnPropertyKeys]]().
 * 3. Return CreateArrayFromList(keys).
 */
export function* ReflectOwnKeys(
  $: VM,
  _: Val,
  target: Val,
): ECR<Val> {
  if (!(target instanceof Obj)) return $.throw('TypeError', 'not an object');
  const keys = target.OwnPropertyKeys($);
  if (IsAbrupt(keys)) return keys;
  return CreateArrayFromList($, keys);
}

/**
 * 28.1.11 Reflect.preventExtensions ( target )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If target is not an Object, throw a TypeError exception.
 * 2. Return ? target.[[PreventExtensions]]().
 */
export function* ReflectPreventExtensions(
  $: VM,
  _: Val,
  target: Val,
): ECR<Val> {
  if (!(target instanceof Obj)) return $.throw('TypeError', 'not an object');
  return target.PreventExtensions($);
}

/**
 * 28.1.12 Reflect.set ( target, propertyKey, V [ , receiver ] )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If target is not an Object, throw a TypeError exception.
 * 2. Let key be ? ToPropertyKey(propertyKey).
 * 3. If receiver is not present, then
 *     a. Set receiver to target.
 * 4. Return ? target.[[Set]](key, V, receiver).
 */
export function* ReflectSet(
  $: VM,
  _: Val,
  target: Val,
  propertyKey: Val,
  V: Val,
  receiver?: Val,
): ECR<Val> {
  if (!(target instanceof Obj)) return $.throw('TypeError', 'not an object');
  const key = yield* ToPropertyKey($, propertyKey);
  if (IsAbrupt(key)) return key;
  if (arguments.length < 6) receiver = target;
  return yield* target.Set($, key, V, receiver);
}

/**
 * 28.1.13 Reflect.setPrototypeOf ( target, proto )
 * 
 * This function performs the following steps when called:
 * 
 * 1. If target is not an Object, throw a TypeError exception.
 * 2. If proto is not an Object and proto is not null, throw a TypeError exception.
 * 3. Return ? target.[[SetPrototypeOf]](proto).
 */
export function* ReflectSetPrototypeOf(
  $: VM,
  _: Val,
  target: Val,
  proto: Val,
): ECR<Val> {
  if (!(target instanceof Obj)) return $.throw('TypeError', 'not an object');
  if (!(proto instanceof Obj) && proto !== null) {
    return $.throw('TypeError', 'not an object');
  }
  return target.SetPrototypeOf($, proto);
}
