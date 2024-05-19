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

type FactoryOrCtor<R> = ((...args: any[]) => R)|(abstract new (...args: any[]) => R);
type Slots<F> = F extends FactoryOrCtor<infer R> ? {[K in keyof R]?: unknown} : never;

// export function withSlots<F extends FactoryOrCtor<any>, S extends {[K in keyof R]?: unknown}, F extends FactoryOrCtor<R>>(fn: F, slots: S): F & {[K in keyof S]: K} {
export function withSlots<F extends FactoryOrCtor<any>, S extends Slots<F>>(fn: F, slots: S): F & {[K in keyof S]: K} {
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
