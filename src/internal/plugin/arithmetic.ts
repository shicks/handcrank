import { Plugin } from '../vm';
import { prop0 } from '../property_descriptor';
import { Evaluate_BinaryExpression } from '../binary_operators';
import { defineProperties } from '../realm_record';

export const arithmetic: Plugin = {
  id: 'arithmetic',

  syntax: {
    Evaluation($, on) {
      on('BinaryExpression', (n) => Evaluate_BinaryExpression($, n));
    },
  },

  realm: {
    SetDefaultGlobalBindings(realm) {
      defineProperties(realm, realm.GlobalObject!, {
        'Infinity': prop0(Infinity),
      });
    },
  },
};
