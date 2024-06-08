import { Plugin, just } from './vm';
import { EMPTY, NOT_APPLICABLE } from './enums';
import { Val } from './val';
import { Abrupt, CR, CompletionType, IsAbrupt } from './completion_record';
import { ResolveBinding, ResolveThisBinding } from './execution_context';
import { ReferenceRecord } from './reference_record';
import { StrictNode } from './tree';
import { ToBoolean, ToPropertyKey } from './abstract_conversion';
import { Evaluation_BlockStatement, Evaluation_LexicalDeclaration, Evaluation_VariableStatement } from './statements';
import { Evaluation_AssignmentExpression } from './assignment';
import { Evaluation_CallExpression, Evaluation_NewExpression } from './func';
import { Evaluation_ObjectExpression } from './obj';
import { Evaluation_ArrayExpression } from './exotic_array';

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
        const strict = (n as StrictNode).strict || false;
        let propertyKey;

        // TODO - handle super, imports, and calls?  (CallExpression productions)

        if (n.computed) {
          // 13.3.3 EvaluatePropertyAccessWithExpressionKey ( baseValue, expression, strict )
          const propertyNameValue = yield* $.evaluateValue(n.property);
          if (IsAbrupt(propertyNameValue)) return propertyNameValue;
          propertyKey = yield* ToPropertyKey($, propertyNameValue);
          if (IsAbrupt(propertyKey)) return propertyKey;
        } else if (n.property.type === 'Identifier') {
          propertyKey = String(n.property.name);
        } else {
          // NOTE: PrivateIdentifier is a valid type here
          //    MemberExpression : MemberExpression . PrivateIdentifier
          // ????
          throw new Error(`Bad non-computed property: ${n.property.type}`);
        }
        return new ReferenceRecord(baseValue, propertyKey, strict, EMPTY);
      });
      on('BlockStatement', Evaluation_BlockStatement);
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
      on('SequenceExpression', function*($, n) {
        let result: CR<Val> = undefined;
        for (const expr of n.expressions) {
          result = yield* $.evaluateValue(expr);
          if (IsAbrupt(result)) return result;
        }
        return result;
      });
      on('ConditionalExpression', function*($, n) {
        const test = yield* $.evaluateValue(n.test);
        if (IsAbrupt(test)) return test;
        if (ToBoolean(test)) {
          return yield* $.evaluateValue(n.consequent);
        } else {
          return yield* $.evaluateValue(n.alternate);
        }
      });
    },
  },
};
