import { EnvironmentRecord } from "./environment_record";

export class ModuleRecord {
  // TODO - see 16.2.1.4 Abstract Module Records
  //  - we should avoid cyclic and async for now, to decrease complexity

  Environment!: EnvironmentRecord & {Instantiated: boolean};
  HasDirectBinding!: (N: string) => boolean;
}
