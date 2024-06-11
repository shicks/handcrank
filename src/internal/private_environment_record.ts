import { ACCESSOR, FIELD, METHOD } from "./enums";
import { Func } from "./func";
import { Val } from "./val";

/**
 * 6.2.12 Private Names
 * 
 * The Private Name specification type is used to describe a globally
 * unique value (one which differs from any other Private Name, even
 * if they are otherwise indistinguishable) which represents the key
 * of a private class element (field, method, or accessor). Each
 * Private Name has an associated immutable [[Description]] which is a
 * String value. A Private Name may be installed on any ECMAScript
 * object with PrivateFieldAdd or PrivateMethodOrAccessorAdd, and then
 * read or written using PrivateGet and PrivateSet.
 */
declare const PRIVATE_NAME_BRAND: unique symbol;
export class PrivateName {
  declare [PRIVATE_NAME_BRAND]: never;
  constructor(readonly Description: string) {}
}

/**
 * 6.2.10 The PrivateElement Specification Type
 * 
 * The PrivateElement type is a Record used in the specification of
 * private class fields, methods, and accessors. Although Property
 * Descriptors are not used for private elements, private fields behave
 * similarly to non-configurable, non-enumerable, writable data
 * properties, private methods behave similarly to non-configurable,
 * non-enumerable, non-writable data properties, and private accessors
 * behave similarly to non-configurable, non-enumerable accessor
 * properties.
 * 
 * Values of the PrivateElement type are Record values whose fields
 * are defined by Table 9. Such values are referred to as
 * PrivateElements.
 * 
 * [[Key]] (All kinds), a Private Name - The name of the field, method, or accessor.
 * [[Kind]] (All kinds), field, method, or accessor - The kind of the element.
 * [[Value]] (field and method), an ECMAScript language value - The value of the field.
 * [[Get]] (accessor), a function object or undefined - The getter for a private accessor.
 * [[Set]] (accessor), a function object or undefined - The setter for a private accessor.
 */
export type PrivateElement = PrivateElementField | PrivateElementMethod | PrivateElementAccessor;

interface PrivateElementBase {
  Key: PrivateName;
  Kind: FIELD|METHOD|ACCESSOR;
}

interface PrivateElementField extends PrivateElementBase {
  Kind: FIELD;
  Value: Val;
}

interface PrivateElementMethod extends PrivateElementBase {
  Kind: METHOD;
  Value: Func;
}

interface PrivateElementAccessor extends PrivateElementBase {
  Kind: ACCESSOR;
  Get: Func|undefined;
  Set: Func|undefined;
}

export function IsPrivateElement(x: unknown): x is PrivateElement {
  return privateElementKinds.has((x as PrivateElement).Kind);
}
const privateElementKinds: Set<unknown> = new Set([FIELD, METHOD, ACCESSOR]);

export function IsPrivateElementAccessor(x: PrivateElement): x is PrivateElementAccessor {
  return ACCESSOR.is(x.Kind);
}
export function IsPrivateElementField(x: PrivateElement): x is PrivateElementField {
  return FIELD.is(x.Kind);
}
export function IsPrivateElementMethod(x: PrivateElement): x is PrivateElementMethod {
  return METHOD.is(x.Kind);
}

/**
 * 9.2 PrivateEnvironment Records
 * 
 * A PrivateEnvironment Record is a specification mechanism used to
 * track Private Names based upon the lexical nesting structure of
 * ClassDeclarations and ClassExpressions in ECMAScript code. They are
 * similar to, but distinct from, Environment Records. Each
 * PrivateEnvironment Record is associated with a ClassDeclaration or
 * ClassExpression. Each time such a class is evaluated, a new
 * PrivateEnvironment Record is created to record the Private Names
 * declared by that class.
 * 
 * Each PrivateEnvironment Record has the fields defined in Table 23.
 * 
 * [[OuterPrivateEnvironment]], a PrivateEnvironment Record or null -
 * The PrivateEnvironment Record of the nearest containing class. null
 * if the class with which this PrivateEnvironment Record is
 * associated is not contained in any other class.
 * [[Names]], a List of Private Names - The Private Names declared by
 * this class.
 */
export class PrivateEnvironmentRecord {

  readonly Names = new Map<string, PrivateName>();

  constructor(readonly OuterPrivateEnvironment: PrivateEnvironmentRecord|null) {}
}

/**
 * 9.2.1 PrivateEnvironment Record Operations
 *
 * The following abstract operations are used in this specification to
 * operate upon PrivateEnvironment Records:
 *
 * 9.2.1.2 ResolvePrivateIdentifier ( privEnv, identifier )
 * 
 * The abstract operation ResolvePrivateIdentifier takes arguments
 * privEnv (a PrivateEnvironment Record) and identifier (a String) and
 * returns a Private Name. It performs the following steps when
 * called:
 * 
 * 1. Let names be privEnv.[[Names]].
 * 2. For each Private Name pn of names, do
 *     a. If pn.[[Description]] is identifier, then
 *         i. Return pn.
 * 3. Let outerPrivEnv be privEnv.[[OuterPrivateEnvironment]].
 * 4. Assert: outerPrivEnv is not null.
 * 5. Return ResolvePrivateIdentifier(outerPrivEnv, identifier).
 */
export function ResolvePrivateIdentifier(
  privEnv: PrivateEnvironmentRecord,
  identifier: string,
): PrivateName {
  return privEnv.Names.get(identifier) ||
    ResolvePrivateIdentifier(privEnv.OuterPrivateEnvironment!, identifier);
}
