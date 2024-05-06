import { GetIdentifierReference } from './Abstract';
import { Assert } from './Assert';
import { CR } from './CompletionRecord';
import { EnvironmentRecord } from './EnvironmentRecord';
import { ExecutionContext } from './ExecutionContext';
import { Obj, Val } from './Obj';
import { ReferenceRecord } from './ReferenceRecord';

export class InternalVM {
  executionContextStack: ExecutionContext[] = [];

  // GetActiveScriptOrModule(): ScriptRecord|ModuleRecord|null {
  //   // 9.4.1
  //   for (let i = this.executionContextStack.length - 1; i >= 0; i--) {
  //     const ec = this.executionContextStack[i];
  //     if (ec.ScriptOrModule) return ec.ScriptOrModule;
  //   }
  //   return null;
  // }

  ResolveBinding(name: string, env?: EnvironmentRecord): CR<ReferenceRecord> {
    // 9.4.2
    const ec = this.executionContextStack[this.executionContextStack.length - 1];
    if (!env) {
      if (!ec) throw new Error(`Expected to have a running context...?`);
      env = ec.LexicalEnvironment;
    }
    Assert(() => env instanceof EnvironmentRecord);
    const strict = ec ? ec.isStrict : false;
    return GetIdentifierReference(env, name, strict);
  }
}

