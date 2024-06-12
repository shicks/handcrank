/** @fileoverview 15.7 Class Definitions */

import { IsConstructor } from './abstract_compare';
import { ToPropertyKey } from './abstract_conversion';
import { Call, Construct, DefineField, Get, InitializeInstanceElements, PrivateMethodOrAccessorAdd } from './abstract_object';
import { Assert } from './assert';
import { InitializeBoundName } from './binding';
import { CR, CastNotAbrupt, IsAbrupt } from './completion_record';
import { ACCESSOR, BASE, DERIVED, EMPTY, METHOD, NON_LEXICAL_THIS, UNUSED } from './enums';
import { DeclarativeEnvironmentRecord, FunctionEnvironmentRecord } from './environment_record';
import { GetNewTarget, GetThisEnvironment } from './execution_context';
import { ArgumentListEvaluation, CreateBuiltinFunction, DefineMethod, Func, FunctionDeclarationInstantiation, IsFunc, MakeClassConstructor, MakeConstructor, MakeMethod, MethodDefinitionEvaluation, OrdinaryFunctionCreate, SetFunctionName } from './func';
import { objectAndFunctionPrototype } from './fundamental';
import { EvaluatePropertyKey, Obj, OrdinaryCreateFromConstructor, OrdinaryObjectCreate } from './obj';
import { IsPrivateElement, IsPrivateElementAccessor, PrivateElement, PrivateEnvironmentRecord, PrivateName } from './private_environment_record';
import { GetValue, ReferenceRecord } from './reference_record';
import { Evaluation_BlockLike } from './statements';
import { GetSourceText } from './static/functions';
import { IsStrictMode } from './static/scope';
import { ClassElement } from './tree';
import { PropertyKey, Val } from './val';
import { DebugString, ECR, Plugin, VM, when } from './vm';
import * as ESTree from 'estree';

export const classes: Plugin = {
  id: 'classes',
  deps: () => [objectAndFunctionPrototype],
  syntax: {
    Evaluation(on) {
      on(['ClassDeclaration', 'ClassExpression'], Evaluation_ClassExpression);
      on('MemberExpression', when(n => n.object.type === 'Super', Evaluation_SuperProperty));
      on('CallExpression', when(n => n.callee.type === 'Super', Evaluation_SuperCall));
    },
    NamedEvaluation(on) {
      /**
       * ClassExpression : class ClassTail
       * 1. Let value be ? ClassDefinitionEvaluation of ClassTail with arguments undefined and name.
       * 2. Set value.[[SourceText]] to the source text matched by ClassExpression.
       * 3. Return value.
       */
      on('ClassExpression', function*($, node, name) {
        const value = yield* ClassDefinitionEvaluation($, undefined, name, node.superClass, node.body);
        if (IsAbrupt(value)) return value;
        value.SourceText = GetSourceText(node);
        return value;
      });
    },
  }
};

/**
 * 6.2.11 The ClassFieldDefinition Record Specification Type
 * 
 * The ClassFieldDefinition type is a Record used in the specification
 * of class fields.
 * 
 * Values of the ClassFieldDefinition type are Record values whose
 * fields are defined by Table 10. Such values are referred to as
 * ClassFieldDefinition Records.
 * 
 * [[Name]], a Private Name, a String, or a Symbol - The name of the field.
 * [[Initializer]], a function object or empty - The initializer of the field, if any.
 */
export class ClassFieldDefinitionRecord {
  constructor(
    readonly Name: PrivateName|string|symbol,
    readonly Initializer: Func|EMPTY,
  ) {}
}

/**
 * 6.2.13 The ClassStaticBlockDefinition Record Specification Type
 * 
 * A ClassStaticBlockDefinition Record is a Record value used to
 * encapsulate the executable code for a class static initialization
 * block.
 * 
 * ClassStaticBlockDefinition Records have the fields listed in Table 11.
 * 
 * [[BodyFunction]], a function object - The function object to be
 * called during static initialization of a class.
 */
class ClassStaticBlockDefinitionRecord {
  constructor(readonly BodyFunction: Func) {}
}

/**
 * 13.3.7 The super Keyword
 * 
 * 13.3.7.1 Runtime Semantics: Evaluation
 * 
 * SuperProperty : super [ Expression ]
 * 1. Let env be GetThisEnvironment().
 * 2. Let actualThis be ? env.GetThisBinding().
 * 3. Let propertyNameReference be ? Evaluation of Expression.
 * 4. Let propertyNameValue be ? GetValue(propertyNameReference).
 * 5. Let propertyKey be ? ToPropertyKey(propertyNameValue).
 * 6. If the source text matched by this SuperProperty is strict mode
 *    code, let strict be true; else let strict be false.
 * 7. Return ? MakeSuperPropertyReference(actualThis, propertyKey, strict).
 * 
 * SuperProperty : super . IdentifierName
 * 1. Let env be GetThisEnvironment().
 * 2. Let actualThis be ? env.GetThisBinding().
 * 3. Let propertyKey be StringValue of IdentifierName.
 * 4. If the source text matched by this SuperProperty is strict mode
 *    code, let strict be true; else let strict be false.
 * 5. Return ? MakeSuperPropertyReference(actualThis, propertyKey, strict).
 */
export function* Evaluation_SuperProperty(
  $: VM,
  node: ESTree.MemberExpression,
): ECR<ReferenceRecord> {
  Assert(node.object.type === 'Super');
  const env = GetThisEnvironment($);
  const actualThis = env.GetThisBinding($);
  if (IsAbrupt(actualThis)) return actualThis;
  const propertyKey = yield* EvaluatePropertyKey($, node);
  if (IsAbrupt(propertyKey)) return propertyKey;
  const strict = IsStrictMode(node);
  Assert(!(propertyKey instanceof PrivateName));
  return MakeSuperPropertyReference($, actualThis, propertyKey, strict);
}

/**
 * SuperCall : super Arguments
 * 1. Let newTarget be GetNewTarget().
 * 2. Assert: newTarget is an Object.
 * 3. Let func be GetSuperConstructor().
 * 4. Let argList be ? ArgumentListEvaluation of Arguments.
 * 5. If IsConstructor(func) is false, throw a TypeError exception.
 * 6. Let result be ? Construct(func, argList, newTarget).
 * 7. Let thisER be GetThisEnvironment().
 * 8. Perform ? thisER.BindThisValue(result).
 * 9. Let F be thisER.[[FunctionObject]].
 * 10. Assert: F is an ECMAScript function object.
 * 11. Perform ? InitializeInstanceElements(result, F).
 * 12. Return result.
 */
function* Evaluation_SuperCall(
  $: VM,
  node: ESTree.CallExpression,
): ECR<Obj> {
  const newTarget = GetNewTarget($);
  Assert(IsFunc(newTarget));
  const func = GetSuperConstructor($);
  const argList = yield* ArgumentListEvaluation($, node.arguments);
  if (IsAbrupt(argList)) return argList;
  if (!IsConstructor(func)) return $.throw('TypeError', 'super is not a constructor');
  const result = yield* Construct($, func, argList, newTarget);
  if (IsAbrupt(result)) return result;
  const thisER = GetThisEnvironment($);
  Assert(thisER instanceof FunctionEnvironmentRecord);
  CastNotAbrupt(thisER.BindThisValue($, result));
  const F = thisER.FunctionObject;
  Assert(IsFunc(F));
  const status = yield* InitializeInstanceElements($, result, F);
  if (IsAbrupt(status)) return status;
  return result;
}

/**
 * 13.3.7.2 GetSuperConstructor ( )
 * 
 * The abstract operation GetSuperConstructor takes no arguments and
 * returns an ECMAScript language value. It performs the following
 * steps when called:
 * 
 * 1. Let envRec be GetThisEnvironment().
 * 2. Assert: envRec is a Function Environment Record.
 * 3. Let activeFunction be envRec.[[FunctionObject]].
 * 4. Assert: activeFunction is an ECMAScript function object.
 * 5. Let superConstructor be ! activeFunction.[[GetPrototypeOf]]().
 * 6. Return superConstructor.
 */
function GetSuperConstructor($: VM): Val {
  const envRec = GetThisEnvironment($);
  Assert(envRec instanceof FunctionEnvironmentRecord);
  const activeFunction = envRec.FunctionObject;
  Assert(IsFunc(activeFunction));
  return CastNotAbrupt(activeFunction.GetPrototypeOf($));
}

/**
 * 13.3.7.3 MakeSuperPropertyReference ( actualThis, propertyKey, strict )
 * 
 * The abstract operation MakeSuperPropertyReference takes arguments
 * actualThis (an ECMAScript language value), propertyKey (a property
 * key), and strict (a Boolean) and returns either a normal completion
 * containing a Super Reference Record or a throw completion. It
 * performs the following steps when called:
 * 
 * 1. Let env be GetThisEnvironment().
 * 2. Assert: env.HasSuperBinding() is true.
 * 3. Let baseValue be ? env.GetSuperBase().
 * 4. Return the Reference Record { [[Base]]: baseValue,
 *    [[ReferencedName]]: propertyKey, [[Strict]]: strict,
 *    [[ThisValue]]: actualThis }.
 */
function MakeSuperPropertyReference(
  $: VM,
  actualThis: Val,
  propertyKey: PropertyKey,
  strict: boolean,
): CR<ReferenceRecord> {
  const env = GetThisEnvironment($);
  Assert(env.HasSuperBinding());
  Assert(env instanceof FunctionEnvironmentRecord);
  const baseValue = env.GetSuperBase($);
  if (IsAbrupt(baseValue)) return baseValue;
  return new ReferenceRecord(baseValue, propertyKey, strict, actualThis);
}

/**
 * 15.7.4 Static Semantics: IsStatic
 * 
 * The syntax-directed operation IsStatic takes no arguments and returns a Boolean. It is defined piecewise over the following productions:
 * 
 * ClassElement : MethodDefinition
 * 1. Return false.
 * ClassElement : static MethodDefinition
 * 1. Return true.
 * ClassElement : FieldDefinition ;
 * 1. Return false.
 * ClassElement : static FieldDefinition ;
 * 1. Return true.
 * ClassElement : ClassStaticBlock
 * 1. Return true.
 * ClassElement : ;
 * 1. Return false.
 */
function IsStatic(element: ClassElement): boolean {
  return element.type === 'StaticBlock' || (element as ESTree.PropertyDefinition).static;
}

/**
 * 15.7.8 Static Semantics: PrivateBoundIdentifiers
 * 
 * The syntax-directed operation PrivateBoundIdentifiers takes no
 * arguments and returns a List of Strings. It is defined piecewise
 * over the following productions:
 * 
 * FieldDefinition : ClassElementName Initializeropt
 * 1. Return PrivateBoundIdentifiers of ClassElementName.
 * 
 * ClassElementName : PrivateIdentifier
 * 1. Return a List whose sole element is the StringValue of PrivateIdentifier.
 * 
 * ClassElementName :
 * PropertyName
 * ClassElement :
 * ClassStaticBlock
 * ;
 * 1. Return a new empty List.
 * 
 * ClassElementList : ClassElementList ClassElement
 * 1. Let names1 be PrivateBoundIdentifiers of ClassElementList.
 * 2. Let names2 be PrivateBoundIdentifiers of ClassElement.
 * 3. Return the list-concatenation of names1 and names2.
 * 
 * MethodDefinition :
 * ClassElementName ( UniqueFormalParameters ) { FunctionBody }
 * get ClassElementName ( ) { FunctionBody }
 * set ClassElementName ( PropertySetParameterList ) { FunctionBody }
 * GeneratorMethod :
 * * ClassElementName ( UniqueFormalParameters ) { GeneratorBody }
 * AsyncMethod :
 * async ClassElementName ( UniqueFormalParameters ) { AsyncFunctionBody }
 * AsyncGeneratorMethod :
 * async * ClassElementName ( UniqueFormalParameters ) { AsyncGeneratorBody }
 * 1. Return PrivateBoundIdentifiers of ClassElementName.
 */
function PrivateBoundIdentifiers(body: ESTree.ClassBody): Set<string> {
  const names = new Set<string>();
  for (const e of body.body) {
    if (e.type === 'StaticBlock') continue;
    if (e.key.type === 'PrivateIdentifier') names.add(e.key.name);
  }
  return names;
}

/**
 * 15.7.10 Runtime Semantics: ClassFieldDefinitionEvaluation
 * 
 * The syntax-directed operation ClassFieldDefinitionEvaluation takes
 * argument homeObject (an Object) and returns either a normal
 * completion containing a ClassFieldDefinition Record or an abrupt
 * completion. It is defined piecewise over the following productions:
 * 
 * FieldDefinition : ClassElementName Initializeropt
 * 1. Let name be ? Evaluation of ClassElementName.
 * 2. If Initializeropt is present, then
 *     a. Let formalParameterList be an instance of the production FormalParameters : [empty] .
 *     b. Let env be the LexicalEnvironment of the running execution context.
 *     c. Let privateEnv be the running execution context's PrivateEnvironment.
 *     d. Let sourceText be the empty sequence of Unicode code points.
 *     e. Let initializer be OrdinaryFunctionCreate(%Function.prototype%, sourceText,
 *        formalParameterList, Initializer, non-lexical-this, env, privateEnv).
 *     f. Perform MakeMethod(initializer, homeObject).
 *     g. Set initializer.[[ClassFieldInitializerName]] to name.
 * 3. Else,
 *     a. Let initializer be empty.
 * 4. Return the ClassFieldDefinition Record { [[Name]]: name, [[Initializer]]: initializer }.
 * 
 * NOTE: The function created for initializer is never directly
 * accessible to ECMAScript code.
 */
function* ClassFieldDefinitionEvaluation(
  $: VM,
  field: ESTree.PropertyDefinition|ESTree.Property,
  homeObject: Obj,
): ECR<ClassFieldDefinitionRecord> {
  const name = yield* EvaluatePropertyKey($, field);
  if (IsAbrupt(name)) return name;
  if (!field.value) return new ClassFieldDefinitionRecord(name, EMPTY);

  const formalParameterList: ESTree.Pattern[] = [];
  const env = $.getRunningContext().LexicalEnvironment;
  Assert(env);
  const privateEnv = $.getRunningContext().PrivateEnvironment;
  const sourceText = '';
  const initializer = OrdinaryFunctionCreate(
    $, $.getIntrinsic('%Function.prototype%'), sourceText, formalParameterList,
    field.value as ESTree.Expression, NON_LEXICAL_THIS, env, privateEnv);
  MakeMethod(initializer, homeObject);
  initializer.ClassFieldInitializerName = name;
  return new ClassFieldDefinitionRecord(name, initializer);
}

/**
 * 15.7.11 Runtime Semantics: ClassStaticBlockDefinitionEvaluation
 * 
 * The syntax-directed operation ClassStaticBlockDefinitionEvaluation
 * takes argument homeObject (an Object) and returns a
 * ClassStaticBlockDefinition Record. It is defined piecewise over the
 * following productions:
 * 
 * ClassStaticBlock : static { ClassStaticBlockBody }
 * 1. Let lex be the running execution context's LexicalEnvironment.
 * 2. Let privateEnv be the running execution context's PrivateEnvironment.
 * 3. Let sourceText be the empty sequence of Unicode code points.
 * 4. Let formalParameters be an instance of the production FormalParameters : [empty] .
 * 5. Let bodyFunction be OrdinaryFunctionCreate(%Function.prototype%,
 *    sourceText, formalParameters, ClassStaticBlockBody,
 *    non-lexical-this, lex, privateEnv).
 * 6. Perform MakeMethod(bodyFunction, homeObject).
 * 7. Return the ClassStaticBlockDefinition Record { [[BodyFunction]]: bodyFunction }.
 * 
 * NOTE: The function bodyFunction is never directly accessible to
 * ECMAScript code.
 */
function* ClassStaticBlockDefinitionEvaluation($: VM, block: ESTree.StaticBlock, homeObject: Obj): ECR<ClassStaticBlockDefinitionRecord> {
  const lex = $.getRunningContext().LexicalEnvironment;
  Assert(lex);
  const privateEnv = $.getRunningContext().PrivateEnvironment;
  const sourceText = '';
  const formalParameters: ESTree.Pattern[] = [];
  const bodyFunction = OrdinaryFunctionCreate(
    $, $.getIntrinsic('%Function.prototype%'), sourceText, formalParameters,
    block, NON_LEXICAL_THIS, lex, privateEnv);
  MakeMethod(bodyFunction, homeObject);



  // TODO - figure out what's going on here...
  //bodyFunction.EvaluateBody = EvaluateClassStaticBlockBody; // ???
  const {} = {EvaluateClassStaticBlockBody};



  return new ClassStaticBlockDefinitionRecord(bodyFunction);
}

/**
 * 15.7.12 Runtime Semantics: EvaluateClassStaticBlockBody
 * 
 * The syntax-directed operation EvaluateClassStaticBlockBody takes
 * argument functionObject (a function object) and returns either a
 * normal completion containing an ECMAScript language value or an
 * abrupt completion. It is defined piecewise over the following
 * productions:
 * 
 * ClassStaticBlockBody : ClassStaticBlockStatementList
 * 1. Perform ? FunctionDeclarationInstantiation(functionObject, « »).
 * 2. Return ? Evaluation of ClassStaticBlockStatementList.
 */
function* EvaluateClassStaticBlockBody($: VM, functionObject: Func, block: ESTree.StaticBlock): ECR<Val|EMPTY> {
  const status = yield* FunctionDeclarationInstantiation($, functionObject, []);
  if (IsAbrupt(status)) return status;
  return yield* Evaluation_BlockLike($, block);
}

/**
 * 15.7.13 Runtime Semantics: ClassElementEvaluation
 * 
 * The syntax-directed operation ClassElementEvaluation takes argument
 * object (an Object) and returns either a normal completion
 * containing either a ClassFieldDefinition Record, a
 * ClassStaticBlockDefinition Record, a PrivateElement, or unused, or
 * an abrupt completion. It is defined piecewise over the following
 * productions:
 * 
 * ClassElement :
 * FieldDefinition ;
 * static FieldDefinition ;
 * 1. Return ? ClassFieldDefinitionEvaluation of FieldDefinition with
 *    argument object.
 * 
 * ClassElement :
 * MethodDefinition
 * static MethodDefinition
 * 1. Return ? MethodDefinitionEvaluation of MethodDefinition with
 *    arguments object and false.
 * 
 * ClassElement : ClassStaticBlock
 * 1. Return ClassStaticBlockDefinitionEvaluation of ClassStaticBlock with argument object.
 * 
 * ClassElement : ;
 * 1. Return unused.
 */
function ClassElementEvaluation(
  $: VM,
  element: ClassElement,
  object: Obj,
): ECR<ClassFieldDefinitionRecord|ClassStaticBlockDefinitionRecord|Val|PrivateElement|UNUSED> {
  switch (element.type) {
    case 'MethodDefinition':
      return MethodDefinitionEvaluation($, element, object, false);
    case 'StaticBlock':
      return ClassStaticBlockDefinitionEvaluation($, element, object);
    case 'PropertyDefinition':
    case 'Property':
      return ClassFieldDefinitionEvaluation($, element, object);
  }
  throw new Error(`unexpected type: ${(element as any).type}`);
}

/**
 * 15.7.14 Runtime Semantics: ClassDefinitionEvaluation
 * 
 * The syntax-directed operation ClassDefinitionEvaluation takes
 * arguments classBinding (a String or undefined) and className (a
 * property key or a Private Name) and returns either a normal
 * completion containing a function object or an abrupt completion.
 * 
 * NOTE: For ease of specification, private methods and accessors are
 * included alongside private fields in the [[PrivateElements]] slot
 * of class instances. However, any given object has either all or
 * none of the private methods and accessors defined by a given
 * class. This feature has been designed so that implementations may
 * choose to implement private methods and accessors using a strategy
 * which does not require tracking each method or accessor
 * individually.
 * 
 * For example, an implementation could directly associate instance
 * private methods with their corresponding Private Name and track,
 * for each object, which class constructors have run with that object
 * as their this value. Looking up an instance private method on an
 * object then consists of checking that the class constructor which
 * defines the method has been used to initialize the object, then
 * returning the method associated with the Private Name.
 * 
 * This differs from private fields: because field initializers can
 * throw during class instantiation, an individual object may have
 * some proper subset of the private fields of a given class, and so
 * private fields must in general be tracked individually.
 * 
 * It is defined piecewise over the following productions:
 * 
 * ClassTail : ClassHeritageopt { ClassBodyopt }
 * 1. Let env be the LexicalEnvironment of the running execution context.
 * 2. Let classEnv be NewDeclarativeEnvironment(env).
 * 3. If classBinding is not undefined, then
 *     a. Perform ! classEnv.CreateImmutableBinding(classBinding, true).
 * 4. Let outerPrivateEnvironment be the running execution context's PrivateEnvironment.
 * 5. Let classPrivateEnvironment be NewPrivateEnvironment(outerPrivateEnvironment).
 * 6. If ClassBodyopt is present, then
 *     a. For each String dn of the PrivateBoundIdentifiers of ClassBodyopt, do
 *         i. If classPrivateEnvironment.[[Names]] contains a Private Name pn
 *            such that pn.[[Description]] is dn, then
 *             1. Assert: This is only possible for getter/setter pairs.
 *         ii. Else,
 *             1. Let name be a new Private Name whose [[Description]] is dn.
 *             2. Append name to classPrivateEnvironment.[[Names]].
 * 7. If ClassHeritageopt is not present, then
 *     a. Let protoParent be %Object.prototype%.
 *     b. Let constructorParent be %Function.prototype%.
 * 8. Else,
 *     a. Set the running execution context's LexicalEnvironment to classEnv.
 *     b. NOTE: The running execution context's PrivateEnvironment is
 *        outerPrivateEnvironment when evaluating ClassHeritage.
 *     c. Let superclassRef be Completion(Evaluation of ClassHeritage).
 *     d. Set the running execution context's LexicalEnvironment to env.
 *     e. Let superclass be ? GetValue(? superclassRef).
 *     f. If superclass is null, then
 *         i. Let protoParent be null.
 *         ii. Let constructorParent be %Function.prototype%.
 *     g. Else if IsConstructor(superclass) is false, throw a TypeError exception.
 *     h. Else,
 *         i. Let protoParent be ? Get(superclass, "prototype").
 *         ii. If protoParent is not an Object and protoParent is not
 *             null, throw a TypeError exception.
 *         iii. Let constructorParent be superclass.
 * 9. Let proto be OrdinaryObjectCreate(protoParent).
 * 10. If ClassBodyopt is not present, let constructor be empty.
 * 11. Else, let constructor be ConstructorMethod of ClassBody.
 * 12. Set the running execution context's LexicalEnvironment to classEnv.
 * 13. Set the running execution context's PrivateEnvironment to classPrivateEnvironment.
 * 14. If constructor is empty, then
 *     a. Let defaultConstructor be a new Abstract Closure with no parameters that
 *        captures nothing and performs the following steps when called:
 *         i. Let args be the List of arguments that was passed to
 *            this function by [[Call]] or [[Construct]].
 *         ii. If NewTarget is undefined, throw a TypeError exception.
 *         iii. Let F be the active function object.
 *         iv. If F.[[ConstructorKind]] is derived, then
 *             1. NOTE: This branch behaves similarly to
 *                constructor(...args) { super(...args); }. The most
 *                notable distinction is that while the aforementioned
 *                ECMAScript source text observably calls the @@iterator
 *                method on %Array.prototype%, this function does not.
 *             2. Let func be ! F.[[GetPrototypeOf]]().
 *             3. If IsConstructor(func) is false, throw a TypeError exception.
 *             4. Let result be ? Construct(func, args, NewTarget).
 *         v. Else,
 *             1. NOTE: This branch behaves similarly to constructor() {}.
 *             2. Let result be ? OrdinaryCreateFromConstructor(NewTarget, "%Object.prototype%").
 *         vi. Perform ? InitializeInstanceElements(result, F).
 *         vii. Return result.
 *     b. Let F be CreateBuiltinFunction(defaultConstructor, 0, className,
 *        « [[ConstructorKind]], [[SourceText]] », the current Realm Record,
 *        constructorParent).
 * 15. Else,
 *     a. Let constructorInfo be ! DefineMethod of constructor with
 *        arguments proto and constructorParent.
 *     b. Let F be constructorInfo.[[Closure]].
 *     c. Perform MakeClassConstructor(F).
 *     d. Perform SetFunctionName(F, className).
 * 16. Perform MakeConstructor(F, false, proto).
 * 17. If ClassHeritageopt is present, set F.[[ConstructorKind]] to derived.
 * 18. Perform CreateMethodProperty(proto, "constructor", F).
 * 19. If ClassBodyopt is not present, let elements be a new empty List.
 * 20. Else, let elements be NonConstructorElements of ClassBody.
 * 21. Let instancePrivateMethods be a new empty List.
 * 22. Let staticPrivateMethods be a new empty List.
 * 23. Let instanceFields be a new empty List.
 * 24. Let staticElements be a new empty List.
 * 25. For each ClassElement e of elements, do
 *     a. If IsStatic of e is false, then
 *         i. Let element be Completion(ClassElementEvaluation of e with argument proto).
 *     b. Else,
 *         i. Let element be Completion(ClassElementEvaluation of e with argument F).
 *     c. If element is an abrupt completion, then
 *         i. Set the running execution context's LexicalEnvironment to env.
 *         ii. Set the running execution context's PrivateEnvironment to outerPrivateEnvironment.
 *         iii. Return ? element.
 *     d. Set element to element.[[Value]].
 *     e. If element is a PrivateElement, then
 *         i. Assert: element.[[Kind]] is either method or accessor.
 *         ii. If IsStatic of e is false, let container be instancePrivateMethods.
 *         iii. Else, let container be staticPrivateMethods.
 *         iv. If container contains a PrivateElement pe such that
 *             pe.[[Key]] is element.[[Key]], then
 *             1. Assert: element.[[Kind]] and pe.[[Kind]] are both accessor.
 *             2. If element.[[Get]] is undefined, then
 *                 a. Let combined be PrivateElement { [[Key]]: element.[[Key]],
 *                    [[Kind]]: accessor, [[Get]]: pe.[[Get]], [[Set]]: element.[[Set]] }.
 *             3. Else,
 *                 a. Let combined be PrivateElement { [[Key]]: element.[[Key]],
 *                    [[Kind]]: accessor, [[Get]]: element.[[Get]], [[Set]]: pe.[[Set]] }.
 *             4. Replace pe in container with combined.
 *         v. Else,
 *             1. Append element to container.
 *     f. Else if element is a ClassFieldDefinition Record, then
 *         i. If IsStatic of e is false, append element to instanceFields.
 *         ii. Else, append element to staticElements.
 *     g. Else if element is a ClassStaticBlockDefinition Record, then
 *         i. Append element to staticElements.
 * 26. Set the running execution context's LexicalEnvironment to env.
 * 27. If classBinding is not undefined, then
 *     a. Perform ! classEnv.InitializeBinding(classBinding, F).
 * 28. Set F.[[PrivateMethods]] to instancePrivateMethods.
 * 29. Set F.[[Fields]] to instanceFields.
 * 30. For each PrivateElement method of staticPrivateMethods, do
 *     a. Perform ! PrivateMethodOrAccessorAdd(F, method).
 * 31. For each element elementRecord of staticElements, do
 *     a. If elementRecord is a ClassFieldDefinition Record, then
 *         i. Let result be Completion(DefineField(F, elementRecord)).
 *     b. Else,
 *         i. Assert: elementRecord is a ClassStaticBlockDefinition Record.
 *         ii. Let result be Completion(Call(elementRecord.[[BodyFunction]], F)).
 *     c. If result is an abrupt completion, then
 *         i. Set the running execution context's PrivateEnvironment
 *            to outerPrivateEnvironment.
 *         ii. Return ? result.
 * 32. Set the running execution context's PrivateEnvironment to outerPrivateEnvironment.
 * 33. Return F.
 */
export function* ClassDefinitionEvaluation(
  $: VM,
  classBinding: string|undefined,
  className: string,
  heritage: ESTree.Expression|null|undefined,
  body: ESTree.ClassBody|undefined,
): ECR<Func> {
  const ec = $.getRunningContext();
  const env = ec.LexicalEnvironment;
  const classEnv = new DeclarativeEnvironmentRecord(env ?? null);
  if (classBinding) {
    CastNotAbrupt(classEnv.CreateImmutableBinding($, classBinding, true));
  }
  const outerPrivateEnvironment = $.getRunningContext().PrivateEnvironment;
  const classPrivateEnvironment = new PrivateEnvironmentRecord(outerPrivateEnvironment);
  if (body) {
    for (const dn of PrivateBoundIdentifiers(body)) {
      const name = new PrivateName(dn);
      classPrivateEnvironment.Names.set(dn, name);
    }
  }

  let protoParent: Obj|null = $.getIntrinsic('%Object.prototype%');
  let constructorParent: Obj = $.getIntrinsic('%Function.prototype%');
  if (heritage) {
    ec.LexicalEnvironment = classEnv;
    // NOTE: The running execution context's PrivateEnvironment is
    // outerPrivateEnvironment when evaluating ClassHeritage.
    const superclassRef = yield* $.Evaluation(heritage);
    ec.LexicalEnvironment = env;
    if (IsAbrupt(superclassRef)) return superclassRef;
    Assert(!EMPTY.is(superclassRef));
    const superclass = yield* GetValue($, superclassRef);
    if (IsAbrupt(superclass)) return superclass;
    if (superclass === null) {
      protoParent = null;
      constructorParent = $.getIntrinsic('%Function.prototype%');
    } else if (IsConstructor(superclass)) {
      const proto = yield* Get($, superclass, 'prototype');
      if (IsAbrupt(proto)) return proto;
      if (!(proto instanceof Obj)) {
        return $.throw('TypeError', 'Invalid prototype');
      }
      protoParent = proto;
      constructorParent = superclass;
    } else {
      return $.throw(
        'TypeError',
        `Class extends value ${DebugString(superclass)} is not a constructor or null`);
    }
  }
  const proto = OrdinaryObjectCreate({
    Prototype: protoParent,
  });
  const constructor = body && body.body.find(e => e.type === 'MethodDefinition' && e.kind === 'constructor');
  ec.LexicalEnvironment = classEnv;
  ec.PrivateEnvironment = classPrivateEnvironment;

  // 14.
  let F: Func;
  if (!constructor) {
    F = CreateBuiltinFunction(
      {
        *Construct($, args, newTarget) {
          if (newTarget === undefined) {
            return $.throw('TypeError', 'NewTarget is undefined');
          }
          const F = $.getActiveFunctionObject()!;
          Assert(IsFunc(newTarget));
          let result: CR<Obj>;
          if (DERIVED.is(F.ConstructorKind)) {
            const func = CastNotAbrupt(F.GetPrototypeOf($));
            if (!IsConstructor(func)) {
              return $.throw('TypeError', 'Invalid constructor');
            }
            result = yield* Construct($, func, args, newTarget);
          } else {
            result = yield* OrdinaryCreateFromConstructor($, newTarget, '%Object.prototype%');
          }
          if (IsAbrupt(result)) return result;
          const status = yield* InitializeInstanceElements($, result, F);
          if (IsAbrupt(status)) return status;
          return result;
        },
      }, 0, className, $.getRealm()!, constructorParent);
  } else {
    const constructorInfo =
      CastNotAbrupt(
        yield* DefineMethod($, constructor as ESTree.MethodDefinition, proto, constructorParent));
    F = constructorInfo.Closure;
    MakeClassConstructor(F);
    SetFunctionName(F, className);
  }
  MakeConstructor($, F, false, proto);
  F.ConstructorKind = heritage ? DERIVED : BASE;
  // 19.
  const instancePrivateMethods = new Map<PrivateName, PrivateElement>();
  const staticPrivateMethods = new Map<PrivateName, PrivateElement>();
  const instanceFields: ClassFieldDefinitionRecord[] = [];
  const staticElements: Array<ClassFieldDefinitionRecord|ClassStaticBlockDefinitionRecord> = [];
  // 25.
  for (const e of body?.body || []) {
    let abrupt: CR<undefined>;
    let element: CR<unknown>;
    if (e.type === 'MethodDefinition' && e.kind === 'constructor') continue;
    if (IsStatic(e)) {
      element = yield* ClassElementEvaluation($, e, F);
    } else {
      element = yield* ClassElementEvaluation($, e, proto);
    }
    if (IsAbrupt(element)) {
      abrupt = element;
    } else if (IsPrivateElement(element)) {
      Assert(METHOD.is(element.Kind) || ACCESSOR.is(element.Kind));
      const container = IsStatic(e) ? staticPrivateMethods : instancePrivateMethods;
      const prev = container.get(element.Key);
      if (prev) {
        if (
          !IsPrivateElementAccessor(prev)
            || !IsPrivateElementAccessor(element)
            || element.Get && prev.Get
            || element.Set && prev.Set
        ) {
          abrupt = $.throw('SyntaxError',
                           `Identifier '${element.Key}' has already been declared`);
        } else {
          const combined = {
            Key: element.Key,
            Kind: ACCESSOR,
            Get: element.Get ?? prev.Get,
            Set: element.Set ?? prev.Set,
          };
          container.set(element.Key, combined);
        }
      } else {
        container.set(element.Key, element);
      }
    } else if (element instanceof ClassFieldDefinitionRecord) {
      (IsStatic(e) ? staticElements : instanceFields).push(element);
    } else if (element instanceof ClassStaticBlockDefinitionRecord) {
      staticElements.push(element);
    } else {
      Assert(UNUSED.is(element));
    }
    if (abrupt) {
      ec.LexicalEnvironment = env;
      ec.PrivateEnvironment = outerPrivateEnvironment;
      return abrupt;
    }
  }
  ec.LexicalEnvironment = env;
  if (classBinding) CastNotAbrupt(yield* classEnv.InitializeBinding($, classBinding, F));
  F.PrivateMethods = instancePrivateMethods;
  F.Fields = instanceFields;
  for (const method of staticPrivateMethods.values()) {
    CastNotAbrupt(PrivateMethodOrAccessorAdd($, F, method));
  }
  for (const elementRecord of staticElements) {
    let result: CR<unknown>;
    if (elementRecord instanceof ClassFieldDefinitionRecord) {
      result = yield* DefineField($, F, elementRecord);
    } else {
      result = yield* Call($, elementRecord.BodyFunction, F);
    }
    if (IsAbrupt(result)) {
      ec.PrivateEnvironment = outerPrivateEnvironment;
      return result;
    }
  }
  ec.PrivateEnvironment = outerPrivateEnvironment;
  return F;
}

/**
 * 15.7.15 Runtime Semantics: BindingClassDeclarationEvaluation
 * 
 * The syntax-directed operation BindingClassDeclarationEvaluation
 * takes no arguments and returns either a normal completion
 * containing a function object or an abrupt completion. It is defined
 * piecewise over the following productions:
 * 
 * ClassDeclaration : class BindingIdentifier ClassTail
 * 1. Let className be StringValue of BindingIdentifier.
 * 2. Let value be ? ClassDefinitionEvaluation of ClassTail with arguments className
 *    and className.
 * 3. Set value.[[SourceText]] to the source text matched by ClassDeclaration.
 * 4. Let env be the running execution context's LexicalEnvironment.
 * 5. Perform ? InitializeBoundName(className, value, env).
 * 6. Return value.
 * 
 * ClassDeclaration : class ClassTail
 * 1. Let value be ? ClassDefinitionEvaluation of ClassTail with arguments undefined
 *    and "default".
 * 2. Set value.[[SourceText]] to the source text matched by ClassDeclaration.
 * 3. Return value.
 * 
 * NOTE: ClassDeclaration : class ClassTail only occurs as part of an
 * ExportDeclaration and establishing its binding is handled as part
 * of the evaluation action for that production. See 16.2.3.7.
 */
export function* BindingClassDeclarationEvaluation(
  $: VM,
  node: ESTree.ClassDeclaration,
): ECR<Func> {
  const classBinding = node.id?.name;
  const className = classBinding ?? 'default';
  const value = yield* ClassDefinitionEvaluation(
    $, classBinding, className, node.superClass, node.body);
  if (IsAbrupt(value)) return value;
  value.SourceText = GetSourceText(node);
  if (classBinding != null) {
    const env = $.getRunningContext().LexicalEnvironment!;
    CastNotAbrupt(yield* InitializeBoundName($, className, value, env));
  }
  return value;
}

/**
 * 15.7.16 Runtime Semantics: Evaluation
 * 
 * ClassDeclaration : class BindingIdentifier ClassTail
 * 1. Perform ? BindingClassDeclarationEvaluation of this ClassDeclaration.
 * 2. Return empty.
 * 
 * NOTE: ClassDeclaration : class ClassTail only occurs as part of an
 * ExportDeclaration and is never directly evaluated.
 * 
 * ClassExpression : class ClassTail
 * 1. Let value be ? ClassDefinitionEvaluation of ClassTail with arguments undefined and "".
 * 2. Set value.[[SourceText]] to the source text matched by ClassExpression.
 * 3. Return value.
 * 
 * ClassExpression : class BindingIdentifier ClassTail
 * 1. Let className be StringValue of BindingIdentifier.
 * 2. Let value be ? ClassDefinitionEvaluation of ClassTail with
 *    arguments className and className.
 * 3. Set value.[[SourceText]] to the source text matched by ClassExpression.
 * 4. Return value.
 * 
 * ClassElementName : PrivateIdentifier
 * 1. Let privateIdentifier be StringValue of PrivateIdentifier.
 * 2. Let privateEnvRec be the running execution context's PrivateEnvironment.
 * 3. Let names be privateEnvRec.[[Names]].
 * 4. Assert: Exactly one element of names is a Private Name whose
 *    [[Description]] is privateIdentifier.
 * 5. Let privateName be the Private Name in names whose [[Description]] is
 *    privateIdentifier.
 * 6. Return privateName.
 * 
 * ClassStaticBlockStatementList : [empty]
 * 1. Return undefined.
 */
export function* Evaluation_ClassExpression(
  $: VM,
  node: ESTree.ClassExpression|ESTree.ClassDeclaration,
): ECR<Func|EMPTY> {
  if (node.type === 'ClassDeclaration') {
    const status = yield* BindingClassDeclarationEvaluation($, node);
    if (IsAbrupt(status)) return status;
    return EMPTY;
  }
  const classBinding = node.id?.name;
  const className = classBinding ?? '';
  const value = yield* ClassDefinitionEvaluation(
    $, classBinding, className, node.superClass, node.body);
  if (IsAbrupt(value)) return value;
  value.SourceText = GetSourceText(node);
  return value;
}
