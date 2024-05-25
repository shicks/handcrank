/** @fileoverview 20 Fundamental Objects */

import { CR } from './completion_record';
import { BuiltinFunction } from './func';
import { Obj, OrdinaryObjectCreate } from './obj';
import { Val } from './val';
import { EvalGen, VM } from './vm';

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
 * 
 * has a [[Prototype]] internal slot whose value is %Function.prototype%.
 * has a "length" property.
 * has the following additional properties:
 */
export class ObjectConstructor extends BuiltinFunction { // extends BuiltinClass ??
  constructor($: VM, prototype: Obj) {
    // TODO - need $, among others... - change to generator so we can pass stuff
    super($, 1, 'Object', undefined, prototype);
  }

  override *Call($: VM) {
    return OrdinaryObjectCreate(this.Prototype);
  }
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
export class FunctionConstructor extends BuiltinFunction {
  constructor($: VM, prototype: Obj) {
    super($, 1, 'Function', undefined, prototype);
  }

  override *Call(_$: VM, _thisArgument: Val, _argumentsList: Val[]): EvalGen<CR<Val>> {
    // TODO - implement dynamic functions
    throw new Error('NOT IMPLEMENTED');
  }
}
