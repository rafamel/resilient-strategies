/* eslint-disable @typescript-eslint/no-use-before-define */
import { NullaryFn } from 'type-core';
import { AbortSignal } from 'abort-controller';
import { Strategy } from '../../definitions';
import { Util } from '../../helpers/Util';
import { ExecutionError } from '../../ExecutionError';
import { RateLimitQueue } from './RateLimitQueue';

export declare namespace RateLimitStrategy {
  interface Options {
    /** Number of calls allowed */
    limit: number;
    /** Milliseconds of each time window */
    interval: number;
    /** Smooth the execution over the interval with an artificial delay */
    smoothDelay: boolean;
  }
}

export class RateLimitStrategy implements Strategy {
  #queue: RateLimitQueue;
  public constructor(options: RateLimitStrategy.Options) {
    this.#queue = new RateLimitQueue({
      limit: options.limit < 0 ? Infinity : options.limit,
      interval: Math.max(0, options.interval),
      smoothDelay: Boolean(options.smoothDelay)
    });
  }
  public async execute<O>(
    fn: NullaryFn<O | Promise<O>>,
    signal?: AbortSignal | null
  ): Promise<O> {
    Util.throwIfAbort(signal);

    const queue = this.#queue;
    return new Promise<O>((resolve, reject) => {
      const teardown = Util.onAbort(() => {
        queue.dequeue(cb);
        reject(new ExecutionError({ reason: 'cancel' }));
      }, signal);

      const cb: NullaryFn = async () => {
        try {
          teardown();
          resolve(await fn());
        } catch (err) {
          reject(err);
        }
      };

      queue.enqueue(cb);
    });
  }
}
