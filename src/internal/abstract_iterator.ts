import { Func } from "./func";
import { Obj, OrdinaryObjectCreate } from "./obj";
import { Val } from "./val";
import { VM } from "./vm";

/**
 * 7.4.1 Iterator Records
 *
 * An Iterator Record is a Record value used to encapsulate an
 * Iterator or AsyncIterator along with the next method.
 *
 * Iterator Records have the fields listed below:
 *
 * [[Iterator]], an Object - An object that conforms to the
 * Iterator or AsyncIterator interface.
 *
 * [[NextMethod]], a function object - The next method of
 * the [[Iterator]] object.
 *
 * [[Done]], a Boolean - Whether the iterator has been closed.
 */
export class IteratorRecord {
  constructor(
    readonly Iterator: Obj,
    readonly NextMethod: Func,
    readonly Done: boolean,
  ) {}
}

/**
 * 7.4.12 CreateListIteratorRecord ( list )
 *
 * The abstract operation CreateListIteratorRecord takes argument list
 * (a List of ECMAScript language values) and returns an Iterator
 * Record. It creates an Iterator (27.1.1.2) object record whose next
 * method returns the successive elements of list. It performs the
 * following steps when called:
 *
 * 1. Let closure be a new Abstract Closure with no parameters that
 *    captures list and performs the following steps when called:
 *     a. For each element E of list, do
 *         i. Perform ? GeneratorYield(CreateIterResultObject(E, false)).
 *     b. Return NormalCompletion(undefined).
 * 2. Let iterator be CreateIteratorFromClosure(closure, empty, %IteratorPrototype%).
 * 3. Return the Iterator Record { [[Iterator]]: iterator,
 *    [[NextMethod]]: %GeneratorFunction.prototype.prototype.next%,
 *    [[Done]]: false }.
 *
 * NOTE: The list iterator object is never directly accessible to ECMAScript code.
 */
export function CreateListIteratorRecord($: VM, list: Val[]): IteratorRecord {
  // TODO - implement!!
  if (1 < 2) throw new Error('not implemented');
  return new IteratorRecord(OrdinaryObjectCreate(null), null!, false);
}
