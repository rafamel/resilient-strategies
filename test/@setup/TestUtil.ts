import { NullaryFn, UnaryFn } from 'type-core';
import { expect } from '@jest/globals';
import { Observable } from 'multitude';
import { AbortController, AbortSignal } from 'abort-controller';
import { Executor, Policy, Strategy, ExecutionError } from '../../src';

export interface ValidateParams<I, O> {
  args: I;
  value: O | null;
  error: Error | boolean | ExecutionError.Reason;
  action: UnaryFn<Executor.Request<I, O>, void | Promise<void>> | null;
  events: null | Array<Executor.Event['type']>;
}

export class TestUtil {
  public static wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  public static transformStrategy<I, O>(
    strategy: Strategy,
    execute: UnaryFn<I, O | Promise<O>>
  ): Executor<I, O> {
    return TestUtil.transformPolicy(
      {
        events$: new Observable(() => undefined),
        execute<T>(
          fn: NullaryFn<T | Promise<T>>,
          signal: AbortSignal
        ): Policy.Request<T> {
          const response = Promise.resolve().then(() => {
            return strategy.execute(fn, signal);
          });

          response.catch(() => undefined);
          return {
            id: '',
            events$: new Observable(() => undefined),
            response: () => response
          };
        }
      },
      execute
    );
  }
  public static transformPolicy<I, O>(
    policy: Policy,
    execute: UnaryFn<I, O | Promise<O>>
  ): Executor<I, O> {
    return {
      events$: policy.events$,
      query: async () => null,
      execute(args) {
        const controller = new AbortController();
        const request = policy.execute(() => execute(args), controller.signal);
        return {
          ...request,
          args,
          storage: () => Promise.resolve(),
          cancel() {
            controller.abort();
          }
        };
      }
    };
  }
  public static async validate<I, O>(
    mode: 'strategy' | 'policy' | 'executor',
    instance: Executor<I, O>,
    params: ValidateParams<I, O>
  ): Promise<void> {
    const request = instance.execute(params.args);
    const responseOnly = mode === 'strategy';
    const instanceEvents: Array<Executor.Event['type']> = [];
    const requestEvents: Array<Executor.Event['type']> = [];
    const instanceEventsSubscription =
      responseOnly || !params.events
        ? null
        : instance.events$.subscribe(({ id, type }) => {
            if (id === request.id) {
              instanceEvents.push(type);
            }
          });
    const requestEventsSubscription =
      responseOnly || !params.events
        ? null
        : request.events$.subscribe(({ type }) => {
            requestEvents.push(type);
          });

    if (params.action) await params.action(request);

    if (params.error) {
      const response = request.response();
      const typeOfError = typeof params.error;
      if (typeOfError === 'boolean') {
        await expect(response).rejects.toThrowError();
      } else if (typeOfError === 'string') {
        const reason = params.error as ExecutionError.Reason;
        await response.then(
          () => null,
          (err) => {
            expect(ExecutionError.is(err)).toBe(true);
            expect(ExecutionError.is(err, reason)).toBe(true);
          }
        );
      } else {
        const error = params.error as Error;
        await expect(response).rejects.toThrowError(error);
      }
    } else {
      await expect(request.response()).resolves.toEqual(params.value);
    }

    if (params.events) {
      const noClearEvents = params.events.filter((event) => event !== 'clear');

      if (mode === 'executor') {
        const noClearRequestEvents = requestEvents.filter(
          (event) => event !== 'clear'
        );
        const noClearInstanceEvents = requestEvents.filter(
          (event) => event !== 'clear'
        );
        expect(noClearRequestEvents).toEqual(noClearEvents);
        expect(noClearInstanceEvents).toEqual(noClearEvents);
        await new Promise<void>((resolve) => {
          request.events$.subscribe({ complete: resolve });
        });
        expect(requestEvents).toEqual(params.events);
        expect(instanceEvents).toEqual(params.events);
      } else if (mode === 'policy') {
        expect(requestEvents).toEqual(noClearEvents);
        expect(instanceEvents).toEqual(noClearEvents);
      }
    }
    if (requestEventsSubscription) {
      expect(requestEventsSubscription.closed).toBe(true);
    }
    if (instanceEventsSubscription) {
      expect(instanceEventsSubscription.closed).toBe(false);
      instanceEventsSubscription.unsubscribe();
    }
  }
}
