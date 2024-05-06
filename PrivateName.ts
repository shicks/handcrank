import type { Obj } from "./Obj";

declare const BRAND: unique symbol;

// 6.2.12
export class PrivateName {
  [BRAND]!: never;
  constructor(readonly Description: string) {}
}
