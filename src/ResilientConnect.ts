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
  #getState: NullaryFn<Connect.State>;
  #events$: Push.Subject<Connect.Event>;
  #negotiation$: Push.Subject<Connect.Negotiation<T> | null>;
  public constructor(
    executor: ResilientConnect.Execute<T>,
    ...strategies: Strategy[]
  ) {
    this.#execute = async () => executor();
    this.#policy = new ResilientPolicy(...strategies);
    this.#controller = null;
    this.#getState = () => 'close';
    this.#events$ = new Subject();
    this.#negotiation$ = new Subject({ replay: 1 });
  }
  public get state(): Connect.State {
    return this.#getState();
  }
  public get events$(): Push.Observable<Connect.Event> {
    return Observable.from(this.#events$);
  }
  public get negotiation$(): Push.Observable<Connect.Negotiation<T> | null> {
    return Observable.from(this.#negotiation$);
  }
  public async query(): Promise<Connect.Negotiation<T>> {
    const value = this.#negotiation$.value;
    if (value) return value;

    if (!this.#controller) {
      throw Error(`Connection process did stop`);
    }

    return new Promise((resolve, reject) => {
      const subscriptions: Push.Subscription[] = [];

      const unsubscribe = (): void => {
        return subscriptions.forEach((subs) => {
          return subs.unsubscribe();
        });
      };

      this.#negotiation$.subscribe({
        start: (subs) => subscriptions.push(subs),
        next: (negotiation) => {
          if (!negotiation) return;

          unsubscribe();
          resolve(negotiation);
        }
      });

      this.#events$.subscribe({
        start: (subs) => subscriptions.push(subs),
        next: (ev) => {
          if (ev.type !== 'error' && ev.type !== 'stop') return;

          unsubscribe();
          ev.type === 'error'
            ? reject(ev.data)
            : reject(Error(`Connection process did stop`));
        }
      });
    });
  }
  public connect(): void {
    if (this.#controller) return;

    let didLastOpen = true;
    let didLastClose = true;
    const controller = new AbortController();
    const { id, events$ } = this.#policy.execute(async () => {
      let state: Connect.State = 'opening';
      this.#getState = () => state;
      if (didLastOpen) {
        this.#events$.next({ id, group: 'state', type: 'opening', data: null });
      }

      didLastOpen = false;
      didLastClose = false;
      const adapter = await this.#execute();
      didLastOpen = true;

      const sub = uuid();
      this.#negotiation$.next({
        sub,
        get state() {
          return state;
        },
        connection: adapter.connection
      });
      state = 'open';
      this.#events$.next({ id, group: 'state', type: 'open', data: null });

      adapter.onWarn((err) => {
        this.#events$.next({
          id,
          group: 'exception',
          type: 'warn',
          data: ensure(err)
        });
      });

      let teardown: null | NullaryFn = null;
      const promise = new Promise<void>((resolve, reject) => {
        adapter.onClose((err) => {
          if (state === 'close') return;

          didLastClose = true;
          state = 'close';
          this.#events$.next({ id, group: 'state', type: 'close', data: null });
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

      if (state === 'open') {
        teardown = Util.onAbort(() => {
          if (state !== 'open') return;

          state = 'closing';
          this.#events$.next({
            id,
            group: 'state',
            type: 'closing',
            data: null
          });
          if (this.#negotiation$.value?.sub === sub) {
            this.#negotiation$.next(null);
          }
          adapter.close();
        }, controller.signal);
      }

      return promise;
    }, controller.signal);

    this.#controller = controller;
    this.#events$.next({ id, group: 'execution', type: 'start', data: null });
    events$.subscribe((event) => {
      const { type } = event;

      if (!didLastClose && ['error', 'stop'].includes(type)) {
        didLastClose = true;
        this.#events$.next({
          id: event.id,
          group: 'state',
          type: 'close',
          data: null
        });
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
