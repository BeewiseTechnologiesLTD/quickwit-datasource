import { AdHocVariableFilter } from '@grafana/data';

import { addAddHocFilter } from './modifyQuery';

describe('addAddHocFilter', () => {
  it('adds an exists filter when value is missing', () => {
    const filter = {
      key: 'service',
      operator: 'exists',
      value: undefined,
    } as unknown as AdHocVariableFilter;

    const result = addAddHocFilter('status:ok', filter);

    expect(result).toBe('status:ok service:*');
  });

  it('adds a not exists filter when value is missing', () => {
    const filter = {
      key: 'service',
      operator: 'not exists',
      value: undefined,
    } as unknown as AdHocVariableFilter;

    const result = addAddHocFilter('', filter);

    expect(result).toBe('-service:*');
  });
});
