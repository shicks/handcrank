import { Plugin, just } from '../vm';
import { EMPTY, NOT_APPLICABLE } from '../enums';
import { Val } from '../val';
import { Abrupt, CR, CompletionType, IsAbrupt } from '../completion_record';
import { ResolveBinding, ResolveThisBinding } from '../execution_context';
import { ReferenceRecord } from '../reference_record';
import { OrdinaryObjectCreate } from '../obj';
import { StrictNode } from '../tree';
import { ToPropertyKey } from '../abstract_conversion';
import { Evaluation_BlockStatement, Evaluation_LexicalDeclaration, Evaluation_VariableStatement } from '../statements';
import { Evaluation_AssignmentExpression } from '../assignment';
import { FunctionConstructor, ObjectConstructor } from '../fundamental';
import { Evaluation_CallExpression } from '../func';

// type Plugin<ExtraIntrinsics = never> = {[K in Intrinsics|Globals]: Intrinsics|($: VM) => Generator<Intrinsic, K extends `%${string}%` ? Obj : Val|PropertyDescriptor, Obj>} & {Evaluate?(on: fn): ...};
// export const basic: Plugin = {
//   *'undefined'() { return undefined; },
//   *'null'() { return null; },
//   *'Object'() {
//     const ctor = OrdinaryFunctionCreate(yield '%ObjectPrototype%');
//     return ctor;
//   },
//   *'%ObjectPrototype%' { return ... },
//   *'Object.Prototype' { return yield '%ObjectPrototype%' },
//      // ^ NOTE: considered part of `Object`
//   Evaluate(on) {
//     on(['Program'], n => n, function*($, n: Program, evaluate) {
//       return 
//     });

//       )
//   },
// };


// TODO - put more ...something... into this?


export const basic: Plugin = {
  Evaluation($, on) {
    on('Program', function*(n, evaluate) {
      let result: CR<Val|ReferenceRecord|EMPTY> = EMPTY;
      for (const child of n.body) {
        result = yield* evaluate(child);
        if (IsAbrupt(result)) return result;
      }
      return result;
    });
    on('ExpressionStatement', (n, evaluate) => evaluate(n.expression));
    // Primary elements
    on('Literal', (n) => {
      if (n.value instanceof RegExp) return NOT_APPLICABLE;
      return just(n.value);
    });
    on('ThisExpression', () => just(ResolveThisBinding($)));
    on('Identifier', (n) => just(ResolveBinding($, n.name)));
    on('ArrayExpression', (n) => {throw'13.2.4.2'});
    on('ObjectExpression', (n) => {throw'13.2.5.4'});
    //on('Literal', when(n.value instanceof RegExp) (n) => {throw'13.2.7.3'});
    on('TemplateLiteral', (n) => {throw'13.2.8.6'});
    /** 13.3.2.1 MemberExpression */
    on('MemberExpression', function*(n) {
      const baseValue = yield* $.evaluateValue(n.object);
      if (IsAbrupt(baseValue)) return baseValue;
      const strict = (n as StrictNode).strict || false;
      let propertyKey;

      // TODO - handle super, imports, and calls?  (CallExpression productions)

      if (n.computed) {
        // 13.3.3 EvaluatePropertyAccessWithExpressionKey ( baseValue, expression, strict )
        const propertyNameValue = yield* $.evaluateValue(n.property);
        if (IsAbrupt(propertyNameValue)) return propertyNameValue;
        propertyKey = ToPropertyKey($, propertyNameValue);
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
    on('BlockStatement', (n) => Evaluation_BlockStatement($, n));
    on('VariableDeclaration', (n, evaluate) => {
      if (n.kind !== 'var') {
        return Evaluation_LexicalDeclaration($, n);
      }
      return Evaluation_VariableStatement($, n);
    });
    on('AssignmentExpression', (n) => Evaluation_AssignmentExpression($, n));
    on('FunctionDeclaration', (n) => just(EMPTY));
    //on('FunctionExpression', (n) => Evaluate_FunctionExpression($, n));
    on('ReturnStatement', function*(n) {
      // 14.10.1 Runtime Semantics: Evaluation
      //
      // ReturnStatement : return ;
      // 1. Return Completion Record { [[Type]]: return, [[Value]]:
      //    undefined, [[Target]]: empty }.
      if (!n.argument) return new Abrupt(CompletionType.Return, undefined, EMPTY);

      // ReturnStatement : return Expression ;
      // 1. Let exprRef be ? Evaluation of Expression.
      // 2. Let exprValue be ? GetValue(exprRef).
      // 3. If GetGeneratorKind() is async, set exprValue to ? Await(exprValue).
      // 4. Return Completion Record { [[Type]]: return, [[Value]]:
      //    exprValue, [[Target]]: empty }.
      const exprValue = yield* $.evaluateValue(n.argument);
      if (IsAbrupt(exprValue)) return exprValue;
      //if (GetGeneratorKind() === 'async') {
      return new Abrupt(CompletionType.Return, exprValue, EMPTY);
    });
    on('CallExpression', (n) => Evaluation_CallExpression($, n));
  },

  Intrinsics: {
    *'%Object.prototype%'() { return OrdinaryObjectCreate(null); },
    *'%Object%'($) { return new ObjectConstructor($, yield '%Object.prototype%'); },
    *'%Function.prototype%'() { return OrdinaryObjectCreate(yield '%Object.prototype%'); },
    *'%Function%'($) { return new FunctionConstructor($, yield '%Function.prototype%'); },
  },

  Globals: {
    *'undefined'() { return undefined; },
    *'Object'() { return yield '%Object%'; },
    *'Object.prototype'() { return yield '%Object.prototype%'; },
    *'Function'() { return yield '%Function%'; },
    *'Function.prototype'() { return yield '%Function.prototype%'; },
  }
};
