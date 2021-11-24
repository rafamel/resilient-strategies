import { TestUtil } from './@setup/TestUtil';
import { resilientTests } from './@setup/resilient-tests';
import { ResilientStrategy } from '../src';

resilientTests('strategy', (execute, ...strategies) => {
  return TestUtil.transformStrategy(
    new ResilientStrategy(...strategies),
    execute
  );
});
