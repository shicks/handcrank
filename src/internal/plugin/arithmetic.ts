import { Plugin, when } from '../vm';
import { EMPTY } from '../enums';
import { Val } from '../val';
import { CR, IsAbrupt, Throw } from '../completion_record';
import { GetValue } from '../reference_record';
import { PropertyDescriptor } from '../property_descriptor';

const KNOWN_OPS = new Set([
  '+',
]);

export const arithmetic: Plugin = {

  Evaluation($, on) {
    on('BinaryExpression', when(
      n => KNOWN_OPS.has(n.operator),
      function*(n, evaluate) {
        const leftR = orUndefined(yield* evaluate(n.left));
        if (IsAbrupt(leftR)) return leftR;
        const left = GetValue($, leftR);
        if (IsAbrupt(left)) return left;
        const rightR = orUndefined(yield* evaluate(n.right));
        if (IsAbrupt(rightR)) return rightR;
        const right = GetValue($, rightR);
        if (IsAbrupt(right)) return right;
        switch (n.operator) {
          case '+': return add(left, right);
        }
        throw new Error(`Bad operator: ${n.operator}`);
      }));
  },

  Globals: {
    *'Infinity'() { return new PropertyDescriptor({Value: Infinity}); },
  },
};

function orUndefined<T>(v: T|EMPTY): T|undefined {
  return EMPTY.is(v) ? undefined : v;
}

// TODO - do this correctly with objects, etc
function add(left: Val, right: Val): CR<Val> {
  if (typeof left === 'number' && typeof right === 'number') return left + right;
  return Throw('TypeError');
}
