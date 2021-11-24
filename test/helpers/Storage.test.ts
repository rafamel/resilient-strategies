/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { expect, jest, test } from '@jest/globals';
import { MemoryStorage } from '../../src/helpers/MemoryStorage';
import { StorageAdapter } from '../../src/helpers/StorageAdapter';
import { Storage } from '../../src';

function createAdapter(withBatch: boolean) {
  const memory = new MemoryStorage();
  const storage: Storage<any> = {
    get: jest.fn(memory.get.bind(memory)),
    set: jest.fn(memory.set.bind(memory)),
    batch: withBatch
      ? jest.fn(
          async (...mutations: Array<Storage.Mutation<any>>): Promise<void> => {
            mutations.forEach((mutation) => memory.set(mutation));
          }
        )
      : undefined
  };
  return {
    storage,
    adapter: new StorageAdapter({
      get: storage.get,
      set: storage.set,
      batch: storage.batch || undefined
    }),
    assertStoreCalledTimes(times: { get: number; set: number; batch: number }) {
      expect(storage.get).toHaveBeenCalledTimes(times.get);
      expect(storage.set).toHaveBeenCalledTimes(times.set);
      expect(storage.batch || jest.fn()).toHaveBeenCalledTimes(times.batch);
    }
  };
}

test(`instance.getIds: calls store.get`, async () => {
  const { adapter, assertStoreCalledTimes } = createAdapter(true);

  await adapter.getIds();
  assertStoreCalledTimes({ get: 1, set: 0, batch: 0 });
});
test(`instance.getIds: returns an empty array for an empty store.getIds reponse`, async () => {
  const { adapter } = createAdapter(true);

  await expect(adapter.getIds()).resolves.toEqual([]);
});
test(`instance.getValues: doesn't call store.get for an empty array`, async () => {
  const { adapter, assertStoreCalledTimes } = createAdapter(true);

  await adapter.getValues([]);
  assertStoreCalledTimes({ get: 0, set: 0, batch: 0 });
});
test(`instance.getValues: calls store.get once per id`, async () => {
  const { adapter, assertStoreCalledTimes } = createAdapter(true);

  await adapter.getValues(['foo', 'bar']);
  assertStoreCalledTimes({ get: 2, set: 0, batch: 0 });
});
test(`instance.getValues: returns null values for non-existent ids`, async () => {
  const { adapter } = createAdapter(true);

  await expect(adapter.getValues(['foo', 'bar'])).resolves.toEqual([
    { id: 'foo', exists: false },
    { id: 'bar', exists: false }
  ]);
});
test(`instance.setIds: calls store.set w/ batch method`, async () => {
  const { adapter, assertStoreCalledTimes } = createAdapter(true);

  await adapter.setIds([]);
  assertStoreCalledTimes({ get: 0, set: 1, batch: 0 });
  await adapter.setIds(['foo', 'bar', 'baz']);
  assertStoreCalledTimes({ get: 0, set: 2, batch: 0 });
});
test(`instance.setIds: calls store.set wo/ batch method`, async () => {
  const { adapter, assertStoreCalledTimes } = createAdapter(false);

  await adapter.setIds([]);
  assertStoreCalledTimes({ get: 0, set: 1, batch: 0 });
  await adapter.setIds(['foo', 'bar', 'baz']);
  assertStoreCalledTimes({ get: 0, set: 2, batch: 0 });
});
test(`instance.setValues: calls store.set once per id wo/ batch method`, async () => {
  const { adapter, assertStoreCalledTimes } = createAdapter(false);

  await adapter.setValues(
    { id: 'foo', value: { id: 'foo' } },
    { id: 'bar', value: { id: 'bar' } }
  );
  assertStoreCalledTimes({ get: 0, set: 2, batch: 0 });
});
test(`instance.setValues: calls store.set once per id w/ batch method`, async () => {
  const { adapter, assertStoreCalledTimes } = createAdapter(true);

  await adapter.setValues(
    { id: 'foo', value: { id: 'foo' } },
    { id: 'bar', value: { id: 'bar' } }
  );
  assertStoreCalledTimes({ get: 0, set: 0, batch: 1 });
});
test(`instance.setIds/instance.getIds: set and get ids`, async () => {
  const { adapter } = createAdapter(true);

  await adapter.setIds(['foo']);
  await expect(adapter.getIds()).resolves.toEqual(['foo']);
  await adapter.setIds(['bar', 'baz']);
  await expect(adapter.getIds()).resolves.toEqual(['bar', 'baz']);
});
test(`instance.setValues/instance.getValues: set and get values wo/ batch method`, async () => {
  const { adapter } = createAdapter(false);

  await adapter.setValues(
    { id: 'foo', value: { id: 'foo' } },
    { id: 'bar', value: { id: 'bar' } }
  );
  await expect(adapter.getValues(['foo', 'bar'])).resolves.toEqual([
    { id: 'foo', exists: true, value: { id: 'foo' } },
    { id: 'bar', exists: true, value: { id: 'bar' } }
  ]);
  await adapter.setValues(
    { id: 'foo', delete: true },
    { id: 'baz', value: { id: 'baz' } }
  );
  await expect(adapter.getValues(['foo', 'bar', 'baz'])).resolves.toEqual([
    { id: 'foo', exists: false },
    { id: 'bar', exists: true, value: { id: 'bar' } },
    { id: 'baz', exists: true, value: { id: 'baz' } }
  ]);
});
test(`instance.setValues/instance.getValues: set and get values w/ batch method`, async () => {
  const { adapter } = createAdapter(true);

  await adapter.setValues(
    { id: 'foo', value: { id: 'foo' } },
    { id: 'bar', value: { id: 'bar' } }
  );
  await expect(adapter.getValues(['foo', 'bar'])).resolves.toEqual([
    { id: 'foo', exists: true, value: { id: 'foo' } },
    { id: 'bar', exists: true, value: { id: 'bar' } }
  ]);
  await adapter.setValues(
    { id: 'foo', delete: true },
    { id: 'baz', value: { id: 'baz' } }
  );
  await expect(adapter.getValues(['foo', 'bar', 'baz'])).resolves.toEqual([
    { id: 'foo', exists: false },
    { id: 'bar', exists: true, value: { id: 'bar' } },
    { id: 'baz', exists: true, value: { id: 'baz' } }
  ]);
});
