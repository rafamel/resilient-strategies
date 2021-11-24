import { UnaryFn } from 'type-core';
import { test, expect, jest } from '@jest/globals';
import { TestUtil } from './TestUtil';
import { Executor } from '../../src';

export function emptyTests(
  mode: 'strategy' | 'policy' | 'executor',
  create: <I, O>(execute: UnaryFn<I, O | Promise<O>>) => Executor<I, O>
): void {
  const validate = TestUtil.validate.bind(null, mode);

  test(`executes first call immediately`, async () => {
    const fn = jest.fn();
    const instance = create(fn);

    instance.execute(null);
    await TestUtil.wait(0);

    expect(fn).toHaveBeenCalledTimes(1);
  });
  test(`executes second call immediately in parallel`, async () => {
    const fn = jest.fn();
    const instance = create((i: number): any => {
      switch (i) {
        case 0:
          return TestUtil.wait(250);
        default:
          return fn();
      }
    });

    instance.execute(0);
    instance.execute(-1);
    await TestUtil.wait(0);

    expect(fn).toHaveBeenCalledTimes(1);
  });
  test(`request validates on success`, async () => {
    const instance = create(() => 'foo');

    await validate(instance, {
      args: null,
      value: 'foo',
      error: false,
      events: ['start', 'stop', 'clear'],
      action: null
    });
  });
  test(`request validates on failure`, async () => {
    const err = Error();
    const instance = create(() => Promise.reject(err));

    await validate(instance, {
      args: null,
      value: null,
      error: err,
      events: ['start', 'error', 'stop', 'clear'],
      action: null
    });
  });
  test(`Cancellation before-start rejects and prevents execution`, async () => {
    const fn = jest.fn();
    const instance = create(fn);

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
    const instance = create(fn);

    await validate(instance, {
      args: null,
      value: null,
      error: 'cancel',
      events: ['cancel', 'error', 'clear'],
      action: (request) => {
        request.cancel();
        request.cancel();
        return TestUtil.wait(100).then(() => request.cancel());
      }
    });
    expect(fn).not.toHaveBeenCalled();
  });
  test(`Cancellation after-end doesn't have an effect`, async () => {
    const fn = jest.fn(() => 'foo');
    const instance = create(fn);

    let p: Promise<void> | null = null;
    await validate(instance, {
      args: null,
      value: 'foo',
      error: false,
      events: ['start', 'stop', 'clear'],
      action: (request) => {
        p = TestUtil.wait(100).then(() => request.cancel());
      }
    });
    await p;
  });
  test(`Response doesn't reject on success for mid-way cancellation`, async () => {
    const instance = create(() => {
      return TestUtil.wait(500).then(() => 'foo');
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
    const instance = create(() => {
      return TestUtil.wait(1500).then(() => Promise.reject(err));
    });

    await validate(instance, {
      args: null,
      value: null,
      error: err,
      events: ['start', 'cancel', 'error', 'stop', 'clear'],
      action: async (request) => {
        await TestUtil.wait(500);
        request.cancel();
      }
    });
  });
}
