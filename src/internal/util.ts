// Take a template array and return a string with the template values interpolated
// and all whitespace collapsed into a single space.
export function trimInternal(array: TemplateStringsArray, ...values: unknown[]): string {
  let result = '';
  for (let i = 0; i < array.length; i++) {
    result += array[i];
    if (i < values.length) {
      result += String(values[i]);
    }
  }
  return result.replace(/\s+/g, ' ').trim();
}
