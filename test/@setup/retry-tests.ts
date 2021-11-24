import { UnaryFn } from 'type-core';
import { test, expect, jest } from '@jest/globals';
import { TestUtil } from './TestUtil';
import { Executor, RetryStrategy } from '../../src';

export function retryTests(
  mode: 'strategy' | 'policy' | 'executor',
  create: <I, O>(
    execute: UnaryFn<I, O | Promise<O>>,
    options: RetryStrategy.Options
  ) => Executor<I, O>
): void {
  const validate = TestUtil.validate.bind(null, mode);

  test(`executes first call immediately`, async () => {
    const fn = jest.fn();
    const instance = create(fn, { limit: 10, delay: 50 });

    instance.execute(null);
    await TestUtil.wait(0);

    expect(fn).toHaveBeenCalledTimes(1);
  });
  test(`executes second call immediately in parallel`, async () => {
    const fn = jest.fn();
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return TestUtil.wait(500);
          default:
            return fn();
        }
      },
      { limit: 10, delay: 100 }
    );

    instance.execute(0);
    instance.execute(-1);
    await TestUtil.wait(0);

    expect(fn).toHaveBeenCalledTimes(1);
  });
  test(`doesn't retry call on success`, async () => {
    const fn = jest.fn(() => 'foo');
    const instance = create(fn, { limit: 10, delay: 0 });

    await validate(instance, {
      args: null,
      value: 'foo',
      error: false,
      events: ['start', 'stop', 'clear'],
      action: null
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });
  test(`retries calls until attempts on failure`, async () => {
    const err = Error();
    const fn = jest.fn(() => Promise.reject(err));
    const instance = create(fn, { limit: 10, delay: 0 });

    await validate(instance, {
      args: null,
      value: null,
      error: err,
      events: ['start', ...Array(10).fill('warn'), 'error', 'stop', 'clear'],
      action: null
    });
    expect(fn).toHaveBeenCalledTimes(11);
  });
  test(`retries calls until success for unlimited attempts`, async () => {
    for (const limit of [Infinity, -1]) {
      let times = 0;
      const err = Error();
      const fn = jest.fn(() => {
        times++;
        return times >= 50 ? Promise.resolve('foo') : Promise.reject(err);
      });
      const instance = create(fn, { limit, delay: 0 });

      await validate(instance, {
        args: null,
        value: 'foo',
        error: false,
        events: ['start', ...Array(49).fill('warn'), 'stop', 'clear'],
        action: null
      });
      expect(fn).toHaveBeenCalledTimes(50);
    }
  });
  test(`doesn't retry calls on failure for limit 0`, async () => {
    const err = Error();
    const fn = jest.fn(() => Promise.reject(err));
    const instance = create(fn, { limit: 0, delay: 0 });

    await validate(instance, {
      args: null,
      value: null,
      error: err,
      events: ['start', 'error', 'stop', 'clear'],
      action: null
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });
  test(`delays calls by delay milliseconds`, async () => {
    const err = Error();
    const fn = jest.fn(() => Promise.reject(err));
    const instance = create(fn, { limit: 7, delay: 500 });

    await validate(instance, {
      args: null,
      value: null,
      error: err,
      events: ['start', ...Array(7).fill('warn'), 'error', 'stop', 'clear'],
      action: async () => {
        await TestUtil.wait(1750);
        expect(fn).toHaveBeenCalledTimes(4);
      }
    });
    expect(fn).toHaveBeenCalledTimes(8);
  });
  test(`Cancellation before-start rejects and prevents execution`, async () => {
    const fn = jest.fn();
    const instance = create(fn, { limit: 10, delay: 50 });

    await validate(instance, {
      args: null,
      value: null,
      error: 'cancel',
      events: ['cancel', 'error', 'clear'],
      action: (request) => request.cancel()
    });
    expect(fn).not.toHaveBeenCalled();
  });
  test(`Further cancellations don't have an additional effect`, async () => {
    const fn = jest.fn();
    const instance = create(fn, { limit: 10, delay: 500 });

    await validate(instance, {
      args: null,
      value: null,
      error: 'cancel',
      events: ['cancel', 'error', 'clear'],
      action: (request) => {
        request.cancel();
        request.cancel();
        return TestUtil.wait(1000).then(() => request.cancel());
      }
    });
    expect(fn).not.toHaveBeenCalled();
  });
  test(`Cancellation on delay immediately rejects`, async () => {
    const err = Error();
    const fn = jest.fn(() => Promise.reject(err));
    const instance = create(fn, { limit: 10, delay: 1500 });

    const start = Date.now();
    await validate(instance, {
      args: null,
      value: null,
      error: 'cancel',
      events: ['start', 'warn', 'cancel', 'error', 'stop', 'clear'],
      action: async (request) => {
        await TestUtil.wait(150);
        request.cancel();
      }
    });
    expect(Date.now() - start).toBeLessThan(1500);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  test(`Cancellation after-end doesn't have an effect`, async () => {
    const err = Error();
    const fn = jest.fn(() => Promise.reject(err));
    const instance = create(fn, { limit: 2, delay: 500 });

    await validate(instance, {
      args: null,
      value: null,
      error: err,
      events: ['start', 'warn', 'warn', 'error', 'stop', 'clear'],
      action: async (request) => {
        await TestUtil.wait(1500);
        request.cancel();
      }
    });
  });
  test(`Cancellation prevents further retries`, async () => {
    const err = Error();
    const fn = jest.fn(() => Promise.reject(err));
    const instance = create(fn, { limit: 10, delay: 500 });

    await validate(instance, {
      args: null,
      value: null,
      error: 'cancel',
      events: ['start', 'warn', 'warn', 'cancel', 'error', 'stop', 'clear'],
      action: async (request) => {
        await TestUtil.wait(750);
        expect(fn).toHaveBeenCalledTimes(2);
        request.cancel();
      }
    });
    await TestUtil.wait(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  test(`Response doesn't reject on success for mid-way cancellation`, async () => {
    let times = 0;
    const err = Error();
    const instance = create(
      () => {
        times++;
        return TestUtil.wait(500).then(() =>
          times > 1 ? 'foo' : Promise.reject(err)
        );
      },
      { limit: 10, delay: 0 }
    );

    await validate(instance, {
      args: null,
      value: 'foo',
      error: false,
      events: ['start', 'warn', 'cancel', 'stop', 'clear'],
      action: async (request) => {
        await TestUtil.wait(750);
        request.cancel();
      }
    });
    expect(times).toBe(2);
  });
  test(`Response rejects on failure for mid-way cancellation`, async () => {
    let times = 0;
    const err = Error();
    const instance = create(
      () => {
        times++;
        return TestUtil.wait(500).then(() => Promise.reject(err));
      },
      { limit: 10, delay: 0 }
    );

    await validate(instance, {
      args: null,
      value: null,
      error: err,
      events: ['start', 'warn', 'warn', 'cancel', 'error', 'stop', 'clear'],
      action: async (request) => {
        await TestUtil.wait(1250);
        request.cancel();
      }
    });
    expect(times).toBe(3);
  });
}
