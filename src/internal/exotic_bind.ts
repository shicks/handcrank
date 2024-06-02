import { IsConstructor, SameValue } from './abstract_compare';
import { Call, Construct } from './abstract_object';
import { Assert } from './assert';
import { CR, IsAbrupt } from './completion_record';
import { Func, IsFunc } from './func';
import { Obj, OrdinaryObject, RequiredSlots } from './obj';
import { RealmRecord } from './realm_record';
import { memoize } from './slots';
import { Val } from './val';
import { ECR, VM } from './vm';

declare global {
  interface ObjectSlots extends BoundFunctionExoticSlots {}
}

interface BoundFunctionExoticSlots {
    /**
     * [[BoundTargetFunction]], a callable Object - The wrapped
     * function object.
     */
    BoundTargetFunction?: Func;

    /**
     * [[BoundThis]], an ECMAScript language value - The value that is
     * always passed as the this value when calling the wrapped function.
     */
    BoundThis?: Val;

    /**
     * [[BoundArguments]], a List of ECMAScript language values - A list
     * of values whose elements are used as the first arguments to any
     * call to the wrapped function.
     */
    BoundArguments?: Val[];
}

type BoundFunctionRequiredSlots = RequiredSlots<keyof BoundFunctionExoticSlots|'Prototype'>;

/**
 * 10.4.1 Bound Function Exotic Objects
 * 
 * A bound function exotic object is an exotic object that wraps
 * another function object. A bound function exotic object is callable
 * (it has a [[Call]] internal method and may have a [[Construct]]
 * internal method). Calling a bound function exotic object generally
 * results in a call of its wrapped function.
 * 
 * An object is a bound function exotic object if its [[Call]] and (if
 * applicable) [[Construct]] internal methods use the following
 * implementations, and its other essential internal methods use the
 * definitions found in 10.1. These methods are installed in
 * BoundFunctionCreate.
 * 
 * Bound function exotic objects do not have the internal slots of
 * ECMAScript function objects listed in Table 30. Instead they have
 * the internal slots listed in Table 31, in addition to [[Prototype]]
 * and [[Extensible]].
 */
export type BoundFunctionExoticObject = InstanceType<ReturnType<typeof BoundFunctionExoticObject>>;
const BoundFunctionExoticObject = memoize(() => class BoundFunctionExoticObject extends OrdinaryObject() implements Func {

  declare Realm: RealmRecord;
  declare Prototype: Obj;
  declare BoundTargetFunction: Func;
  declare BoundThis: Val;
  declare BoundArguments: Val[];

  constructor(slots: BoundFunctionRequiredSlots) {
    super(slots);
  }

  /**
   * 10.4.1.1 [[Call]] ( thisArgument, argumentsList )
   * 
   * The [[Call]] internal method of a bound function exotic object F
   * takes arguments thisArgument (an ECMAScript language value) and
   * argumentsList (a List of ECMAScript language values) and returns
   * either a normal completion containing an ECMAScript language value
   * or a throw completion. It performs the following steps when called:
   * 
   * 1. Let target be F.[[BoundTargetFunction]].
   * 2. Let boundThis be F.[[BoundThis]].
   * 3. Let boundArgs be F.[[BoundArguments]].
   * 4. Let args be the list-concatenation of boundArgs and argumentsList.
   * 5. Return ? Call(target, boundThis, args).
   */
  *Call($: VM, thisArgument: Val, argumentsList: Val[]): ECR<Val> {
    const target = this.BoundTargetFunction;
    const boundThis = this.BoundThis;
    const boundArgs = this.BoundArguments;
    const args = boundArgs.concat(argumentsList);
    return yield* Call($, target, boundThis, args);
  }

  /**
   * 10.4.1.2 [[Construct]] ( argumentsList, newTarget )
   * 
   * The [[Construct]] internal method of a bound function exotic object
   * F takes arguments argumentsList (a List of ECMAScript language
   * values) and newTarget (a constructor) and returns either a normal
   * completion containing an Object or a throw completion. It performs
   * the following steps when called:
   * 
   * 1. Let target be F.[[BoundTargetFunction]].
   * 2. Assert: IsConstructor(target) is true.
   * 3. Let boundArgs be F.[[BoundArguments]].
   * 4. Let args be the list-concatenation of boundArgs and argumentsList.
   * 5. If SameValue(F, newTarget) is true, set newTarget to target.
   * 6. Return ? Construct(target, args, newTarget).
   */
  *Construct($: VM, argumentsList: Val[], newTarget: Val): ECR<Obj> {
    const target = this.BoundTargetFunction;
    Assert(IsConstructor(target));
    const boundArgs = this.BoundArguments;
    const args = boundArgs.concat(argumentsList);
    if (SameValue(this, newTarget)) newTarget = target;
    Assert(IsFunc(newTarget) || newTarget === undefined);
    return yield* Construct($, target, args, newTarget);
  }
});

/**
 * 10.4.1.3 BoundFunctionCreate ( targetFunction, boundThis, boundArgs )
 * 
 * The abstract operation BoundFunctionCreate takes arguments
 * targetFunction (a function object), boundThis (an ECMAScript
 * language value), and boundArgs (a List of ECMAScript language
 * values) and returns either a normal completion containing a
 * function object or a throw completion. It is used to specify the
 * creation of new bound function exotic objects. It performs the
 * following steps when called:
 * 
 * 1. Let proto be ? targetFunction.[[GetPrototypeOf]]().
 * 2. Let internalSlotsList be the list-concatenation of «
 *    [[Prototype]], [[Extensible]] » and the internal slots listed in
 *    Table 31.
 * 3. Let obj be MakeBasicObject(internalSlotsList).
 * 4. Set obj.[[Prototype]] to proto.
 * 5. Set obj.[[Call]] as described in 10.4.1.1.
 * 6. If IsConstructor(targetFunction) is true, then
 *     a. Set obj.[[Construct]] as described in 10.4.1.2.
 * 7. Set obj.[[BoundTargetFunction]] to targetFunction.
 * 8. Set obj.[[BoundThis]] to boundThis.
 * 9. Set obj.[[BoundArguments]] to boundArgs.
 * 10. Return obj.
 */
export function BoundFunctionCreate(
  $: VM,
  targetFunction: Func,
  boundThis: Val,
  boundArgs: Val[],
): CR<BoundFunctionExoticObject> {
  const targetPrototype = targetFunction.GetPrototypeOf($);
  if (IsAbrupt(targetPrototype)) return targetPrototype;
  if (!IsFunc(targetPrototype)) return $.throw('TypeError', 'Bind must be called on a function');
  return new (BoundFunctionExoticObject())({
    Prototype: targetPrototype,
    Realm: targetPrototype.Realm,
    BoundTargetFunction: targetFunction,
    BoundThis: boundThis!, // NOTE: explicit undefined is allowed?
    BoundArguments: boundArgs,
  });
}
