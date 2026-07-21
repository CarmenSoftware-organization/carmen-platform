import api from './api';

/**
 * Reads/writes a business unit's interface entitlement (which brand keys it is licensed
 * for) via the super-admin-gated gateway endpoints. Keyed by bu_code, not id.
 */
const interfaceEntitlementService = {
  getByBuCode: async (buCode: string): Promise<string[]> => {
    const response = await api.get(
      `/api-system/platform/business-units/${encodeURIComponent(buCode)}/interface-entitlement`,
    );
    const data = response.data?.data ?? response.data;
    return Array.isArray(data?.interface_keys) ? data.interface_keys : [];
  },

  setByBuCode: async (
    buCode: string,
    interfaceKeys: string[],
  ): Promise<string[]> => {
    const response = await api.put(
      `/api-system/platform/business-units/${encodeURIComponent(buCode)}/interface-entitlement`,
      { interface_keys: interfaceKeys },
    );
    const data = response.data?.data ?? response.data;
    return Array.isArray(data?.interface_keys) ? data.interface_keys : interfaceKeys;
  },
};

export default interfaceEntitlementService;
