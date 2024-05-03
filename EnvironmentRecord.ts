// v4 is a mini JS evaluation engine, built on top of esprima.
// Let's just make it always strict,

//import {Syntax, parseScript} from 'esprima';
import {
  BaseFunction,
  BlockStatement,
  CallExpression,
  FunctionExpression,
} from 'estree';

import {Assert, Must} from './Assert';
import {CompletionRecord} from './CompletionRecord';
import {Val} from './Val';

export abstract class EnvironmentRecord {
  // TODO - root node?
  // TODO - something for stack trace?
  abstract readonly OuterEnv: EnvironmentRecord|undefined;
  abstract HasBinding(name: string): CompletionRecord<boolean>;
  abstract CreateMutableBinding(name: string, deletable: boolean): CompletionRecord<void>;
  abstract CreateImmutableBinding(name: string, strict: boolean): CompletionRecord<void>;
  abstract InitializeBinding(name: string, val: Val): CompletionRecord<void>;
  abstract SetMutableBinding(name: string, val: Val, strict: boolean): CompletionRecord<void>;
  abstract GetBindingValue(name: string, strict: boolean): CompletionRecord<Val>;
  abstract DeleteBinding(name: string): CompletionRecord<boolean>;
  abstract HasThisBinding(): CompletionRecord<boolean>;
  abstract HasSuperBinding(): CompletionRecord<boolean>;
  abstract WithBaseObject(): CompletionRecord<Val|undefined>;
}

class Binding {
  constructor(
    // ???
    public value: Val|undefined,
    public mutable: boolean,
    public deletable: boolean,
    public strict: boolean,
  ) {}
}

export class DeclarativeEnvironmentRecord extends EnvironmentRecord {
  constructor(readonly OuterEnv: EnvironmentRecord|undefined) { super(); }

  private readonly bindings = new Map<string, Binding>;

  override HasBinding(name: string): CompletionRecord<boolean> {
    return CompletionRecord.Normal(this.bindings.has(name));
  }

  override CreateMutableBinding(name: string, deletable: boolean): CompletionRecord<void> {
    Assert(() => !this.bindings.has(name));
    const binding = new Binding(undefined, true, deletable, false);
    this.bindings.set(name, binding);
    return CompletionRecord.Normal();
  }

  override CreateImmutableBinding(name: string, strict: boolean): CompletionRecord<void> {
    Assert(() => !this.bindings.has(name));
    const binding = new Binding(undefined, false, false, strict);
    this.bindings.set(name, binding);
    return CompletionRecord.Normal();
  }

  override InitializeBinding(name: string, val: Val): CompletionRecord<void> {
    Assert(() => this.bindings.has(name));
    const binding = this.bindings.get(name)!;
    Assert(() => binding.value == null);
    binding!.value = val;
    return CompletionRecord.Normal();
  }

  override SetMutableBinding(name: string, val: Val, strict: boolean): CompletionRecord<void> {
    if (!this.bindings.has(name)) {
      if (strict) return CompletionRecord.Throw('ReferenceError', '');
      Must(this.CreateMutableBinding(name, true));
      Must(this.InitializeBinding(name, val));
      return CompletionRecord.Normal();
    }

    const binding = this.bindings.get(name)!;
    strict ||= binding.strict;
    if (binding.value == null) return CompletionRecord.Throw('ReferenceError', '');
    if (binding.mutable) {
      binding!.value = val;
      return CompletionRecord.Normal();
    }
    // Assert: Attempt to change value of an immutable binding
    if (strict) return CompletionRecord.Throw('TypeError', '');
    return CompletionRecord.Normal();
  }

  override GetBindingValue(name: string, strict: boolean): CompletionRecord<Val> {
    Assert(() => this.bindings.has(name));
    const binding = this.bindings.get(name)!;
    if (binding.value == undefined) return CompletionRecord.Throw('ReferenceError', '');
    return CompletionRecord.Normal(binding.value);
  }

  override DeleteBinding(name: string): CompletionRecord<boolean> {
    Assert(() => this.bindings.has(name));
    const binding = this.bindings.get(name)!;
    if (!binding.deletable) return CompletionRecord.Normal(false);
    this.bindings.delete(name);
    return CompletionRecord.Normal(true);
  }

  override HasThisBinding(): CompletionRecord<boolean> {
    return CompletionRecord.Normal(false);
  }

  override HasSuperBinding(): CompletionRecord<boolean> {
    return CompletionRecord.Normal(false);
  }

  override WithBaseObject(): CompletionRecord<undefined> {
    return CompletionRecord.Normal(undefined);
  }
}

export class ObjectEnvironmentRecord extends EnvironmentRecord {

  constructor(
    readonly BindingObject: Obj,
    readonly IsWithEnvironment: boolean) { super(); }

  override HasBinding(name: string): CompletionRecord<boolean> {
    this.BindingObject.HasProperty(name)
  }
  override CreateMutableBinding(name: string, deletable: boolean): CompletionRecord<void>;
  override CreateImmutableBinding(name: string, strict: boolean): CompletionRecord<void>;
  override InitializeBinding(name: string, val: Val): CompletionRecord<void>;
  override SetMutableBinding(name: string, val: Val, strict: boolean): CompletionRecord<void>;
  override GetBindingValue(name: string, strict: boolean): CompletionRecord<Val>;
  override DeleteBinding(name: string): CompletionRecord<boolean>;
  override HasThisBinding(): CompletionRecord<boolean>;
  override HasSuperBinding(): CompletionRecord<boolean>;
}
