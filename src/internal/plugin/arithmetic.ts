import { BinaryExpression } from 'estree';
import { Plugin, PluginSPI } from '../vm';
import { EMPTY, NOT_APPLICABLE } from '../enums';
import { Val } from '../values';
import { CR, IsAbrupt } from '../completion_record';

export const arithmetic: Plugin = (spi: PluginSPI) => {
  spi.onEvaluation(['BinaryExpression'], (_, n: BinaryExpression, evaluate) => {
    const left = orUndefined(evaluate(n.left));
    if (IsAbrupt(left)) return left;
    const right = orUndefined(evaluate(n.right));
    if (IsAbrupt(right)) return right;
    switch (n.operator) {
      case '+': return add(orUndefined(left), orUndefined(right));
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

// TODO - regex as a separate thing...
