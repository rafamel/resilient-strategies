import { NullaryFn } from 'type-core';
import { AbortSignal } from 'abort-controller';
import { Push } from 'multitude';

export interface Strategy {
  execute<O>(
    fn: NullaryFn<O | Promise<O>>,
    signal?: AbortSignal | null
  ): Promise<O>;
}

export interface Policy {
  events$: Push.Observable<Policy.Event>;
  execute<O>(
    fn: NullaryFn<O | Promise<O>>,
    signal?: AbortSignal | null
  ): Policy.Request<O>;
}
export declare namespace Policy {
  interface Request<O> {
    id: string;
    events$: Push.Observable<Event>;
    response(): Promise<O>;
  }

  type Event =
    | Event.Type<string, 'execution', 'start' | 'stop' | 'cancel'>
    | Event.Type<string, 'exception', 'warn' | 'error', Error>;
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
    | Event.Type<string, 'execution', 'clear'>
    | Event.Type<null, 'exception', 'error', Error>;
}

export interface Storage<T> {
  get(query: Storage.Query): Promise<Storage.Response<T | string[]>>;
  set(mutation: Storage.Mutation<T | string[]>): Promise<void>;
  batch?(...mutations: Array<Storage.Mutation<T | string[]>>): Promise<void>;
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
    | Event.Type<string, 'state', State>
    | Event.Type<string, 'execution', 'start' | 'stop' | 'cancel'>
    | Event.Type<string, 'exception', 'warn' | 'error', Error>;

  interface Negotiation<T> {
    sub: string;
    state: State;
    connection: T;
  }
}

export declare namespace Event {
  interface Type<
    I extends string | null,
    G extends Event.Group,
    T extends string,
    D = null
  > {
    id: I;
    group: G;
    type: T;
    data: D;
  }
  type Group = 'execution' | 'exception' | 'state';
}
