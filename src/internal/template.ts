/** @fileoverview 13.2.8 Template Literals */

import { ToString } from "./abstract_conversion";
import { CreateArrayFromList, SetIntegrityLevel } from "./abstract_object";
import { Assert } from "./assert";
import { CastNotAbrupt, IsAbrupt } from "./completion_record";
import { EMPTY, FROZEN } from "./enums";
import { EvaluateCall } from "./func";
import { Obj } from "./obj";
import { prop0 } from "./property_descriptor";
import { GetValue } from "./reference_record";
import { Val } from "./val";
import { ECR, Plugin, VM } from "./vm";
import * as ESTree from 'estree';

function IsInTailPosition(node: any) { return false; }

/**
 * 13.2.8.4 GetTemplateObject ( templateLiteral )
 * 
 * The abstract operation GetTemplateObject takes argument
 * templateLiteral (a Parse Node) and returns an Array. It performs
 * the following steps when called:
 * 
 * 1. Let realm be the current Realm Record.
 * 2. Let templateRegistry be realm.[[TemplateMap]].
 * 3. For each element e of templateRegistry, do
 *     a. If e.[[Site]] is the same Parse Node as templateLiteral, then
 *         i. Return e.[[Array]].
 * 4. Let rawStrings be TemplateStrings of templateLiteral with argument true.
 * 5. Let cookedStrings be TemplateStrings of templateLiteral with argument false.
 * 6. Let count be the number of elements in the List cookedStrings.
 * 7. Assert: count ≤ 232 - 1.
 * 8. Let template be ! ArrayCreate(count).
 * 9. Let rawObj be ! ArrayCreate(count).
 * 10. Let index be 0.
 * 11. Repeat, while index < count,
 *     a. Let prop be ! ToString(𝔽(index)).
 *     b. Let cookedValue be cookedStrings[index].
 *     c. Perform ! DefinePropertyOrThrow(template, prop,
 *        PropertyDescriptor { [[Value]]: cookedValue, [[Writable]]:
 *        false, [[Enumerable]]: true, [[Configurable]]: false }).
 *     d. Let rawValue be the String value rawStrings[index].
 *     e. Perform ! DefinePropertyOrThrow(rawObj, prop,
 *        PropertyDescriptor { [[Value]]: rawValue, [[Writable]]: false,
 *        [[Enumerable]]: true, [[Configurable]]: false }).
 *     f. Set index to index + 1.
 * 12. Perform ! SetIntegrityLevel(rawObj, frozen).
 * 13. Perform ! DefinePropertyOrThrow(template, "raw", PropertyDescriptor {
 *     [[Value]]: rawObj, [[Writable]]: false, [[Enumerable]]: false,
 *     [[Configurable]]: false }).
 * 14. Perform ! SetIntegrityLevel(template, frozen).
 * 15. Append the Record { [[Site]]: templateLiteral, [[Array]]:
 *     template } to realm.[[TemplateMap]].
 * 16. Return template.
 */
export function GetTemplateObject(
  $: VM,
  templateLiteral: ESTree.TemplateLiteral,
): Obj {
  const realm = $.getRealm()!;
  const templateRegistry = realm.TemplateMap;
  const cached = templateRegistry.get(templateLiteral);
  if (cached) return cached;
  const quasis = templateLiteral.quasis;
  Assert(quasis.length <= Number.MAX_SAFE_INTEGER);
  const template = CreateArrayFromList($, quasis.map(q => q.value.cooked));
  const rawObj = CreateArrayFromList($, quasis.map(q => q.value.raw));
  CastNotAbrupt(SetIntegrityLevel($, rawObj, FROZEN));
  template.OwnProps.set('raw', prop0(rawObj));
  CastNotAbrupt(SetIntegrityLevel($, template, FROZEN));
  templateRegistry.set(templateLiteral, template);
  return template;
}

/**
 * 13.2.8.5 Runtime Semantics: SubstitutionEvaluation
 * 
 * The syntax-directed operation SubstitutionEvaluation takes no
 * arguments and returns either a normal completion containing a List
 * of ECMAScript language values or an abrupt completion. It is
 * defined piecewise over the following productions:
 * 
 * TemplateSpans : TemplateTail
 * 1. Return a new empty List.
 * 
 * TemplateSpans : TemplateMiddleList TemplateTail
 * 1. Return ? SubstitutionEvaluation of TemplateMiddleList.
 * 
 * TemplateMiddleList : TemplateMiddle Expression
 * 1. Let subRef be ? Evaluation of Expression.
 * 2. Let sub be ? GetValue(subRef).
 * 3. Return « sub ».
 * 
 * TemplateMiddleList : TemplateMiddleList TemplateMiddle Expression
 * 1. Let preceding be ? SubstitutionEvaluation of TemplateMiddleList.
 * 2. Let nextRef be ? Evaluation of Expression.
 * 3. Let next be ? GetValue(nextRef).
 * 4. Return the list-concatenation of preceding and « next ».
 *
 * ---
 *
 * 13.2.8.6 Runtime Semantics: Evaluation
 * 
 * TemplateLiteral : NoSubstitutionTemplate
 * 1. Return the TV of NoSubstitutionTemplate as defined in 12.9.6.
 * 
 * SubstitutionTemplate : TemplateHead Expression TemplateSpans
 * 1. Let head be the TV of TemplateHead as defined in 12.9.6.
 * 2. Let subRef be ? Evaluation of Expression.
 * 3. Let sub be ? GetValue(subRef).
 * 4. Let middle be ? ToString(sub).
 * 5. Let tail be ? Evaluation of TemplateSpans.
 * 6. Return the string-concatenation of head, middle, and tail.
 * 
 * NOTE 1: The string conversion semantics applied to the Expression
 * value are like String.prototype.concat rather than the + operator.
 * 
 * TemplateSpans : TemplateTail
 * 1. Return the TV of TemplateTail as defined in 12.9.6.
 * 
 * TemplateSpans : TemplateMiddleList TemplateTail
 * 1. Let head be ? Evaluation of TemplateMiddleList.
 * 2. Let tail be the TV of TemplateTail as defined in 12.9.6.
 * 3. Return the string-concatenation of head and tail.
 * 
 * TemplateMiddleList : TemplateMiddle Expression
 * 1. Let head be the TV of TemplateMiddle as defined in 12.9.6.
 * 2. Let subRef be ? Evaluation of Expression.
 * 3. Let sub be ? GetValue(subRef).
 * 4. Let middle be ? ToString(sub).
 * 5. Return the string-concatenation of head and middle.
 * 
 * NOTE 2: The string conversion semantics applied to the Expression
 * value are like String.prototype.concat rather than the + operator.
 * 
 * TemplateMiddleList : TemplateMiddleList TemplateMiddle Expression
 * 1. Let rest be ? Evaluation of TemplateMiddleList.
 * 2. Let middle be the TV of TemplateMiddle as defined in 12.9.6.
 * 3. Let subRef be ? Evaluation of Expression.
 * 4. Let sub be ? GetValue(subRef).
 * 5. Let last be ? ToString(sub).
 * 6. Return the string-concatenation of rest, middle, and last.
 * 
 * NOTE 3: The string conversion semantics applied to the Expression
 * value are like String.prototype.concat rather than the + operator.
 */
export function* Evaluation_TemplateLiteral($: VM, template: ESTree.TemplateLiteral): ECR<string> {
  let result = '';
  for (let i = 0; i < template.quasis.length; i++) {
    result += template.quasis[i].value.cooked;
    if (i < template.expressions.length) {
      const expr = template.expressions[i];
      const sub = yield* $.evaluateValue(expr);
      if (IsAbrupt(sub)) return sub;
      const str = yield* ToString($, sub);
      result += str;
    }
  }
  return result;
}

export const templateLiterals: Plugin = {
  id: 'templateLiterals',
  syntax: {
    Evaluation(on) {
      on('TemplateLiteral', Evaluation_TemplateLiteral);
    },
  },
};

/**
 * 13.3.11 Tagged Templates
 * 
 * NOTE: A tagged template is a function call where the arguments of
 * the call are derived from a TemplateLiteral (13.2.8). The actual
 * arguments include a template object (13.2.8.4) and the values
 * produced by evaluating the expressions embedded within the
 * TemplateLiteral.
 *  
 * 13.3.11.1 Runtime Semantics: Evaluation
 * 
 * MemberExpression : MemberExpression TemplateLiteral
 * 1. Let tagRef be ? Evaluation of MemberExpression.
 * 2. Let tagFunc be ? GetValue(tagRef).
 * 3. Let thisCall be this MemberExpression.
 * 4. Let tailCall be IsInTailPosition(thisCall).
 * 5. Return ? EvaluateCall(tagFunc, tagRef, TemplateLiteral, tailCall).
 * 
 * CallExpression : CallExpression TemplateLiteral
 * 1. Let tagRef be ? Evaluation of CallExpression.
 * 2. Let tagFunc be ? GetValue(tagRef).
 * 3. Let thisCall be this CallExpression.
 * 4. Let tailCall be IsInTailPosition(thisCall).
 * 5. Return ? EvaluateCall(tagFunc, tagRef, TemplateLiteral, tailCall).
 */
export function* Evaluation_TaggedTemplateExpression(
  $: VM,
  node: ESTree.TaggedTemplateExpression,
): ECR<Val> {
  const tagRef = yield* $.Evaluation(node.tag);
  if (IsAbrupt(tagRef)) return tagRef;
  Assert(!EMPTY.is(tagRef));
  const tagFunc = yield* GetValue($, tagRef);
  if (IsAbrupt(tagFunc)) return tagFunc;
  const tailCall = IsInTailPosition(node);
  return yield* EvaluateCall($, tagFunc, tagRef, node.quasi, tailCall);
}

/**
 * 13.3.8.1 Runtime Semantics: ArgumentListEvaluation
 * 
 * The syntax-directed operation ArgumentListEvaluation takes no
 * arguments and returns either a normal completion containing a List
 * of ECMAScript language values or an abrupt completion. It is
 * defined piecewise over the following productions:
 *
 * TemplateLiteral : NoSubstitutionTemplate
 * 1. Let templateLiteral be this TemplateLiteral.
 * 2. Let siteObj be GetTemplateObject(templateLiteral).
 * 3. Return « siteObj ».
 *
 * TemplateLiteral : SubstitutionTemplate
 * 1. Let templateLiteral be this TemplateLiteral.
 * 2. Let siteObj be GetTemplateObject(templateLiteral).
 * 3. Let remaining be ? ArgumentListEvaluation of SubstitutionTemplate.
 * 4. Return the list-concatenation of « siteObj » and remaining.
 *
 * SubstitutionTemplate : TemplateHead Expression TemplateSpans
 * 1. Let firstSubRef be ? Evaluation of Expression.
 * 2. Let firstSub be ? GetValue(firstSubRef).
 * 3. Let restSub be ? SubstitutionEvaluation of TemplateSpans.
 * 4. Assert: restSub is a possibly empty List.
 * 5. Return the list-concatenation of « firstSub » and restSub.
 */
export function* ArgumentListEvaluation_TemplateLiteral(
  $: VM,
  node: ESTree.TemplateLiteral,
): ECR<Val[]> {
  const result: Val[] = [GetTemplateObject($, node)];
  for (const expr of node.expressions) {
    const arg = yield* $.evaluateValue(expr);
    if (IsAbrupt(arg)) return arg;
    result.push(arg);
  }
  return result;
}

export const taggedTemplateLiterals: Plugin = {
  id: 'taggedTemplateLiterals',
  syntax: {
    Evaluation(on) {
      on('TaggedTemplateExpression', Evaluation_TaggedTemplateExpression);
    },
    ArgumentListEvaluation(on) {
      on('TemplateLiteral', ArgumentListEvaluation_TemplateLiteral);
    },
  },
};
