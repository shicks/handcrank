import { GlobalEnvironmentRecord } from "./environment_record";

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

/**
 * 9.3.1 CreateRealm ( )
 *
 * The abstract operation CreateRealm takes no arguments and returns
 * a Realm Record. It performs the following steps when called:
 */
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
 */
export function CreateIntrinsics($: VM, realmRec: RealmRecord): UNUSED {
  // TODO - TABLE 6
  //      - this is a great place for plugins...?
  //        -> could be registered with VM

  // 1. Set realmRec.[[Intrinsics]] to a new Record.

  // 2. Set fields of realmRec.[[Intrinsics]] with the values listed
  // in Table 6. The field names are the names listed in column one of
  // the table. The value of each field is a new object value fully and
  // recursively populated with property values as defined by the
  // specification of each object in clauses 19 through 28. All object
  // property values are newly created object values. All values that
  // are built-in function objects are created by performing
  // CreateBuiltinFunction(steps, length, name, slots, realmRec,
  // prototype) where steps is the definition of that function provided
  // by this specification, name is the initial value of the function\'s
  // "name" property, length is the initial value of the function\'s
  // "length" property, slots is a list of the names, if any, of the
  // function\'s specified internal slots, and prototype is the
  // specified value of the function\'s [[Prototype]] internal slot. The
  // creation of the intrinsics and their properties must be ordered to
  // avoid any dependencies upon objects that have not yet been created.

  // 3. Perform
  // AddRestrictedFunctionProperties(realmRec.[[Intrinsics]].[[%Function.prototype%]],
  // realmRec).

  return UNUSED;
}

/**
 * 9.3.3 SetRealmGlobalObject ( realmRec, globalObj, thisValue )
 *
 * The abstract operation SetRealmGlobalObject takes arguments
 * realmRec (a Realm Record), globalObj (an Object or undefined), and
 * thisValue (an Object or undefined) and returns unused. It performs
 * the following steps when called:
 */
export function SetRealmGlobalObject(_$: VM,
                                     realmRec: RealmRecord,
                                     globalObj: Obj|undefined,
                                     thisValue: Obj|undefined): UNUSED {
  if (globalObj == undefined) {
    const intrinsics = realmRec.Intrinsics;
    globalObj = OrdinaryObjectCreate(intrinsice.get('%Object.prototype%'));
  }
  Assert(globalObj instanceof Obj);
  if (thisValue == undefined) thisValue = globalObj;
  realmRec.GlobalObj = globalObj;
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
 */
export function SetDefaultGlobalBindings($: VM, realmRec: RealmRecord): CR<Obj> {
  const gbl = realmRec.GlobalObject;
  for (const prop of $.defaultGlobals) { // ???
    // 2. For each property of the Global Object specified in clause 19, do
    //   a. Let name be the String value of the property name.
    //   b. Let desc be the fully populated data Property
    //      Descriptor for the property, containing the specified
    //      attributes for the property. For properties listed in 19.2,
    //      19.3, or 19.4 the value of the [[Value]] attribute is the
    //      corresponding intrinsic object from realmRec.
    //   c. Perform ? DefinePropertyOrThrow(global, name, desc).
  }
  return gbl;
}
