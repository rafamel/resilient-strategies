/* eslint-disable @typescript-eslint/no-use-before-define */
import { NullaryFn } from 'type-core';
import { AbortSignal } from 'abort-controller';
import { ExecutionError } from '../ExecutionError';

export class Util {
  public static noop(): void {
    return undefined;
  }
  public static onAbort(fn: NullaryFn, signal?: AbortSignal): NullaryFn {
    if (!signal) return Util.noop;

    function listener(): void {
      if (signal) {
        signal.removeEventListener('abort', listener);
        fn();
      }
    }

    signal.addEventListener('abort', listener);
    return () => {
      signal.removeEventListener('abort', listener);
    };
  }
  public static throwIfAbort(signal?: AbortSignal): void {
    if (signal && signal.aborted) {
      throw new ExecutionError({ reason: 'cancel' });
    }
  }
}
