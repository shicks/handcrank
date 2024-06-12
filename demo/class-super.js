class B {
  constructor() {
    this.foo = 1;
  }
  bar() {
    return this.foo + 1;
  }
}

class C extends B {
  constructor() {
    super();
    this.baz = 2;
  }
  qux() {
    return this.bar() + this.baz;
  }
}

console.log(new C().qux());
