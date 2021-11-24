import { UnaryFn } from 'type-core';
import { test, expect, jest } from '@jest/globals';
import { TestUtil } from './TestUtil';
import { Executor, BulkheadStrategy } from '../../src';

export function bulkheadTests(
  mode: 'strategy' | 'policy' | 'executor',
  create: <I, O>(
    execute: UnaryFn<I, O | Promise<O>>,
    options: BulkheadStrategy.Options
  ) => Executor<I, O>
): void {
  const validate = TestUtil.validate.bind(null, mode);

  test(`first call fails on no concurrency`, async () => {
    const instance = create(() => 'foo', { concurrency: 0, queue: 1 });

    await validate(instance, {
      args: null,
      value: null,
      error: 'bulkhead',
      events: ['error', 'clear'],
      action: null
    });
  });
  test(`executes first call immediately if concurrency allows`, async () => {
    const fn = jest.fn();
    const instance = create(fn, { concurrency: 1, queue: 0 });

    instance.execute(null);
    await TestUtil.wait(0);

    expect(fn).toHaveBeenCalledTimes(1);
  });
  test(`further calls execute immediately if concurrency allows, limited concurrency`, async () => {
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
      { concurrency: 2, queue: 0 }
    );

    instance.execute(0);
    instance.execute(-1);
    await TestUtil.wait(0);

    expect(fn).toHaveBeenCalledTimes(1);
  });
  test(`further calls execute immediately if concurrency allows, unlimited concurrency`, async () => {
    for (const concurrency of [Infinity, -1]) {
      const fn = jest.fn(() => TestUtil.wait(500));
      const instance = create(fn, { concurrency, queue: 0 });

      Array(50)
        .fill(0)
        .forEach(() => instance.execute(null));

      await TestUtil.wait(500);
      expect(fn).toHaveBeenCalledTimes(50);
    }
  });
  test(`queued calls execute and follow concurrency rules`, async () => {
    const fn = jest.fn(() => 'foo');
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return TestUtil.wait(500);
          case 1:
            return TestUtil.wait(1000);
          default:
            return fn();
        }
      },
      { concurrency: 2, queue: 3 }
    );

    instance.execute(0);
    instance.execute(1);
    instance.execute(0);
    instance.execute(0);

    await validate(instance, {
      args: -1,
      value: 'foo',
      error: false,
      events: ['start', 'stop', 'clear'],
      action: async () => {
        await TestUtil.wait(750);
        expect(fn).toHaveBeenCalledTimes(0);
        await TestUtil.wait(1250);
        expect(fn).toHaveBeenCalledTimes(1);
      }
    });
  });
  test(`queued calls get eventually executed, unlimited queue`, async () => {
    for (const queue of [Infinity, -1]) {
      const fn = jest.fn(() => TestUtil.wait(25));
      const instance = create(fn, { concurrency: 2, queue });

      Array(50)
        .fill(0)
        .forEach(() => instance.execute(null));

      await TestUtil.wait(500);
      expect(fn).not.toHaveBeenCalledTimes(50);
      await TestUtil.wait(750);
      expect(fn).toHaveBeenCalledTimes(50);
    }
  });
  test(`further calls fail immediately w/ no slots left wo/ queue`, async () => {
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return TestUtil.wait(500);
          default:
            return 'foo';
        }
      },
      { concurrency: 2, queue: 0 }
    );

    instance.execute(0);
    instance.execute(0);

    const start = Date.now();
    await validate(instance, {
      args: -1,
      value: null,
      error: 'bulkhead',
      events: ['error', 'clear'],
      action: null
    });
    expect(Date.now() - start).toBeLessThan(500);
  });
  test(`further calls fail immediately w/ no slots left w/ queue`, async () => {
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return TestUtil.wait(1500);
          default:
            return 'foo';
        }
      },
      { concurrency: 2, queue: 2 }
    );

    instance.execute(0);
    instance.execute(0);
    instance.execute(0);
    instance.execute(0);

    const start = Date.now();
    await validate(instance, {
      args: -1,
      value: null,
      error: 'bulkhead',
      events: ['error', 'clear'],
      action: null
    });
    expect(Date.now() - start).toBeLessThan(500);
  });
  test(`Cancellation before-start rejects and prevents execution wo/ queue`, async () => {
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
      { concurrency: 2, queue: 0 }
    );

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
  test(`Cancellation before-start rejects and prevents execution w/ queue`, async () => {
    const fn = jest.fn();
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return TestUtil.wait(0);
          default:
            return fn();
        }
      },
      { concurrency: 2, queue: 2 }
    );

    instance.execute(0);
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
  test(`Cancellation while on queue rejects and prevents execution`, async () => {
    const fn = jest.fn();
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return TestUtil.wait(1000);
          default:
            return fn();
        }
      },
      { concurrency: 2, queue: 2 }
    );

    instance.execute(0);
    instance.execute(0);
    instance.execute(0);

    await validate(instance, {
      args: -1,
      value: null,
      error: 'cancel',
      events: ['cancel', 'error', 'clear'],
      action: async (request) => {
        await TestUtil.wait(500);
        request.cancel();
      }
    });
    expect(fn).not.toHaveBeenCalled();
  });
  test(`Cancellation clears a concurrency slot`, async () => {
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return TestUtil.wait(500);
          default:
            return 'foo';
        }
      },
      { concurrency: 2, queue: 0 }
    );

    instance.execute(0);

    await validate(instance, {
      args: 0,
      value: null,
      error: 'cancel',
      events: ['cancel', 'error', 'clear'],
      action: async (r1) => {
        r1.cancel();

        await validate(instance, {
          args: -1,
          value: 'foo',
          error: false,
          events: ['start', 'stop', 'clear'],
          action: null
        });
      }
    });
  });
  test(`Cancellation clears a queue slot`, async () => {
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return TestUtil.wait(1000);
          default:
            return 'foo';
        }
      },
      { concurrency: 2, queue: 2 }
    );

    instance.execute(0);
    instance.execute(0);
    instance.execute(0);

    await validate(instance, {
      args: 0,
      value: null,
      error: 'cancel',
      events: ['cancel', 'error', 'clear'],
      action: async (r1) => {
        await TestUtil.wait(500);
        r1.cancel();

        await validate(instance, {
          args: -1,
          value: 'foo',
          error: false,
          events: ['start', 'stop', 'clear'],
          action: null
        });
      }
    });
  });
  test(`Response doesn't reject on success for mid-way cancellation`, async () => {
    const instance = create(
      (i: number): any => {
        switch (i) {
          case 0:
            return TestUtil.wait(500);
          default:
            return TestUtil.wait(500).then(() => 'foo');
        }
      },
      { concurrency: 2, queue: 0 }
    );

    instance.execute(0);

    await validate(instance, {
      args: -1,
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
      (i: number): any => {
        switch (i) {
          case 0:
            return TestUtil.wait(500);
          default:
            return TestUtil.wait(500).then(() => Promise.reject(err));
        }
      },
      { concurrency: 2, queue: 0 }
    );

    instance.execute(0);

    await validate(instance, {
      args: -1,
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
