import { DefinePropertyOrThrow } from './abstract_object';
import { Assert } from './assert';
import { CR, IsAbrupt } from './completion_record';
import { UNUSED } from './enums';
import { GlobalEnvironmentRecord } from './environment_record';
import { ExecutionContext } from './execution_context';
import { Obj } from './obj';
import { IsPropertyDescriptor, PropertyDescriptor } from './property_descriptor';
import { Val } from './val';
import { VM } from './vm';

declare const OrdinaryObjectCreate: any;

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
  // TemplateMap: TemplateRecord[] = [];
  
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

  // TODO - lock down the constructor so that it's never called outside
  // of CreateRealm?
}

export function CreateRealm($: VM): RealmRecord {
  const realmRec = new RealmRecord();
  CreateIntrinsics($, realmRec);
  return realmRec;
}

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

  const intrinsics = new Map<string, Obj>();
  const needed = new Set<string>($.intrinsics.keys());
  function build(name: string) {
    const [deps, fn] = $.intrinsics.get(name)!;
    const depList: Obj[] = [];
    for (const dep of deps) {
      if (!intrinsics.has(dep)) return;
      depList.push(intrinsics.get(dep)!);
    }
    const obj = fn(...depList);
    intrinsics.set(name, obj);
    needed.delete(name);
    for (const follow of $.rdeps.get(name) || []) {
      if (needed.has(follow)) build(follow);
    }
  }
  for (const name of needed) {
    build(name);
  }

  // TODO - if size is nonzero, report
  if (needed.size) {
    throw new Error(`Could not initialize intrinsics: ${[...needed].join(', ')}`);
  }

  realmRec.Intrinsics = intrinsics;

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
  debugger;
  const gbl = realmRec.GlobalObject!;
  Assert(gbl);

  // NOTE: at this point, the intrinsics should already be done.
  // We now need to go through the defines for global objects, which
  // may depend on intrinsics.
  const vals = new Map<string, Val>();
  const needed = new Set<string>($.globals.keys());

  function build(name: string): CR<UNUSED> {
    const [deps, fn] = $.globals.get(name)!;
    const depList: Val[] = [];
    for (const dep of deps) {
      const map = dep.startsWith('%') ? realmRec.Intrinsics : vals;
      if (!map.has(dep)) return UNUSED; // try again later
      depList.push(map.get(dep)!);
    }
    const result = fn(...depList);
    const desc: PropertyDescriptor = IsPropertyDescriptor(result) ?
      result : PropertyDescriptor({Value: result});
    const define = DefinePropertyOrThrow($, gbl, name, desc);
    if (IsAbrupt(define)) return define;
    needed.delete(name);
    for (const follow of $.rdeps.get(name) || []) {
      if (needed.has(follow)) build(follow);
    }
    return UNUSED;
  }
  for (const name of needed) {
    const result = build(name);
    if (IsAbrupt(result)) return result;
  }

  // TODO - if size is nonzero, report
  if (needed.size) {
    throw new Error(`Could not initialize global binding: ${[...needed].join(', ')}`);
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
export function InitializeHostDefinedRealm($: VM): CR<UNUSED> {
  // 1. Let realm be CreateRealm().
  const realm = CreateRealm($);
  // 2. Let newContext be a new execution context.
  // 3. Set the Function of newContext to null.
  // 4. Set the Realm of newContext to realm.
  // 5. Set the ScriptOrModule of newContext to null.
  const newContext = new ExecutionContext(null, null, realm, null);
  // 6. Push newContext onto the execution context stack; newContext
  //    is now the running execution context.
  $.executionStack.push(newContext);
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
  SetRealmGlobalObject(realm, undefined, undefined);
  // 10. Let globalObj be ? SetDefaultGlobalBindings(realm).
  // 11. Create any host-defined global object properties on globalObj.
  const globalObj = SetDefaultGlobalBindings($, realm);
  if (IsAbrupt(globalObj)) return globalObj;
  // 12. Return unused.
  return UNUSED;
}
