import type { CR } from './completion_record';
import type { BASE, DERIVED, EMPTY, GLOBAL, LEXICAL, STRICT } from './enums';
import type { EnvironmentRecord } from './environment_record';
import type { ModuleRecord } from './module_record';
import type { PrivateEnvironmentRecord, PrivateName } from './private_environment_record';
import type { PropertyDescriptor } from './property_descriptor';
import type { RealmRecord } from './realm_record';
import { withSlots } from './record';
import type { ScriptRecord } from './script_record';
import type { PropertyKey, Val } from './val';
import type { VM } from './vm';
import type * as ESTree from 'estree';

type ClassFieldDefinitionRecord = any;
type PrivateElement = any;

abstract class Obj {

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

  // Standard slots for all objects
  Prototype?: Obj|null;
  Extensible?: boolean;

  // Slots for function objects
  Environment?: EnvironmentRecord;
  PrivateEnvironment?: PrivateEnvironmentRecord;
  FormalParameters?: ESTree.Pattern[];
  ECMAScriptCode?: ESTree.BlockStatement|ESTree.Expression;
  ConstructorKind?: BASE|DERIVED;
  Realm?: RealmRecord;
  ScriptOrModule?: ScriptRecord|ModuleRecord;
  ThisMode?: LEXICAL|STRICT|GLOBAL;
  Strict?: boolean;
  HomeObject?: Obj|undefined; // |undefined?
  SourceText?: string;
  Fields?: ClassFieldDefinitionRecord[]; // TODO - Map?
  PrivateMethods?: PrivateElement[]; // TODO - Map?
  ClassFieldInitializerName?: string|symbol|PrivateName|EMPTY;
  IsClassConstructor?: boolean;

  // Methods for function objects
  Call?($: VM, thisArgument: Val, argumentsList: Val[]): CR<Val>;
  Construct?($: VM, argumentsList: Val[], newTarget: Obj): CR<Obj>;

  // Slot for exotic mapped arguments object
  ParameterMap?: Obj|undefined;
}

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

  // Arguments
  ParameterMap: true,
});
type ObjWithSlots = Obj;

export {ObjWithSlots as Obj};
