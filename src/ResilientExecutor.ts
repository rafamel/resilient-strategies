import { Dictionary, BinaryFn } from 'type-core';
import { AbortController, AbortSignal } from 'abort-controller';
import { Observable, Push, Subject } from 'multitude';
import PromiseQueue from 'p-queue';
import { ensure } from 'errorish';
import { v4 as uuid } from 'uuid';
import { Strategy, Executor, Storage } from './definitions';
import { MemoryStorage } from './helpers/MemoryStorage';
import { StorageAdapter } from './helpers/StorageAdapter';
import { Queue } from './helpers/Queue';
import { Util } from './helpers/Util';
import { ResilientStrategy } from './ResilientStrategy';

interface Reference<I, O> {
  signal: AbortSignal;
  events$: Push.Subject<Executor.Event>;
  response$: Push.Subject<O>;
  request: Executor.Request<I, O>;
}

export class ResilientExecutor<I, O> implements Executor<I, O> {
  #execute: BinaryFn<[I, AbortSignal], Promise<O> | O>;
  #strategy: Strategy;
  #storage: StorageAdapter<I>;
  #queue: Queue<I>;
  #jobs: PromiseQueue;
  #references: Dictionary<Reference<I, O>>;
  #events$: Push.Subject<Executor.Event>;
  public constructor(
    execute: (args: I, signal: AbortSignal) => Promise<O> | O,
    storage: Storage<I | string[]> | null,
    ...strategies: Strategy[]
  ) {
    this.#execute = execute;
    this.#strategy = new ResilientStrategy(...strategies);
    this.#storage = new StorageAdapter(storage || new MemoryStorage());
    this.#queue = new Queue(this.#storage);
    this.#jobs = new PromiseQueue({ concurrency: 1 });
    this.#references = {};
    this.#events$ = new Subject();

    // Start
    this.#work();
  }
  public get events$(): Push.Observable<Executor.Event> {
    return Observable.from(this.#events$);
  }
  public async query(id: string): Promise<Executor.Request<I, O> | null> {
    const reference = this.#references[id];
    if (reference) return reference.request;

    const [item] = await this.#storage.getValues([id]);
    if (!item.exists) return null;

    return this.#upsert(id, item.value, Promise.resolve()).request;
  }
  public execute(args: I): Executor.Request<I, O> {
    const id = uuid();
    const reference = this.#upsert(
      id,
      args,
      this.#queue.enqueue(id, args).then(() => this.#work())
    );

    return reference.request;
  }
  #work(): void {
    if (this.#jobs.size) return;
    this.#jobs.add(() => this.#dequeue());
  }
  async #dequeue(): Promise<void> {
    return new Promise((resolve) => {
      let reference: Reference<I, O> | null = null;

      this.#queue
        .dequeue(async (id, args) => {
          this.#dequeue().then(resolve);

          reference = this.#upsert(id, args, Promise.resolve());
          const { events$, response$, signal } = reference;

          await Util.execute(
            id,
            this.#strategy,
            () => this.#execute(args, signal),
            (event) => {
              events$.next(event);
              this.#events$.next(event);
            },
            reference.signal
          )
            .then(
              (value) => response$.next(value),
              (err) => response$.error(err)
            )
            .finally(() => response$.complete());
        })
        .then(
          () => {
            if (!reference) return;

            const event: Executor.Event = {
              id: reference.request.id,
              group: 'execution',
              type: 'clear',
              data: null
            };
            reference.events$.next(event);
            this.#events$.next(event);
            reference.events$.complete();
          },
          (err) => {
            if (reference) {
              const event: Executor.Event = {
                id: reference.request.id,
                group: 'exception',
                type: 'warn',
                data: ensure(err)
              };

              reference.events$.next(event);
              this.#events$.next(event);
              reference.events$.complete();
            } else {
              this.#events$.next({
                id: null,
                group: 'exception',
                type: 'error',
                data: ensure(err)
              });
            }
          }
        )
        .finally(resolve);
    });
  }
  #upsert(id: string, args: I, storage: Promise<void>): Reference<I, O> {
    const item = this.#references[id];
    if (item) return item;

    const controller = new AbortController();
    const events$ = new Subject<Executor.Event>();
    const response$ = new Subject<O>();
    const response = new Promise<O>((resolve, reject) => {
      const subs: Push.Subscription = response$.subscribe({
        next: (item) => resolve(item),
        error: (err) => reject(err),
        complete: () => subs.unsubscribe()
      });
    });

    storage.catch((err) => {
      if (events$.closed) return;

      const event: Executor.Event = {
        id,
        group: 'exception',
        type: 'error',
        data: ensure(err)
      };
      events$.next(event);
      this.#events$.next(event);
    });

    const teardown = Util.onAbort(() => {
      if (events$.closed) return;

      const event: Executor.Event = {
        id,
        group: 'execution',
        type: 'cancel',
        data: null
      };
      events$.next(event);
      this.#events$.next(event);
    }, controller.signal);

    response.catch(Util.noop).finally(teardown);

    const reference: Reference<I, O> = {
      signal: controller.signal,
      events$,
      response$,
      request: {
        id,
        args,
        get events$() {
          return Observable.from(events$);
        },
        async storage() {
          return storage.catch((err) => {
            return Promise.reject(ensure(err));
          });
        },
        async response() {
          return response.catch((err) => {
            return Promise.reject(ensure(err));
          });
        },
        cancel: () => {
          controller.abort();
        }
      }
    };

    this.#references[id] = reference;
    return reference;
  }
}
