// TODO - how to compile these away conditionally???

const ENABLE_ASSERTS = true;

export function Assert(arg: unknown): asserts arg {
  if (ENABLE_ASSERTS && !arg) throw new Error(`Assertion failed`);
}
