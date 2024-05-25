import { Plugin } from '../vm';
import { PropertyDescriptor } from '../property_descriptor';
import { Evaluate_BinaryExpression } from '../binary_operators';

export const arithmetic: Plugin = {

  Evaluation($, on) {
    on('BinaryExpression', (n) => Evaluate_BinaryExpression($, n));
  },

  Globals: {
    *'Infinity'() { return new PropertyDescriptor({Value: Infinity}); },
  },
};
