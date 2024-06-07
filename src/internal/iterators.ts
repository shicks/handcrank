import { method } from './func';
import { Plugin } from './vm';
import { objectAndFunctionPrototype } from './fundamental';
import { defineProperties } from './realm_record';
import { OrdinaryObjectCreate } from './obj';

export const iterators: Plugin = {
  id: 'iterators',
  deps: [objectAndFunctionPrototype],
  realm: {
    CreateIntrinsics(realm, stagedGlobals) {
      /**
       * 27.1.2 The %IteratorPrototype% Object
       * 
       * The %IteratorPrototype% object:
       * 
       *   - has a [[Prototype]] internal slot whose value is %Object.prototype%.
       *   - is an ordinary object.
       *
       * NOTE: All objects defined in this specification that
       * implement the Iterator interface also inherit from
       * %IteratorPrototype%. ECMAScript code may also define objects
       * that inherit from %IteratorPrototype%. The
       * %IteratorPrototype% object provides a place where additional
       * methods that are applicable to all iterator objects may be
       * added.
       * 
       * The following expression is one way that ECMAScript code can
       * access the %IteratorPrototype% object:
       * 
       * Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))
       */
      const iteratorPrototype = OrdinaryObjectCreate({
        Prototype: realm.Intrinsics.get('%Object.prototype%')!,
      });
      realm.Intrinsics.set('%IteratorPrototype%', iteratorPrototype);

      defineProperties(realm, iteratorPrototype, {
        /**
         *
         * 27.1.2.1 %IteratorPrototype% [ @@iterator ] ( )
         * 
         * This function performs the following steps when called:
         * 
         * 1. Return the this value.
         * 
         * The value of the "name" property of this function is "[Symbol.iterator]".
         */
        [Symbol.iterator]: method(function*(_$, thisValue) { return thisValue; }),
      });
    },
  },
};
