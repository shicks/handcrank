import { Node } from "estree";
import { PrivateName } from "../private_environment_record";
import { CR, IsAbrupt } from "../completion_record";
import { Func } from "../func";
import { EvalGen, VM } from "../vm";
import { ParentNode, Source } from "../tree";

// 8.4 Function Name Inference

/**
 * 8.4.3 Static Semantics: IsAnonymousFunctionDefinition ( expr )
 *
 * The abstract operation IsAnonymousFunctionDefinition takes argument
 * expr (an AssignmentExpression Parse Node or an Initializer Parse
 * Node) and returns a Boolean. It determines if its argument is a
 * function definition that does not bind a name. It performs the
 * following steps when called:
 *
 * 1. If IsFunctionDefinition (8.2.2) of expr is false, return false.
 * 2. Let hasName be HasName (8.2.1) of expr.
 * 3. If hasName is true, return false.
 * 4. Return true.
 */
export function IsAnonymousFunctionDefinition(expr: Node): boolean {
  switch (expr.type) {
    case 'ArrowFunctionExpression':
      return true;
    case 'ClassExpression':
    case 'FunctionExpression':
      return expr.id == null;
    default:
      return false;
  }
}

/**
 * 8.4.5 Runtime Semantics: NamedEvaluation
 *
 * The syntax-directed operation NamedEvaluation takes argument name
 * (a property key or a Private Name) and returns either a normal
 * completion containing a function object or an abrupt completion. It
 * is defined piecewise over the following productions:
 *
 * PrimaryExpression : CoverParenthesizedExpressionAndArrowParameterList
 * 1. Let expr be the ParenthesizedExpression that is covered by
 *    CoverParenthesizedExpressionAndArrowParameterList.
 * 2. Return ? NamedEvaluation of expr with argument name.
 *
 * ParenthesizedExpression : ( Expression )
 * 1. Assert: IsAnonymousFunctionDefinition(Expression) is true.
 * 2. Return ? NamedEvaluation of Expression with argument name.
 *
 * FunctionExpression : function ( FormalParameters ) { FunctionBody }
 * 1. Return InstantiateOrdinaryFunctionExpression of
 *    FunctionExpression with argument name.
 *
 * GeneratorExpression : function * ( FormalParameters ) { GeneratorBody }
 * 1. Return InstantiateGeneratorFunctionExpression of
 *    GeneratorExpression with argument name.
 *
 * AsyncGeneratorExpression :
 *     async function * ( FormalParameters ) { AsyncGeneratorBody }
 * 1. Return InstantiateAsyncGeneratorFunctionExpression of
 *    AsyncGeneratorExpression with argument name.
 *
 * AsyncFunctionExpression :
 *     async function ( FormalParameters ) { AsyncFunctionBody }
 * 1. Return InstantiateAsyncFunctionExpression of
 *    AsyncFunctionExpression with argument name.
 *
 * ArrowFunction : ArrowParameters => ConciseBody
 * 1. Return InstantiateArrowFunctionExpression of ArrowFunction with
 *    argument name.
 *
 * AsyncArrowFunction :
 *     async AsyncArrowBindingIdentifier => AsyncConciseBody
 *     CoverCallExpressionAndAsyncArrowHead => AsyncConciseBody
 * 1. Return InstantiateAsyncArrowFunctionExpression of
 *    AsyncArrowFunction with argument name.
 *
 * ClassExpression : class ClassTail
 * 1. Let value be ? ClassDefinitionEvaluation of ClassTail with
 *    arguments undefined and name.
 * 2. Set value.[[SourceText]] to the source text matched by
 *    ClassExpression.
 * 3. Return value.
 */

export function* NamedEvaluation($: VM, node: Node, name: PropertyKey|PrivateName): EvalGen<CR<Func>> {
  const result = yield* $.evaluateValue(node);
  if (IsAbrupt(result)) return result;
  (result as Func)
  throw new Error('not implemented');
}


/**
 * 15.1.2 Static Semantics: ContainsExpression
 *
 * The syntax-directed operation ContainsExpression takes no arguments
 * and returns a Boolean. It is defined piecewise over the following
 * productions:
 *
 * ObjectBindingPattern :
 *     { }
 *     { BindingRestProperty }
 * 1. Return false.
 * 
 * ObjectBindingPattern : { BindingPropertyList , BindingRestProperty }
 * 1. Return ContainsExpression of BindingPropertyList.
 * 
 * ArrayBindingPattern : [ Elisionopt ]
 * 1. Return false.
 * 
 * ArrayBindingPattern : [ Elisionopt BindingRestElement ]
 * 1. Return ContainsExpression of BindingRestElement.
 * 
 * ArrayBindingPattern : [ BindingElementList , Elisionopt ]
 * 1. Return ContainsExpression of BindingElementList.
 * 
 * ArrayBindingPattern : [ BindingElementList , Elisionopt BindingRestElement ]
 * 1. Let has be ContainsExpression of BindingElementList.
 * 2. If has is true, return true.
 * 3. Return ContainsExpression of BindingRestElement.
 * 
 * BindingPropertyList : BindingPropertyList , BindingProperty
 * 1. Let has be ContainsExpression of BindingPropertyList.
 * 2. If has is true, return true.
 * 3. Return ContainsExpression of BindingProperty.
 * 
 * BindingElementList : BindingElementList , BindingElisionElement
 * 1. Let has be ContainsExpression of BindingElementList.
 * 2. If has is true, return true.
 * 3. Return ContainsExpression of BindingElisionElement.
 * 
 * BindingElisionElement : Elisionopt BindingElement
 * 1. Return ContainsExpression of BindingElement.
 * 
 * BindingProperty : PropertyName : BindingElement
 * 1. Let has be IsComputedPropertyKey of PropertyName.
 * 2. If has is true, return true.
 * 3. Return ContainsExpression of BindingElement.
 * 
 * BindingElement : BindingPattern Initializer
 * 1. Return true.
 * 
 * SingleNameBinding : BindingIdentifier
 * 1. Return false.
 * 
 * SingleNameBinding : BindingIdentifier Initializer
 * 1. Return true.
 * 
 * BindingRestElement : ... BindingIdentifier
 * 1. Return false.
 * 
 * BindingRestElement : ... BindingPattern
 * 1. Return ContainsExpression of BindingPattern.
 * 
 * FormalParameters : [empty]
 * 1. Return false.
 * 
 * FormalParameters : FormalParameterList , FunctionRestParameter
 * 1. If ContainsExpression of FormalParameterList is true, return true.
 * 2. Return ContainsExpression of FunctionRestParameter.
 * 
 * FormalParameterList : FormalParameterList , FormalParameter
 * 1. If ContainsExpression of FormalParameterList is true, return true.
 * 2. Return ContainsExpression of FormalParameter.
 * 
 * ArrowParameters : BindingIdentifier
 * 1. Return false.
 * 
 * ArrowParameters : CoverParenthesizedExpressionAndArrowParameterList
 * 1. Let formals be the ArrowFormalParameters that is covered by
 *    CoverParenthesizedExpressionAndArrowParameterList.
 * 2. Return ContainsExpression of formals.
 * 
 * AsyncArrowBindingIdentifier : BindingIdentifier
 * 1. Return false.
 */
export function ContainsExpression(n: Node|null): boolean {
  if (!n) return false;
  switch (n.type) {
    case 'ObjectPattern':
      return n.properties.some(ContainsExpression);
    case 'ArrayPattern':
      return n.elements.some(ContainsExpression);
    case 'Property':
      return n.computed || ContainsExpression(n.value);
    case 'AssignmentPattern':
      return true;
    default:
      return false;
  }
}

/**
 * 15.1.3 Static Semantics: IsSimpleParameterList
 *
 * The syntax-directed operation IsSimpleParameterList takes no
 * arguments and returns a Boolean. It is defined piecewise over the
 * following productions:
 *
 * BindingElement : BindingPattern
 * 1. Return false.
 *
 * BindingElement : BindingPattern Initializer
 * 1. Return false.
 *
 * SingleNameBinding : BindingIdentifier
 * 1. Return true.
 *
 * SingleNameBinding : BindingIdentifier Initializer
 * 1. Return false.
 *
 * FormalParameters : [empty]
 * 1. Return true.
 *
 * FormalParameters : FunctionRestParameter
 * 1. Return false.
 *
 * FormalParameters : FormalParameterList , FunctionRestParameter
 * 1. Return false.
 *
 * FormalParameterList : FormalParameterList , FormalParameter
 * 1. If IsSimpleParameterList of FormalParameterList is false, return
 *    false.
 * 2. Return IsSimpleParameterList of FormalParameter.
 *
 * FormalParameter : BindingElement
 * 1. Return IsSimpleParameterList of BindingElement.
 *
 * ArrowParameters : BindingIdentifier
 * 1. Return true.
 *
 * ArrowParameters : CoverParenthesizedExpressionAndArrowParameterList
 * 1. Let formals be the ArrowFormalParameters that is covered by
 *    CoverParenthesizedExpressionAndArrowParameterList.
 * 2. Return IsSimpleParameterList of formals.
 *
 * AsyncArrowBindingIdentifier : BindingIdentifier
 * 1. Return true.
 *
 * CoverCallExpressionAndAsyncArrowHead : MemberExpression Arguments
 * 1. Let head be the AsyncArrowHead that is covered by
 *    CoverCallExpressionAndAsyncArrowHead.
 * 2. Return IsSimpleParameterList of head.
 */
export function IsSimpleParameterList(params: Node[]): boolean {
  for (const n of params) {
    switch (n.type) {
      case 'Identifier':
        break;
      case 'AssignmentExpression':
      case 'RestElement':
      case 'ObjectPattern':
      case 'ArrayPattern':
        return false;
      default:
        throw new Error(`unexpected node type in formals: ${n.type}`);
    }
  }
  return true;
}

// ESTree details
export function GetSourceText(n: Node): string {
  if ((n as ParentNode).parent?.type === 'Property') {
    n = (n as ParentNode).parent!;
  }
  if (!n) return NO_SOURCE;
  if (!n.loc) return NO_SOURCE;
  const start = (n as any).start ?? n.range?.[0];
  const end = (n as any).end ?? n.range?.[1];
  if (start == null || end == null) return NO_SOURCE;
  return (n.loc.source as Source)?.sourceText?.substring(start, end) ??
      NO_SOURCE;
}
const NO_SOURCE = '(no source)';
