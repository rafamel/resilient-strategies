import { UnaryFn, Dictionary, BinaryFn } from 'type-core';
import PromiseQueue from 'p-queue';
import { ensure } from 'errorish';
import { StorageAdapter } from './StorageAdapter';

export class Queue<T> {
  #adapter: StorageAdapter<T>;
  #jobs: PromiseQueue;
  #inProgress: Dictionary<boolean>;
  #include: Array<{ id: string; value: T; cb: UnaryFn<Error | null> }>;
  #exclude: Array<{ id: string; cb: UnaryFn<Error | null> }>;
  public constructor(adapter: StorageAdapter<T>) {
    this.#adapter = adapter;
    this.#jobs = new PromiseQueue({ concurrency: 1 });
    this.#inProgress = {};
    this.#include = [];
    this.#exclude = [];
  }
  /** Enqueues a request */
  public enqueue(id: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#include.push({
        id,
        value,
        cb: (err) => (err ? reject(err) : resolve())
      });
      this.#work();
    });
  }
  /** Dequeues a request */
  public async dequeue(
    fn: BinaryFn<[string, T], Promise<void>>
  ): Promise<void> {
    const queuedIds = await this.#adapter.getIds();

    for (const id of queuedIds) {
      if (this.#inProgress[id]) continue;

      this.#inProgress[id] = true;

      const item = await this.#adapter
        .getValues([id])
        .then((res) => res[0])
        .then((res) => {
          if (res) return res;
          else throw Error(`Unexpected storage response for id: "${id}"`);
        })
        .catch(async (err) => {
          delete this.#inProgress[id];
          throw err;
        });

      if (!item.exists) {
        this.#exclude.push({
          id,
          cb: () => {
            delete this.#inProgress[id];
          }
        });
        continue;
      }

      let error: [Error] | null = null;
      await fn(id, item.value).catch((err) => {
        error = [err];
      });

      return new Promise((resolve, reject) => {
        this.#exclude.push({
          id,
          cb: (err) => {
            delete this.#inProgress[id];
            if (error) reject(error[0]);
            if (err) reject(err);
            else resolve();
          }
        });
        this.#work();
      });
    }
  }
  #work(): void {
    if (this.#jobs.size) return;

    this.#jobs.add(async () => {
      const include = this.#include;
      const exclude = this.#exclude;
      if (!include.length && !exclude.length) return;

      try {
        this.#include = [];
        this.#exclude = [];

        const queuedIds = await this.#adapter.getIds();
        await this.#adapter.setIds(
          queuedIds
            // Remove the elements already dequeued
            .filter((id) => !exclude.find((item) => item.id === id))
            // Enqueue elements to the queue
            .concat(include.map((item) => item.id))
        );

        const mutations = [
          ...include.map(
            (item): StorageAdapter.Mutation<T> => ({
              id: item.id,
              value: item.value
            })
          ),
          ...exclude.map(
            (item): StorageAdapter.Mutation<T> => ({
              id: item.id,
              delete: true
            })
          )
        ];
        await this.#adapter.setValues(...mutations);

        include.map((item) => item.cb(null));
        exclude.map((item) => item.cb(null));
        this.#work();
      } catch (err) {
        const error = ensure(err);
        include.map((item) => item.cb(error));
        exclude.map((item) => item.cb(error));
        this.#work();
      }
    });
  }
}
