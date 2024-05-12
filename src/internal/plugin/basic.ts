import { Identifier, Literal } from 'estree';
import { Plugin, PluginSPI, VM } from '../vm';
import { EMPTY, NOT_APPLICABLE } from '../enums';
import { OrdinaryObject, Val } from '../values';
import { CR, IsAbrupt } from '../completion_record';
import { ResolveBinding, ResolveThisBinding } from '../execution_context';
import { ReferenceRecord } from '../reference_record';

declare const ObjectConstructor: any;

export const basic: Plugin = (spi: PluginSPI) => {
  // Basic structure of running programs and expressions
  spi.onEvaluation(['Program'], (_, n, evaluate): CR<Val|ReferenceRecord|EMPTY> => {
    let result: CR<Val|ReferenceRecord|EMPTY> = EMPTY;
    for (const child of n.body) {
      result = evaluate(child);
      if (IsAbrupt(result)) return result;
    }
    return result;
  });
  spi.onEvaluation(['ExpressionStatement'],
                   (_, n, evaluate) => evaluate(n.expression));

  // Primary elements
  spi.onEvaluation(['Literal'], (_, n: Literal) => {
    if (n.value instanceof RegExp) return NOT_APPLICABLE;
    return n.value;
  });
  spi.onEvaluation(['ThisExpression'], ($: VM) => {
    return ResolveThisBinding($);
  });
  spi.onEvaluation(['Identifier'], ($: VM, n: Identifier) => {
    return ResolveBinding($, n.name);
  });

  spi.define('%ObjectPrototype%', [], () => {
    return new OrdinaryObject(null);
  });

  spi.define('%Object%', [], () => {
    return new ObjectConstructor();
  });
};

// TODO - regex as a separate thing...
