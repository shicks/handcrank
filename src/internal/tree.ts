import {Node} from 'estree';

type TypeToNode<T> = T extends {type: string} ? (arg: {[K in T['type']]: T}) => void : never;
type Intersection = TypeToNode<Node> extends (arg: infer T) => void ? T : never;

export type NodeTypes = keyof Intersection;
export type NodeMap = {[K in NodeTypes]: Intersection[K]};
export {Node};
