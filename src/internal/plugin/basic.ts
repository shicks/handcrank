import { Plugin, just } from '../vm';
import { EMPTY, NOT_APPLICABLE } from '../enums';
import { Val } from '../val';
import { CR, IsAbrupt } from '../completion_record';
import { ResolveBinding, ResolveThisBinding } from '../execution_context';
import { ReferenceRecord } from '../reference_record';
import { OrdinaryObjectCreate } from '../obj';
import { ObjectConstructor } from '../func';

// type Plugin<ExtraIntrinsics = never> = {[K in Intrinsics|Globals]: Intrinsics|($: VM) => Generator<Intrinsic, K extends `%${string}%` ? Obj : Val|PropertyDescriptor, Obj>} & {Evaluate?(on: fn): ...};
// export const basic: Plugin = {
//   *'undefined'() { return undefined; },
//   *'null'() { return null; },
//   *'Object'() {
//     const ctor = OrdinaryFunctionCreate(yield '%ObjectPrototype%');
//     return ctor;
//   },
//   *'%ObjectPrototype%' { return ... },
//   *'Object.Prototype' { return yield '%ObjectPrototype%' },
//      // ^ NOTE: considered part of `Object`
//   Evaluate(on) {
//     on(['Program'], n => n, function*($, n: Program, evaluate) {
//       return 
//     });

//       )
//   },
// };


export const basic: Plugin = {
  Evaluation($, on) {
    on('Program', function*(n, evaluate) {
      let result: CR<Val|ReferenceRecord|EMPTY> = EMPTY;
      for (const child of n.body) {
        result = yield* evaluate(child);
        if (IsAbrupt(result)) return result;
      }
      return result;
    });
    on('ExpressionStatement', (n, evaluate) => evaluate(n.expression));
    // Primary elements
    on('Literal', (n) => {
      if (n.value instanceof RegExp) return NOT_APPLICABLE;
      return just(n.value);
    });
    on('ThisExpression', () => just(ResolveThisBinding($)));
    on('Identifier', (n) => just(ResolveBinding($, n.name)));
  },

  Intrinsics: {
    *'%ObjectPrototype%'() { return OrdinaryObjectCreate(null); },
    *'%Object%'($) { return new ObjectConstructor($, yield '%ObjectPrototype%'); },
  },

  Globals: {
    *'undefined'() { return undefined; },
    *'Object'() { return yield '%Object%'; },
    *'Object.prototype'() { return yield '%ObjectPrototype%'; },
  }
};
