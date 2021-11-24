import { Dictionary } from 'type-core';
import { Storage } from '../definitions';

export class MemoryStorage implements Storage<any> {
  #values: Dictionary<any>;
  public constructor() {
    this.#values = {};
  }
  public async get(query: Storage.Query): Promise<Storage.Response<any>> {
    const key = query.key;
    const values = this.#values;
    return Object.hasOwnProperty.call(values, key)
      ? { key, exists: true, value: values[key] }
      : { key, exists: false };
  }
  public async set(mutation: Storage.Mutation<any>): Promise<void> {
    if (mutation.delete) delete this.#values[mutation.key];
    else this.#values[mutation.key] = mutation.value;
  }
}
