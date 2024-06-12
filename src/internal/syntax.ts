import { Plugin, just } from './vm';
import { EMPTY, NOT_APPLICABLE } from './enums';
import { Val } from './val';
import { Abrupt, CR, CompletionType, IsAbrupt } from './completion_record';
import { ResolveBinding, ResolveThisBinding } from './execution_context';
import { ReferenceRecord } from './reference_record';
import { Evaluation_BlockLike, Evaluation_LexicalDeclaration, Evaluation_VariableStatement } from './statements';
import { Evaluation_AssignmentExpression } from './assignment';
import { Evaluation_CallExpression, Evaluation_NewExpression } from './func';
import { EvaluatePropertyKey, Evaluation_ObjectExpression } from './obj';
import { Evaluation_ArrayExpression } from './exotic_array';
import { Evaluation_ConditionalExpression, Evaluation_SequenceExpression } from './control_flow';
import { BindingInitialization_ArrayPattern, BindingInitialization_Identifier, BindingInitialization_MemberExpression, BindingInitialization_ObjectPattern } from './binding';
import { IsStrictMode } from './static/scope';

// TODO - split out basic from advanced syntax??

export const syntax: Plugin = {
  id: 'syntax',

  syntax: {
    Evaluation(on) {
      on('Program', function*($, n) {
        let result: CR<Val|ReferenceRecord|EMPTY> = EMPTY;
        for (const child of n.body) {
          result = yield* $.Evaluation(child);
          if (IsAbrupt(result)) return result;
        }
        return result;
      });
      on('ExpressionStatement', ($, n) => $.Evaluation(n.expression));
      // Primary elements
      on('Literal', (_$, n) => {
        if (n.value instanceof RegExp) return NOT_APPLICABLE;
        return just(n.value);
      });
      on('ThisExpression', ($) => just(ResolveThisBinding($)));
      on('Identifier', ($, n) => just(ResolveBinding($, n.name)));
      on('ObjectExpression', Evaluation_ObjectExpression);
      on('ArrayExpression', Evaluation_ArrayExpression);
      //on('Literal', when(n.value instanceof RegExp) (n) => {throw'13.2.7.3'});
      on('TemplateLiteral', () => {throw 'Not Implemented: 13.2.8.6'});
      /** 13.3.2.1 MemberExpression */
      on('MemberExpression', function*($, n) {
        const baseValue = yield* $.evaluateValue(n.object);
        if (IsAbrupt(baseValue)) return baseValue;
        const strict = IsStrictMode(n);
        // TODO - handle super, imports, and calls?  (CallExpression productions)
        const propertyKey = yield* EvaluatePropertyKey($, n);
        if (IsAbrupt(propertyKey)) return propertyKey;
        return new ReferenceRecord(baseValue, propertyKey, strict, EMPTY);
      });
      on(['BlockStatement', 'Program'], Evaluation_BlockLike);
      on('VariableDeclaration', ($, n) => {
        if (n.kind !== 'var') {
          return Evaluation_LexicalDeclaration($, n);
        }
        return Evaluation_VariableStatement($, n);
      });
      on('AssignmentExpression', Evaluation_AssignmentExpression);
      on('ThrowStatement', function*($, n) {
        // 14.14.1 Runtime Semantics: Evaluation
        //
        // ThrowStatement : throw Expression ;
        // 1. Let exprRef be ? Evaluation of Expression.
        // 2. Let exprValue be ? GetValue(exprRef).
        // 3. Return ThrowCompletion(exprValue).
        const exprValue = yield* $.evaluateValue(n.argument);
        if (IsAbrupt(exprValue)) return exprValue;
        return new Abrupt(CompletionType.Throw, exprValue, EMPTY);
      });
      on('CallExpression', Evaluation_CallExpression);
      on('NewExpression', Evaluation_NewExpression);
      on('SequenceExpression', Evaluation_SequenceExpression);
      on('ConditionalExpression', Evaluation_ConditionalExpression);
    },

    BindingInitialization(on) {
      // TODO - variable binding is itself a plugin????
      on('Identifier', BindingInitialization_Identifier);
      on('MemberExpression', BindingInitialization_MemberExpression);
      // TODO - separate destructuring into a plugin
      on('ObjectPattern', BindingInitialization_ObjectPattern);
      on('ArrayPattern', BindingInitialization_ArrayPattern);
    },
  },
};
