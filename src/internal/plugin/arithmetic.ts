import { BinaryExpression } from 'estree';
import { Plugin, PluginSPI, VM } from '../vm';
import { EMPTY, NOT_APPLICABLE } from '../enums';
import { Val } from '../values';
import { CR, IsAbrupt } from '../completion_record';
import { GetValue } from '../reference_record';

export const arithmetic: Plugin = (spi: PluginSPI) => {
  spi.onEvaluation(['BinaryExpression'], ($: VM, n: BinaryExpression, evaluate) => {
    const leftR = orUndefined(evaluate(n.left));
    if (IsAbrupt(leftR)) return leftR;
    const left = GetValue($, leftR);
    if (IsAbrupt(left)) return left;
    const rightR = orUndefined(evaluate(n.right));
    if (IsAbrupt(rightR)) return rightR;
    const right = GetValue($, rightR);
    if (IsAbrupt(right)) return right;
    
    switch (n.operator) {
      case '+': return add(left, right);
    }
    return NOT_APPLICABLE;
  });
};

function orUndefined<T>(v: T|EMPTY): T|undefined {
  return EMPTY.is(v) ? undefined : v;
}

// TODO - do this correctly with objects, etc
function add(left: Val, right: Val): CR<Val>|NOT_APPLICABLE {
  if (typeof left === 'number' && typeof right === 'number') return left + right;
  return NOT_APPLICABLE;
}
