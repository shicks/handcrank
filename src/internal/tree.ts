import type { Node, Program, SourceLocation } from 'estree';

type TypeToNode<T> = T extends {type: string} ? (arg: {[K in T['type']]: T}) => void : never;
type Intersection = TypeToNode<Node> extends (arg: infer T) => void ? T : never;

export type NodeType = keyof Intersection;
export type NodeMap = {[K in NodeType]: Intersection[K]};
export {Node, Program};

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
