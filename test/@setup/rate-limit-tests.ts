import { UnaryFn } from 'type-core';
import { test, expect, jest } from '@jest/globals';
import { TestUtil } from './TestUtil';
import { Executor, RateLimitStrategy } from '../../src';

export function rateLimitTests(
  mode: 'strategy' | 'policy' | 'executor',
  create: <I, O>(
    execute: UnaryFn<I, O | Promise<O>>,
    options: RateLimitStrategy.Options
  ) => Executor<I, O>
): void {
  const validate = TestUtil.validate.bind(null, mode);

  test(`first call is executed immediately`, async () => {
    const instance = create((n: number) => n, {
      limit: 2,
      interval: 500,
      smoothDelay: false
    });

    const start = Date.now();
    await validate(instance, {
      args: 1,
      value: 1,
      error: false,
      events: ['start', 'stop', 'clear'],
      action: null
    });
    expect(Date.now() - start).toBeLessThan(100);
  });
  test(`calls over limit are executed after interval`, async () => {
    const instance = create((n: number) => n, {
      limit: 2,
      interval: 500,
      smoothDelay: false
    });

    const start = Date.now();
    instance.execute(0);
    instance.execute(0);

    await validate(instance, {
      args: 0,
      value: 0,
      error: false,
      events: ['start', 'stop', 'clear'],
      action: null
    });
    expect(Date.now() - start).toBeGreaterThan(500);
  });
  test(`smoothDelay delays execution before limit is reached`, async () => {
    const instance = create(() => TestUtil.wait(1000), {
      limit: 2,
      interval: 500,
      smoothDelay: true
    });

    const start = Date.now();
    instance.execute(null);

    await validate(instance, {
      args: null,
      value: undefined,
      error: false,
      events: ['start', 'stop', 'clear'],
      action: null
    });
    expect(Date.now() - start).toBeGreaterThan(1250);
    expect(Date.now() - start).toBeLessThan(1500);
  });
  test(`smoothDelay delays execution after limit is reached`, async () => {
    const instance = create(() => TestUtil.wait(1000), {
      limit: 2,
      interval: 500,
      smoothDelay: true
    });

    const start = Date.now();
    instance.execute(null);
    instance.execute(null);
    instance.execute(null);

    await validate(instance, {
      args: null,
      value: undefined,
      error: false,
      events: ['start', 'stop', 'clear'],
      action: null
    });
    expect(Date.now() - start).toBeGreaterThan(1750);
    expect(Date.now() - start).toBeLessThan(2000);
  });
  test(`Cancellation before-start rejects and prevents execution before limit is reached`, async () => {
    const fn = jest.fn();
    const instance = create(fn, {
      limit: 2,
      interval: 500,
      smoothDelay: false
    });

    await validate(instance, {
      args: null,
      value: null,
      error: 'cancel',
      events: ['cancel', 'error', 'clear'],
      action: (request) => request.cancel()
    });
    expect(fn).not.toHaveBeenCalled();
  });
  test(`Cancellation before-start rejects and prevents execution after limit is reached`, async () => {
    const fn = jest.fn();
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return null;
          default:
            return fn();
        }
      },
      {
        limit: 2,
        interval: 500,
        smoothDelay: false
      }
    );

    instance.execute(0);
    instance.execute(0);
    await validate(instance, {
      args: -1,
      value: null,
      error: 'cancel',
      events: ['cancel', 'error', 'clear'],
      action: (request) => request.cancel()
    });
    expect(fn).not.toHaveBeenCalled();
  });
  test(`Cancellation clears a slot before limit is reached`, async () => {
    const instance = create(() => TestUtil.wait(1000), {
      limit: 2,
      interval: 500,
      smoothDelay: false
    });

    instance.execute(null);
    instance.execute(null).cancel();

    const start = Date.now();
    await validate(instance, {
      args: null,
      value: undefined,
      error: false,
      events: ['start', 'stop', 'clear'],
      action: null
    });
    expect(Date.now() - start).toBeGreaterThanOrEqual(1000);
    expect(Date.now() - start).toBeLessThan(1500);
  });
  test(`Cancellation clears a slot after limit is reached`, async () => {
    const instance = create(() => TestUtil.wait(1000), {
      limit: 2,
      interval: 500,
      smoothDelay: false
    });

    instance.execute(null);
    instance.execute(null);
    instance.execute(null);
    const request = instance.execute(null);
    TestUtil.wait(250).then(() => request.cancel());

    const start = Date.now();
    await validate(instance, {
      args: null,
      value: undefined,
      error: false,
      events: ['start', 'stop', 'clear'],
      action: null
    });
    expect(Date.now() - start).toBeGreaterThanOrEqual(1500);
    expect(Date.now() - start).toBeLessThan(2000);
  });
  test(`Response doesn't reject on success for mid-way cancellation`, async () => {
    const instance = create(() => TestUtil.wait(500), {
      limit: 2,
      interval: 500,
      smoothDelay: false
    });

    await validate(instance, {
      args: null,
      value: undefined,
      error: false,
      events: ['start', 'cancel', 'stop', 'clear'],
      action: async (request) => {
        await TestUtil.wait(250);
        request.cancel();
      }
    });
  });
  test(`Response rejects on failure for mid-way cancellation`, async () => {
    const err = Error();
    const instance = create(
      () => TestUtil.wait(500).then(() => Promise.reject(err)),
      { limit: 2, interval: 500, smoothDelay: false }
    );

    await validate(instance, {
      args: null,
      value: null,
      error: err,
      events: ['start', 'cancel', 'error', 'stop', 'clear'],
      action: async (request) => {
        await TestUtil.wait(250);
        request.cancel();
      }
    });
  });
}
