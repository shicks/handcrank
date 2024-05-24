import type { Node, Program } from 'estree';

export { Node, Program };

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
export interface ParentNode {
  /** Back-ref to parant node. */
  parent?: Node;
}

interface ParseOpts {
  range?: boolean;
  loc?: boolean;
  tolerant?: boolean;
  comment?: boolean;
}
export interface Esprima {
  parseScript(str: string, opts?: ParseOpts, delegate?: (n: Node, meta: any) => void): any;
  parseModule(str: string, opts?: ParseOpts, delegate?: (n: Node, meta: any) => void): any;
}

class NodeWalker<T> {
  constructor(
    readonly preorder?: (n: Node, state: T, child: string) => T,
    readonly postorder?: (n: Node, state: T, child: string) => void,
  ) {}
  walk(n: Node, state: T, child = '') {
    state = this.preorder ? this.preorder(n, state, child) : state;
    for (const k in n) {
      const v = n[k as keyof Node];
      const vs = Array.isArray(v) ? v : [v];
      for (const c of vs) {
        if (c && typeof c === 'object' && (c as any).type) {
          this.walk(c as any, state, k);
        }
      }
    }
    this.postorder?.(n, state, child);
  }
}

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
  new NodeWalker<{strict: boolean, parent?: Node}>((n, {strict}) => {
    ((n.loc || ((n as any).loc = {})) as SourceLocation).source = source;
    if (!strict) { // if we're already strict, we'll never go back to sloppy.
      switch (n.type) {
        case 'ClassDeclaration':
        case 'ClassExpression':
          strict = true;
          break;
        case 'FunctionDeclaration':
        case 'FunctionExpression':
          // Strict if it has a "use strict"
          for (const child of n.body.body) {
            if ((child as any).directive === 'use strict') strict = true;
            if (!(child as any).directive) break;
          }
          break;
        case 'Program':
          for (const child of n.body) {
            if ((child as any).directive === 'use strict') strict = true;
            if ((child as any).directive) break;
          }
          break;
      }
    }
    (n as StrictNode).strict = strict;
    return {strict, parent: n};
  }, (n, {parent}) => {
    if (parent) (n as ParentNode).parent = parent;
  }).walk(n, {strict}, '');
}
