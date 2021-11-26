import { NullaryFn } from 'type-core';
import { AbortSignal } from 'abort-controller';
import { Push } from 'multitude';

export interface Strategy {
  execute<O>(fn: NullaryFn<O | Promise<O>>, signal?: AbortSignal): Promise<O>;
}

export interface Policy {
  events$: Push.Observable<Policy.Event>;
  execute<O>(
    fn: NullaryFn<O | Promise<O>>,
    signal?: AbortSignal
  ): Policy.Request<O>;
}
export declare namespace Policy {
  interface Request<O> {
    id: string;
    events$: Push.Observable<Event>;
    response(): Promise<O>;
  }
  type Event =
    | { id: string; type: 'start' | 'stop' | 'cancel' }
    | { id: string; type: 'warn' | 'error'; error: Error };
}

export interface Executor<I, O> {
  events$: Push.Observable<Executor.Event>;
  query(id: string): Promise<Executor.Request<I, O> | null>;
  execute(args: I): Executor.Request<I, O>;
}
export declare namespace Executor {
  interface Request<I, O> {
    id: string;
    args: I;
    events$: Push.Observable<Event>;
    storage(): Promise<void>;
    response(): Promise<O>;
    cancel(): void;
  }
  type Event =
    | Policy.Event
    | { id: string; type: 'clear' }
    | { id: null; type: 'error'; error: Error };
}

export interface Storage<T> {
  get(query: Storage.Query): Promise<Storage.Response<T>>;
  set(mutation: Storage.Mutation<T>): Promise<void>;
  batch?(...mutations: Array<Storage.Mutation<T>>): Promise<void>;
}
export declare namespace Storage {
  type Query = { key: string };
  type Mutation<T> =
    | { key: string; delete?: false; value: T }
    | { key: string; delete: true; value?: null };
  type Response<T> =
    | { key: string; exists: true; value: T }
    | { key: string; exists: false; value?: null };
}

export interface Connect<T> {
  /** Current connection state */
  state: Connect.State;
  /** Events observable */
  events$: Push.Observable<Connect.Event>;
  /** Negotiation observable */
  negotiation$: Push.Observable<Connect.Negotiation<T> | null>;
  /** Negotiation promise */
  query(): Promise<Connect.Negotiation<T>>;
  /** Starts the connection process. */
  connect(): void;
  /** Stops the connection process and closes any connection. */
  disconnect(): void;
}
export declare namespace Connect {
  type State = 'opening' | 'open' | 'closing' | 'close';

  type Event =
    | { id: string; type: State }
    | { id: string; type: 'start' | 'stop' | 'cancel' }
    | { id: string; type: 'warn' | 'error'; error: Error };

  interface Negotiation<T> {
    sub: string;
    state: State;
    connection: T;
  }
}
