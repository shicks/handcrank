/**
 * @fileoverview Look for early errors in the syntax.
 */

import { Node } from 'estree';
import { traversePostorder } from '../tree';
import { LexicallyDeclaredNames, VarDeclaredNames } from './scope';

export function analyze(n: Node): string[] {
  const errors: string[] = [];
  traversePostorder(n, (n) => {
    switch (n.type) {
      case 'Program':
      case 'BlockStatement':
        const varNames = new Set(VarDeclaredNames(n.body));
        const lexNames = LexicallyDeclaredNames(n.body);
        for (const name of lexNames) {
          if (varNames.has(name)) {
            errors.push(`Identifier '${name}' has already been declared`);
          }
        }
    }
  });
  return errors;
}
