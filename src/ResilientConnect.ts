import { NullaryFn, UnaryFn } from 'type-core';
import { v4 as uuid } from 'uuid';
import { ensure } from 'errorish';
import { AbortController } from 'abort-controller';
import { Observable, Push, Subject } from 'multitude';
import { Policy, Strategy, Connect } from './definitions';
import { Util } from './helpers/Util';
import { ResilientPolicy } from './ResilientPolicy';

export declare namespace ResilientConnect {
  /** A function returning an adapter for the connection. */
  type Execute<T> = NullaryFn<Promise<Adapter<T>> | Adapter<T>>;

  /** An adapter for the connection and connection methods. */
  interface Adapter<T> {
    connection: T;
    close: () => void;
    onWarn: (cb: UnaryFn<Error>) => void;
    onClose: (cb: UnaryFn<Error | null>) => void;
  }
}

// TODO: write tests
export class ResilientConnect<T> implements Connect<T> {
  #execute: NullaryFn<Promise<ResilientConnect.Adapter<T>>>;
  #policy: Policy;
  #controller: AbortController | null;
  #events$: Push.Subject<Connect.Event>;
  #negotiation$: Push.Subject<Connect.Negotiation<T> | null>;
  public constructor(
    executor: ResilientConnect.Execute<T>,
    ...strategies: Strategy[]
  ) {
    this.#execute = async () => executor();
    this.#policy = new ResilientPolicy(...strategies);
    this.#controller = null;
    this.#events$ = new Subject();
    this.#negotiation$ = new Subject();
  }
  public get events$(): Push.Observable<Connect.Event> {
    return Observable.from(this.#events$);
  }
  public get negotiation$(): Push.Observable<Connect.Negotiation<T> | null> {
    return Observable.from(this.#negotiation$);
  }
  public negotiation(): Connect.Negotiation<T> | null {
    return this.#negotiation$.value || null;
  }
  public connect(): void {
    if (this.#controller) return;

    let didLastOpen = true;
    let didLastClose = true;
    const controller = new AbortController();
    const { id, events$ } = this.#policy.execute(async () => {
      if (didLastOpen) this.#events$.next({ id, type: 'opening' });

      didLastOpen = false;
      didLastClose = false;
      const adapter = await this.#execute();
      didLastOpen = true;

      let isOpen = true;
      const sub = uuid();
      this.#negotiation$.next({
        sub,
        get isOpen() {
          return isOpen;
        },
        connection: adapter.connection
      });
      this.#events$.next({ id, type: 'open' });

      adapter.onWarn((err) => {
        this.#events$.next({ id, type: 'warn', error: ensure(err) });
      });

      let teardown: null | NullaryFn = null;
      const promise = new Promise<void>((resolve, reject) => {
        let didClose = false;
        adapter.onClose((err) => {
          if (didClose) return;

          isOpen = false;
          didClose = true;
          didLastClose = true;
          this.#events$.next({ id, type: 'close' });
          if (teardown) teardown();
          if (this.#negotiation$.value?.sub === sub) {
            this.#negotiation$.next(null);
          }

          if (err) {
            reject(ensure(err));
          } else if (!controller.signal.aborted) {
            reject(Error('Unexpected connection termination'));
          } else {
            resolve();
          }
        });
      });

      if (isOpen) {
        teardown = Util.onAbort(() => {
          if (!isOpen) return;

          isOpen = false;
          this.#events$.next({ id, type: 'closing' });
          if (this.#negotiation$.value?.sub === sub) {
            this.#negotiation$.next(null);
          }
          adapter.close();
        }, controller.signal);
      }

      return promise;
    }, controller.signal);

    this.#controller = controller;
    this.#events$.next({ id, type: 'start' });
    events$.subscribe((event) => {
      const { type } = event;

      if (!didLastClose && ['error', 'stop'].includes(type)) {
        didLastClose = true;
        this.#events$.next({ id: event.id, type: 'close' });
      }

      if (['cancel', 'stop'].includes(type)) {
        this.#controller = null;
      }

      if (['warn', 'error', 'cancel', 'stop'].includes(type)) {
        this.#events$.next(event);
      }
    });
  }
  public disconnect(): void {
    const controller = this.#controller;
    if (!controller) return;

    controller.abort();
  }
}
