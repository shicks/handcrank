class C {
  #x = 1;
  #y() {}
  foo() {
    console.log(this.#x++);
  }
}

const c = new C();
c.foo();
c.foo();
c.foo();
