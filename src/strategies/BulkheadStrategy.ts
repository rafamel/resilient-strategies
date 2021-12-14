/* eslint-disable @typescript-eslint/no-use-before-define */
import { NullaryFn } from 'type-core';
import { AbortSignal } from 'abort-controller';
import { Strategy } from '../definitions';
import { ExecutionError } from '../ExecutionError';
import { Util } from '../helpers/Util';

export declare namespace BulkheadStrategy {
  interface Options {
    /** Number of concurrent calls allowed */
    concurrency: number;
    /** Number of calls to be send to the queue */
    queue: number;
  }
}

export class BulkheadStrategy implements Strategy {
  #options: BulkheadStrategy.Options;
  #last: Array<Promise<void>>;
  #queueSize: number;
  public constructor(options: BulkheadStrategy.Options) {
    this.#options = {
      concurrency: options.concurrency < 0 ? Infinity : options.concurrency,
      queue: options.queue < 0 ? Infinity : options.queue
    };
    this.#last = [];
    this.#queueSize = 0;
  }
  public async execute<O>(
    fn: NullaryFn<O | Promise<O>>,
    signal?: AbortSignal | null
  ): Promise<O> {
    Util.throwIfAbort(signal);
    const options = this.#options;
    const last = this.#last;

    if (
      options.concurrency <= 0 ||
      (last.length >= options.concurrency && this.#queueSize >= options.queue)
    ) {
      throw new ExecutionError({ reason: 'bulkhead' });
    }

    return new Promise((resolve, reject) => {
      let toQueue = false;

      let clear = (): void => {
        clear = Util.noop;
        const index = last.indexOf(promise);
        if (index !== -1) last.splice(index, 1);
      };

      const promise = new Promise<void>((resolve, reject) => {
        const teardown = Util.onAbort(() => {
          clear();
          reject(new ExecutionError({ reason: 'cancel' }));
        }, signal);

        if (last.length >= options.concurrency) {
          this.#queueSize++;
          toQueue = true;
          Promise.race(last)
            .then(resolve, reject)
            .finally(() => teardown());
        } else {
          resolve();
          teardown();
        }
      })
        .then(() => {
          if (toQueue) this.#queueSize--;
          return fn();
        })
        .then(resolve, reject)
        .finally(() => clear());

      last.push(promise);
      if (last.length > options.concurrency) last.shift();
    });
  }
}
