class QueryParams {
  page: number;
  perpage: number;
  search: string;
  searchfields: string[];
  filter: Record<string, unknown>;
  sort: string;
  advance: string;

  constructor(
    page?: number,
    perpage?: number,
    search?: string,
    searchfields?: string[],
    defaultSearchFields?: string[],
    filter?: Record<string, unknown>,
    sort?: string,
    advance?: string
  ) {
    this.page = page || 1;
    this.perpage = perpage || 10;
    this.search = search || '';
    this.searchfields = searchfields || defaultSearchFields || [];
    this.filter = (typeof filter === 'object' && !Array.isArray(filter)) ? filter : {};
    this.sort = sort || '';
    this.advance = advance || '';
  }

  toQueryString(): string {
    const params = new URLSearchParams();
    params.set('page', String(this.page));
    params.set('perpage', String(this.perpage));

    if (this.search) {
      params.set('search', this.search);
    }

    if (this.searchfields && this.searchfields.length > 0) {
      params.set('searchfields', this.searchfields.join(','));
    }

    if (this.filter && Object.keys(this.filter).length > 0) {
      params.set('filter', JSON.stringify(this.filter));
    }

    if (this.sort) {
      params.set('sort', this.sort);
    }

    if (this.advance) {
      params.set('advance', this.advance);
    }

    return params.toString();
  }
}

export default QueryParams;
