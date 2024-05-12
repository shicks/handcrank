describe('Object.defineProperty', () => {
  it('should retain property attributes that are not explicitly overwritten', () => {
    const o = {};
    Object.defineProperty(o, 'a', {configurable: true});
    expect(Object.getOwnPropertyDescriptor(o, 'a')).toEql({
      value: undefined,
      writable: false,
      enumerable: false,
      configurable: true,
    });
    Object.defineProperty(o, 'a', {enumerable: true, value: 1});
    expect(Object.getOwnPropertyDescriptor(o, 'a')).toEql({
      value: 1,
      writable: false,
      enumerable: true,
      configurable: true,
    });
    Object.defineProperty(o, 'a', {writable: true});
    expect(Object.getOwnPropertyDescriptor(o, 'a')).toEql({
      value: 1,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    const f = (x) => console.log(x);
    Object.defineProperty(o, 'a', {set: x});
    expect(Object.getOwnPropertyDescriptor(o, 'a')).toEql({
      get: undefined,
      set: f,
      enumerable: true,
      configurable: true,
    });
    Object.defineProperty(o, 'a', {writable: false});
    expect(Object.getOwnPropertyDescriptor(o, 'a')).toEql({
      value: undefined,
      writable: false,
      enumerable: true,
      configurable: true,
    });
  });
});
