function* fib() {
  let a = 0;
  let b = 1;
  while (true) {
    yield a;
    [a, b] = [b, a + b];
  }
}

function take(n, gen) {
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push(gen.next().value);
  }
  return result;
}

console.log([...take(50, fib())]);
