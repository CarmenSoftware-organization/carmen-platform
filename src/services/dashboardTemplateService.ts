import api from './api';
import type {
  DashboardTemplate, DashboardTemplateInput, DashboardTemplateKind, DashboardDatasetInfo,
  DashboardDeployStatus, DashboardDeployMode, DashboardDeployResult,
} from '../types';

const BASE = '/api-system/dashboard-templates';
// gateway ห่อ envelope { data } — ตาม src/services/CLAUDE.md
const unwrap = <T>(res: { data: unknown }): T => {
  const body = res.data as { data?: T } | T;
  return ((body as { data?: T })?.data ?? body) as T;
};

const dashboardTemplateService = {
  list: async (kind: DashboardTemplateKind, module?: string): Promise<DashboardTemplate[]> => {
    const q = new URLSearchParams({ kind, ...(module ? { module } : {}) });
    const inner = unwrap<DashboardTemplate[] | { data: DashboardTemplate[] }>(await api.get(`${BASE}?${q}`));
    return Array.isArray(inner) ? inner : inner?.data ?? [];
  },
  create: async (data: DashboardTemplateInput): Promise<{ id: string }> => unwrap(await api.post(BASE, data)),
  update: async (id: string, data: Partial<DashboardTemplateInput> & { doc_version?: number }) =>
    unwrap<{ id: string; doc_version: number }>(await api.patch(`${BASE}/${id}`, data)),
  remove: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/${id}`);
  },
  reorder: async (kind: DashboardTemplateKind, module: string, items: { id: string; order_index: number }[]) =>
    unwrap<{ reordered: number }>(await api.patch(`${BASE}/reorder`, { kind, module, items })),
  datasets: async (): Promise<DashboardDatasetInfo[]> =>
    unwrap<{ items: DashboardDatasetInfo[] }>(await api.get(`${BASE}/datasets`)).items ?? [],
  version: async (): Promise<number> => unwrap<{ version: number }>(await api.get(`${BASE}/bu-default/version`)).version,
  deployStatus: async (buCode: string, signal?: AbortSignal): Promise<DashboardDeployStatus> =>
    unwrap(await api.get(`${BASE}/deploy/${encodeURIComponent(buCode)}/status`, { signal })),
  deploy: async (buCode: string, mode: DashboardDeployMode, expectedVersion: number, signal?: AbortSignal) =>
    unwrap<DashboardDeployResult>(
      await api.post(`${BASE}/deploy/${encodeURIComponent(buCode)}`, { mode, expected_version: expectedVersion }, { signal }),
    ),
};

export default dashboardTemplateService;
