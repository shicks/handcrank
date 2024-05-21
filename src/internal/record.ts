// Infrastructure for defining record classes.

/**
 * Superclass for a class that accepts slots.  All possible slots should be
 * declared here, as in
 * ```ts
 * class Obj extends Slots(slot => ({
 *   SlotName: slot<SlotType>,
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
 *
 * NOTE: we do not add function properties to the prototype because they don't
 * play nicely with overridden prototype methods on subclasses.
 */
type Field<in out T> = (arg: T) => T;
type ClassOf<T extends Record<string, Field<any>>> =
  {[K in keyof T]?: T[K] extends Field<infer U> ? U : never};

export function Slots<T extends Record<string, Field<any>>, const B>(
  fn: (slot: <U>(arg: U) => U) => T,
  _brand?: B,
): {[K in keyof T]: K} & {new(init?: ClassOf<T>): ClassOf<T> & {__brand__: B}} {
  const ctor = function(this: ClassOf<T>, init: ClassOf<T>) {
    if (init) {
      for (const key in init) {
        if (fields.has(key)) this[key] = init[key];
      }
    }
  } as any;
  const slot = <U,>(x: U) => x;
  const fields = new Set<keyof T>();
  const spec = fn(slot);
  for (const key in spec) {
    if (spec[key] === slot) {
      fields.add(key);
      ctor[key] = key;
    }
  }
  return ctor;
}

export function hasAnyFields(arg: {}) {
  if (!arg) return false;
  for (const _ in arg) return true;
  return false;
}

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
