import { NullaryFn } from 'type-core';
import { AbortSignal } from 'abort-controller';
import { Strategy } from '../definitions';
import { ExecutionError } from '../ExecutionError';
import { Util } from '../helpers/Util';

export declare namespace CircuitBreakerStrategy {
  interface Options {
    /** Number of consecutive failures that will cause circuit to open */
    failureThreshold: number;
    /** Time after close to half open the circuit breaker in ms */
    halfOpenAfter: number;
  }
}

export class CircuitBreakerStrategy implements Strategy {
  #options: CircuitBreakerStrategy.Options;
  #failures: number;
  #halfOpenAt: number | null;
  public constructor(options: CircuitBreakerStrategy.Options) {
    this.#options = {
      failureThreshold:
        options.failureThreshold < 0 ? Infinity : options.failureThreshold,
      halfOpenAfter: Math.max(0, options.halfOpenAfter)
    };
    this.#failures = 0;
    this.#halfOpenAt = null;
  }
  public async execute<O>(
    fn: NullaryFn<O | Promise<O>>,
    signal?: AbortSignal
  ): Promise<O> {
    Util.throwIfAbort(signal);
    const { failureThreshold } = this.#options;
    const cb = async (): Promise<O> => fn();

    if (
      this.#failures < failureThreshold ||
      Date.now() >= (this.#halfOpenAt || Infinity)
    ) {
      return cb().then(
        (value) => {
          this.#update(false);
          return value;
        },
        (err) => {
          this.#update(true);
          throw err;
        }
      );
    } else {
      throw new ExecutionError({ reason: 'circuit' });
    }
  }
  #update(isFailure: boolean): void {
    const { failureThreshold, halfOpenAfter } = this.#options;

    if (isFailure) {
      if (this.#halfOpenAt) {
        this.#failures = failureThreshold;
      } else if (this.#failures < failureThreshold) {
        this.#failures++;
      }
      if (this.#failures >= failureThreshold) {
        this.#halfOpenAt = Date.now() + halfOpenAfter;
      }
    } else if (!this.#halfOpenAt) {
      this.#failures = 0;
      this.#halfOpenAt = null;
    }
  }
}
