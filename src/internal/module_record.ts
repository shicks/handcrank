import { CR } from "./completion_record";
import { Val } from "./values";

export class ModuleRecord {
  // TODO - see 16.2.1.4 Abstract Module Records
  //  - we should avoid cyclic and async for now, to decrease complexity

  Environment!: {Instantiated: boolean, GetBindingValue(s: string, b: boolean): CR<Val>};
  HasDirectBinding!: (N: string) => boolean;
}
