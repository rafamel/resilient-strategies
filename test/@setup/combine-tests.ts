import { UnaryFn } from 'type-core';
import { test, expect, jest } from '@jest/globals';
import { TestUtil } from './TestUtil';
import {
  Strategy,
  Executor,
  BulkheadStrategy,
  RetryStrategy,
  CircuitBreakerStrategy
} from '../../src';

export function combineTests(
  mode: 'strategy' | 'policy' | 'executor',
  create: <I, O>(
    execute: UnaryFn<I, O | Promise<O>>,
    ...strategies: Strategy[]
  ) => Executor<I, O>
): void {
  const validate = TestUtil.validate.bind(null, mode);

  test(`retry doesn't affect bulkhead failures`, async () => {
    const fn = jest.fn(() => 'foo');
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return TestUtil.wait(100);
          default:
            return fn();
        }
      },
      new BulkheadStrategy({ concurrency: 1, queue: 1 }),
      new RetryStrategy({ limit: 10, delay: 0 })
    );

    instance.execute(0);
    instance.execute(0);

    await validate(instance, {
      args: -1,
      value: null,
      error: 'bulkhead',
      events: ['error', 'clear'],
      action: null
    });
    expect(fn).not.toHaveBeenCalled();
  });
  test(`retry affects circuit breaker`, async () => {
    const err = Error();
    let times = 0;
    const fn = jest.fn(() => {
      times++;
      return times > 2 ? 'foo' : Promise.reject(err);
    });
    const instance = create(
      fn,
      new RetryStrategy({ limit: 10, delay: 50 }),
      new CircuitBreakerStrategy({ failureThreshold: 2, halfOpenAfter: 25 })
    );

    await validate(instance, {
      args: null,
      value: 'foo',
      error: false,
      events: ['start', 'warn', 'warn', 'stop', 'clear'],
      action: null
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });
  test(`bulkhead failures don't affect circuit breaker`, async () => {
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return Promise.reject(Error());
          default:
            return 'foo';
        }
      },
      new BulkheadStrategy({ concurrency: 1, queue: 1 }),
      new CircuitBreakerStrategy({ failureThreshold: 2, halfOpenAfter: 50 })
    );

    instance.execute(0);
    instance.execute(-1);
    instance.execute(-1);

    await TestUtil.wait(0);
    await validate(instance, {
      args: -1,
      value: 'foo',
      error: false,
      events: ['start', 'stop', 'clear'],
      action: null
    });
  });
}
