import { escapeFilter, escapeFilterValue, concatenate, LuceneQuery } from 'utils/lucene';
import { AdHocVariableFilter } from '@grafana/data';

/**
 * Adds a label:"value" expression to the query.
 */
export function addAddHocFilter(query: string, filter: AdHocVariableFilter): string {
  const valueLessOperators = ['exists', 'not exists'];
  const hasValidValue = filter.value !== undefined && filter.value !== null && filter.value !== '';
  const isValueLessOperator = valueLessOperators.includes(filter.operator);

  if (!filter.key || (!isValueLessOperator && !hasValidValue)) {
    return query;
  }

  // Type is defined as string, but it can be a number.
  const filterValue = hasValidValue ? filter.value.toString() : '';

  const equalityFilters = ['=', '!='];
  if (equalityFilters.includes(filter.operator)) {
    return LuceneQuery.parse(query)
      .addFilter(filter.key, filterValue, filter.operator === '=' ? '' : '-')
      .toString();
  }
  /**
   * Keys and values in ad hoc filters may contain characters such as
   * colons, which needs to be escaped.
   */
  const key = escapeFilter(filter.key);
  const value = escapeFilterValue(filterValue);
  let addHocFilter = '';
  switch (filter.operator) {
    case '=~':
      addHocFilter = `${key}:/${value}/`;
      break;
    case '!~':
      addHocFilter = `-${key}:/${value}/`;
      break;
    case '>':
      addHocFilter = `${key}:>${value}`;
      break;
    case '<':
      addHocFilter = `${key}:<${value}`;
      break;
    case 'term':
      addHocFilter = `${key}:${value}`;
      break;
    case 'not term':
      addHocFilter = `-${key}:${value}`;
      break;
    case 'exists':
      addHocFilter = `${key}:*`;
      break;
    case 'not exists':
      addHocFilter = `-${key}:*`;
      break;
  }
  return concatenate(query, addHocFilter);
}
