function* f() {
  yield 1;
  const x = yield 2;
  yield x + 1;
  return 4;
}
const i = f();
console.log(i.next());  // { value: 1, done: false }
console.log(i.next());  // { value: 2, done: false }
console.log(i.next(5)); // { value: 6, done: false }
console.log(i.next());  // { value: 4, done: true }
