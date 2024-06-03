import { DebugString, Plugin } from './vm';
import { objectAndFunctionPrototype } from './fundamental';
import { method } from './func';
import { propWC } from './property_descriptor';
import { Obj, OrdinaryObjectCreate } from './obj';
import { defineProperties } from './realm_record';

export const consoleObject: Plugin = {
  id: 'consoleObject',
  deps: [objectAndFunctionPrototype],
  realm: {
    CreateIntrinsics(realm, stagedGlobals) {
      const ns = OrdinaryObjectCreate({
        Prototype: realm.Intrinsics.get('%Object.prototype%')!,
      });
      stagedGlobals.set('console', propWC(ns));

      defineProperties(realm, ns, {
        'log': method(function*(_$, _, ...args) {
          const passThroughArgs = args.map((arg) => {
            if (arg instanceof Obj) {
              return DebugString(arg, 1);              
            } else {
              return arg;
            }
          });
          console.log(...passThroughArgs);
          return undefined;
        }),
      });
    },
  },
};
