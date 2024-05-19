/**
 * 6.1.7.4 Well-Known Intrinsic Objects
 *
 * Well-known intrinsics are built-in objects that are explicitly
 * referenced by the algorithms of this specification and which
 * usually have realm-specific identities. Unless otherwise specified
 * each intrinsic object actually corresponds to a set of similar
 * objects, one per realm.
 *
 * Within this specification a reference such as %name% means the
 * intrinsic object, associated with the current realm, corresponding
 * to the name. A reference such as %name.a.b% means, as if the "b"
 * property of the value of the "a" property of the intrinsic object
 * %name% was accessed prior to any ECMAScript code being
 * evaluated. Determination of the current realm and its intrinsics is
 * described in 9.4. The well-known intrinsics are listed in Table 6.
 *
 * NOTE: Additional entries in Table 91.
 */
export enum Intrinsic {
  /** The AggregateError constructor (20.5.7.1) */
  AggregateError = '%AggregateError%',
  /** The Array constructor (23.1.1) */
  Array = '%Array%',
  /** The ArrayBuffer constructor (25.1.3) */
  ArrayBuffer = '%ArrayBuffer%',
  /** The prototype of Array iterator objects (23.1.5) */
  ArrayIteratorPrototype = '%ArrayIteratorPrototype%',
  /** The prototype of async-from-sync iterator objects (27.1.4) */
  AsyncFromSyncIteratorPrototype = '%AsyncFromSyncIteratorPrototype%',
  /** The constructor of async function objects (27.7.1) */
  AsyncFunction = '%AsyncFunction%',
  /** The constructor of async iterator objects (27.4.1) */
  AsyncGeneratorFunction = '%AsyncGeneratorFunction%',
  /** An object that all standard built-in async iterator objects indirectly inherit from */
  AsyncIteratorPrototype = '%AsyncIteratorPrototype%',
  /** The Atomics object (25.4) */
  Atomics = '%Atomics%',
  /** The BigInt constructor (21.2.1) */
  BigInt = '%BigInt%',
  /** The BigInt64Array constructor (23.2) */
  BigInt64Array = '%BigInt64Array%',
  /** The BigUint64Array constructor (23.2) */
  BigUint64Array = '%BigUint64Array%',
  /** The Boolean constructor (20.3.1) */
  Boolean = '%Boolean%',
  /** The DataView constructor (25.3.2) */
  DataView = '%DataView%',
  /** The Date constructor (21.4.2) */
  Date = '%Date%',
  /** The decodeURI function (19.2.6.1) */
  decodeURI = '%decodeURI%',
  /** The decodeURIComponent function (19.2.6.2) */
  decodeURIComponent = '%decodeURIComponent%',
  /** The encodeURI function (19.2.6.3) */
  encodeURI = '%encodeURI%',
  /** The encodeURIComponent function (19.2.6.4) */
  encodeURIComponent = '%encodeURIComponent%',
  /** The Error constructor (20.5.1) */
  Error = '%Error%',
  /** The eval function (19.2.1) */
  eval = '%eval%',
  /** The EvalError constructor (20.5.5.1) */
  EvalError = '%EvalError%',
  /** The FinalizationRegistry constructor (26.2.1) */
  FinalizationRegistry = '%FinalizationRegistry%',
  /** The Float32Array constructor (23.2) */
  Float32Array = '%Float32Array%',
  /** The Float64Array constructor (23.2) */
  Float64Array = '%Float64Array%',
  /** The prototype of For-In iterator objects (14.7.5.10) */
  ForInIteratorPrototype = '%ForInIteratorPrototype%',
  /** The Function constructor (20.2.1) */
  Function = '%Function%',
  /** The constructor of Generators (27.3.1) */
  GeneratorFunction = '%GeneratorFunction%',
  /** The Int8Array constructor (23.2) */
  Int8Array = '%Int8Array%',
  /** The Int16Array constructor (23.2) */
  Int16Array = '%Int16Array%',
  /** The Int32Array constructor (23.2) */
  Int32Array = '%Int32Array%',
  /** The isFinite function (19.2.2) */
  isFinite = '%isFinite%',
  /** The isNaN function (19.2.3) */
  isNaN = '%isNaN%',
  /** An object that all standard built-in iterator objects indirectly inherit from */
  IteratorPrototype = '%IteratorPrototype%',
  /** The JSON object (25.5) */
  JSON = '%JSON%',
  /** The Map constructor (24.1.1) */
  Map = '%Map%',
  /** The prototype of Map iterator objects (24.1.5) */
  MapIteratorPrototype = '%MapIteratorPrototype%',
  /** The Math object (21.3) */
  Math = '%Math%',
  /** The Number constructor (21.1.1) */
  Number = '%Number%',
  /** The Object constructor (20.1.1) */
  Object = '%Object%',
  /** The parseFloat function (19.2.4) */
  parseFloat = '%parseFloat%',
  /** The parseInt function (19.2.5) */
  parseInt = '%parseInt%',
  /** The Promise constructor (27.2.3) */
  Promise = '%Promise%',
  /** The Proxy constructor (28.2.1) */
  Proxy = '%Proxy%',
  /** The RangeError constructor (20.5.5.2) */
  RangeError = '%RangeError%',
  /** The ReferenceError constructor (20.5.5.3) */
  ReferenceError = '%ReferenceError%',
  /** The Reflect object (28.1) */
  Reflect = '%Reflect%',
  /** The RegExp constructor (22.2.4) */
  RegExp = '%RegExp%',
  /** The prototype of RegExp String Iterator objects (22.2.9) */
  RegExpStringIteratorPrototype = '%RegExpStringIteratorPrototype%',
  /** The Set constructor (24.2.1) */
  Set = '%Set%',
  /** The prototype of Set iterator objects (24.2.5) */
  SetIteratorPrototype = '%SetIteratorPrototype%',
  /** The SharedArrayBuffer constructor (25.2.2) */
  SharedArrayBuffer = '%SharedArrayBuffer%',
  /** The String constructor (22.1.1) */
  String = '%String%',
  /** The prototype of String iterator objects (22.1.5) */
  StringIteratorPrototype = '%StringIteratorPrototype%',
  /** The Symbol constructor (20.4.1) */
  Symbol = '%Symbol%',
  /** The SyntaxError constructor (20.5.5.4) */
  SyntaxError = '%SyntaxError%',
  /** A function object that unconditionally throws a new instance of %TypeError% */
  ThrowTypeError = '%ThrowTypeError%',
  /** The super class of all typed Array constructors (23.2.1) */
  TypedArray = '%TypedArray%',
  /** The TypeError constructor (20.5.5.5) */
  TypeError = '%TypeError%',
  /** The Uint8Array constructor (23.2) */
  Uint8Array = '%Uint8Array%',
  /** The Uint8ClampedArray constructor (23.2) */
  Uint8ClampedArray = '%Uint8ClampedArray%',
  /** The Uint16Array constructor (23.2) */
  Uint16Array = '%Uint16Array%',
  /** The Uint32Array constructor (23.2) */
  Uint32Array = '%Uint32Array%',
  /** The URIError constructor (20.5.5.6) */
  URIError = '%URIError%',
  /** The WeakMap constructor (24.3.1) */
  WeakMap = '%WeakMap%',
  /** The WeakRef constructor (26.1.1) */
  WeakRef = '%WeakRef%',
  /** The WeakSet constructor (24.4.1) */
  WeakSet = '%WeakSet%',
}

export const globals = new Map<string, Intrinsic>([
  ['AggregateError', Intrinsic.AggregateError],
  ['Array', Intrinsic.Array],
  ['ArrayBuffer', Intrinsic.ArrayBuffer],
  ['Atomics', Intrinsic.Atomics],
  ['BigInt', Intrinsic.BigInt],
  ['BigInt64Array', Intrinsic.BigInt64Array],
  ['BigUint64Array', Intrinsic.BigUint64Array],
  ['Boolean', Intrinsic.Boolean],
  ['DataView', Intrinsic.DataView],
  ['Date', Intrinsic.Date],
  ['decodeURI', Intrinsic.decodeURI],
  ['decodeURIComponent', Intrinsic.decodeURIComponent],
  ['encodeURI', Intrinsic.encodeURI],
  ['encodeURIComponent', Intrinsic.encodeURIComponent],
  ['Error', Intrinsic.Error],
  ['eval', Intrinsic.eval],
  ['EvalError', Intrinsic.EvalError],
  ['FinalizationRegistry', Intrinsic.FinalizationRegistry],
  ['Float32Array', Intrinsic.Float32Array],
  ['Float64Array', Intrinsic.Float64Array],
  ['Function', Intrinsic.Function],
  ['Int8Array', Intrinsic.Int8Array],
  ['Int16Array', Intrinsic.Int16Array],
  ['Int32Array', Intrinsic.Int32Array],
  ['isFinite', Intrinsic.isFinite],
  ['isNaN', Intrinsic.isNaN],
  ['JSON', Intrinsic.JSON],
  ['Map', Intrinsic.Map],
  ['Math', Intrinsic.Math],
  ['Number', Intrinsic.Number],
  ['Object', Intrinsic.Object],
  ['parseFloat', Intrinsic.parseFloat],
  ['parseInt', Intrinsic.parseInt],
  ['Promise', Intrinsic.Promise],
  ['Proxy', Intrinsic.Proxy],
  ['RangeError', Intrinsic.RangeError],
  ['ReferenceError', Intrinsic.ReferenceError],
  ['Reflect', Intrinsic.Reflect],
  ['RegExp', Intrinsic.RegExp],
  ['Set', Intrinsic.Set],
  ['SharedArrayBuffer', Intrinsic.SharedArrayBuffer],
  ['String', Intrinsic.String],
  ['Symbol', Intrinsic.Symbol],
  ['SyntaxError', Intrinsic.SyntaxError],
  ['TypeError', Intrinsic.TypeError],
  ['Uint8Array', Intrinsic.Uint8Array],
  ['Uint8ClampedArray', Intrinsic.Uint8ClampedArray],
  ['Uint16Array', Intrinsic.Uint16Array],
  ['Uint32Array', Intrinsic.Uint32Array],
  ['URIError', Intrinsic.URIError],
  ['WeakMap', Intrinsic.WeakMap],
  ['WeakRef', Intrinsic.WeakRef],
  ['WeakSet', Intrinsic.WeakSet],
]);
