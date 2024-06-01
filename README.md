# Tree8

A JavaScript virtual machine that runs on ESTree syntax trees (e.g. tesprima, etc).  Takes a pedantic approach by implementing the abstract operations from the ECMA-262 spec very literally.

## Features

[x] Evaluate arithmetic
[x] Bind variables
    [x] with const/let
    [x] with var
    [x] implicitly (sloppy)
[x] Standard globals
[x] Basic primitive types and wrappers
    [x] Number
    [x] String
    [x] Symbol
    [x] Boolean
    [ ] BigInt
[ ] Well-known Object types
    [x] Object
        [ ] static methods
        [x] instance methods
    [x] Function
        [ ] instance methods
    [x] Error
        [x] all subtypes
        [x] throwable
        [x] stack traces
    [ ] Array
    [ ] RegExp
    [ ] Arguments
    [ ] Map
    [ ] Set
    [ ] WeakMap / WeakSet
[x] Define functions
    [x] vanilla declarations
    [x] vanilla expressions
    [ ] arrow functions
    [ ] generators
    [ ] async
    [ ] async arrows
[x] Call functions
[ ] Template string literals
[ ] Syntax
    [x] Object literals
    [ ] Array literals
    [ ] Destructuring
    [ ] ++ and -- operators
