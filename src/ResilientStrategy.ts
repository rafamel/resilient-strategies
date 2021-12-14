import { NullaryFn } from 'type-core';
import { AbortSignal } from 'abort-controller';
import { Strategy } from './definitions';
import { Util } from './helpers/Util';

export class ResilientStrategy implements Strategy {
  #strategies: Strategy[];
  public constructor(...strategies: Strategy[]) {
    this.#strategies = strategies.reverse();
  }
  public async execute<O>(
    fn: NullaryFn<O | Promise<O>>,
    signal?: AbortSignal | null
  ): Promise<O> {
    Util.throwIfAbort(signal);

    const strategies = this.#strategies;
    const cb = strategies.reduce(
      (acc, policy) => () => policy.execute(acc, signal),
      async () => fn()
    );

    return cb();
  }
}
