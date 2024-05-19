import { Node } from "estree";

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
