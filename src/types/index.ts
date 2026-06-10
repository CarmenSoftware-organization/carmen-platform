export interface PaginateParams {
  page?: number;
  perpage?: number;
  search?: string;
  searchfields?: string[];
  filter?: Record<string, unknown> | unknown[];
  sort?: string;
  advance?: string;
}

export interface PaginateInfo {
  total: number;
  page: number;
  perpage: number;
  totalPages?: number;
}

export interface ApiListResponse<T> {
  data: T[];
  paginate?: PaginateInfo;
  total?: number;
}

export interface Cluster {
  id: string;
  code: string;
  name: string;
  description?: string;
  alias_name?: string;
  logo?: PresignedImage | null;   // resolved presigned logo (list + detail)
  avatar?: PresignedImage | null; // resolved presigned avatar (list + detail)
  max_license_bu?: number;
  info?: unknown;
  is_active: boolean;
  bu_count?: number;
  users_count?: number;
  total_max_license_users?: number;
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
  deleted_at?: string;
  deleted_by_name?: string;
}

export interface Application {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  allow_all?: boolean;
  api_names?: string[]; // read model (flat list of api_name strings)
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
}

// A module group of api_names, e.g. { module: 'cluster', api_names: ['cluster.create', ...] }.
// Returned by the api-catalog endpoint (or derived client-side from a flat api_names list).
export interface ApiCatalogGroup {
  module: string;
  api_names: string[];
}

// Write payload for create/update. The backend is asymmetric to the read model:
// selected api_names are sent through details.add[]. Update uses replace semantics
// (send the full desired set).
export interface ApplicationWritePayload {
  name: string;
  description?: string;
  is_active?: boolean;
  allow_all?: boolean;
  details?: { add: { api_name: string }[] };
}

export interface BusinessUnitConfig {
  id?: string;
  key: string;
  label: string;
  datatype?: string;
  value?: unknown;
}

export interface PresignedImage {
  url: string;
  expires_at?: string;
}

export interface BusinessUnit {
  id: string;
  cluster_id?: string;
  code: string;
  name: string;
  logo?: PresignedImage | null;   // resolved presigned brand logo (list + detail)
  avatar?: PresignedImage | null; // resolved presigned square avatar (list + detail)
  alias_name?: string;
  description?: string;
  is_hq?: boolean;
  is_active: boolean;
  max_license_users?: number;
  // Hotel Information
  hotel_name?: string;
  hotel_tel?: string;
  hotel_email?: string;
  hotel_address?: string;
  hotel_zip_code?: string;
  // Company Information
  company_name?: string;
  company_tel?: string;
  company_email?: string;
  company_address?: string;
  company_zip_code?: string;
  // Tax Information
  tax_no?: string;
  branch_no?: string;
  // Date/Time Formats
  date_format?: string;
  date_time_format?: string;
  time_format?: string;
  long_time_format?: string;
  short_time_format?: string;
  timezone?: string;
  // Number Formats
  perpage_format?: string;
  amount_format?: string;
  quantity_format?: string;
  recipe_format?: string;
  // Calculation Settings
  calculation_method?: string;
  default_currency_id?: string;
  // Config & Connection
  db_connection?: unknown;
  config?: BusinessUnitConfig[] | null;
  cluster_name?: string;
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
  deleted_at?: string;
  deleted_by_name?: string;
}

export interface UserInfo {
  firstname?: string;
  middlename?: string;
  lastname?: string;
  telephone?: string;
}

export interface User {
  id: string;
  name?: string;
  email: string;
  role?: string;
  status?: string;
  alias_name?: string;
  firstname?: string;
  middlename?: string;
  lastname?: string;
  telephone?: string;
  user_info?: UserInfo;
  business_unit?: BusinessUnit[];
  created_at?: string;
  updated_at?: string;
}

// Row returned by GET /api-system/user/clusters/:clusterId — a tb_cluster_user
// join row, not a plain User. Carries cluster-membership fields plus a
// nested userInfo (note the camelCase shape from the backend).
export interface ClusterUser {
  id: string;          // tb_cluster_user.id (membership row id, NOT the user's id)
  user_id?: string;    // links to User.id
  cluster_id?: string;
  parent_bu_id?: string | null;
  role?: string;
  is_active?: boolean;
  username?: string;
  email?: string;
  name?: string;
  userInfo?: {
    firstname?: string;
    middlename?: string;
    lastname?: string;
  };
  created_at?: string;
  updated_at?: string;
}

export type Scope = { type: 'platform' } | { type: 'cluster'; cluster_id: string };

export interface EffectivePermissions {
  platform: string[];                    // permission keys "resource.action"
  clusters: Record<string, string[]>;    // clusterId -> permission keys
  is_super_admin?: boolean;              // god-mode bypass flag from the backend
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  permissions: string[];                 // permission keys
}

export interface PermissionCatalogItem {
  key: string;                           // "resource.action"
  resource: string;
  action: string;
  description?: string;
}

export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  role_name?: string;
  scope: Scope;
}

export interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface LoginResult {
  success: boolean;
  error?: string;
}

export interface AuthContextValue {
  user: User | null;
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  logout: () => void;
  refreshUser: () => void;
  isAuthenticated: boolean;
  loading: boolean;
  loginResponse: LoginResponse | null;
  userCount: number | null;
  effectivePermissions: EffectivePermissions | null;
  hasPermission: (key: string, opts?: { clusterId?: string }) => boolean;
  isSuperAdmin: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export type NewsStatus = 'draft' | 'published' | 'archived';

export interface AuditEntry {
  at?: string;
  id?: string;
  name?: string;
  avatar?: string;
}

export interface Audit {
  created?: AuditEntry;
  updated?: AuditEntry;
  deleted?: AuditEntry;
}

export interface News {
  id: string;
  title: string;
  contents?: string;            // Markdown body
  url?: string;                 // source URL
  image_url?: string;           // presigned image URL returned by list + detail
  image?: string;               // legacy field name (older payloads); kept as fallback
  business_unit_ids?: string[]; // [] = global (all BUs); non-empty = those BUs
  status?: NewsStatus;
  published_at?: string;
  audit?: Audit;                // enriched audit object (from getById)
  deleted_at?: string;          // set on soft-deleted records (present in the list payload)
}

// ===== Broadcasts =====

export type BroadcastTargetMode = 'system_all' | 'system_users' | 'bu';

export type BroadcastTypePreset = 'INFO' | 'WARNING' | 'CRITICAL' | 'MAINTENANCE' | 'OTHER';

export interface BroadcastSystemPayload {
  title: string;
  message: string;
  type?: string;
  metadata?: Record<string, unknown>;
  scheduled_at?: string; // ISO date-time
  userIds?: string[];    // UUIDs; when present, fans out as personal rows
}

export interface BroadcastBuPayload {
  bu_code: string;
  title: string;
  message: string;
  type?: string;
  metadata?: Record<string, unknown>;
  scheduled_at?: string; // ISO date-time
}

export interface UserOption {
  id: string;
  name: string;
  email?: string;
}

// ===== Changelog =====

export type ChangelogCategory =
  | 'Added' | 'Changed' | 'Deprecated' | 'Removed' | 'Fixed' | 'Security';

export type ChangelogChanges = Partial<Record<ChangelogCategory, string[]>>;

export interface ChangelogVersion {
  version: string;            // semver, e.g. "0.1.0"
  date: string;               // "YYYY-MM-DD"
  changes: ChangelogChanges;
}

export interface Changelog {
  unreleased: ChangelogChanges;
  versions: ChangelogVersion[];
}
