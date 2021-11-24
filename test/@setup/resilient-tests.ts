import { UnaryFn } from 'type-core';
import { describe } from '@jest/globals';
import { emptyTests } from './empty-tests';
import { retryTests } from './retry-tests';
import { bulkheadTests } from './bulkhead-tests';
import { circuitBreakerTests } from './circuit-breaker-tests';
import { combineTests } from './combine-tests';
import {
  Executor,
  Strategy,
  RetryStrategy,
  BulkheadStrategy,
  CircuitBreakerStrategy
} from '../../src';

export function resilientTests(
  mode: 'strategy' | 'policy' | 'executor',
  create: <I, O>(
    execute: UnaryFn<I, O | Promise<O>>,
    ...strategies: Strategy[]
  ) => Executor<I, O>
): void {
  describe(`strategy: empty`, () => {
    emptyTests(mode, (execute) => {
      return create(execute);
    });
  });
  describe(`strategy: retry`, () => {
    retryTests(mode, (execute, options) => {
      return create(execute, new RetryStrategy(options));
    });
  });
  describe(`strategy: bulkhead`, () => {
    bulkheadTests(mode, (execute, options) => {
      return create(execute, new BulkheadStrategy(options));
    });
  });
  describe(`strategy: circuitBreaker`, () => {
    circuitBreakerTests(mode, (execute, options) => {
      return create(execute, new CircuitBreakerStrategy(options));
    });
  });
  describe(`strategy: combine`, () => {
    combineTests(mode, (execute, ...strategies) => {
      return create(execute, ...strategies);
    });
  });
}
