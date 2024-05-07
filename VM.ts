import { parseScript } from 'esprima';

import { CR } from './CompletionRecord';
import { Val } from './Obj';
import { ExecutionContext } from './ExecutionContext';

export class VM {

  execStack: ExecutionContext[] = [];




  evaluateScript(script: string, filename?: string): CR<Val> {

  }
}
