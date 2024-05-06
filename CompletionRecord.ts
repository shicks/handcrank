export type CompletionType = 'normal'|'return'|'throw'|'continue'|'break';

// TODO - pass abrupt completions by throwing???

export class Abrupt {
  constructor(
    readonly Type: CompletionType,
    readonly Value: unknown,
    readonly Target?: string|undefined) {
  }
}

// CR = CompletionRecord
export type CR<T> = T|Abrupt;

export function IsAbrupt(x: CR<unknown>): x is Abrupt {
  return x instanceof Abrupt;
}

export function Throw(name: string, msg?: string): Abrupt {
  // TODO - actual errors
  return new Abrupt('throw', msg ? `${name}: ${msg}` : name);
}
