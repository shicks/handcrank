import { Literal } from 'estree';
import { Plugin, PluginSPI } from '../vm';
import { EMPTY, NOT_APPLICABLE } from '../enums';
import { Val } from '../values';
import { CR, IsAbrupt } from '../completion_record';

export const basic: Plugin = (spi: PluginSPI) => {
  spi.onEvaluation(['Program'], (_, n, evaluate): CR<Val|EMPTY> => {
    let result: CR<Val|EMPTY> = EMPTY;
    for (const child of n.body) {
      result = evaluate(child);
      if (IsAbrupt(result)) return result;
    }
    return result;
  });
  spi.onEvaluation(['ExpressionStatement'],
                   (_, n, evaluate) => evaluate(n.expression));
  spi.onEvaluation(['Literal'], (_, n: Literal) => {
    if (n.value instanceof RegExp) return NOT_APPLICABLE;
    return n.value;
  });
};

// TODO - regex as a separate thing...
