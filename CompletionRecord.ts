import {Str} from './Str';

export type CompletionType = 'normal'|'return'|'throw'|'continue'|'break';

// TODO - pass abrupt completions by throwing???

export class Abrupt {
  private brand!: never;
  constructor(
    readonly Type: CompletionType,
    readonly Value: unknown,
    readonly Target?: string|undefined) {}
}

export class CompletionRecord<T> {
  constructor(
    readonly Value: T, // NOTE: we may want abrupt completions to allow unknown???
    readonly Target?: string|undefined) {}
  isNormal(): boolean {
    return this.Type === 'normal';
  }
  isAbrupt(): boolean {
    return this.Type !== 'normal';
  }

  static Normal(): CompletionRecord<void>;
  static Normal<T>(value: T): CompletionRecord<T>;
  static Normal(value?: unknown): CompletionRecord<any> {
    return new CompletionRecord('normal', value);
  }

  static Throw(name: string, message: string): CompletionRecord<never> {
    // TODO - enhanced messages, proper error ctor
    return new CompletionRecord<never>('throw', new Str(`${name}: ${message}`) as never);
  }
}
