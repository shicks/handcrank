import { syntax } from './internal/syntax';
import { arithmetic } from './internal/arithmetic';
import { fundamental } from './internal/fundamental';
import { arrayObject } from './internal/exotic_array';
import { stringObject } from './internal/exotic_string';
import { errorObject } from './internal/error_object';
import { consoleObject } from './internal/console';
import { iterators } from './internal/iterators';
import { generators } from './internal/generator';
import { CreateBuiltinFunction, CreateBuiltinFunctionFromClosure, functions } from './internal/func';
import { controlFlow } from './internal/control_flow';
import { classes } from './internal/class';
import { taggedTemplateLiterals, templateLiterals } from './internal/template';
import { Plugin, when } from './internal/vm';
import { regexp } from './internal/regexp';
import { promises } from './internal/promise';
import { asyncFunctions } from './internal/asyncfunction';

export const full: Plugin = {
  id: 'full',
  deps: () => [
    syntax,
    arithmetic,
    fundamental,
    arrayObject,
    stringObject,
    errorObject,
    consoleObject,
    iterators,
    generators,
    functions,
    controlFlow,
    classes,
    templateLiterals,
    taggedTemplateLiterals,
    regexp,
    promises,
    asyncFunctions,
  ],

  // TODO - remove this once we implement async generators
  syntax: {
    InstantiateFunctionObject(on) {
      on('FunctionDeclaration',
         when(n => n.async && n.generator, function($) { return CreateBuiltinFunctionFromClosure(function*() { return undefined; }, 0, '', {$}); }));
    },
    Evaluation(on) {
      on(['ArrowFunctionExpression', 'FunctionExpression'],
         when(n => n.async && n.generator, function*($) { return CreateBuiltinFunctionFromClosure(function*() { return undefined; }, 0, '', {$}); }));
    },
  },

};

export {
  syntax,
  arithmetic,
  fundamental,
  arrayObject,
  stringObject,
  errorObject,
  consoleObject,
  iterators,
  generators,
  functions,
  controlFlow,
  classes,
  templateLiterals,
  taggedTemplateLiterals,
  regexp,
  promises,
  asyncFunctions,
};
