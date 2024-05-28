/** @fileoverview Defines infrastructure for slots. */

/**
 * Defines a "slots" object for "in" checking that's robust
 * to property renaming (but not to disambiguation).
 */
export function slots<const T extends Record<string, unknown>>(
  props: T,
): {[K in keyof T]: K} {
  const slots: any = {};
  for (const key in props) {
    slots[key] = key;
  }
  return slots;
}

/**
 * Superclass for Obj that automatically adds all declared
 * slots into the class.
 */
export function Slots<T>(): new() => T {
  return function() {} as any;
}

/** Tests whether there are any own properties in the given object. */
export function hasAnyFields(arg: {}) {
  if (!arg) return false;
  for (const key in arg) {
    if (Object.hasOwn(arg, key)) return true;
  }
  return false;
}

/** Memoize a value. */
export function memoize<T>(f: () => T) {
  return () => {
    const value = f();
    f = () => value;
    return value;
  }
}
