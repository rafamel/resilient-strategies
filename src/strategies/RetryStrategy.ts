/* eslint-disable @typescript-eslint/no-use-before-define */
import { NullaryFn } from 'type-core';
import { AbortSignal } from 'abort-controller';
import { Strategy } from '../definitions';
import { ExecutionError } from '../ExecutionError';
import { Util } from '../helpers/Util';

export declare namespace RetryStrategy {
  interface Options {
    /** Maximum retry attempts, first call excluded */
    limit: number;
    /** Delay for retries in ms */
    delay: number;
  }
}

export class RetryStrategy implements Strategy {
  #options: RetryStrategy.Options;
  public constructor(options: RetryStrategy.Options) {
    this.#options = {
      limit: options.limit < 0 ? Infinity : options.limit,
      delay: Math.max(0, options.delay)
    };
  }
  public async execute<O>(
    fn: NullaryFn<O | Promise<O>>,
    signal?: AbortSignal
  ): Promise<O> {
    Util.throwIfAbort(signal);

    const { limit, delay } = this.#options;
    const cb = async (): Promise<O> => fn();

    let times = 0;
    const repeat = async (err: any): Promise<O> => {
      times++;
      if (times > limit || signal?.aborted) {
        throw err;
      } else {
        return new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve();
            teardown();
          }, delay);

          const teardown = Util.onAbort(() => {
            reject(new ExecutionError({ reason: 'cancel' }));
            clearTimeout(timeout);
            teardown();
          }, signal);
        }).then(() => {
          return cb().catch((err) => repeat(err));
        });
      }
    };

    return cb().catch((err) => repeat(err));
  }
}
