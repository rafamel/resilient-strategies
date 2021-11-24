import { TestUtil } from './@setup/TestUtil';
import { resilientTests } from './@setup/resilient-tests';
import { ResilientPolicy } from '../src';

resilientTests('policy', (execute, ...strategies) => {
  return TestUtil.transformPolicy(new ResilientPolicy(...strategies), execute);
});
