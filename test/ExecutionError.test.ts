import { test, expect } from '@jest/globals';
import { ExecutionError } from '../src/ExecutionError';

test(`instance.message: has expected message wo/ explicit message`, () => {
  const a = new ExecutionError({
    reason: 'cancel'
  });
  expect(a.message).toMatchInlineSnapshot(`"Execution error: cancel"`);

  const b = new ExecutionError({
    reason: 'cancel',
    message: undefined
  });
  expect(b.message).toMatchInlineSnapshot(`"Execution error: cancel"`);

  const c = new ExecutionError({
    reason: 'cancel',
    message: ''
  });
  expect(c.message).toMatchInlineSnapshot(`"Execution error: cancel"`);
});
test(`instance.message: has expected message w/ explicit message`, () => {
  const instance = new ExecutionError({
    reason: 'cancel',
    message: 'foo'
  });
  expect(instance.message).toMatchInlineSnapshot(
    `"Execution error: cancel, foo"`
  );
});
test(`instance.reason: is reason`, () => {
  const instance = new ExecutionError({ reason: 'cancel' });
  expect(instance.reason).toBe('cancel');
});
test(`instance.isExecutionError: is true`, () => {
  const instance = new ExecutionError({ reason: 'cancel' });
  expect(instance.isExecutionError).toBe(true);
});
test(`ExecutionError.is: returns true for ExecutionError instance`, () => {
  const instance = new ExecutionError({ reason: 'cancel' });
  expect(ExecutionError.is(instance)).toBe(true);
});
test(`ExecutionError.is: returns true for ExecutionError instance w/ matching reason`, () => {
  const instance = new ExecutionError({ reason: 'cancel' });
  expect(ExecutionError.is(instance, 'cancel')).toBe(true);
});
test(`ExecutionError.is: returns false for ExecutionError instance wo/ matching reason`, () => {
  const instance = new ExecutionError({ reason: 'bulkhead' });
  expect(ExecutionError.is(instance, 'cancel')).toBe(false);
});
test(`ExecutionError.is: returns false for Error instance`, () => {
  const instance = new Error();
  expect(ExecutionError.is(instance)).toBe(false);
});
