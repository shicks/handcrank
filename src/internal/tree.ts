import type { Node, Program, SourceLocation } from 'estree';

export {Node, Program};

type TypeToNodeI<T> = T extends {type: string} ? (arg: {[K in T['type']]: T}) => void : never;
type Intersection = TypeToNodeI<Node> extends (arg: infer T) => void ? T : never;
type NodesWith<K, T> = T extends {type: K} ? T : never;

export type NodeType = keyof Intersection;
// export type NodeMapI = {[K in NodeType]: Intersection[K]};
export type NodeMap = {[K in NodeType]: NodesWith<K, Node>};

export interface SourceTextNode {
  sourceText?: string;
}
export interface StrictNode {
  strict?: boolean;
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

export function emptyLoc(): SourceLocation {
  return {
    start: {line: 0, column: 0},
    end: {line: 0, column: 0},
  };
}
