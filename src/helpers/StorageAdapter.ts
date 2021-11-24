import { ensure } from 'errorish';
import { Storage } from '../definitions';

export declare namespace StorageAdapter {
  type Mutation<T> =
    | { id: string; delete?: false; value: T }
    | { id: string; delete: true; value?: null };
  type Response<T> =
    | { id: string; exists: true; value: T }
    | { id: string; exists: false; value?: null };
}

export class StorageAdapter<T> {
  #kv: Storage<T | string[]>;
  public constructor(kv: Storage<T | string[]>) {
    this.#kv = kv;
  }
  public async getIds(): Promise<string[]> {
    const response = await this.#kv
      .get({ key: 'ids' })
      .catch((err) => Promise.reject(ensure(err, Error)));
    return response.exists ? (response.value as string[]) : [];
  }
  public async setIds(ids: string[]): Promise<void> {
    await this.#kv
      .set({ key: 'ids', value: ids })
      .catch((err) => Promise.reject(ensure(err, Error)));
  }
  public async getValues(
    ids: string[]
  ): Promise<Array<StorageAdapter.Response<T>>> {
    const response = await Promise.all(
      ids.map((id) => {
        return this.#kv
          .get({ key: 'value-' + id })
          .catch((err) => Promise.reject(ensure(err, Error)));
      })
    );
    return response.map((item) => {
      const id = item.key.slice(6);
      return item.exists
        ? { id, exists: item.exists, value: item.value as T }
        : { id, exists: false };
    });
  }
  public async setValues(
    ...mutations: Array<StorageAdapter.Mutation<T>>
  ): Promise<void> {
    const transform = mutations.map((mutation): Storage.Mutation<T> => {
      const key = 'value-' + mutation.id;
      return mutation.delete
        ? { key, delete: true }
        : { key, value: mutation.value };
    });

    if (this.#kv.batch) {
      await this.#kv
        .batch(...transform)
        .catch((err) => Promise.reject(ensure(err, Error)));
    } else {
      await Promise.all(
        transform.map((mutation) => {
          return this.#kv
            .set(mutation)
            .catch((err) => Promise.reject(ensure(err, Error)));
        })
      );
    }
  }
}
