import { UnaryFn } from 'type-core';
import { test, expect, jest } from '@jest/globals';
import { TestUtil } from './TestUtil';
import { Executor, CircuitBreakerStrategy } from '../../src';

export function circuitBreakerTests(
  mode: 'strategy' | 'policy' | 'executor',
  create: <I, O>(
    execute: UnaryFn<I, O | Promise<O>>,
    options: CircuitBreakerStrategy.Options
  ) => Executor<I, O>
): void {
  const validate = TestUtil.validate.bind(null, mode);

  test(`executes first call immediately`, async () => {
    const fn = jest.fn();
    const instance = create(fn, { failureThreshold: 2, halfOpenAfter: 500 });

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
      { failureThreshold: 2, halfOpenAfter: 1000 }
    );

    instance.execute(0);
    instance.execute(-1);

    await TestUtil.wait(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  test(`circuit doesn't half open for unlimited failureThreshold`, async () => {
    for (const failureThreshold of [Infinity, -1]) {
      const fn = jest.fn(() => Promise.reject(Error()));
      const instance = create(fn, { failureThreshold, halfOpenAfter: 5000 });

      Array(50)
        .fill(0)
        .forEach(() => instance.execute(null));

      await TestUtil.wait(0);
      expect(fn).toHaveBeenCalledTimes(50);
    }
  });
  test(`circuit half opens after failureThreshold`, async () => {
    const fn = jest.fn(() => 'foo');
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return Promise.reject(Error());
          default:
            return fn();
        }
      },
      { failureThreshold: 2, halfOpenAfter: 1000 }
    );

    instance.execute(0);
    instance.execute(0);

    await TestUtil.wait(500);

    await validate(instance, {
      args: -1,
      value: null,
      error: true,
      events: ['error', 'clear'],
      action: null
    });

    expect(fn).toHaveBeenCalledTimes(0);
  });
  test(`circuit failures reset on success`, async () => {
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return Promise.reject(Error());
          case 1:
            return 'foo';
          default:
            return 'bar';
        }
      },
      { failureThreshold: 2, halfOpenAfter: 50 }
    );

    instance.execute(0);
    instance.execute(1);
    instance.execute(0);

    await validate(instance, {
      args: -1,
      value: 'bar',
      error: false,
      events: ['start', 'stop', 'clear'],
      action: null
    });
  });
  test(`circuit half opens after halfOpenAfter (1)`, async () => {
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return Promise.reject(Error());
          default:
            return 'foo';
        }
      },
      { failureThreshold: 2, halfOpenAfter: 1000 }
    );

    instance.execute(0);
    instance.execute(0);

    await TestUtil.wait(1500);
    await validate(instance, {
      args: -1,
      value: 'foo',
      error: false,
      events: ['start', 'stop', 'clear'],
      action: null
    });
  });
  test(`circuit half opens after halfOpenAfter (2)`, async () => {
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return Promise.reject(Error());
          default:
            return 'foo';
        }
      },
      { failureThreshold: 2, halfOpenAfter: 500 }
    );

    instance.execute(0);
    instance.execute(0);

    await TestUtil.wait(750);
    instance.execute(0);

    await TestUtil.wait(0);
    await validate(instance, {
      args: -1,
      value: null,
      error: 'circuit',
      events: ['error', 'clear'],
      action: null
    });
  });
  test(`circuit half opens after halfOpenAfter (3)`, async () => {
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return Promise.reject(Error());
          default:
            return 'foo';
        }
      },
      { failureThreshold: 2, halfOpenAfter: 1000 }
    );

    instance.execute(0);
    instance.execute(0);

    await TestUtil.wait(1500);
    instance.execute(0);

    await TestUtil.wait(1500);
    await validate(instance, {
      args: -1,
      value: 'foo',
      error: false,
      events: ['start', 'stop', 'clear'],
      action: null
    });
  });
  test(`Cancellation before-start rejects and prevents execution`, async () => {
    const fn = jest.fn();
    const instance = create(fn, { failureThreshold: 2, halfOpenAfter: 50 });

    await validate(instance, {
      args: null,
      value: null,
      error: 'cancel',
      events: ['cancel', 'error', 'clear'],
      action: (request) => request.cancel()
    });
    expect(fn).not.toHaveBeenCalled();
  });
  test(`Cancellation rejections don't affect circuit`, async () => {
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return Promise.reject(Error());
          default:
            return 'foo';
        }
      },
      { failureThreshold: 2, halfOpenAfter: 50 }
    );

    instance.execute(0);
    const request = instance.execute(0);
    request.cancel();

    await validate(instance, {
      args: -1,
      value: 'foo',
      error: false,
      events: ['start', 'stop', 'clear'],
      action: null
    });
  });
  test(`Response doesn't reject on success for mid-way cancellation`, async () => {
    const instance = create(() => TestUtil.wait(500).then(() => 'foo'), {
      failureThreshold: 2,
      halfOpenAfter: 500
    });

    await validate(instance, {
      args: null,
      value: 'foo',
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
      { failureThreshold: 2, halfOpenAfter: 500 }
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
