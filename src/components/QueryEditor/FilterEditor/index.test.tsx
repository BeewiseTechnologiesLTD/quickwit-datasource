import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { DispatchContext } from '@/hooks/useStatelessReducer';
import { ElasticsearchQuery } from '@/types';

import { QueryContext } from '../ElasticsearchQueryContext';
import { FilterEditor } from '.';
import { addFilter } from './state/actions';

const createQuery = (filters: ElasticsearchQuery['filters']): ElasticsearchQuery => ({
  refId: 'A',
  query: '',
  metrics: [{ id: '1', type: 'count' }],
  bucketAggs: [{ id: '2', type: 'date_histogram' }],
  filters,
});

const renderFilterEditor = (query: ElasticsearchQuery) => {
  const dispatch = jest.fn();

  render(
    <DispatchContext.Provider value={dispatch}>
      <QueryContext.Provider value={query}>
        <FilterEditor onSubmit={jest.fn()} />
      </QueryContext.Provider>
    </DispatchContext.Provider>
  );

  return { dispatch };
};

describe('FilterEditor', () => {
  it('shows add button when there are no filters', () => {
    renderFilterEditor(createQuery([]));

    expect(screen.getByRole('button', { name: 'add' })).toBeInTheDocument();
  });

  it('dispatches addFilter when adding first filter from empty state', () => {
    const { dispatch } = renderFilterEditor(createQuery([]));

    fireEvent.click(screen.getByRole('button', { name: 'add' }));

    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0];
    expect(addFilter.match(action)).toBe(true);
    expect(action.payload).toEqual(expect.any(String));
  });
});
