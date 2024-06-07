function IsArrayIndex(s: string) {
  const n = Number(s) >>> 0;
  return s === String(n);
}
export default function findKeysAbove(keys: string[], len: number): string[] {
  let a = 0;
  let c = keys.length;
  // We have three ranges in the input:
  //  1. [0, first) are array indexes less than len
  //  2. [first, end) are array indexes greater than or equal to len
  //  3. [end, keys.length) are non-array indexes
  // To do this binary search, we maintain the following invariant:
  //  a < first < b < end < c
  // We therefore need to start by finding a valid b:
  let b;
  while (a < c) {
    const m = (a + c) >>> 1;
    const v = keys[m];
    if (!IsArrayIndex(v)) {
      // m >= end, so move c:=m
      c = m;
    } else if (Number(v) < len) {
      // m < first, so move a:=m
      a = m + 1;
    } else {
      // m >= first: we've found b
      b = m;
      break;
    }
  }
  if (b == null) {
    // We didn't find anything, so return an empty range.
    return [];
  }
  // Now narrow between a and b to find first.
  let first = b;
  while (a < first) {
    const m: number = (a + first) >>> 1;
    const v = keys[m];
    if (Number(v) < len) {
      a = m + 1;
    } else {
      first = m;
    }
  }
  // Now narrow between b and c to find end.
  let end = c;
  while (b < end) {
    const m: number = (b + end) >>> 1;
    const v = keys[m];
    if (IsArrayIndex(v)) {
      b = m + 1;
    } else {
      end = m;
    }
  }
  return keys.slice(first, end);
}
