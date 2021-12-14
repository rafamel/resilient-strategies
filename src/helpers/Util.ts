/* eslint-disable @typescript-eslint/no-use-before-define */
import { NullaryFn, UnaryFn } from 'type-core';
import { AbortSignal } from 'abort-controller';
import { ensure } from 'errorish';
import { Policy, Strategy } from '../definitions';
import { ExecutionError } from '../ExecutionError';

export class Util {
  public static noop(): void {
    return undefined;
  }
  public static onAbort(fn: NullaryFn, signal?: AbortSignal | null): NullaryFn {
    if (!signal) return Util.noop;

    if (signal.aborted) {
      fn();
      return Util.noop;
    } else {
      function listener(): void {
        if (!signal) return;

        signal.removeEventListener('abort', listener);
        fn();
      }

      signal.addEventListener('abort', listener);
      return () => {
        signal.removeEventListener('abort', listener);
      };
    }
  }
  public static throwIfAbort(signal?: AbortSignal | null): void {
    if (signal && signal.aborted) {
      throw new ExecutionError({ reason: 'cancel' });
    }
  }
  public static execute<O>(
    id: string,
    strategy: Strategy,
    fn: NullaryFn<O | Promise<O>>,
    onEvent: UnaryFn<Policy.Event>,
    signal?: AbortSignal | null
  ): Promise<O> {
    let didStart = false;
    let errEnd: [any] | null = null;
    const cb = async (): Promise<O> => fn();
    const triggers: Set<NullaryFn> = new Set();
    const triggerAll = (): void => {
      const values = triggers.values();
      triggers.clear();
      for (const trigger of values) {
        trigger();
      }
    };

    return Promise.resolve()
      .then(() => {
        return strategy.execute(async () => {
          if (signal && signal.aborted) {
            throw new ExecutionError({ reason: 'cancel' });
          }

          if (!didStart) {
            didStart = true;
            onEvent({ id, group: 'execution', type: 'start', data: null });
          }

          return cb().catch((err) => {
            const trigger = (): void => {
              clearTimeout(timeout);
              triggers.delete(trigger);
              if (!errEnd || errEnd[0] !== err) {
                onEvent({
                  id,
                  group: 'exception',
                  type: 'warn',
                  data: ensure(err, Error)
                });
              }
            };
            const timeout = setTimeout(trigger, 0);

            triggers.add(trigger);
            throw err;
          });
        }, signal);
      })
      .then(
        (value) => {
          triggerAll();
          return value;
        },
        (err) => {
          errEnd = [err];
          triggerAll();

          const error = ensure(err, Error);
          onEvent({ id, group: 'exception', type: 'error', data: error });
          throw error;
        }
      )
      .finally(() => {
        if (didStart) {
          onEvent({ id, group: 'execution', type: 'stop', data: null });
        }
      });
  }
}
