import api from './api';
import { buildQuery } from '../utils/buildQuery';
import type { PaginateParams, ApplicationWritePayload, ApplicationsResponse, ApiCatalogGroup, ApplicationSummaryData, DeviceType } from '../types';
import { groupApiNames } from '../utils/apiCatalog';

const defaultSearchFields = ['name', 'description'];

// Build the write payload from flat form data. `api_names` (string[]) is translated
// into the backend's details.add[] shape. Empty/whitespace entries are dropped.
const toWritePayload = (data: {
  name: string;
  description?: string;
  is_active?: boolean;
  allow_all?: boolean;
  device?: DeviceType;
  api_names?: string[];
  doc_version?: number;
}): ApplicationWritePayload => {
  const payload: ApplicationWritePayload = {
    name: data.name,
    description: data.description,
    is_active: data.is_active,
    allow_all: data.allow_all,
    device: data.device,
  };
  // When allow_all is set the backend grants every API, so api_names are irrelevant.
  if (!data.allow_all) {
    const cleaned = (data.api_names ?? []).map((s) => s.trim()).filter(Boolean);
    payload.details = { add: cleaned.map((api_name) => ({ api_name })) };
  }
  if (data.doc_version != null) payload.doc_version = data.doc_version;
  return payload;
};

// Runtime guard for a catalog group from an untrusted API response: both fields
// present and correctly typed (including every api_name being a string).
const isApiCatalogGroup = (g: unknown): g is ApiCatalogGroup =>
  typeof g === 'object' &&
  g !== null &&
  typeof (g as ApiCatalogGroup).module === 'string' &&
  Array.isArray((g as ApiCatalogGroup).api_names) &&
  (g as ApiCatalogGroup).api_names.every((n: unknown) => typeof n === 'string');

const applicationService = {
  getAll: async (paginate: PaginateParams = {}): Promise<ApplicationsResponse> => {
    const response = await api.get(
      `/api-system/applications?${buildQuery(paginate, defaultSearchFields)}`,
    );
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/api-system/applications/${id}`);
    return response.data;
  },

  // Catalog of selectable api_name values. The endpoint returns
  // { api_names: string[], groups?: { module, api_names }[] } (optionally inside the
  // standard { data } envelope). Tolerate a bare string[] too. When the backend has
  // not yet been redeployed with `groups`, derive the same grouping client-side from
  // api_names (identical split rule), so the UI works regardless of deploy order.
  getApiCatalog: async (): Promise<{ groups: ApiCatalogGroup[]; api_names: string[] }> => {
    const response = await api.get('/api-system/applications/api-catalog');
    const body = response.data?.data ?? response.data;

    const api_names: string[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.api_names)
        ? body.api_names
        : [];

    const rawGroups = body?.groups;
    const validGroups: ApiCatalogGroup[] =
      Array.isArray(rawGroups) && rawGroups.every(isApiCatalogGroup)
        ? (rawGroups as ApiCatalogGroup[])
        : groupApiNames(api_names);

    return { groups: validGroups, api_names };
  },

  /**
   * Registry aggregate from `GET /api-system/applications/summary` — unfiltered, no
   * `search`/`advance` params. Counts every application in the registry, not the current
   * table view. See `ApplicationSummaryData` in `types/index.ts`.
   */
  getRegistrySummary: async (): Promise<ApplicationSummaryData> => {
    const response = await api.get('/api-system/applications/summary');
    return response.data.data || response.data;
  },

  create: async (data: Parameters<typeof toWritePayload>[0]) => {
    const response = await api.post('/api-system/applications', toWritePayload(data));
    return response.data;
  },

  update: async (id: string, data: Parameters<typeof toWritePayload>[0]) => {
    const response = await api.put(`/api-system/applications/${id}`, toWritePayload(data));
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api-system/applications/${id}`);
    return response.data;
  },
};

export default applicationService;
