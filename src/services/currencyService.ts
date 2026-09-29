import api from './api';
import type { TenantCurrency } from '../types';
import { fetchAllPages, type PagedResponse } from '../utils/fetchAllPages';

// Tenant currency master lives under the /api proxy, keyed by BU code.
const base = (buCode: string) => `/api/config/${buCode}/currencies`;

const currencyService = {
  // Full list for a BU's tenant DB, sorted by code, for a dropdown.
  getForBu: (buCode: string): Promise<TenantCurrency[]> =>
    fetchAllPages<TenantCurrency>(
      async (page, perpage) => {
        const response = await api.get(`${base(buCode)}?page=${page}&perpage=${perpage}&sort=code:asc`);
        // tolerate a bare-array body or a non-array `data` (as the old unwrap did)
        const body = response.data as PagedResponse<TenantCurrency> | TenantCurrency[] | undefined;
        if (Array.isArray(body)) return { data: body, paginate: { total: body.length } };
        if (!Array.isArray(body?.data)) return { data: [], paginate: { total: 0 } };
        return body as PagedResponse<TenantCurrency>;
      },
      { label: 'currencyService.getForBu', context: { buCode } },
    ),
};

export default currencyService;
