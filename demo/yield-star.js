function* f() { yield* g(); yield* g(); }
const g = function*() { yield 1; yield 2; }
const i = f();
console.log(i.next()); // { value: 1, done: false }
console.log(i.next()); // { value: 2, done: false }
console.log(i.next()); // { value: 1, done: false }
console.log(i.next()); // { value: 2, done: false }
console.log(i.next()); // { value: undefined, done: true }
