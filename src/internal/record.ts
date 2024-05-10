// Infrastructure for defining record classes.

type OptOf<T> = {[K in keyof T]-?: {} extends Pick<T, K> ? K : never}[keyof T];
type FillOpt<T> = {[K in OptOf<T>]-?: T[K]};
type Rest<F extends RecordFor<any>> = OptOf<F> extends never ? [] : [FillOpt<F>];

type MakeRecordFn =
  <F extends RecordFor<object>>(name: string, ...rest: Rest<F>) => {
    (arg: F[RECORD_INIT]['type']): F;
    [Symbol.hasInstance](arg: unknown): arg is F;
  };

declare const RECORD_INIT: unique symbol;
type RECORD_INIT = typeof RECORD_INIT;

interface Inv<in out T> {
  inv(arg: T): T;
  type: T;
}

// Makes all fields required and adds a tag to keep track of the original version,
// so that `makeRecord` can unpack it.
export type RecordFor<T extends object> = T & {[RECORD_INIT]: Inv<T>};
//export type RecordFor<T> = {[K in keyof T]-?: T[K]} & {[RECORD_INIT]: T};

// NOTE: takes ownership of the object literal
export const makeRecord: MakeRecordFn = <F extends RecordFor<object>>() => {
  const instances = new WeakSet<F>();
  const fn = (obj: any) => {
    instances.add(obj);
    return obj;
  };
  Object.defineProperty(fn, Symbol.hasInstance,
                        {value: (arg: any) => instances.has(arg)});
  // TODO - any other static methods?
  return fn as any;
};

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
