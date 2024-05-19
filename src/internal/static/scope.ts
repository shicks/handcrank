/** @fileoverview 8.2 Scope Analysis */

import { Node } from '../tree';

/**
 * 8.2.1 Static Semantics: BoundNames
 *
 * The syntax-directed operation BoundNames takes no arguments and
 * returns a List of Strings.
 * 
 * NOTE: "*default*" is used within this specification as a synthetic
 * name for a module's default export when it does not have another
 * name. An entry in the module's [[Environment]] is created with that
 * name and holds the corresponding value, and resolving the export
 * named "default" by calling ResolveExport ( exportName [ ,
 * resolveSet ] ) for the module will return a ResolvedBinding Record
 * whose [[BindingName]] is "*default*", which will then resolve in
 * the module's [[Environment]] to the above-mentioned value. This is
 * done only for ease of specification, so that anonymous default
 * exports can be resolved like any other export. This "*default*"
 * string is never accessible to ECMAScript code or to the module
 * linking algorithm.
 */
export function BoundNames(node: Node, names: string[] = []): string[] {
  function visit(node: Node|undefined|null) {
    switch (node?.type) {
      case 'ArrayPattern':
        node.elements.forEach(visit)
        return;
      case 'ObjectPattern':
        node.properties.forEach(visit)
        return;
      case 'Property':
        visit(node.key);
        return;
      case 'RestElement':
        visit(node.argument);
        return;
      case 'AssignmentPattern':
        visit(node.left);
        return;
      case 'Identifier':
        names.push(node.name);
        return;
      case 'VariableDeclaration':
        node.declarations.forEach(visit);
        return;

      case 'ExportDefaultDeclaration':
        names.push('*default*');
        // fall-through
      case 'ExportNamedDeclaration':
        // NOTE: type checker complains about MaybeNamedClassDecl but it's fine
        visit(node.declaration as Node);
        return;

      case 'ImportDeclaration':
        node.specifiers.forEach(visit);
        return;
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
      case 'ImportSpecifier':
        visit(node.local);
        return;

      case 'ClassDeclaration':
      case 'FunctionDeclaration':
      case 'VariableDeclarator':
        if (node.id == null) {
          names.push('*default*');
        } else {
          visit(node.id);
        }
        return;
    }
  }
  visit(node);
  return names;
}

/**
 * 8.2.3 Static Semantics: IsConstantDeclaration
 *
 * The syntax-directed operation IsConstantDeclaration takes no
 * arguments and returns a Boolean.
 *
 * NOTE: It is not necessary to treat export default
 * AssignmentExpression as a constant declaration because there is no
 * syntax that permits assignment to the internal bound name used to
 * reference a module's default object.
 */
export function IsConstantDeclaration(node: Node): boolean {
  return node.type === 'VariableDeclaration' && node.kind === 'const';
}

/**
 * 8.2.4 Static Semantics: LexicallyDeclaredNames
 *
 * The syntax-directed operation LexicallyDeclaredNames takes no
 * arguments and returns a List of Strings.
 *
 * NOTE 1: At the top level of a Script, function declarations are
 * treated like var declarations rather than like lexical
 * declarations.
 * 
 * NOTE 2: The LexicallyDeclaredNames of a Module includes the names
 * of all of its imported bindings.
 *
 * NOTE 3: At the top level of a Module, function declarations are
 * treated like lexical declarations rather than like var
 * declarations. This is difficult to observe, but shows up when
 * `var f; function f() {}` is allowed at top level, but is a
 * SyntaxError when enclosed in a block scope.
 *
 * ---
 *
 * 8.2.8 Static Semantics: TopLevelLexicallyDeclaredNames
 *
 * The syntax-directed operation TopLevelLexicallyDeclaredNames takes
 * no arguments and returns a List of Strings.
 *
 * NOTE: This is basically the same as LexicallyDeclaredNames except
 * that it treats top-level functions as `var` instead of `let`.
 * Block-scoped functions are always treated as `let`.
 */
export function LexicallyDeclaredNames(node: Node, topLevel: boolean): string[] {
  const names: string[] = [];
  visitLexicallyScopedDecls(node, topLevel, (n) => BoundNames(n, names));
  return names;
}

/**
 * 8.2.5 Static Semantics: LexicallyScopedDeclarations
 *
 * The syntax-directed operation LexicallyScopedDeclarations takes no
 * arguments and returns a List of Parse Nodes.
 *
 * ---
 *
 * 8.2.9 Static Semantics: TopLevelLexicallyScopedDeclarations
 *
 * The syntax-directed operation TopLevelLexicallyScopedDeclarations
 * takes no arguments and returns a List of Parse Nodes.
 */
export function LexicallyScopedDeclarations(node: Node, topLevel: boolean): Node[] {
  const nodes: Node[] = [];
  visitLexicallyScopedDecls(node, topLevel, (n) => nodes.push(n));
  return nodes;
}

/**
 * 8.2.6 Static Semantics: VarDeclaredNames
 *
 * The syntax-directed operation VarDeclaredNames takes no arguments
 * and returns a List of Strings. It is defined piecewise over the
 * following productions:
 *
 * ---
 *
 * 8.2.10 Static Semantics: TopLevelVarDeclaredNames
 *
 * The syntax-directed operation TopLevelVarDeclaredNames takes no
 * arguments and returns a List of Strings. It is defined piecewise
 * over the following productions:
 *
 * NOTE: At the top level of a function or script, inner function
 * declarations are treated like var declarations.
 */
export function VarDeclaredNames(node: Node, topLevel: boolean): string[] {
  const names: string[] = [];
  visitVarScopedDecls(node, topLevel, (n) => BoundNames(n, names));
  return names;
}

/**
 * 8.2.7 Static Semantics: VarScopedDeclarations
 *
 * The syntax-directed operation VarScopedDeclarations takes no
 * arguments and returns a List of Parse Nodes.
 *
 * ---
 *
 * 8.2.11 Static Semantics: TopLevelVarScopedDeclarations
 *
 * The syntax-directed operation TopLevelVarScopedDeclarations takes
 * no arguments and returns a List of Parse Nodes.
 */
export function VarScopedDeclarations(node: Node, topLevel: boolean): Node[] {
  const nodes: Node[] = [];
  visitVarScopedDecls(node, topLevel, (n) => nodes.push(n));
  return nodes;
}

type Visitor = (node: Node) => void;

function visitVarScopedDecls(node: Node, topLevel: boolean, visitor: Visitor): void {
  const visitTopLevel = (node: Node|undefined|null) => visit(node, true);
  const visitNested = (node: Node|undefined|null) => visit(node, false);
  function visit(node: Node|undefined|null, topLevel: boolean) {
    switch (node?.type) {
      case 'FunctionDeclaration':
        // NOTE: top-level functions are treatd as var.
        if (topLevel) visitor(node);
        return;
      case 'VariableDeclaration':
        // NOTE: `var` is not lexically declared.
        if (node.kind === 'var') visitor(node);
        return;
      case 'LabeledStatement':
        // NOTE: verified behavior w/ `var f; label: function f() {}`
        visit(node.body, topLevel);
        return;
      case 'SwitchCase':
        node.consequent.forEach(visitNested);
        return;
      case 'SwitchStatement':
        node.cases.forEach(visitNested);
        return;

      case 'StaticBlock':
      case 'Program':
        node.body.forEach(visitTopLevel);
        return;

      case 'IfStatement':
        visitNested(node.consequent);
        visitNested(node.alternate);
        return;
      case 'ForStatement':
        visitNested(node.init);
        visitNested(node.body);
        return;
      case 'ForInStatement':
      case 'ForOfStatement':
        visitNested(node.left);
        visitNested(node.body);
        return;
      case 'DoWhileStatement':
      case 'WhileStatement':
        visitNested(node.body);
        return;
      case 'TryStatement':
        visitNested(node.block);
        visitNested(node.handler?.body);
        visitNested(node.finalizer);
        return;
      case 'WithStatement':
        visitNested(node.body);
    }
  }
  visit(node, topLevel);
}

function visitLexicallyScopedDecls(node: Node, topLevel: boolean, visitor: Visitor): void {
  const visitTopLevel = (node: Node|undefined|null) => visit(node, true);
  const visitNested = (node: Node|undefined|null) => visit(node, false);
  function visit(node: Node|undefined|null, topLevel: boolean) {
    switch (node?.type) {
      case 'VariableDeclaration':
        // NOTE: `var` is not lexically declared.
        if (node.kind !== 'var') visitor(node);
        return;
      case 'FunctionDeclaration':
        // NOTE: top-level functions are treatd as var.
        if (!topLevel) visitor(node);
        return;
      case 'ClassDeclaration':
        visitor(node);
        return;

      case 'LabeledStatement':
        // NOTE: verified behavior w/ `var f; label: function f() {}`
        visit(node.body, topLevel);
        return;
      case 'SwitchCase':
        node.consequent.forEach(visitNested);
        return;

      case 'StaticBlock':
      case 'Program':
        node.body.forEach(visitTopLevel);
        return;

      case 'ExportDefaultDeclaration':
      case 'ExportNamedDeclaration':
        visitNested(node.declaration as Node);
        return;

      case 'ImportDeclaration':
        node.specifiers.forEach(visitNested);
        return;
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
      case 'ImportSpecifier':
        visitNested(node.local);
        return;
    }
  }
  visit(node, topLevel);
}

/**
 * 16.1.2 Static Semantics: IsStrict
 *
 * The syntax-directed operation IsStrict takes no arguments and
 * returns a Boolean. It is defined piecewise over the following
 * productions:
 *
 * Script : ScriptBodyopt
 * 1. If ScriptBody is present and the Directive Prologue of
 * ScriptBody contains a Use Strict Directive, return true; otherwise,
 * return false.
 */
export function markStrictScopes(n: Node, strict: boolean): void {
  // TODO - modules are always strict
  //      - recognize {type: 'Directive', directive: 'use strict'}
  //      - function bodies (rest/inits), programs, class bodies, etc


}
