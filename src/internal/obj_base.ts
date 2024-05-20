import type { CR } from './completion_record';
import type { BASE, DERIVED, EMPTY, GLOBAL, LEXICAL, STRICT } from './enums';
import type { EnvironmentRecord } from './environment_record';
import type { ModuleRecord } from './module_record';
import type { PrivateEnvironmentRecord, PrivateName } from './private_environment_record';
import type { PropertyDescriptor } from './property_descriptor';
import type { RealmRecord } from './realm_record';
import { Slots, withSlots } from './record';
import type { ScriptRecord } from './script_record';
import type { PropertyKey, Val } from './val';
import type { VM } from './vm';
import type * as ESTree from 'estree';

type ClassFieldDefinitionRecord = any;
type PrivateElement = any;


// // This sort of thing could help de-dupe the list of slot names
//
// interface Field<B extends boolean, in out T> {
//   __optional__: B;
//   __type__: T;
// }
// function required<T>(): Field<false, T> {
//   return true as any;
// }
// function optional<T>(): Field<true, T> {
//   return true as any;
// }
// const slots = {
//   Prototype: optional<Obj|null>(),
//   Extensible: optional<boolean>(),
//   OwnProps: required<Map<PropertyKey, PropertyDescriptor>>(),
//   Environment: optional<EnvironmentRecord>(),
// } as const;
// type ObjBase<S = typeof slots> = {[K in keyof S]: S[K] extends Field<infer B, infer T> ? (arg: B extends true ? {[K1 in K]?: T} : {[K1 in K]: T}) => void : never}[keyof S] extends (arg: infer U) => void ? U : never;
// const ObjBase: abstract new() => ObjBase = class {} as any;
// class Obj2 extends ObjBase {
// }


abstract class Obj extends Slots(slot => ({
  // Standard slots for all objects
  Prototype: slot<Obj|null>,
  Extensible: slot<boolean>,

  // Slots for function objects
  Environment: slot<EnvironmentRecord>,
  PrivateEnvironment: slot<PrivateEnvironmentRecord>,
  FormalParameters: slot<ESTree.Pattern[]>,
  ECMAScriptCode: slot<ESTree.BlockStatement|ESTree.Expression>,
  ConstructorKind: slot<BASE|DERIVED>,
  Realm: slot<RealmRecord>,
  ScriptOrModule: slot<ScriptRecord|ModuleRecord>,
  ThisMode: slot<LEXICAL|STRICT|GLOBAL>,
  Strict: slot<boolean>,
  HomeObject: slot<Obj|undefined>, // |undefined?
  SourceText: slot<string>,
  Fields: slot<ClassFieldDefinitionRecord[]>, // TODO - Map?
  PrivateMethods: slot<PrivateElement[]>, // TODO - Map?
  ClassFieldInitializerName: slot<string|symbol|PrivateName|EMPTY>,
  IsClassConstructor: slot<boolean>,

  // Methods for function objects
  Call: slot<($: VM, thisArgument: Val, argumentsList: Val[]) => CR<Val>>,
  Construct: slot<($: VM, argumentsList: Val[], newTarget: Obj) => CR<Obj>>,

  // Slot for builtin function object
  InitialName: slot<string>,

  // Slot for exotic mapped arguments object
  ParameterMap: slot<Obj|undefined>,
})) {

  // Implementation details not in spec
  abstract OwnProps: Map<PropertyKey, PropertyDescriptor>;

  // Required internal methods for all objects
  abstract GetPrototypeOf(_$: VM): CR<Obj|null>;
  abstract SetPrototypeOf(_$: VM, V: Obj|null): CR<boolean>;
  abstract IsExtensible(_$: VM): CR<boolean>;
  abstract PreventExtensions(_$: VM): CR<boolean>;
  abstract GetOwnProperty(_$: VM, P: PropertyKey): CR<PropertyDescriptor|undefined>;
  abstract DefineOwnProperty($: VM, P: PropertyKey, Desc: PropertyDescriptor): CR<boolean>;
  abstract HasProperty($: VM, P: PropertyKey): CR<boolean>;
  abstract Get($: VM, P: PropertyKey, Receiver: Val): CR<Val>;
  abstract Set($: VM, P: PropertyKey, V: Val, Receiver: Val): CR<boolean>;
  abstract Delete($: VM, P: PropertyKey): CR<boolean>;
  abstract OwnPropertyKeys(_$: VM): CR<PropertyKey[]>;

}

// NOTE: This is repeated, but the `satisfies` at the end at least ensures
// there's no typoes between this list and the previous one.
const ObjWithSlots = withSlots(Obj, {
  // Required slots only here for completeness
  Prototype: true,
  Extensible: true,
  OwnProps: true,
  // Don't bother with required methods since they're always present and not interesting

  // Function
  Environment: true,
  PrivateEnvironment: true,
  FormalParameters: true,
  ECMAScriptCode: true,
  ConstructorKind: true,
  Realm: true,
  ScriptOrModule: true,
  ThisMode: true,
  Strict: true,
  HomeObject: true,
  SourceText: true,
  Fields: true,
  PrivateMethods: true,
  ClassFieldInitializerName: true,
  IsClassConstructor: true,
  Call: true,
  Construct: true,

  // Builtin function
  InitialName: true,

  // Arguments
  ParameterMap: true,
} satisfies {[K in keyof Obj]?: true});
type ObjWithSlots = Obj;

export {ObjWithSlots as Obj};
