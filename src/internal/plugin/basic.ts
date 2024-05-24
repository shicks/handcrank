import { Plugin, just } from '../vm';
import { EMPTY, NOT_APPLICABLE } from '../enums';
import { Val } from '../val';
import { CR, IsAbrupt } from '../completion_record';
import { ResolveBinding, ResolveThisBinding } from '../execution_context';
import { ReferenceRecord } from '../reference_record';
import { OrdinaryObjectCreate } from '../obj';
import { ObjectConstructor } from '../func';
import { StrictNode } from '../tree';
import { ToPropertyKey } from '../abstract_conversion';
import { Evaluation_BlockStatement } from '../statements';

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
    on('MemberExpression', function*(n, evaluate) {
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
    on('VariableDeclaration', function*(n, evaluate) {
      throw '';
      // 14.2.3 
      // 14.3.1 Let and Const Declarations
      // 14.3.2 Variable Statement

      // NOTE: need to figure out let/const?
    });
  },

  Intrinsics: {
    *'%ObjectPrototype%'() { return OrdinaryObjectCreate(null); },
    *'%Object%'($) { return new ObjectConstructor($, yield '%ObjectPrototype%'); },
  },

  Globals: {
    *'undefined'() { return undefined; },
    *'Object'() { return yield '%Object%'; },
    *'Object.prototype'() { return yield '%ObjectPrototype%'; },
  }
};
