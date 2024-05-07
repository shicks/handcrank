import { EnvironmentRecord } from './environment_record';

export class ExecutionContext {
  //Function?: Obj;
  //Realm: RealmRecord;
  //ScriptOrModule: ScriptRecord|ModuleRecord;

  // TODO - is there an ExecutionContext that isn't a CodeExecutionContext?
  //      - if so, then maybe the ctor params below are pulled out for code only

  isStrict: boolean = false;

  constructor(
    readonly LexicalEnvironment: EnvironmentRecord,
    readonly VariableEnvironment: EnvironmentRecord,
    //PrivateEnvironment?: PrivateEnvironmentRecord;
    //Generator?: Gen;
  ) { }
}
