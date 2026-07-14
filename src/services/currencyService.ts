import api from './api';
import type { TenantCurrency } from '../types';

// Tenant currency master lives under the /api proxy, keyed by BU code.
const base = (buCode: string) => `/api/config/${buCode}/currencies`;

// Unwrap the standard `{ data: ... }` envelope, tolerating a bare body.
function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: unknown };
  return (body?.data ?? body) as T;
}

const currencyService = {
  // Full list for a BU's tenant DB, sorted by code, for a dropdown.
  getForBu: async (buCode: string): Promise<TenantCurrency[]> => {
    const response = await api.get(`${base(buCode)}?perpage=500&sort=code:asc`);
    const list = unwrap<TenantCurrency[]>(response);
    return Array.isArray(list) ? list : [];
  },
};

export default currencyService;
