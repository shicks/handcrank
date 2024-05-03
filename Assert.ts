// TODO - how to compile these away conditionally???

import {CompletionRecord} from './CompletionRecord';

export function Assert(pred: () => boolean) {
  if (!pred()) throw new Error(`Assertion failed`);
}

export function Must<T>(result: CompletionRecord<T>): T {
  if (!result.isNormal()) throw new Error(`Assertion failed`);
  return result.Value;
}
