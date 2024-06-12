# Handcrank

A JavaScript sandbox virtual machine that runs on ESTree syntax trees
(e.g. esprima, etc).  Takes a pedantic approach by implementing the
abstract operations from the ECMA-262 spec very literally.  Evaluation
is done via generators to support stepping through code for debugging
and to avoid infinite loops.

It provides a safe sandbox environment for evaluating JavaScript code
without allowing any access to the host environment, since all
operations are fully emulated.  Additional objects can be added to the
environment to allow safe evaluation of user-provided scripts in the
browser or on the server.

## TODO

- classes
- array/function instance methods

## Features

- [x] Evaluate arithmetic
- [x] Bind variables
    - [x] with const/let
    - [x] with var
    - [x] implicitly (sloppy)
- [x] Standard globals
- [x] Basic primitive types and wrappers
    - [x] Number
        - [ ] Math
    - [x] String
    - [x] Symbol
    - [x] Boolean
    - [ ] BigInt
- [ ] Well-known Object types
    - [x] Object
        - [x] static methods
            - [ ] Object.fromEntries
        - [x] instance methods
    - [x] Function
    - [x] Error
        - [x] all subtypes
        - [x] throwable
        - [x] stack traces
    - [x] Array
        - [ ] instance methods
    - [x] Iterators
    - [ ] RegExp
    - [ ] Arguments
    - [ ] Map
    - [ ] Set
    - [ ] WeakMap / WeakSet
- [x] Define functions
    - [x] vanilla declarations
    - [x] vanilla expressions
    - [x] arrow functions
    - [x] generators
    - [ ] async
    - [ ] async arrows
- [x] Call functions
- [ ] Template string literals
- [ ] Syntax
    - [x] object literals
    - [x] array literals
    - [x] destructuring
    - [x] spread
    - [x] binary operators
    - [x] unary operators
    - [x] ++ and -- operators
    - [x] control structures
        - [x] for
        - [x] if
        - [x] while
        - [x] try
        - [x] switch
        - [x] with
    - [x] classes
        - [x] class fields
        - [x] private fields
        - [ ] super
    - [ ] use strict
