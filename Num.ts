import type {Type} from './Abstract';
import {Val} from './Val';

export class Num extends Val {
  override get Type(): 'number' { return 'number'; }
}
