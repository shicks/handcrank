import { BIGINT, BOOLEAN, NULL, NUMBER, OBJECT, STRING, SYMBOL, UNDEFINED } from './enums';
import { Obj } from './obj_base';

/**
 * 6.1 ECMAScript Language Types
 *
 * An ECMAScript language type corresponds to values that are directly
 * manipulated by an ECMAScript programmer using the ECMAScript
 * language. The ECMAScript language types are Undefined, Null,
 * Boolean, String, Symbol, Number, BigInt, and Object. An ECMAScript
 * language value is a value that is characterized by an ECMAScript
 * language type.
 */

export type Prim = undefined|null|boolean|string|symbol|number|bigint;
export type Val = Prim|Obj;

export type Type = UNDEFINED|NULL|BOOLEAN|STRING|SYMBOL|NUMBER|BIGINT|OBJECT;
export function Type(v: Val): Type {
  switch (typeof v) {
    case 'undefined': return UNDEFINED;
    case 'boolean': return BOOLEAN;
    case 'string': return STRING;
    case 'symbol': return SYMBOL;
    case 'number': return NUMBER;
    case 'bigint': return BIGINT;
    case 'object':
      if (!v) return NULL;
      // fall-through
    case 'function': // TODO - is this even possible?
      return OBJECT;
  }
}

// class Primitive<in out T extends PrimitiveType> {
//   constructor(readonly Value: T) {}
// }
// type PrimitiveType = undefined|null|boolean|string|number|bigint|Sym;
// type Box<T extends PrimitiveType> = T extends symbol ? Sym : T;
// type Unbox<T extends Prim> = T extends Sym ? symbol : T;

export type PropertyKey = string|symbol;







// // Basic function
// export abstract class Func extends Obj {
//   /**
//    * [[Environment]], an Environment Record - The Environment Record
//    * that the function was closed over. Used as the outer environment
//    * when evaluating the code of the function.
//    */
//   abstract Environment: EnvironmentRecord;

//   /**
//    * [[PrivateEnvironment]], a PrivateEnvironment Record or null - The
//    * PrivateEnvironment Record for Private Names that the function was
//    * closed over. null if this function is not syntactically contained
//    * within a class. Used as the outer PrivateEnvironment for inner
//    * classes when evaluating the code of the function.
//    */
//   abstract PrivateEnvironment: PrivateEnvironmentRecord;

//   /**
//    * [[FormalParameters]], a Parse Node - The root parse node of the
//    * source text that defines the function's formal parameter list.
//    */
//   abstract FormalParameters: ESTree.Pattern[];

//   /**
//    * [[ECMAScriptCode]], a Parse Node - The root parse node of the
//    * source text that defines the function's body.
//    */
//   abstract ECMAScriptCode: ESTree.BlockStatement|ESTree.Expression;

//   /**
//    * [[ConstructorKind]], base or derived - Whether or not the function
//    * is a derived class constructor.
//    */
//   abstract ConstructorKind: BASE|DERIVED;

//   /**
//    * [[Realm]], a Realm Record - The realm in which the function was
//    * created and which provides any intrinsic objects that are accessed
//    * when evaluating the function.
//    */
//   abstract Realm: RealmRecord;

//   /**
//    * [[ScriptOrModule]], a Script Record or a Module Record - The script
//    * or module in which the function was created.
//    */
//   abstract ScriptOrModule: ScriptRecord|ModuleRecord;

//   /**
//    * [[ThisMode]], lexical, strict, or global - Defines how this
//    * references are interpreted within the formal parameters and code
//    * body of the function. lexical means that this refers to the this
//    * value of a lexically enclosing function. strict means that the this
//    * value is used exactly as provided by an invocation of the
//    * function. global means that a this value of undefined or null is
//    * interpreted as a reference to the global object, and any other this
//    * value is first passed to ToObject.
//    */
//   abstract ThisMode: LEXICAL|STRICT|GLOBAL;

//   /**
//    * [[Strict]], a Boolean - true if this is a strict function, false if
//    * this is a non-strict function.
//    */
//   abstract Strict: boolean;

//   /**
//    * [[HomeObject]], an Object - If the function uses super, this is the
//    * object whose [[GetPrototypeOf]] provides the object where super
//    * property lookups begin.
//    */
//   abstract HomeObject: Obj|undefined; // |undefined?

//   /**
//    * [[SourceText]], a sequence of Unicode code points - The source text
//    * that defines the function.
//    */
//   abstract SourceText: string;

//   /**
//    * [[Fields]], a List of ClassFieldDefinition Records - If the
//    * function is a class, this is a list of Records representing the
//    * non-static fields and corresponding initializers of the class.
//    */
//   abstract Fields: ClassFieldDefinitionRecord[]; // TODO - Map?

//   /**
//    * [[PrivateMethods]], a List of PrivateElements - If the function is
//    * a class, this is a list representing the non-static private methods
//    * and accessors of the class.
//    */
//   abstract PrivateMethods: PrivateElement[]; // TODO - Map?

//   /**
//    * [[ClassFieldInitializerName]], a String, a Symbol, a Private Name,
//    * or empty - If the function is created as the initializer of a class
//    * field, the name to use for NamedEvaluation of the field; empty
//    * otherwise.
//    */
//   abstract ClassFieldInitializerName: string|symbol|PrivateName|EMPTY;

//   /**
//    * [[IsClassConstructor]], a Boolean - Indicates whether the function
//    * is a class constructor. (If true, invoking the function's [[Call]]
//    * will immediately throw a TypeError exception.)
//    */
//   abstract IsClassConstructor: boolean;
  
//   abstract Call($: VM, thisArgument: Val, argumentsList: Val[]): CR<Val>;
//   abstract Construct($: VM, argumentsList: Val[], newTarget: Obj): CR<Obj>;
// }

// export class OrdinaryFunction extends Func {
//   override Environment: EnvironmentRecord;
//   override PrivateEnvironment: PrivateEnvironmentRecord;
//   override FormalParameters: ESTree.Pattern[];
//   override ECMAScriptCode: ESTree.BlockStatement|ESTree.Expression;
//   override ConstructorKind: BASE|DERIVED;
//   override Realm: RealmRecord;
//   override ScriptOrModule: ScriptRecord|ModuleRecord;
//   override ThisMode: LEXICAL|STRICT|GLOBAL;
//   override Strict: boolean;
//   override HomeObject: Obj|undefined = undefined;
//   override SourceText: string;
//   override Fields: ClassFieldDefinitionRecord[]; // TODO - Map?
//   override PrivateMethods: PrivateElement[]; // TODO - Map?
//   override ClassFieldInitializerName: string|symbol|PrivateName|EMPTY;
//   override IsClassConstructor: boolean = false;

//   // (from OrdinaryObjectCreate)
//   override Prototype: Obj;
//   override Extensible = true;
//   override OwnProps = new Map<PropertyKey, PropertyDescriptor>();

  // constructor(functionPrototype: Obj,
  //             sourceText: string,
  //             ParameterList: ESTree.Pattern[],
  //             Body: Node,
  //             thisMode: LEXICAL_THIS|NON_LEXICAL_THIS,
  //             env: EnvironmentRecord,
  //             privateEnv: PrivateEnvironmentRecord|null,
  //            ) {
  //   super();
  //   this.Prototype = functionPrototype;
  //   this.SourceText = sourceText;
  //   this.FormalParameters = ParameterList;
  //   this.ECMAScriptCode = Body;
  //   if (IsStrictMode(Body)) {
  //     // TODO - can we recurse through in the post-parse step to do this?
  //     //  - does it belong somewhere else?
  //   }
  // }
