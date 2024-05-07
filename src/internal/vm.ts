//import { parseScript } from 'esprima';

import { CR } from './completion_record';
import type { Val } from './values';
import type { ExecutionContext } from './execution_context';

export class VM {

  executionStack: ExecutionContext[] = [];



  evaluateScript(script: string, filename?: string): CR<Val> {
    return null!;
  }
}
