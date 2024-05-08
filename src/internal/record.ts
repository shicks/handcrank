// Infrastructure for defining record classes.

type OptOf<T> = {[K in keyof T]-?: {} extends Pick<T, K> ? K : never}[keyof T];
type FillOpt<T> = {[K in OptOf<T>]-?: T[K]};
type Rest<F extends RecordFor<any>> = OptOf<F> extends never ? [] : [FillOpt<F>];

export interface FauxCtor<T, A extends unknown[]> {
  (...args: A): T;
  readonly [Symbol.hasInstance]: (arg: unknown) => arg is T;
}

type MakeRecordFn =
  <F extends RecordFor<any>>(name: string, ...rest: Rest<F>) => {
    (arg: F[RECORD_INIT]): F;
    [Symbol.hasInstance](arg: unknown): arg is F;
  };

declare const RECORD_INIT: unique symbol;
type RECORD_INIT = typeof RECORD_INIT;

// Makes all fields required and adds a tag to keep track of the original version,
// so that `makeRecord` can unpack it.
export type RecordFor<T> = {[K in keyof T]-?: T[K]} & {[RECORD_INIT]: T};

// NOTE: takes ownership of the object literal
export const makeRecord: MakeRecordFn = <F extends RecordFor<any>>(name: string, ...rest: Rest<F>) => {
  const sym = Symbol(name);
  const defs: Array<[string|symbol, unknown]> = [[sym, true]];
  for (const k in rest[0] || {}) {
    defs.push([k, (rest[0] as any)[k]]);
  }
  return withHasInstance(
    (obj: any) => {
      for (const [k, v] of defs) {
        if (!(k in obj)) obj[k] = v;
      }
      return obj;
    }, (arg: any) => arg && typeof arg === 'object' && arg[sym]) as any;
};

export function withHasInstance<F, H>(fn: F, hi: H): F&{readonly [Symbol.hasInstance]: H} {
  Object.defineProperty(fn, Symbol.hasInstance, {value: hi});
  return fn as F&{readonly [Symbol.hasInstance]: H};
}

// There are a few alternative ways to do this.  For instance, a
// "dumber" version that only relies on static inheritance
//
// ```ts
// class Rec {
//   protected constructor() {}
//   static of<T extends typeof Rec>(this: T, obj: T['prototype']): T['prototype'] {
//     const result: any = new (this as unknown as {new(): T})();
//     for (const key in obj) {
//       result[key] = obj[key];
//     }
//     return result;
//   }
// }
//
// export class ReferenceRecord extends Rec {
//   readonly Base!: string;
//   readonly Index!: number;
//   readonly Strict!: boolean;
// }
//
// const r = ReferenceRecord.of({Base: 'x', Index: 1, Strict: true});
// ```
//
// or a slightly inverted version that calls the function before
// defining the type
//
// ```ts
// type AllReq<T> = {[K in keyof T]-?: T[K]};
// type OptOf<T> = {[K in keyof T]-?: {} extends Pick<T, K> ? K : never}[keyof T];
// type FillOpt<T> = {[K in OptOf<T>]-?: T[K]};
// type Rest<T> = OptOf<T> extends never ? [] : [FillOpt<T>];
//
// // NOTE: takes ownership of the object literal
// function makeRecord<F>(name: string, ...rest: Rest<F>): ((arg: F) => AllReq<F>) {
//   const sym = Symbol(name);
//   const defs: Array<[string|symbol, unknown]> = [[sym, true]];
//   for (const k in rest[0] || {}) {
//     defs.push([k, (rest[0] as any)[k]]);
//   }
//   function brand(obj: any) {
//     for (const [k, v] of defs) {
//       if (!(k in obj)) obj[k] = v;
//     }
//     return obj;
//   }
//   Object.defineProperty(brand, Symbol.hasInstance, {value: (arg: any) => arg && arg[sym]});
//   return brand;
// }
//
// const ReferenceRecord = makeRecord<{
//   Base: string,
//   readonly Index: number,
//   readonly Strict?: boolean,
// }>('ReferenceRecord', {
//   Strict: false,
// });
// type ReferenceRecord = ReturnType<typeof ReferenceRecord>;
// ```
//
// The benefit to our current `interface extends` approach is that
// LSP keeps the name opaque.
