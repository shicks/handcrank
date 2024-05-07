import { Assert } from './assert';
import { CR, IsAbrupt, Throw } from './completion_record';
import { Obj, Val } from './values';
import { EMPTY, UNUSED } from './enums';
import { VM } from './vm';
import { RecordFor, makeRecord } from './record';

declare const HasProperty: any;
declare const Get: any;
declare const Set: any;
declare const ToBoolean: any;
declare const DefinePropertyOrThrow: any;
declare const PropertyDescriptor: any;

/**
 * 6.2.7 The Environment Record Specification Type
 *
 * The Environment Record type is used to explain the behaviour of
 * name resolution in nested functions and blocks. This type and the
 * operations upon it are defined in 9.1.
 *
 * ---
 *
 * 9.1 Environment Records
 *
 * Environment Record is a specification type used to define the
 * association of Identifiers to specific variables and functions,
 * based upon the lexical nesting structure of ECMAScript
 * code. Usually an Environment Record is associated with some
 * specific syntactic structure of ECMAScript code such as a
 * FunctionDeclaration, a BlockStatement, or a Catch clause of a
 * TryStatement. Each time such code is evaluated, a new Environment
 * Record is created to record the identifier bindings that are
 * created by that code.
 *
 * Every Environment Record has an [[OuterEnv]] field, which is either
 * null or a reference to an outer Environment Record. This is used to
 * model the logical nesting of Environment Record values. The outer
 * reference of an (inner) Environment Record is a reference to the
 * Environment Record that logically surrounds the inner Environment
 * Record. An outer Environment Record may, of course, have its own
 * outer Environment Record. An Environment Record may serve as the
 * outer environment for multiple inner Environment Records. For
 * example, if a FunctionDeclaration contains two nested
 * FunctionDeclarations then the Environment Records of each of the
 * nested functions will have as their outer Environment Record the
 * Environment Record of the current evaluation of the surrounding
 * function.
 *
 * Environment Records are purely specification mechanisms and need
 * not correspond to any specific artefact of an ECMAScript
 * implementation. It is impossible for an ECMAScript program to
 * directly access or manipulate such values.
 *
 * 9.1.1 The Environment Record Type Hierarchy
 *
 * Environment Records can be thought of as existing in a simple
 * object-oriented hierarchy where Environment Record is an abstract
 * class with three concrete subclasses: Declarative Environment
 * Record, Object Environment Record, and Global Environment
 * Record. Function Environment Records and Module Environment Records
 * are subclasses of Declarative Environment Record.
 */
export abstract class EnvironmentRecord {
  // TODO - root node?
  // TODO - something for stack trace?
  abstract readonly OuterEnv: EnvironmentRecord|null;
  /**
   * HasBinding(N) - Determine if an Environment Record has a binding
   * for the String value N. Return true if it does and false if it
   * does not.
   */
  abstract HasBinding($: VM, N: string): CR<boolean>;
  /**
   * CreateMutableBinding(N, D) - Create a new but uninitialized
   * mutable binding in an Environment Record. The String value N is
   * the text of the bound name. If the Boolean argument D is true the
   * binding may be subsequently deleted.
   */
  abstract CreateMutableBinding($: VM, N: string, D: boolean): CR<UNUSED>;
  /**
   * CreateImmutableBinding(N, S) - Create a new but uninitialized
   * immutable binding in an Environment Record. The String value N is
   * the text of the bound name. If S is true then attempts to set it
   * after it has been initialized will always throw an exception,
   * regardless of the strict mode setting of operations that
   * reference that binding.
   */
  abstract CreateImmutableBinding($: VM, N: string, S: boolean): CR<UNUSED>;
  /**
   * InitializeBinding(N, V) - Set the value of an already existing
   * but uninitialized binding in an Environment Record. The String
   * value N is the text of the bound name. V is the value for the
   * binding and is a value of any ECMAScript language type.
   */
  abstract InitializeBinding($: VM, N: string, V: Val): CR<UNUSED>;
  /**
   * SetMutableBinding(N, V, S) - Set the value of an already existing
   * mutable binding in an Environment Record. The String value N is
   * the text of the bound name. V is the value for the binding and
   * may be a value of any ECMAScript language type. S is a Boolean
   * flag. If S is true and the binding cannot be set throw a
   * TypeError exception.
   */
  abstract SetMutableBinding($: VM, N: string, V: Val, S: boolean): CR<UNUSED>;
  /**
   * GetBindingValue(N, S) - Returns the value of an already existing
   * binding from an Environment Record. The String value N is the
   * text of the bound name. S is used to identify references
   * originating in strict mode code or that otherwise require strict
   * mode reference semantics. If S is true and the binding does not
   * exist throw a ReferenceError exception. If the binding exists but
   * is uninitialized a ReferenceError is thrown, regardless of the
   * value of S.
   */
  abstract GetBindingValue($: VM, N: string, S: boolean): CR<Val>;
  /**
   * DeleteBinding(N) - Delete a binding from an Environment
   * Record. The String value N is the text of the bound name. If a
   * binding for N exists, remove the binding and return true. If the
   * binding exists but cannot be removed return false. If the binding
   * does not exist return true.
   */
  abstract DeleteBinding($: VM, N: string): CR<boolean>;
  /**
   * HasThisBinding() - Determine if an Environment Record establishes
   * a this binding. Return true if it does and false if it does not.
   */
  abstract HasThisBinding($: VM): CR<boolean>;
  /**
   * HasSuperBinding() - Determine if an Environment Record
   * establishes a super method binding. Return true if it does and
   * false if it does not.
   */
  abstract HasSuperBinding($: VM): CR<boolean>;
  /**
   * WithBaseObject() - If this Environment Record is associated with
   * a with statement, return the with object. Otherwise, return
   * undefined.
   */
  abstract WithBaseObject($: VM): CR<Obj|undefined>;
}

// NOTE: There is no concrete specification for what a binding should
// actually look like.
interface Binding extends RecordFor<{
  Value: Val|EMPTY;
  Mutable: boolean;
  Deletable: boolean;
  Strict: boolean;
}> {}
const Binding = makeRecord<Binding>('Binding');

/**
 * 9.1.1.1 Declarative Environment Records
 *
 * Each Declarative Environment Record is associated with an
 * ECMAScript program scope containing variable, constant, let, class,
 * module, import, and/or function declarations. A Declarative
 * Environment Record binds the set of identifiers defined by the
 * declarations contained within its scope.
 *
 * The behaviour of the concrete specification methods for Declarative
 * Environment Records is defined by the following algorithms.
 */
export class DeclarativeEnvironmentRecord extends EnvironmentRecord {
  private readonly bindings = new Map<string, Binding>;

  constructor(readonly OuterEnv: EnvironmentRecord|null) { super(); }

  /**
   * 9.1.1.1.1 HasBinding ( N )
   *
   * The HasBinding concrete method of a Declarative Environment
   * Record envRec takes argument N (a String) and returns a normal
   * completion containing a Boolean. It determines if the argument
   * identifier is one of the identifiers bound by the record. It
   * performs the following steps when called:
   */
  override HasBinding(_$: VM, N: string): CR<boolean> {
    return this.bindings.has(N);
  }

  /**
   * 9.1.1.1.2 CreateMutableBinding ( N, D )
   *
   * The CreateMutableBinding concrete method of a Declarative
   * Environment Record envRec takes arguments N (a String) and D (a
   * Boolean) and returns a normal completion containing unused. It
   * creates a new mutable binding for the name N that is
   * uninitialized. A binding must not already exist in this
   * Environment Record for N. If D is true, the new binding is marked
   * as being subject to deletion. It performs the following steps
   * when called:
   */
  override CreateMutableBinding(_$: VM, N: string, D: boolean): CR<UNUSED> {
    Assert(!this.bindings.has(N));
    const binding = Binding({
      Value: EMPTY,
      Mutable: true,
      Deletable: D,
      Strict: false,
    });
    this.bindings.set(N, binding);
    return UNUSED;
  }

  /**
   * 9.1.1.1.3 CreateImmutableBinding ( N, S )
   *
   * The CreateImmutableBinding concrete method of a Declarative
   * Environment Record envRec takes arguments N (a String) and S (a
   * Boolean) and returns a normal completion containing unused. It
   * creates a new immutable binding for the name N that is
   * uninitialized. A binding must not already exist in this
   * Environment Record for N. If S is true, the new binding is marked
   * as a strict binding. It performs the following steps when called:
   */
  override CreateImmutableBinding(_$: VM, N: string, S: boolean): CR<UNUSED> {
    Assert(!this.bindings.has(N));
    const binding = Binding({
      Value: EMPTY,
      Mutable: false,
      Deletable: false,
      Strict: S,
    });
    this.bindings.set(N, binding);
    return UNUSED;
  }

  /**
   * 9.1.1.1.4 InitializeBinding ( N, V )
   *
   * The InitializeBinding concrete method of a Declarative
   * Environment Record envRec takes arguments N (a String) and V (an
   * ECMAScript language value) and returns a normal completion
   * containing unused. It is used to set the bound value of the
   * current binding of the identifier whose name is N to the value
   * V. An uninitialized binding for N must already exist. It performs
   * the following steps when called:
   */
  override InitializeBinding(_$: VM, N: string, V: Val): CR<UNUSED> {
    Assert(this.bindings.has(N));
    const binding = this.bindings.get(N)!;
    Assert(binding.Value == null);
    binding.Value = V;
    return UNUSED;
  }

  /**
   * 9.1.1.1.5 SetMutableBinding ( N, V, S )
   *
   * The SetMutableBinding concrete method of a Declarative
   * Environment Record envRec takes arguments N (a String), V (an
   * ECMAScript language value), and S (a Boolean) and returns either
   * a normal completion containing unused or a throw completion. It
   * attempts to change the bound value of the current binding of the
   * identifier whose name is N to the value V. A binding for N
   * normally already exists, but in rare cases it may not. If the
   * binding is an immutable binding, a TypeError is thrown if S is
   * true. It performs the following steps when called:
   */
  override SetMutableBinding($: VM, N: string, V: Val, S: boolean): CR<UNUSED> {
    if (!this.bindings.has(N)) {
      if (S) return Throw('ReferenceError');
      Assert(!IsAbrupt(this.CreateMutableBinding($, N, true)));
      Assert(!IsAbrupt(this.InitializeBinding($, N, V)));
      return UNUSED;
    }

    const binding = this.bindings.get(N)!;
    S ||= binding.Strict;
    if (binding.Value == null) return Throw('ReferenceError');
    if (binding.Mutable) {
      binding!.Value = V;
      return UNUSED;
    }
    // Assert: Attempt to change value of an immutable binding
    if (S) return Throw('TypeError');
    return UNUSED;
  }

  /**
   * 9.1.1.1.6 GetBindingValue ( N, S )
   *
   * The GetBindingValue concrete method of a Declarative Environment
   * Record envRec takes arguments N (a String) and S (a Boolean) and
   * returns either a normal completion containing an ECMAScript
   * language value or a throw completion. It returns the value of its
   * bound identifier whose name is N. If the binding exists but is
   * uninitialized a ReferenceError is thrown, regardless of the value
   * of S. It performs the following steps when called:
   */
  override GetBindingValue(_$: VM, N: string, _S: boolean): CR<Val> {
    Assert(this.bindings.has(N));
    const binding = this.bindings.get(N)!;
    if (binding.Value == undefined) return Throw('ReferenceError', '');
    return binding.Value;
  }

  /**
   * 9.1.1.1.7 DeleteBinding ( N )
   *
   * The DeleteBinding concrete method of a Declarative Environment
   * Record envRec takes argument N (a String) and returns a normal
   * completion containing a Boolean. It can only delete bindings that
   * have been explicitly designated as being subject to deletion. It
   * performs the following steps when called:
   */
  override DeleteBinding(_$: VM, N: string): CR<boolean> {
    Assert(this.bindings.has(N));
    const binding = this.bindings.get(N)!;
    if (!binding.Deletable) return false;
    this.bindings.delete(N);
    return true;
  }

  /**
   * 9.1.1.1.8 HasThisBinding ( )
   *
   * The HasThisBinding concrete method of a Declarative Environment
   * Record envRec takes no arguments and returns false. It performs
   * the following steps when called:
   */
  override HasThisBinding(_$: VM): CR<boolean> {
    return false;
  }

  /**
   * 9.1.1.1.9 HasSuperBinding ( )
   *
   * The HasSuperBinding concrete method of a Declarative Environment
   * Record envRec takes no arguments and returns false. It performs
   * the following steps when called:
   */
  override HasSuperBinding(_$: VM): CR<boolean> {
    return false;
  }

  /**
   * 9.1.1.1.10 WithBaseObject ( )
   *
   * The WithBaseObject concrete method of a Declarative Environment
   * Record envRec takes no arguments and returns undefined. It
   * performs the following steps when called:
   */
  override WithBaseObject(_$: VM): CR<undefined> {
    return undefined;
  }
}

/**
 * 9.1.1.2 Object Environment Records
 *
 * Each Object Environment Record is associated with an object called
 * its binding object. An Object Environment Record binds the set of
 * string identifier names that directly correspond to the property
 * names of its binding object. Property keys that are not strings in
 * the form of an IdentifierName are not included in the set of bound
 * identifiers. Both own and inherited properties are included in the
 * set regardless of the setting of their [[Enumerable]]
 * attribute. Because properties can be dynamically added and deleted
 * from objects, the set of identifiers bound by an Object Environment
 * Record may potentially change as a side-effect of any operation
 * that adds or deletes properties. Any bindings that are created as a
 * result of such a side-effect are considered to be a mutable binding
 * even if the Writable attribute of the corresponding property is
 * false. Immutable bindings do not exist for Object Environment
 * Records.
 *
 * Object Environment Records created for with statements (14.11) can
 * provide their binding object as an implicit this value for use in
 * function calls. The capability is controlled by a Boolean
 * [[IsWithEnvironment]] field.
 */
export class ObjectEnvironmentRecord extends EnvironmentRecord {
  constructor(
    readonly OuterEnv: EnvironmentRecord|null,
    /** The binding object of this Environment Record. */
    readonly BindingObject: Obj,
    /** Indicates whether this Environment Record is created for a with statement. */
    readonly IsWithEnvironment: boolean) { super(); }

  /**
   * 9.1.1.2.1 HasBinding ( N )
   *
   * The HasBinding concrete method of an Object Environment Record
   * envRec takes argument N (a String) and returns either a normal
   * completion containing a Boolean or a throw completion. It
   * determines if its associated binding object has a property whose
   * name is N. It performs the following steps when called:
   */
  override HasBinding($: VM, N: string): CR<boolean> {
    const bindingObject = this.BindingObject;
    const foundBinding = HasProperty($, bindingObject, N);
    if (IsAbrupt(foundBinding)) return foundBinding;
    if (!foundBinding) return false;
    if (!this.IsWithEnvironment) return true;
    const unscopables = Get($, bindingObject, Symbol.unscopables);
    if (IsAbrupt(unscopables)) return unscopables;
    if (unscopables instanceof Obj) {
      const prop = Get($, unscopables, N);
      if (IsAbrupt(prop)) return prop;
      const blocked = ToBoolean($, prop);
      if (blocked) return false;
    }
    return true;
  }

  /**
   * 9.1.1.2.2 CreateMutableBinding ( N, D )
   *
   * The CreateMutableBinding concrete method of an Object Environment
   * Record envRec takes arguments N (a String) and D (a Boolean) and
   * returns either a normal completion containing unused or a throw
   * completion. It creates in an Environment Record\'s associated
   * binding object a property whose name is N and initializes it to
   * the value undefined. If D is true, the new property\'s
   * [[Configurable]] attribute is set to true; otherwise it is set to
   * false. It performs the following steps when called:
   */
  override CreateMutableBinding($: VM, N: string, D: boolean): CR<UNUSED> {
    const bindingObject = this.BindingObject;
    // NOTE: Normally envRec will not have a binding for N but if it
    // does, the semantics of DefinePropertyOrThrow may result in an
    // existing binding being replaced or shadowed or cause an abrupt
    // completion to be returned.
    const result = DefinePropertyOrThrow($, bindingObject, N, PropertyDescriptor({
      Value: undefined,
      Writable: true,
      Enumerable: true,
      Configurable: D,
    }));
    if (IsAbrupt(result)) return result;
    return UNUSED;
  }

  /**
   * 9.1.1.2.3 CreateImmutableBinding ( N, S )
   *
   * The CreateImmutableBinding concrete method of an Object
   * Environment Record is never used within this specification.
   */
  override CreateImmutableBinding(_$: VM, _N: string, _S: boolean): CR<UNUSED> {
    Assert(false);
  }

  /**
   * 9.1.1.2.4 InitializeBinding ( N, V )
   *
   * The InitializeBinding concrete method of an Object Environment
   * Record envRec takes arguments N (a String) and V (an ECMAScript
   * language value) and returns either a normal completion containing
   * unused or a throw completion. It is used to set the bound value
   * of the current binding of the identifier whose name is N to the
   * value V. It performs the following steps when called:
   */
  override InitializeBinding($: VM, N: string, V: Val): CR<UNUSED> {
    // NOTE: In this specification, all uses of CreateMutableBinding
    // for Object Environment Records are immediately followed by a
    // call to InitializeBinding for the same name. Hence, this
    // specification does not explicitly track the initialization
    // state of bindings in Object Environment Records.
    const result = this.SetMutableBinding($, N, V, false);
    if (IsAbrupt(result)) return result;
    return UNUSED;
  }

  /**
   * 9.1.1.2.5 SetMutableBinding ( N, V, S )
   *
   * The SetMutableBinding concrete method of an Object Environment
   * Record envRec takes arguments N (a String), V (an ECMAScript
   * language value), and S (a Boolean) and returns either a normal
   * completion containing unused or a throw completion. It attempts
   * to set the value of the Environment Record\'s associated binding
   * object's property whose name is N to the value V. A property
   * named N normally already exists but if it does not or is not
   * currently writable, error handling is determined by S. It
   * performs the following steps when called:
   */
  override SetMutableBinding($: VM, N: string, V: Val, S: boolean): CR<UNUSED> {
    const bindingObject = this.BindingObject;
    const stillExists = HasProperty($, bindingObject, N);
    if (IsAbrupt(stillExists)) return stillExists;
    if (!stillExists && S) return Throw('ReferenceError');
    const result = Set($, bindingObject, N, V, S);
    if (IsAbrupt(result)) return result;
    return UNUSED;
  }

  /**
   * 9.1.1.2.6 GetBindingValue ( N, S )
   *
   * The GetBindingValue concrete method of an Object Environment
   * Record envRec takes arguments N (a String) and S (a Boolean) and
   * returns either a normal completion containing an ECMAScript
   * language value or a throw completion. It returns the value of its
   * associated binding object\'s property whose name is N. The
   * property should already exist but if it does not the result
   * depends upon S. It performs the following steps when called:
   */
  override GetBindingValue($: VM, N: string, S: boolean): CR<Val> {
    const bindingObject = this.BindingObject;
    const value = HasProperty($, bindingObject, N);
    if (IsAbrupt(value)) return value;
    if (!value) {
      if (!S) return undefined;
      return Throw('ReferenceError');
    }
    return Get($, bindingObject, N);
  }

  /**
   * 9.1.1.2.7 DeleteBinding ( N )
   *
   * The DeleteBinding concrete method of an Object Environment Record
   * completion containing a Boolean or a throw completion. It can
   * envRec takes argument N (a String) and returns either a normal
   * only delete bindings that correspond to properties of the
   * environment object whose [[Configurable]] attribute have the
   * value true. It performs the following steps when called:
   */
  override DeleteBinding($: VM, N: string): CR<boolean> {
    const bindingObject = this.BindingObject;
    return bindingObject.Delete($, N);
  }

  /**
   * 9.1.1.2.8 HasThisBinding ( )
   *
   * The HasThisBinding concrete method of an Object Environment
   * Record envRec takes no arguments and returns false. It performs
   * the following steps when called:
   *
   * NOTE: Object Environment Records do not provide a this binding.
   */
  override HasThisBinding(_$: VM): CR<boolean> {
    return false;
  }

  /**
   * 9.1.1.2.9 HasSuperBinding ( )
   *
   * The HasSuperBinding concrete method of an Object Environment
   * Record envRec takes no arguments and returns false. It performs
   * the following steps when called:
   *
   * NOTE: Object Environment Records do not provide a super binding.
   */
  override HasSuperBinding(_$: VM): CR<boolean> {
    return false;
  }

  /**
   * 9.1.1.2.10 WithBaseObject ( )
   *
   * The WithBaseObject concrete method of an Object Environment
   * Record envRec takes no arguments and returns an Object or
   * undefined. It performs the following steps when called:
   */
  override WithBaseObject(_$: VM): CR<Obj|undefined> {
    if (this.IsWithEnvironment) return this.BindingObject;
    return undefined;
  }
}

// TODO - 9.1.1.3 function records
