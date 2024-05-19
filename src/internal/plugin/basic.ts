import { Identifier, Literal } from 'estree';
import { Plugin, PluginSPI, VM } from '../vm';
import { EMPTY, NOT_APPLICABLE } from '../enums';
import { Val } from '../val';
import { CR, IsAbrupt } from '../completion_record';
import { ResolveBinding, ResolveThisBinding } from '../execution_context';
import { ReferenceRecord } from '../reference_record';
import { OrdinaryObjectCreate } from '../obj';

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
    debugger;
    return ResolveBinding($, n.name);
  });

  // Global environment
  spi.define('undefined', [], () => undefined);

  spi.define('%ObjectPrototype%', [], () => {
    return OrdinaryObjectCreate(null);
  });

  // spi.define('%Object%', [], () => {
  //   return new ObjectConstructor();
  // });









};

// TODO - regex as a separate thing...
