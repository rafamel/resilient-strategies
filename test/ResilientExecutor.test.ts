import { describe, expect, jest, test } from '@jest/globals';
import { resilientTests } from './@setup/resilient-tests';
import { ResilientExecutor } from '../src';

resilientTests('executor', (execute, ...strategies) => {
  return new ResilientExecutor(execute, null, ...strategies);
});

describe(`Executor-specific`, () => {
  test(`instance.query returns null promise for non-existing id`, async () => {
    const instance = new ResilientExecutor(() => null, null);
    await expect(instance.query('foo')).resolves.toBe(null);
  });
  test(`instance.query returns request promise for existing id`, async () => {
    const instance = new ResilientExecutor(() => null, null);
    const request = instance.execute(null);

    await expect(instance.query(request.id)).resolves.toBe(request);
  });
  test(`instance.query rejects for storage.get rejections`, async () => {
    const error = Error();
    const instance = new ResilientExecutor<null, null>(() => null, {
      get: () => Promise.reject(error),
      set: () => Promise.resolve()
    });
    await expect(instance.query('foo')).rejects.toBe(error);
  });
  test(`instance.query errors don't propagate to instance.events$`, () => {
    const instance = new ResilientExecutor<null, null>(() => null, {
      get: () => Promise.reject(Error()),
      set: () => Promise.resolve()
    });

    const fn = jest.fn();
    const subs = instance.events$.subscribe({ next: fn });

    instance.query('foo').catch(() => undefined);
    expect(fn).not.toHaveBeenCalled();
    subs.unsubscribe();
  });
});
