//import { parseScript } from 'esprima';

import { CR } from './completion_record';
import type { Val } from './values';
import type { ExecutionContext } from './execution_context';

export class VM {

  executionStack: ExecutionContext[] = [];

  // TODO - can we store strictness of executing production here?

  getRunningContext(): ExecutionContext {
    // TODO - how is this defined?
  }


  evaluateScript(script: string, filename?: string): CR<Val> {
    return null!;
  }
}
