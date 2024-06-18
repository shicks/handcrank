import type { BlockStatement, ClassBody, MethodDefinition, Node, Program, Property, PropertyDefinition, StaticBlock } from 'estree';

export { Node, Program };

export type BlockLike = BlockStatement | Program | StaticBlock;
export function isBlockLike(n: Node): n is BlockLike {
  return n.type === 'BlockStatement' || n.type === 'Program' || n.type === 'StaticBlock';
}

// NOTE: Esprima uses Property instead of PropertyDefinition for the type
export type ClassElement = ClassBody['body'][number] | Property;
export type PropertyLike = Property | PropertyDefinition | MethodDefinition;

type TypeToNodeI<T> = T extends {type: string} ? (arg: {[K in T['type']]: T}) => void : never;
type Intersection = TypeToNodeI<Node> extends (arg: infer T) => void ? T : never;
type NodesWith<K, T> = T extends {type: K} ? T : never;

export type NodeType = keyof Intersection;
// export type NodeMapI = {[K in NodeType]: Intersection[K]};
export type NodeMap = {[K in NodeType]: NodesWith<K, Node>};

export interface Source {
  sourceFile?: string;
  sourceText?: string;
}
export interface SourceLocation {
  start?: {line: number, column: number},
  end?: {line: number, column: number},
  source?: Source;
}

export interface SourceTextNode {
  /** Optional source text for function and class nodes. */
  sourceText?: string;
}
export interface StrictNode {
  /** Whether this node is in a strict context. */
  strict?: boolean;
}
export interface TopLevelNode {
  /** Whether this node is in a top-level script/function context. */
  topLevel?: boolean;
}
// export interface ParentNode {
//   /** Back-ref to parant node. */
//   parent?: Node;
// }

export interface Esprima {
  parseScript(str: string): any;
  parseModule(str: string): any;
}

class NodeWalker<T> {
  constructor(
    readonly visit: (n: Node, state: T, child: string, recurse: (arg: T) => void) => void,
  ) {}
  walk(n: Node, state: T, child = '') {
    this.visit(n, state, child, (state: T) => {
      for (const k in n) {
        if (!childProps[k]) continue;
        const v = n[k as keyof Node];
        const vs = Array.isArray(v) ? v : [v];
        for (const c of vs) {
          if (c && typeof c === 'object' && (c as any).type) {
            this.walk(c as any, state, k);
          }
        }
      }
    });
  }
}

/** Trivial walker with no state */
export function traversePreorder<T>(n: Node, state: T, fn: (n: Node, state: T) => T): void {
  new NodeWalker<T>((n, state, _child, recurse) => {
    recurse(fn(n, state));
  }).walk(n, state, '');
}
export function traversePostorder(n: Node, fn: (n: Node) => void): void {
  new NodeWalker<undefined>((n, _state, _child, recurse) => {
    recurse(undefined);
    fn(n);
  }).walk(n, undefined, '');
}

const childProps: Record<string, boolean> = {
  body: true,
  params: true,
  expression: true,
  test: true,
  consequent: true,
  alternate: true,
  label: true,
  object: true,
  discriminant: true,
  cases: true,
  argument: true,
  block: true,
  handler: true,
  finalizer: true,
  init: true,
  update: true,
  left: true,
  right: true,
  id: true,
  declarations: true,
  elements: true,
  properties: true,
  key: true,
  value: true,
  callee: true,
  arguments: true,
  property: true,
  param: true,
  expressions: true,
  tag: true,
  superClass: true,
  source: true,
  declaration: true,
  imported: true,
  specifiers: true,
  exported: true,
  meta: true,
  local: true,
  quasi: true,
  quasis: true,
};

/**
 * Adds various disambiguating annotations to nodes as required for
 * accurate evaluation:
 * 1. adds a reference to a {sourceFile?, sourceText?} object in each
 *    node's SourceLocation#source field.
 * 2. adds parent references.
 * 3. annotates whether each node is under a strict scope.
 */
export function preprocess(n: Node|null|undefined, source: Source, strict = false) {
  if (!n) return;
  // function body BlockStatement nodes, which do not start a new block
  const bodies = new Set<Node>();
  type State = {strict: boolean, nested: boolean};
  function isStrict(nodes: Node[]): boolean {
    for (const child of nodes) {
      if ((child as any).directive === 'use strict') return true;
      if (!(child as any).directive) break;
    }
    return false;
  }
  traversePreorder<State>(n, {strict, nested: false}, (n, {strict, nested}) => {
    ((n.loc || ((n as any).loc = {})) as SourceLocation).source = source;
    switch (n.type) {
      case 'ClassDeclaration':
      case 'ClassExpression':
        strict = true;
        break;
      case 'StaticBlock':
        nested = false;
        break;          
      case 'FunctionDeclaration':
        (n as TopLevelNode).topLevel = !nested;
      case 'FunctionExpression':
        bodies.add(n.body);
        nested = false;
        // Strict if it has a "use strict"
        if (isStrict(n.body.body)) strict = true;
        break;
      case 'Program':
        nested = false;
        if (isStrict(n.body)) strict = true;
        break;
      case 'BlockStatement':
      case 'StaticBlock':
        nested = !bodies.has(n);
        if (isStrict(n.body)) strict = true;
        break;
      // TODO - look for 'use strict' in other bodies?
    }
    (n as StrictNode).strict = strict;
    return {strict, nested};
  });
}


// /**
//  * Adds various disambiguating annotations to nodes as required for
//  * accurate evaluation:
//  * 1. adds a reference to a {sourceFile?, sourceText?} object in each
//  *    node's SourceLocation#source field.
//  * 2. adds parent references.
//  * 3. annotates whether each node is under a strict scope.
//  */
// export function preprocess(n: Node|null|undefined, source: Source, strict = false) {
//   if (!n) return;
//   new NodeWalker<{strict: boolean, parent?: Node}>((n, {strict, parent}, _, recurse) => {
//     ((n.loc || ((n as any).loc = {})) as SourceLocation).source = source;
//     if (!strict) { // if we're already strict, we'll never go back to sloppy.
//       switch (n.type) {
//         case 'ClassDeclaration':
//         case 'ClassExpression':
//           strict = true;
//           break;
//         case 'FunctionDeclaration':
//         case 'FunctionExpression':
//           // Strict if it has a "use strict"
//           for (const child of n.body.body) {
//             if ((child as any).directive === 'use strict') strict = true;
//             if (!(child as any).directive) break;
//           }
//           break;
//         case 'Program':
//           for (const child of n.body) {
//             if ((child as any).directive === 'use strict') strict = true;
//             if ((child as any).directive) break;
//           }
//           break;
//         // TODO - look for 'use strict' in other bodies
//       }
//     }
//     (n as StrictNode).strict = strict;
//     recurse({strict, parent: n});
//     if (parent) (n as ParentNode).parent = parent;
//   }).walk(n, {strict}, '');
// }
