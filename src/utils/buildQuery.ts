import QueryParams from './QueryParams';
import type { PaginateParams } from '../types';

/**
 * Collapse the QueryParams boilerplate that every `<entity>Service.getAll` copies.
 *
 * `filter` is narrowed here rather than at each call site: `PaginateParams.filter`
 * allows `Record | unknown[]`, but `QueryParams` only understands a Record — an array
 * would JSON-stringify into a `filter` the backend rejects. `null` is excluded too
 * (`typeof null === 'object'`).
 */
export function buildQuery(
  paginate: PaginateParams = {},
  defaultSearchFields: string[] = [],
): string {
  const filter =
    typeof paginate.filter === 'object' &&
    paginate.filter !== null &&
    !Array.isArray(paginate.filter)
      ? (paginate.filter as Record<string, unknown>)
      : {};

  return new QueryParams(
    paginate.page,
    paginate.perpage,
    paginate.search,
    paginate.searchfields,
    defaultSearchFields,
    filter,
    paginate.sort,
    paginate.advance,
  ).toQueryString();
}

export default buildQuery;
