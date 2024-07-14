import { syntax } from './internal/syntax';
import { arithmetic } from './internal/arithmetic';
import { fundamental } from './internal/fundamental';
import { arrayObject } from './internal/exotic_array';
import { stringObject } from './internal/exotic_string';
import { errorObject } from './internal/error_object';
import { consoleObject } from './internal/console';
import { iterators } from './internal/iterators';
import { generators } from './internal/generator';
import { functions } from './internal/func';
import { controlFlow } from './internal/control_flow';
import { classes } from './internal/class';
import { taggedTemplateLiterals, templateLiterals } from './internal/template';
import { Plugin } from './internal/vm';
import { regexp } from './internal/regexp';
import { promises } from './internal/promise';
import { asyncFunctions } from './internal/async_function';
import { asyncGenerators } from './internal/async_generator';
import { reflect } from './internal/reflect';
import { globalEval } from './internal/eval';
import { math } from './internal/math';
import { prelude } from './internal/prelude';

export const full: Plugin = {
  id: 'full',
  deps: () => [
    syntax,
    arithmetic,
    prelude,
    fundamental, // TODO - split this out
    math,
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
    asyncGenerators,
    reflect,
    globalEval,
  ],
};

export {
  syntax,
  arithmetic,
  prelude,
  fundamental,
  math,
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
  asyncGenerators,
  reflect,
  globalEval,
};
