import { Assert } from './assert';
import { CR, CastNotAbrupt, IsAbrupt, Throw } from './completion_record';
import { Val } from './val';
import { EMPTY, INITIALIZED, LEXICAL, UNINITIALIZED, UNRESOLVABLE, UNUSED } from './enums';
import { VM } from './vm';
import { ReferenceRecord } from './reference_record';
import { ModuleRecord } from './module_record';
import { IsDataDescriptor, PropertyDescriptor } from './property_descriptor';
import { DefinePropertyOrThrow, Get, HasOwnProperty, HasProperty, Set as Set$ } from './abstract_object';
import { Func } from './func';
import { Obj } from './obj';
import { ToBoolean } from './abstract_conversion';
import { IsExtensible } from './abstract_compare';

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
  abstract HasThisBinding(): boolean;
  /**
   * HasSuperBinding() - Determine if an Environment Record
   * establishes a super method binding. Return true if it does and
   * false if it does not.
   */
  abstract HasSuperBinding(): boolean;
  /**
   * WithBaseObject() - If this Environment Record is associated with
   * a with statement, return the with object. Otherwise, return
   * undefined.
   */
  abstract WithBaseObject(): Obj|undefined;

  /**
   * NOTE: The spec doesn't indicate this as being present on the
   * base class, but it's called on it, so we include it here.
   */
  GetThisBinding(): CR<Val|undefined> {
    return undefined;
  }
}

interface UninitializedBinding {
  Value: Val;
  Initialized: boolean;
}

/** Abstract base class reresenting a binding. */
abstract class Binding {
  abstract readonly Value: Val;
  abstract readonly Initialized: boolean;
  abstract readonly Deletable: boolean;
  abstract readonly Strict: boolean;
}

/** A mutable binding. */
class MutableBinding extends Binding {
  override Value: Val = undefined;
  override readonly Initialized: boolean = false;
  override readonly Strict!: false;
  constructor(readonly Deletable: boolean) { super(); }
}
(MutableBinding.prototype as any).Strict = false;

/** An immutable binding. */
class ImmutableBinding extends Binding {
  override readonly Value: Val = undefined;
  override readonly Initialized: boolean = false;
  override readonly Deletable!: false;
  constructor(readonly Strict: boolean) { super(); }
}
(ImmutableBinding.prototype as any).Deletable = false;

/** An indirect module binding. */
class IndirectBinding extends Binding {
  override readonly Initialized!: true;
  override readonly Deletable!: false;
  override readonly Strict!: true;
  constructor(
    readonly Module: ModuleRecord,
    readonly Name: string,
  ) { super(); }
  override get Value(): Val { throw new Error('not allowed'); }
}
(IndirectBinding.prototype as any).Initialized = true;
(IndirectBinding.prototype as any).Deletable = false;
(IndirectBinding.prototype as any).Strict = true;

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
  protected readonly bindings = new Map<string, Binding>;

  /**
   * 9.1.2.2 NewDeclarativeEnvironment ( E )
   *
   * The abstract operation NewDeclarativeEnvironment takes argument E
   * (an Environment Record or null) and returns a Declarative
   * Environment Record. It performs the following steps when called:
   */
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
  override HasBinding(_$: VM, N: string): boolean {
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
    const binding = new MutableBinding(D);
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
    const binding = new ImmutableBinding(S);
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
    Assert(!binding.Initialized);
    const b = binding as UninitializedBinding;
    b.Value = V;
    b.Initialized = true;
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
    if (!binding.Initialized) return Throw('ReferenceError');
    if (binding instanceof MutableBinding) {
      binding.Value = V;
      (binding as UninitializedBinding).Initialized = true;
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
    if (!binding.Initialized) return Throw('ReferenceError', '');
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
  override HasThisBinding(): boolean {
    return false;
  }

  /**
   * 9.1.1.1.9 HasSuperBinding ( )
   *
   * The HasSuperBinding concrete method of a Declarative Environment
   * Record envRec takes no arguments and returns false. It performs
   * the following steps when called:
   */
  override HasSuperBinding(): boolean {
    return false;
  }

  /**
   * 9.1.1.1.10 WithBaseObject ( )
   *
   * The WithBaseObject concrete method of a Declarative Environment
   * Record envRec takes no arguments and returns undefined. It
   * performs the following steps when called:
   */
  override WithBaseObject(): undefined {
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
  /**
   * 9.1.2.3 NewObjectEnvironment ( O, W, E )
   *
   * The abstract operation NewObjectEnvironment takes arguments O (an
   * Object), W (a Boolean), and E (an Environment Record or null) and
   * returns an Object Environment Record. It performs the following
   * steps when called:
   */
  constructor(
    /** The binding object of this Environment Record. */
    readonly BindingObject: Obj,
    /** Indicates whether this Environment Record is created for a with statement. */
    readonly IsWithEnvironment: boolean,
    /** Outer environment, passed through to the super class. */
    readonly OuterEnv: EnvironmentRecord|null,
  ) { super(); }

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
      const blocked = ToBoolean(prop);
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
    const result = DefinePropertyOrThrow($, bindingObject, N, new PropertyDescriptor({
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
    const result = Set$($, bindingObject, N, V, S);
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
  override HasThisBinding(): boolean {
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
  override HasSuperBinding(): false {
    return false;
  }

  /**
   * 9.1.1.2.10 WithBaseObject ( )
   *
   * The WithBaseObject concrete method of an Object Environment
   * Record envRec takes no arguments and returns an Object or
   * undefined. It performs the following steps when called:
   */
  override WithBaseObject(): Obj|undefined {
    if (this.IsWithEnvironment) return this.BindingObject;
    return undefined;
  }
}

/**
 * 9.1.1.3 Function Environment Records
 *
 * A Function Environment Record is a Declarative Environment Record
 * that is used to represent the top-level scope of a function and, if
 * the function is not an ArrowFunction, provides a this binding. If a
 * function is not an ArrowFunction function and references super, its
 * Function Environment Record also contains the state that is used to
 * perform super method invocations from within the function.
 *
 * Function Environment Records support all of the Declarative
 * Environment Record methods listed in Table 16 and share the same
 * specifications for all of those methods except for HasThisBinding
 * and HasSuperBinding. In addition, Function Environment Records
 * support the methods listed in Table 19:
 *
 * The behaviour of the additional concrete specification methods for
 * Function Environment Records is defined by the following
 * algorithms:
 */
export class FunctionEnvironmentRecord extends DeclarativeEnvironmentRecord {
  /**
   * If the value is lexical, this is an ArrowFunction and does not
   * have a local this value.
   */
  ThisBindingStatus: LEXICAL|INITIALIZED|UNINITIALIZED = UNINITIALIZED;

  /** This is the `this` value used for this invocation of the function. */
  ThisValue: Val;

  /**
   * 9.1.2.4 NewFunctionEnvironment ( F, newTarget )
   *
   * The abstract operation NewFunctionEnvironment takes arguments F
   * (an ECMAScript function) and newTarget (an Object or undefined)
   * and returns a Function Environment Record. It performs the
   * following steps when called:
   */
  constructor(
    /**
     * The function object whose invocation caused this Environment
     * Record to be created.
     */
    readonly FunctionObject: Func,
    /**
     * If this Environment Record was created by the [[Construct]]
     * internal method, [[NewTarget]] is the value of the [[Construct]]
     * newTarget parameter. Otherwise, its value is undefined.
     */
    readonly NewTarget: Obj|undefined,
  ) {
    Assert(FunctionObject.Environment);
    super(FunctionObject.Environment);
    this.ThisBindingStatus = LEXICAL.is(FunctionObject.ThisMode) ? LEXICAL : UNINITIALIZED;
  }    

  /**
   * 9.1.1.3.1 BindThisValue ( V )
   *
   * The BindThisValue concrete method of a Function Environment
   * Record envRec takes argument V (an ECMAScript language value) and
   * returns either a normal completion containing an ECMAScript
   * language value or a throw completion. It performs the following
   * steps when called:
   */
  BindThisValue(_$: VM, V: Val): CR<Val> {
    Assert(this.ThisBindingStatus !== LEXICAL);
    if (this.ThisBindingStatus === INITIALIZED) return Throw('ReferenceError');
    this.ThisValue = V;
    this.ThisBindingStatus = INITIALIZED;
    return V;
  }

  /**
   * 9.1.1.3.2 HasThisBinding ( )
   *
   * The HasThisBinding concrete method of a Function Environment
   * Record envRec takes no arguments and returns a Boolean. It
   * performs the following steps when called:
   */
  override HasThisBinding(): boolean {
    return this.ThisBindingStatus !== LEXICAL;
  }

  /**
   * 9.1.1.3.3 HasSuperBinding ( )
   *
   * The HasSuperBinding concrete method of a Function Environment
   * Record envRec takes no arguments and returns a Boolean. It
   * performs the following steps when called:
   */
  override HasSuperBinding(): boolean {
    if (this.ThisBindingStatus === LEXICAL) return false;
    if (this.FunctionObject.HomeObject == undefined) return false;
    return true;
  }

  /**
   * 9.1.1.3.4 GetThisBinding ( )
   *
   * The GetThisBinding concrete method of a Function Environment
   * Record envRec takes no arguments and returns either a normal
   * completion containing an ECMAScript language value or a throw
   * completion. It performs the following steps when called:
   */
  override GetThisBinding(): CR<Val> {
    Assert(this.ThisBindingStatus !== LEXICAL);
    if (this.ThisBindingStatus === UNINITIALIZED) return Throw('ReferenecError');
    return this.ThisValue;
  }

  /**
   * 9.1.1.3.5 GetSuperBase ( )
   *
   * The GetSuperBase concrete method of a Function Environment Record
   * envRec takes no arguments and returns either a normal completion
   * containing either an Object, null, or undefined, or a throw
   * completion. It performs the following steps when called:
   */
  GetSuperBase($: VM): CR<Obj|null|undefined> {
    const home = this.FunctionObject.HomeObject;
    if (home == undefined) return undefined;
    Assert(home instanceof Obj);
    return home.GetPrototypeOf($);
  }
}

/**
 * 9.1.1.4 Global Environment Records
 *
 * A Global Environment Record is used to represent the outer most
 * scope that is shared by all of the ECMAScript Script elements that
 * are processed in a common realm. A Global Environment Record
 * provides the bindings for built-in globals (clause 19), properties
 * of the global object, and for all top-level declarations (8.2.9,
 * 8.2.11) that occur within a Script.
 *
 * A Global Environment Record is logically a single record but it is
 * specified as a composite encapsulating an Object Environment Record
 * and a Declarative Environment Record. The Object Environment Record
 * has as its base object the global object of the associated Realm
 * Record. This global object is the value returned by the Global
 * Environment Record's GetThisBinding concrete method. The Object
 * Environment Record component of a Global Environment Record
 * contains the bindings for all built-in globals (clause 19) and all
 * bindings introduced by a FunctionDeclaration, GeneratorDeclaration,
 * AsyncFunctionDeclaration, AsyncGeneratorDeclaration, or
 * VariableStatement contained in global code. The bindings for all
 * other ECMAScript declarations in global code are contained in the
 * Declarative Environment Record component of the Global Environment
 * Record.
 *
 * Properties may be created directly on a global object. Hence, the
 * Object Environment Record component of a Global Environment Record
 * may contain both bindings created explicitly by
 * FunctionDeclaration, GeneratorDeclaration,
 * AsyncFunctionDeclaration, AsyncGeneratorDeclaration, or
 * VariableDeclaration declarations and bindings created implicitly as
 * properties of the global object. In order to identify which
 * bindings were explicitly created using declarations, a Global
 * Environment Record maintains a list of the names bound using its
 * CreateGlobalVarBinding and CreateGlobalFunctionBinding concrete
 * methods.
 */
export class GlobalEnvironmentRecord extends EnvironmentRecord {
  /**
   * an Object Environment Record Binding object is the global
   * object. It contains global built-in bindings as well as
   * FunctionDeclaration, GeneratorDeclaration,
   * AsyncFunctionDeclaration, AsyncGeneratorDeclaration, and
   * VariableDeclaration bindings in global code for the associated
   * realm.
   */
  readonly ObjectRecord: ObjectEnvironmentRecord;

  /**
   * The value returned by this in global scope. Hosts may provide any
   * ECMAScript Object value.
   */
  readonly GlobalThisValue: Obj;

  /**
   * Contains bindings for all declarations in global code for the
   * associated realm code except for FunctionDeclaration,
   * GeneratorDeclaration, AsyncFunctionDeclaration,
   * AsyncGeneratorDeclaration, and VariableDeclaration bindings.
   */
  readonly DeclarativeRecord: DeclarativeEnvironmentRecord;

  /**
   * The string names bound by FunctionDeclaration,
   * GeneratorDeclaration, AsyncFunctionDeclaration,
   * AsyncGeneratorDeclaration, and VariableDeclaration declarations
   * in global code for the associated realm.
   */
  readonly VarNames: Set<string>;

  /** Not relevant. */
  override readonly OuterEnv = null;

  /**
   * 9.1.2.5 NewGlobalEnvironment ( G, thisValue )
   *
   * The abstract operation NewGlobalEnvironment takes arguments G (an
   * Object) and thisValue (an Object) and returns a Global
   * Environment Record. It performs the following steps when called:
   */
  constructor(G: Obj, thisValue: Obj) {
    super();
    this.ObjectRecord = new ObjectEnvironmentRecord(G, false, null);
    this.GlobalThisValue = thisValue;
    this.DeclarativeRecord = new DeclarativeEnvironmentRecord(null);
    this.VarNames = new Set();
  }

  /**
   * 9.1.1.4.1 HasBinding ( N )
   *
   * The HasBinding concrete method of a Global Environment Record
   * envRec takes argument N (a String) and returns either a normal
   * completion containing a Boolean or a throw completion. It
   * determines if the argument identifier is one of the identifiers
   * bound by the record. It performs the following steps when called:
   */
  override HasBinding($: VM, N: string): CR<boolean> {
    const DclRec = this.DeclarativeRecord;
    if (CastNotAbrupt(DclRec.HasBinding($, N))) return true;
    const ObjRec = this.ObjectRecord;
    return ObjRec.HasBinding($, N);
  }

  /**
   * 9.1.1.4.2 CreateMutableBinding ( N, D )
   *
   * The CreateMutableBinding concrete method of a Global Environment
   * Record envRec takes arguments N (a String) and D (a Boolean) and
   * returns either a normal completion containing unused or a throw
   * completion. It creates a new mutable binding for the name N that
   * is uninitialized. The binding is created in the associated
   * DeclarativeRecord. A binding for N must not already exist in the
   * DeclarativeRecord. If D is true, the new binding is marked as
   * being subject to deletion. It performs the following steps when
   * called:
   */
  override CreateMutableBinding($: VM, N: string, D: boolean): CR<UNUSED> {
    const DclRec = this.DeclarativeRecord;
    if (CastNotAbrupt(DclRec.HasBinding($, N))) return Throw('TypeError');
    return CastNotAbrupt(DclRec.CreateMutableBinding($, N, D));
  }

  /**
   * 9.1.1.4.3 CreateImmutableBinding ( N, S )
   *
   * The CreateImmutableBinding concrete method of a Global
   * Environment Record envRec takes arguments N (a String) and S (a
   * Boolean) and returns either a normal completion containing unused
   * or a throw completion. It creates a new immutable binding for the
   * name N that is uninitialized. A binding must not already exist in
   * this Environment Record for N. If S is true, the new binding is
   * marked as a strict binding. It performs the following steps when
   * called:
   */
  override CreateImmutableBinding($: VM, N: string, S: boolean): CR<UNUSED> {
    const DclRec = this.DeclarativeRecord;
    if (CastNotAbrupt(DclRec.HasBinding($, N))) return Throw('TypeError');
    return CastNotAbrupt(DclRec.CreateImmutableBinding($, N, S));
  }

  /**
   * 9.1.1.4.4 InitializeBinding ( N, V )
   *
   * The InitializeBinding concrete method of a Global Environment
   * Record envRec takes arguments N (a String) and V (an ECMAScript
   * language value) and returns either a normal completion containing
   * unused or a throw completion. It is used to set the bound value
   * of the current binding of the identifier whose name is N to the
   * value V. An uninitialized binding for N must already exist. It
   * performs the following steps when called:
   */
  override InitializeBinding($: VM, N: string, V: Val): CR<UNUSED> {
    const DclRec = this.DeclarativeRecord;
    if (CastNotAbrupt(DclRec.HasBinding($, N))) {
      return CastNotAbrupt(DclRec.InitializeBinding($, N, V));
    }
    // Assert: If the binding exists, it must be in the Object Environment Record.
    const ObjRec = this.ObjectRecord;
    return ObjRec.InitializeBinding($, N, V);
  }

  /**
   * 9.1.1.4.5 SetMutableBinding ( N, V, S )
   *
   * SetMutableBinding concrete method of a Global Environment Record
   * envRec takes arguments N (a String), V (an ECMAScript language
   * value), and S (a Boolean) and returns either a normal completion
   * containing unused or a throw completion. It attempts to change
   * the bound value of the current binding of the identifier whose
   * name is N to the value V. If the binding is an immutable binding
   * and S is true, a TypeError is thrown. A property named N normally
   * already exists but if it does not or is not currently writable,
   * error handling is determined by S. It performs the following
   * steps when called:
   */
  override SetMutableBinding($: VM, N: string, V: Val, S: boolean): CR<UNUSED> {
    const DclRec = this.DeclarativeRecord;
    if (CastNotAbrupt(DclRec.HasBinding($, N))) {
      return DclRec.SetMutableBinding($, N, V, S);
    }
    const ObjRec = this.ObjectRecord;
    return ObjRec.SetMutableBinding($, N, V, S);
  }

  /**
   * 9.1.1.4.6 GetBindingValue ( N, S )
   *
   * The GetBindingValue concrete method of a Global Environment
   * Record envRec takes arguments N (a String) and S (a Boolean) and
   * returns either a normal completion containing an ECMAScript
   * language value or a throw completion. It returns the value of its
   * bound identifier whose name is N. If the binding is an
   * uninitialized binding throw a ReferenceError exception. A
   * property named N normally already exists but if it does not or is
   * not currently writable, error handling is determined by S. It
   * performs the following steps when called:
   */
  override GetBindingValue($: VM, N: string, S: boolean): CR<Val> {
    const DclRec =this.DeclarativeRecord;
    if (CastNotAbrupt(DclRec.HasBinding($, N))) {
      return DclRec.GetBindingValue($, N, S);
    }
    const ObjRec = this.ObjectRecord;
    return ObjRec.GetBindingValue($, N, S);
  }

  /**
   * 9.1.1.4.7 DeleteBinding ( N )
   *
   * The DeleteBinding concrete method of a Global Environment Record
   * envRec takes argument N (a String) and returns either a normal
   * completion containing a Boolean or a throw completion. It can
   * only delete bindings that have been explicitly designated as
   * being subject to deletion. It performs the following steps when
   * called:
   */
  override DeleteBinding($: VM, N: string): CR<boolean> {
    const DclRec = this.DeclarativeRecord;
    if (CastNotAbrupt(DclRec.HasBinding($, N))) {
      return CastNotAbrupt(DclRec.DeleteBinding($, N));
    }
    const ObjRec = this.ObjectRecord;
    const globalObject = ObjRec.BindingObject;
    const existingProp = HasOwnProperty($, globalObject, N);
    if (IsAbrupt(existingProp)) return existingProp;
    if (existingProp) {
      const status = ObjRec.DeleteBinding($, N);
      if (IsAbrupt(status)) return status;
      if (status && this.VarNames.has(N)) {
        this.VarNames.delete(N);
        return status;
      }
    }
    return true;
  }

  /**
   * 9.1.1.4.8 HasThisBinding ( )
   *
   * The HasThisBinding concrete method of a Global Environment Record
   * envRec takes no arguments and returns true. It performs the
   * following steps when called:
   */
  override HasThisBinding(): true {
    return true;
  }

  /**
   * 9.1.1.4.9 HasSuperBinding ( )
   *
   * The HasSuperBinding concrete method of a Global Environment
   * Record envRec takes no arguments and returns false. It performs
   * the following steps when called:
   */
  override HasSuperBinding(): false {
    return false;
  }

  /**
   * 9.1.1.4.10 WithBaseObject ( )
   *
   * The WithBaseObject concrete method of a Global Environment Record
   * envRec takes no arguments and returns undefined. It performs the
   * following steps when called:
   */
  override WithBaseObject(): undefined {
    return undefined;
  }

  /**
   * 9.1.1.4.11 GetThisBinding ( )
   *
   * The GetThisBinding concrete method of a Global Environment Record
   * envRec takes no arguments and returns a normal completion
   * containing an Object. It performs the following steps when
   * called:
   */
  override GetThisBinding(): CR<Val> {
    return this.GlobalThisValue;
  }

  /**
   * 9.1.1.4.12 HasVarDeclaration ( N )
   *
   * The HasVarDeclaration concrete method of a Global Environment
   * Record envRec takes argument N (a String) and returns a
   * Boolean. It determines if the argument identifier has a binding
   * in this record that was created using a VariableStatement or a
   * FunctionDeclaration. It performs the following steps when called:
   */
  HasVarDeclaration(_$: VM, N: string): boolean {
    const varDeclaredNames = this.VarNames;
    return varDeclaredNames.has(N);
  }

  /**
   * 9.1.1.4.13 HasLexicalDeclaration ( N )
   *
   * The HasLexicalDeclaration concrete method of a Global Environment
   * Record envRec takes argument N (a String) and returns a
   * Boolean. It determines if the argument identifier has a binding
   * in this record that was created using a lexical declaration such
   * as a LexicalDeclaration or a ClassDeclaration. It performs the
   * following steps when called:
   */
  HasLexicalDeclaration($: VM, N: string): boolean {
    return CastNotAbrupt(this.DeclarativeRecord.HasBinding($, N));
  }

  /**
   * 9.1.1.4.14 HasRestrictedGlobalProperty ( N )
   *
   * The HasRestrictedGlobalProperty concrete method of a Global
   * Environment Record envRec takes argument N (a String) and returns
   * either a normal completion containing a Boolean or a throw
   * completion. It determines if the argument identifier is the name
   * of a property of the global object that must not be shadowed by a
   * global lexical binding. It performs the following steps when
   * called:
   *
   * Properties may exist upon a global object that were directly
   * created rather than being declared using a var or function
   * declaration. A global lexical binding may not be created that has
   * the same name as a non-configurable property of the global
   * object. The global property "undefined" is an example of such a
   * property.
   */
  HasRestrictedGlobalProperty($: VM, N: string): CR<boolean> {
    const globalObject = this.ObjectRecord.BindingObject;
    const existingProp = globalObject.GetOwnProperty($, N);
    if (IsAbrupt(existingProp)) return existingProp;
    if (existingProp === undefined) return false;
    if (existingProp.Configurable) return false;
    return true;
  }

  /**
   * 9.1.1.4.15 CanDeclareGlobalVar ( N )
   *
   * The CanDeclareGlobalVar concrete method of a Global Environment
   * Record envRec takes argument N (a String) and returns either a
   * normal completion containing a Boolean or a throw completion. It
   * determines if a corresponding CreateGlobalVarBinding call would
   * succeed if called for the same argument N. Redundant var
   * declarations and var declarations for pre-existing global object
   * properties are allowed. It performs the following steps when
   * called:
   */
  CanDeclareGlobalVar($: VM, N: string): CR<boolean> {
    const globalObject = this.ObjectRecord.BindingObject;
    const hasProperty = HasOwnProperty($, globalObject, N);
    if (IsAbrupt(hasProperty)) return hasProperty;
    if (hasProperty === true) return true;
    return IsExtensible($, globalObject);
  }

  /**
   * 9.1.1.4.16 CanDeclareGlobalFunction ( N )
   *
   * The CanDeclareGlobalFunction concrete method of a Global
   * Environment Record envRec takes argument N (a String) and returns
   * either a normal completion containing a Boolean or a throw
   * completion. It determines if a corresponding
   * CreateGlobalFunctionBinding call would succeed if called for the
   * same argument N. It performs the following steps when called:
   */
  CanDeclareGlobalFunction($: VM, N: string): CR<boolean> {
    const globalObject = this.ObjectRecord.BindingObject;
    const existingProp = globalObject.GetOwnProperty($, N);
    if (IsAbrupt(existingProp)) return existingProp;
    if (existingProp === undefined) return IsExtensible($, globalObject);
    if (existingProp.Configurable) return true;
    if (IsDataDescriptor(existingProp) && existingProp.Writable && existingProp.Enumerable) {
      return true;
    }
    return false;
  }

  /**
   * 9.1.1.4.17 CreateGlobalVarBinding ( N, D )
   *
   * The CreateGlobalVarBinding concrete method of a Global
   * Environment Record envRec takes arguments N (a String) and D (a
   * Boolean) and returns either a normal completion containing unused
   * or a throw completion. It creates and initializes a mutable
   * binding in the associated Object Environment Record and records
   * the bound name in the associated [[VarNames]] List. If a binding
   * already exists, it is reused and assumed to be initialized. It
   * performs the following steps when called:
   */
  CreateGlobalVarBinding ($: VM, N: string, D: boolean): CR<UNUSED> {
    const globalObject = this.ObjectRecord.BindingObject;
    const hasProperty = HasOwnProperty($, globalObject, N);
    if (IsAbrupt(hasProperty)) return hasProperty;
    const extensible = IsExtensible($, globalObject);
    if (IsAbrupt(extensible)) return extensible;
    if (!hasProperty && extensible) {
      let result = this.ObjectRecord.CreateMutableBinding($, N, D);
      if (IsAbrupt(result)) return result;
      result = this.ObjectRecord.InitializeBinding($, N, undefined);
      if (IsAbrupt(result)) return result;
    }
    if (!this.VarNames.has(N)) this.VarNames.add(N);
    return UNUSED;
  }

  /**
   * 9.1.1.4.18 CreateGlobalFunctionBinding ( N, V, D )
   *
   * The CreateGlobalFunctionBinding concrete method of a Global
   * Environment Record envRec takes arguments N (a String), V (an
   * ECMAScript language value), and D (a Boolean) and returns either
   * a normal completion containing unused or a throw completion. It
   * creates and initializes a mutable binding in the associated
   * Object Environment Record and records the bound name in the
   * associated [[VarNames]] List. If a binding already exists, it is
   * replaced. It performs the following steps when called:
   *
   * NOTE: Global function declarations are always represented as own
   * properties of the global object. If possible, an existing own
   * property is reconfigured to have a standard set of attribute
   * values. Step 7 is equivalent to what calling the
   * InitializeBinding concrete method would do and if globalObject is
   * a Proxy will produce the same sequence of Proxy trap calls.
   */
  CreateGlobalFunctionBinding($: VM, N: string, V: Val, D: boolean): CR<UNUSED> {
    const globalObject = this.ObjectRecord.BindingObject;
    const existingProp = globalObject.GetOwnProperty($, N);
    if (IsAbrupt(existingProp)) return existingProp;
    const desc = (existingProp === undefined || existingProp.Configurable) ?
        new PropertyDescriptor({Value: V, Writable: true, Enumerable: true, Configurable: D}) :
        new PropertyDescriptor({Value: V});
    {
      const result = DefinePropertyOrThrow($, globalObject, N, desc);
      if (IsAbrupt(result)) return result;
    }
    {
      const result = Set$($, globalObject, N, V, false);
      if (IsAbrupt(result)) return result;
    }
    if (!this.VarNames.has(N)) this.VarNames.add(N);
    return UNUSED;
  }
}

/**
 * 9.1.1.5 Module Environment Records
 *
 * A Module Environment Record is a Declarative Environment Record
 * that is used to represent the outer scope of an ECMAScript
 * Module. In additional to normal mutable and immutable bindings,
 * Module Environment Records also provide immutable import bindings
 * which are bindings that provide indirect access to a target binding
 * that exists in another Environment Record.
 *
 * Module Environment Records support all of the Declarative
 * Environment Record methods listed in Table 16 and share the same
 * specifications for all of those methods except for GetBindingValue,
 * DeleteBinding, HasThisBinding and GetThisBinding. In addition,
 * Module Environment Records support the methods listed below:
 *
 * CreateImportBinding(N, M, N2) - Create an immutable indirect
 * binding in a Module Environment Record. The String value N is the
 * text of the bound name. M is a Module Record, and N2 is a binding
 * that exists in M's Module Environment Record.
 *
 * GetThisBinding() - Return the value of this Environment Record's
 * this binding.
 *
 * The behaviour of the additional concrete specification methods for
 * Module Environment Records are defined by the following algorithms:
 *
 * ---
 *
 * 9.1.2.6 NewModuleEnvironment ( E )
 *
 * The abstract operation NewModuleEnvironment takes argument E (an
 * Environment Record) and returns a Module Environment Record. It
 * performs the following steps when called:
 *
 * 1. Let env be a new Module Environment Record containing no bindings.
 * 2. Set env.[[OuterEnv]] to E.
 * 3. Return env.
 *
 * ---
 *
 * Note that the inherited constructor for DeclarativeEnvironmentRecord
 * already just works.
 */
export class ModuleEnvironmentRecord extends DeclarativeEnvironmentRecord {

  /**
   * 9.1.1.5.1 GetBindingValue ( N, S )
   *
   * The GetBindingValue concrete method of a Module Environment
   * Record envRec takes arguments N (a String) and S (a Boolean) and
   * returns either a normal completion containing an ECMAScript
   * language value or a throw completion. It returns the value of its
   * bound identifier whose name is N. However, if the binding is an
   * indirect binding the value of the target binding is returned. If
   * the binding exists but is uninitialized a ReferenceError is
   * thrown. It performs the following steps when called:
   */
  override GetBindingValue(_$: VM, N: string, S: boolean): CR<Val> {
    // NOTE: S will always be true because a Module is always strict mode code.
    Assert(S === true);
    const binding = this.bindings.get(N);
    Assert(binding != null);
    if (binding instanceof IndirectBinding) {
      const targetEnv = binding.Module.Environment;
      return targetEnv.GetBindingValue(binding.Name, true);
    }
    if (!binding.Initialized) return Throw('ReferenceError');
    return binding.Value;
  }

  /**
   * 9.1.1.5.2 DeleteBinding ( N )
   *
   * The DeleteBinding concrete method of a Module Environment Record is
   * never used within this specification.
   *
   * NOTE: Module Environment Records are only used within strict code
   * and an early error rule prevents the delete operator, in strict
   * code, from being applied to a Reference Record that would resolve
   * to a Module Environment Record binding. See 13.5.1.1.
   */
  override DeleteBinding(_$: VM, _N: string): never {
    throw new Error('ModuleEnvironmentRecord#DeleteBinding is not allowed');
  }

  /**
   * 9.1.1.5.3 HasThisBinding ( )
   *
   * The HasThisBinding concrete method of a Module Environment Record
   * envRec takes no arguments and returns true. It performs the
   * following steps when called:
   *
   * NOTE: Module Environment Records always provide a this binding.
   */
  override HasThisBinding(): true {
    return true;
  }

  /**
   * 9.1.1.5.4 GetThisBinding ( )
   *
   * The GetThisBinding concrete method of a Module Environment Record
   * envRec takes no arguments and returns a normal completion
   * containing undefined. It performs the following steps when
   * called:
   */
  override GetThisBinding(): undefined {
    return undefined;
  }

  /**
   * 9.1.1.5.5 CreateImportBinding ( N, M, N2 )
   *
   * The CreateImportBinding concrete method of a Module Environment
   * Record envRec takes arguments N (a String), M (a Module Record),
   * and N2 (a String) and returns unused. It creates a new
   * initialized immutable indirect binding for the name N. A binding
   * must not already exist in this Environment Record for N. N2 is
   * the name of a binding that exists in M\'s Module Environment
   * Record. Accesses to the value of the new binding will indirectly
   * access the bound value of the target binding. It performs the
   * following steps when called:
   */
  CreateImportBinding(N: string, M: ModuleRecord, N2: string): UNUSED {
    Assert(!this.bindings.has(N));
    Assert(!M.Environment.Instantiated || M.HasDirectBinding(N2));
    const binding = new IndirectBinding(M, N2);
    this.bindings.set(N, binding); // TODO - record binding as initialized??? what does this mean?
    return UNUSED;
  }
}

// 9.1.2 Environment Record Operations
//
// The following abstract operations are used in this specification to
// operate upon Environment Records:

/**
 * 9.1.2.1 GetIdentifierReference ( env, name, strict )
 *
 * The abstract operation GetIdentifierReference takes arguments env
 * (an Environment Record or null), name (a String), and strict (a
 * Boolean) and returns either a normal completion containing a
 * Reference Record or a throw completion. It performs the following
 * steps when called:
 */
export function GetIdentifierReference($: VM, env: EnvironmentRecord|null,
                                       name: string, strict: boolean): CR<ReferenceRecord> {
  // 1. If env is null, then
  if (env == null) {
    //   a. Return the Reference Record {
    //        [[Base]]: unresolvable,
    //        [[ReferencedName]]: name,
    //        [[Strict]]: strict,
    //        [[ThisValue]]: empty }.
    return new ReferenceRecord(UNRESOLVABLE, name, strict, EMPTY);
  }
  // 2. Let exists be ? env.HasBinding(name).
  const exists = env.HasBinding($, name);
  if (IsAbrupt(exists)) return exists;
  // 3. If exists is true, then
  if (exists) {
    //   a. Return the Reference Record {
    //        [[Base]]: env,
    //        [[ReferencedName]]: name,
    //        [[Strict]]: strict,
    //        [[ThisValue]]: empty }.
    return new ReferenceRecord(env, name, strict, EMPTY);
  }
  // 4. Else,
  //     a. Let outer be env.[[OuterEnv]].
  //     b. Return ? GetIdentifierReference(outer, name, strict).
  return GetIdentifierReference($, env.OuterEnv, name, strict);
}
