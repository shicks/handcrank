// Infrastructure for defining record classes.

interface Branded {
  readonly __brand__: string|symbol;
}

type MakeRecordFn =
  <F extends Branded>() => {
    <T extends Omit<F, '__brand__'>>(arg: T, ...noBranded: T extends Branded ? [never] : []): F,
    clone(arg: F): F,
    [Symbol.hasInstance](arg: unknown): arg is F,
  };

// NOTE: takes ownership of the object literal
export const makeRecord: MakeRecordFn = <F extends {__brand__: string|symbol}>() => {
  const instances = new WeakSet<object>();
  const fn = (obj: any) => {
    if (instances.has(obj)) throw new Error(`record already tagged`);
    instances.add(obj);
    return obj;
  };
  Object.defineProperties(fn, {clone: {value(arg: F) { return fn({...(arg as any)}); }}});
  Object.defineProperty(fn, Symbol.hasInstance,
                        {value: (arg: any) => instances.has(arg)});
  // TODO - any other static methods?
  return fn as any;
};


/**
 * Superclass for a class that accepts slots.  All possible slots should be
 * declared here, as in
 * ```ts
 * class Obj extends Slots($ => ({
 *   SlotName: $<SlotType>,
 *   // ...
 * })) {
 *   // class body
 * }
 * ```
 * This defines both an optional instance property for each slot, as well as
 * a static constant string (keyof Obj) property on the constructor, which can
 * be used to query slot presence via `Obj.SlotName in obj`.  Subclasses that
 * concretely declare a given slot should override the property, and may want
 * to explicitly initialize it with `undefined!` (if needed) to ensure the slot
 * query works correctly.
 */
type Field<in out T> = (arg: T) => T;
type ClassOf<T extends Record<string, Field<any>>> =
  {[K in keyof T]?: T[K] extends Field<infer U> ? U : never};
export function Slots<T extends Record<string, Field<any>>, const B>(
  fn: ($: <U>(arg: U) => U) => T,
  _brand?: B,
): {[K in keyof T]: K} & {new(init?: ClassOf<T>): ClassOf<T> & {__brand__: B}} {
  const ctor = function(this: ClassOf<T>, init: ClassOf<T>) {
    if (init) {
      for (const key in init) {
        if (fields.has(key)) this[key] = init[key];
      }
    }
  } as any;
  const $ = <U,>(x: U) => x;
  const fields = new Set<keyof T>();
  const spec = fn($);
  for (const key in spec) {
    if (spec[key] === $) {
      fields.add(key);
      ctor[key] = key;
    }
  }
  return ctor;
}


// TODO - delete below this line????


type FactoryOrCtor<R> = ((...args: any[]) => R)|(abstract new (...args: any[]) => R);
type Slots<R> = {readonly [K in keyof R]?: unknown};

// type OptionalKeys<T> = {[K in keyof T]-?: T extends {[K1 in K]-?: T[K]} ? never : K}[keyof T];
// type Slots<R> =
//   {readonly [K in OptionalKeys<R>]-?: unknown} &
//   {readonly [K in Exclude<keyof R, OptionalKeys<R>>]?: unknown};

/**
 * Adds static properties for each slot, in a way that's robust to
 * property renaming.
 */
export function withSlots<R, F extends FactoryOrCtor<R>, S extends Slots<R>>(
  fn: F,
  slots: S,
): F & {[K in keyof S]: K} {
  for (const key in slots) {
    if (Object.hasOwn(slots, key)) (fn as any)[key] = key;
  }
  return fn as any;
}


/**
 * Returns whether the slot is present - note that the return type is
 * over-narrowed if the optional type includes `undefined`, since
 * TypeScript cannot distinguish `{x?: T|undefined}` from `{x?: T}`.
 */
export function hasSlot<T extends {}, F extends keyof T>(obj: T, slot: F): obj is T&{[K in F]-?: T[K]} {
  return slot in obj;
}


// export function unbrand<F extends Branded>(arg: F): Omit<F, '__brand__'> {
//   return arg;
// }

export function hasAnyFields(rec: object): boolean {
  for (const _ in rec) return true;
  return false;
}

// /** Makes a function cached lazily. */
// export function memoize<F>(fn: () => F): () => F {
//   let out = () => {
//     const result = fn();
//     out = () => result;
//     return result;
//   };
//   return () => out();
// }

/**
 * Allows subclassing a class that may not yet be fully initialized.
 * The super class is evaluated lazily on the first instantiation.
 * Note that static methods are NOT copied over since they would not
 * be available before the first instantiation.
 */
export function lazySuper<F, A extends unknown[]>(fn: () => abstract new(...args: A) => F): abstract new(...args: A) => F {
  let ctor: abstract new(...args: A) => F;
  function cls() {
    if (!ctor) {
      ctor = fn();
      Object.setPrototypeOf(cls.prototype, ctor.prototype);
    }
    return Reflect.construct(ctor, arguments, new.target);
  }
  return cls as any;
}
