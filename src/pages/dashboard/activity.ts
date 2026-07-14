import { Network, Building2, Users, AppWindow, Newspaper, FileText, type LucideIcon } from 'lucide-react';
import clusterService from '../../services/clusterService';
import businessUnitService from '../../services/businessUnitService';
import userService from '../../services/userService';
import applicationService from '../../services/applicationService';
import newsService from '../../services/newsService';
import reportTemplateService from '../../services/reportTemplateService';
import type { ApiListResponse, Audit, PaginateParams } from '../../types';

export type ActivityVerb = 'created' | 'updated' | 'published';

export interface ActivityItem {
  id: string;
  domainKey: string;
  domainLabel: string;
  icon: LucideIcon;
  verb: ActivityVerb;
  name: string;
  code?: string;
  who?: string;
  at: string; // ISO timestamp used for ordering + grouping
  href: string;
}

// The subset of fields the activity stream reads off a list record, tolerating
// both the flat (`updated_at` / `updated_by_name`) and nested (`audit.updated`)
// shapes the backends return.
interface RawRecord {
  id?: string;
  name?: string;
  title?: string;
  email?: string;
  code?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  updated_by_name?: string;
  audit?: Audit;
}

interface ActivitySource {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string; // e.g. '/clusters' → row links to '/clusters/:id/edit'
  service: { getAll: (p: PaginateParams) => Promise<ApiListResponse<RawRecord>> };
  nameOf: (r: RawRecord) => string;
  codeOf?: (r: RawRecord) => string | undefined;
}

// Order matches the sidebar / Landing index.
export const ACTIVITY_SOURCES: ActivitySource[] = [
  { key: 'clusters', label: 'Clusters', icon: Network, path: '/clusters', service: clusterService,
    nameOf: (r) => r.name || '(unnamed)', codeOf: (r) => r.code },
  { key: 'business-units', label: 'Business Units', icon: Building2, path: '/business-units', service: businessUnitService,
    nameOf: (r) => r.name || '(unnamed)', codeOf: (r) => r.code },
  { key: 'users', label: 'Users', icon: Users, path: '/users', service: userService,
    nameOf: (r) => r.name || r.email || '(unknown user)' },
  { key: 'applications', label: 'Applications', icon: AppWindow, path: '/applications', service: applicationService,
    nameOf: (r) => r.name || '(unnamed)' },
  { key: 'news', label: 'News', icon: Newspaper, path: '/news', service: newsService,
    nameOf: (r) => r.title || '(untitled)' },
  { key: 'report-templates', label: 'Report Templates', icon: FileText, path: '/report-templates', service: reportTemplateService,
    nameOf: (r) => r.name || '(unnamed)' },
];

const ts = (v?: string) => (v ? Date.parse(v) : NaN);

// The list endpoints wrap their payload at varying envelope depth — a bare array,
// `{ data: [] }`, or `{ data: { data: [], paginate } }`. Every Management page
// unwraps defensively (see CLAUDE.md · Service Layer); do the same here so a
// nested-envelope domain doesn't break the merge.

/** Walk down `.data` until the record array is reached; [] if none is found. */
export function unwrapList(res: unknown): RawRecord[] {
  let node: unknown = res;
  for (let i = 0; i < 5 && node && typeof node === 'object' && !Array.isArray(node); i++) {
    node = (node as { data?: unknown }).data;
  }
  return Array.isArray(node) ? (node as RawRecord[]) : [];
}

/** Find `paginate.total` (or `total`) at any envelope depth; 0 if absent. */
export function unwrapTotal(res: unknown): number {
  let node: unknown = res;
  for (let i = 0; i < 5 && node && typeof node === 'object' && !Array.isArray(node); i++) {
    const n = node as { paginate?: { total?: number }; total?: number };
    if (typeof n.paginate?.total === 'number') return n.paginate.total;
    if (typeof n.total === 'number') return n.total;
    node = (node as { data?: unknown }).data;
  }
  return 0;
}

/** Best-available "when" for a record: updated, else created, flat or nested. */
export function extractAt(r: RawRecord): string | undefined {
  return r.updated_at ?? r.audit?.updated?.at ?? r.created_at ?? r.audit?.created?.at ?? undefined;
}
function extractCreated(r: RawRecord): string | undefined {
  return r.created_at ?? r.audit?.created?.at ?? undefined;
}
function extractWho(r: RawRecord): string | undefined {
  return r.updated_by_name ?? r.audit?.updated?.name ?? undefined;
}

/** created vs updated from timestamp equality; News in published status reads as published. */
export function deriveVerb(sourceKey: string, r: RawRecord): ActivityVerb {
  if (sourceKey === 'news' && r.status === 'published') return 'published';
  const created = extractCreated(r);
  const at = extractAt(r);
  if (created && at && ts(created) === ts(at)) return 'created';
  return 'updated';
}

/** Map a raw list record to an ActivityItem, or null when it can't be placed/linked. */
export function toActivityItem(source: ActivitySource, r: RawRecord): ActivityItem | null {
  const at = extractAt(r);
  if (!r.id || !at) return null;
  return {
    id: r.id,
    domainKey: source.key,
    domainLabel: source.label,
    icon: source.icon,
    verb: deriveVerb(source.key, r),
    name: source.nameOf(r),
    code: source.codeOf?.(r),
    who: extractWho(r),
    at,
    href: `${source.path}/${r.id}/edit`,
  };
}

/** Newest-first, capped. */
export function mergeAndSort(items: ActivityItem[], cap = 15): ActivityItem[] {
  return [...items].sort((a, b) => ts(b.at) - ts(a.at)).slice(0, cap);
}

/**
 * Fetch recent activity across every domain and merge into one stream. Each
 * domain is fetched independently; a failing domain is skipped, not fatal.
 *
 * Ordering is guaranteed client-side by `mergeAndSort`, so the stream is always
 * correctly ordered even if a backend ignores `sort=updated_at:desc` — at worst
 * it means the per-domain page we pulled isn't the very newest slice.
 */
export async function fetchActivity(perDomain = 8, cap = 15): Promise<ActivityItem[]> {
  const results = await Promise.allSettled(
    ACTIVITY_SOURCES.map((source) =>
      source.service
        .getAll({
          page: 1,
          perpage: perDomain,
          sort: 'updated_at:desc',
          advance: JSON.stringify({ where: { deleted_at: null } }),
        })
        .then((res) => ({ source, data: unwrapList(res) })),
    ),
  );

  const items: ActivityItem[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const raw of result.value.data) {
      const item = toActivityItem(result.value.source, raw);
      if (item) items.push(item);
    }
  }
  return mergeAndSort(items, cap);
}
