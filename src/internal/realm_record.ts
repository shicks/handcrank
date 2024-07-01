import { DefinePropertyOrThrow } from './abstract_object';
import { Assert } from './assert';
import { CR, IsAbrupt } from './completion_record';
import { UNUSED } from './enums';
import { GlobalEnvironmentRecord } from './environment_record';
import { RootExecutionContext } from './execution_context';
import { Obj, OrdinaryObjectCreate } from './obj';
import { PropertyDescriptor, methodName } from './property_descriptor';
import { VM } from './vm';
import * as ESTree from 'estree';

/**
 * 9.3 Realms
 *
 * Before it is evaluated, all ECMAScript code must be associated with
 * a realm. Conceptually, a realm consists of a set of intrinsic
 * objects, an ECMAScript global environment, all of the ECMAScript
 * code that is loaded within the scope of that global environment,
 * and other associated state and resources.
 *
 * A realm is represented in this specification as a Realm Record with
 * the fields specified here.
 */
export class RealmRecord {
  /**
   * The intrinsic values used by code associated with this realm (a
   * Record whose field names are intrinsic keys and whose values are
   * objects).
   */
  Intrinsics = new Map<string, Obj>();

  /** The global object for this realm. */
  GlobalObject: Obj|undefined = undefined;

  /** The global environment for this realm. */
  GlobalEnv: GlobalEnvironmentRecord|undefined = undefined;

  // a List of Records with fields [[Site]] (a TemplateLiteral Parse
  // Node) and [[Array]] (an Array).  Template objects are
  // canonicalized separately for each realm using its Realm Record's
  // [[TemplateMap]]. Each [[Site]] value is a Parse Node that is a
  // TemplateLiteral. The associated [[Array]] value is the
  // corresponding template object that is passed to a tag function.
  // NOTE 1: Once a Parse Node becomes unreachable, the corresponding
  // [[Array]] is also unreachable, and it would be unobservable if an
  // implementation removed the pair from the [[TemplateMap]] list.
  readonly TemplateMap = new WeakMap<ESTree.TemplateLiteral, Obj>();
  
  // a List of Records with fields [[Specifier]] (a String) and
  // [[Module]] (a Module Record).  A map from the specifier strings
  // imported by this realm to the resolved Module Record. The list
  // does not contain two different Records with the same
  // [[Specifier]].  NOTE 2: As mentioned in HostLoadImportedModule
  // (16.2.1.8 Note 1), [[LoadedModules]] in Realm Records is only
  // used when running an import() expression in a context where there
  // is no active script or module.
  // LoadedModules: LoadedModuleRecord[];

  // Field reserved for use by hosts that need to associate additional
  // information with a Realm Record.
  HostDefined: unknown = undefined;

  readonly RootContext: RootExecutionContext;

  constructor() {
    this.RootContext = new RootExecutionContext(this);
  }

  // TODO - lock down the constructor so that it's never called outside
  // of CreateRealm?
}

// export function CreateRealm($: VM): RealmRecord {
// NOTE: this is inlined in InitializeHostDefinedRealm
// }

const stagedGlobalsMapping = new WeakMap<RealmRecord, Map<string, PropertyDescriptor>>();

/**
 * 9.3.2 CreateIntrinsics ( realmRec )
 *
 * The abstract operation CreateIntrinsics takes argument realmRec (a
 * Realm Record) and returns unused. It performs the following steps
 * when called:
 *
 * 1. Set realmRec.[[Intrinsics]] to a new Record.
 * 2. Set fields of realmRec.[[Intrinsics]] with the values listed
 *    in Table 6. The field names are the names listed in column one of
 *    the table. The value of each field is a new object value fully and
 *    recursively populated with property values as defined by the
 *    specification of each object in clauses 19 through 28. All object
 *    property values are newly created object values. All values that
 *    are built-in function objects are created by performing
 *    CreateBuiltinFunction(steps, length, name, slots, realmRec,
 *    prototype) where steps is the definition of that function provided
 *    by this specification, name is the initial value of the function's
 *    "name" property, length is the initial value of the function's
 *    "length" property, slots is a list of the names, if any, of the
 *    function's specified internal slots, and prototype is the
 *    specified value of the function's [[Prototype]] internal slot. The
 *    creation of the intrinsics and their properties must be ordered to
 *    avoid any dependencies upon objects that have not yet been created.
 * 3. Perform AddRestrictedFunctionProperties(
 *    realmRec.[[Intrinsics]].[[%Function.prototype%]], realmRec).
 */
export function CreateIntrinsics($: VM, realmRec: RealmRecord): UNUSED {
  // TODO - TABLE 6
  //      - this is a great place for plugins...?
  //        -> could be registered with VM
  const stagedGlobals = new Map<string, PropertyDescriptor>();
  stagedGlobalsMapping.set(realmRec, stagedGlobals);
  realmRec.Intrinsics = new Map<string, Obj>();
  for (const plugin of $.plugins.values()) {
    plugin.realm?.CreateIntrinsics?.(realmRec, stagedGlobals);
  }

  // TODO -
  // AddRestrictedFunctionProperties(realmRec.Intrinsics.get('%Function.prototype%', realmRec);

  return UNUSED;
}

/**
 * 9.3.3 SetRealmGlobalObject ( realmRec, globalObj, thisValue )
 *
 * The abstract operation SetRealmGlobalObject takes arguments
 * realmRec (a Realm Record), globalObj (an Object or undefined), and
 * thisValue (an Object or undefined) and returns unused. It performs
 * the following steps when called:
 *
 * 1. If globalObj is undefined, then
 *     a. Let intrinsics be realmRec.[[Intrinsics]].
 *     b. Set globalObj to OrdinaryObjectCreate(intrinsics.[[%Object.prototype%]]).
 * 2. Assert: globalObj is an Object.
 * 3. If thisValue is undefined, set thisValue to globalObj.
 * 4. Set realmRec.[[GlobalObject]] to globalObj.
 * 5. Let newGlobalEnv be NewGlobalEnvironment(globalObj, thisValue).
 * 6. Set realmRec.[[GlobalEnv]] to newGlobalEnv.
 * 7. Return unused.
 */
export function SetRealmGlobalObject(realmRec: RealmRecord,
                                     globalObj: Obj|undefined,
                                     thisValue: Obj|undefined): UNUSED {
  if (globalObj == undefined) {
    const intrinsics = realmRec.Intrinsics;
    //globalObj = OrdinaryObjectCreate(intrinsics.get('%Object.prototype%'));
    globalObj = OrdinaryObjectCreate(intrinsics.get('%Object.prototype%')!);
  }
  Assert(globalObj instanceof Obj);
  if (thisValue == undefined) thisValue = globalObj;
  realmRec.GlobalObject = globalObj;
  realmRec.GlobalEnv = new GlobalEnvironmentRecord(globalObj, thisValue);
  return UNUSED;
}

/**
 * 9.3.4 SetDefaultGlobalBindings ( realmRec )
 *
 * The abstract operation SetDefaultGlobalBindings takes argument
 * realmRec (a Realm Record) and returns either a normal completion
 * containing an Object or a throw completion. It performs the
 * following steps when called:
 *
 * 1. Let global be realmRec.[[GlobalObject]].
 * 2. For each property of the Global Object specified in clause 19, do
 *     a. Let name be the String value of the property name.
 *     b. Let desc be the fully populated data Property
 *        Descriptor for the property, containing the specified
 *        attributes for the property. For properties listed in 19.2,
 *        19.3, or 19.4 the value of the [[Value]] attribute is the
 *        corresponding intrinsic object from realmRec.
 *     c. Perform ? DefinePropertyOrThrow(global, name, desc).
 * 3. Return global.
 */
export function SetDefaultGlobalBindings($: VM, realmRec: RealmRecord): CR<Obj> {
  const gbl = realmRec.GlobalObject!;
  Assert(gbl);

  for (const [key, desc] of stagedGlobalsMapping.get(realmRec)!) {
    const result = DefinePropertyOrThrow($, gbl, key, desc);
    if (IsAbrupt(result)) return result;
  }
  for (const plugin of $.plugins.values()) {
    const result = plugin.realm?.SetDefaultGlobalBindings?.(realmRec);
    if (IsAbrupt(result)) return result;
  }
  return gbl;
}

/**
 * 9.6 InitializeHostDefinedRealm ( )
 *
 * The abstract operation InitializeHostDefinedRealm takes no
 * arguments and returns either a normal completion containing unused
 * or a throw completion. It performs the following steps when called:
 */
export function InitializeHostDefinedRealm($: VM, realm: RealmRecord): CR<UNUSED> {
  // 1. Let realm be CreateRealm(). [NOTE: we create intrinsics later]
  // 2. Let newContext be a new execution context.
  // 3. Set the Function of newContext to null.
  // 4. Set the Realm of newContext to realm.
  // 5. Set the ScriptOrModule of newContext to null.
  // 6. Push newContext onto the execution context stack; newContext
  //    is now the running execution context.
  $.enterContext(realm.RootContext);
  CreateIntrinsics($, realm);

  for (const [k, v] of realm.Intrinsics) {
    intrinsicName.set(v, k);
    (v as any)[INTRINSIC_NAME] = k; // for debugging
  }

  // 7. If the host requires use of an exotic object to serve as
  //    realm's global object, let global be such an object created in a
  //    host-defined manner. Otherwise, let global be undefined,
  //    indicating that an ordinary object should be created as the
  //    global object.
  // 8. If the host requires that the this binding in realm's global
  //    scope return an object other than the global object, let
  //    thisValue be such an object created in a host-defined
  //    manner. Otherwise, let thisValue be undefined, indicating that
  //    realm's global this binding should be the global object.
  // 9. Perform SetRealmGlobalObject(realm, global, thisValue).
  const args: [RealmRecord, Obj|undefined, Obj|undefined]
    = [realm, undefined, undefined];
  for (const plugin of $.plugins.values()) {
    plugin.realm?.SetRealmGlobalObject?.(args);
  }
  SetRealmGlobalObject(...args);
  // 10. Let globalObj be ? SetDefaultGlobalBindings(realm).
  // 11. Create any host-defined global object properties on globalObj.
  const globalObj = SetDefaultGlobalBindings($, realm);
  $.popContext(realm.RootContext);
  if (IsAbrupt(globalObj)) return globalObj;
  // 12. Return unused.
  return UNUSED;
}

const INTRINSIC_NAME = Symbol();
const intrinsicName = new WeakMap<Obj, string>();
export function getIntrinsicName(o: Obj): string|undefined {
  return intrinsicName.get(o);
}

/**
 * Define a handful of property (descriptors) on an object.  Allows
 * passing descriptor factories to facilitate definitions without
 * needing to depend directly on the realm or duplicate the name.
 */
export function defineProperties(
  realm: RealmRecord,
  obj: Obj,
  props: Record<string|symbol, PropertyDescriptor|((realm: RealmRecord, name: string) => PropertyDescriptor)>,
): void {
  for (const k of Reflect.ownKeys(props)) {
    const v = props[k];
    const desc = typeof v === 'function' ? v(realm, methodName(k)) : v;
    obj.OwnProps.set(k, desc);
  }
}

/** SPI for specifying plugins to modify realms. */
export interface RealmAdvice {
  /** Adds additional intrinsics (and stage globals). */
  CreateIntrinsics?(
    realm: RealmRecord,
    stagedGlobals: Map<string, PropertyDescriptor>,
  ): void;

  /** Modifies arguments passed to `SetRealmGlobalObject`. */
  SetRealmGlobalObject?(params: [realm: RealmRecord, globalObj: Obj|undefined, thisValue: Obj|undefined]): void;

  /** Adds additional default global bindings. */
  SetDefaultGlobalBindings?(realm: RealmRecord): CR<void>;
}
