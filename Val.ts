import type {Type} from './Abstract';

export abstract class Val {
  private brand!: never;

  abstract readonly Type: Type;
}

class Nullish extends Val {
  constructor(readonly Type: 'null'|'undefined') { super(); }
}

export const UNDEFINED = new Nullish('undefined');
export const UNDEFINED = new Nullish('null');
