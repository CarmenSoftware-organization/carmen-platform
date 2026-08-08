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
  doc_version?: number; // optimistic-lock token (read model)
}

export type DeviceType = 'mobile' | 'web' | 'desktop' | 'pos';
export const DEVICE_OPTIONS: DeviceType[] = ['mobile', 'web', 'desktop', 'pos'];

export interface Application {
  id: string;
  name: string;
  description?: string;
  is_active?: boolean;
  allow_all?: boolean;
  device?: DeviceType;
  api_names?: string[]; // read model (flat list of api_name strings)
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
  doc_version?: number; // optimistic-lock token (read model)
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
  device?: DeviceType;
  details?: { add: { api_name: string }[] };
  doc_version?: number;
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
  hotel_address_line1?: string;
  hotel_address_line2?: string;
  hotel_sub_district?: string;
  hotel_district?: string;
  hotel_city?: string;
  hotel_province?: string;
  hotel_postal_code?: string;
  hotel_country?: string;
  hotel_latitude?: string;
  hotel_longitude?: string;
  // Company Information
  company_name?: string;
  company_tel?: string;
  company_email?: string;
  company_address_line1?: string;
  company_address_line2?: string;
  company_sub_district?: string;
  company_district?: string;
  company_city?: string;
  company_province?: string;
  company_postal_code?: string;
  company_country?: string;
  company_latitude?: string;
  company_longitude?: string;
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
  doc_version?: number; // optimistic-lock token (read model)
}

// Tenant database migration (super-admin) — /api-system/tenant/migrations/:bu_id/*
export interface TenantMigrationStatus {
  bu_id: string;
  bu_code: string;
  has_pending: boolean;
  pending: string[];
  up_to_date: boolean;
  raw: string;
}

export interface TenantMigrationDeployResult {
  bu_id: string;
  bu_code: string;
  success: boolean;
  already_up_to_date: boolean;
  applied_migrations: string[];
  raw: string;
}

export interface SingleDeploySummary {
  bu_id: string;
  bu_code: string;
  success: boolean;
  already_up_to_date: boolean;
  applied_migrations: string[];
}

export interface BatchDeploySummary {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<Record<string, unknown>>;
}

export type DeploySummary = SingleDeploySummary | BatchDeploySummary;

export type ProgressEvent =
  | { type: 'start'; bu_id: string; bu_code: string; total: number }
  | { type: 'applying'; bu_id: string; bu_code: string; name: string; index: number; total: number }
  | {
      type: 'bu-complete';
      bu_id: string;
      bu_code: string;
      success: boolean;
      applied: string[];
      already_up_to_date: boolean;
      error?: string;
    }
  | { type: 'log'; message: string }
  | { type: 'done'; success: boolean; summary: DeploySummary }
  | { type: 'error'; message: string };

// Tenant seed data (super-admin) — /api-system/tenant/seeds/:bu_id/*
export interface SeedSetStatus {
  key: string;
  label: string;
  defined: number;
  present: number;
  missing: string[];
}

export interface TenantSeedStatus {
  bu_id: string;
  bu_code: string;
  sets: SeedSetStatus[];
  all_seeded: boolean;
}

export interface SeedDeploySummary {
  bu_id: string;
  bu_code: string;
  created: number;
  skipped: number;
}

export type SeedProgressEvent =
  | { type: 'start'; bu_id: string; bu_code: string; total: number }
  | { type: 'seeding'; bu_id: string; bu_code: string; key: string; row_type: string; index: number; total: number }
  | { type: 'done'; success: boolean; summary: SeedDeploySummary }
  | { type: 'error'; message: string };

export type PreconfigDuplicateMode = 'skip' | 'upsert' | 'error';

export interface PreconfigStepMeta {
  id: string;
  sheet_name: string;
  table_name: string;
  display_name: string;
  description: string;
  target: 'tenant' | 'platform';
  required_columns: string[];
  optional_columns: string[];
  duplicate_key: string[];
  default_duplicate_mode: PreconfigDuplicateMode;
  supports_clear: boolean;
  creates_lookups: string[];
}

export interface PreconfigCheckStep {
  step_id: string;
  sheet_present: boolean;
  row_count: number;
  missing_required_columns: string[];
  missing_optional_columns: string[];
  status: 'ready' | 'sheet_missing' | 'columns_missing';
}

export interface PreconfigCheckReport {
  file_name: string;
  sheets_found: string[];
  steps: PreconfigCheckStep[];
}

export interface PreconfigPreviewRow {
  row_number: number;
  verdict: 'new' | 'duplicate' | 'error';
  values: Record<string, unknown>;
  errors: Array<{ column: string; message: string }>;
}

export interface PreconfigLookupCreation {
  table: string;
  column: string;
  values: string[];
}

export interface PreconfigPreview {
  step_id: string;
  total_rows: number;
  counts: { new: number; duplicate: number; error: number };
  clear_will_soft_delete: number;
  clear_will_soft_delete_related: number;
  lookups_to_create: PreconfigLookupCreation[];
  rows: PreconfigPreviewRow[];
  rows_truncated: boolean;
  /**
   * How many rows of each verdict are in `rows` — `counts` is the whole sheet. Optional so this
   * app still type-checks when deployed ahead of the backend that added it; StepPanel counts the
   * rows itself when it is absent.
   */
  sampled?: { new: number; duplicate: number; error: number };
}

export interface PreconfigImportSummary {
  step_id: string;
  bu_id: string;
  bu_code: string;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  lookups_created: number;
  errors: Array<{ row_number: number; message: string }>;
}

export type PreconfigImportEvent =
  | { type: 'start'; step_id: string; bu_code: string; total: number }
  | { type: 'cleared'; step_id: string; soft_deleted: number; related_soft_deleted: number }
  | { type: 'progress'; step_id: string; index: number; total: number; inserted: number; updated: number; skipped: number; failed: number }
  | { type: 'done'; success: boolean; summary: PreconfigImportSummary }
  | { type: 'error'; message: string };

export interface PreconfigImportOptions {
  duplicate_mode?: PreconfigDuplicateMode;
  clear_existing?: boolean;
  accept_lookup_creation?: boolean;
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
  doc_version?: number; // optimistic-lock token (read model)
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

/** A cluster the signed-in user administers, as returned by GET /api-system/me/admin-clusters. */
export interface AdminCluster {
  id: string;
  name: string;
  code: string;
  is_active?: boolean;
  /** Resolved presigned square avatar — absent until the gateway can reach the file service. */
  avatar?: PresignedImage | null;
}

/**
 * The caller's cluster-admin reach. Mirrors the backend's adminClusterScope: `all` is true
 * only for platform super admins, for whom `clusters` is a searchable page rather than the
 * complete set. For everyone else `clusters` is the whole truth.
 */
export interface AdminScope {
  all: boolean;
  clusters: AdminCluster[];
}

/** One business unit an invitation grants access to, and the role granted there on accept. */
export interface InvitationBusinessUnit {
  business_unit_id: string;
  role: string;              // enum_user_business_unit_role
  is_default?: boolean;
}

/** Request body for POST /api-system/clusters/:cluster_id/invitations. */
export interface InvitationCreatePayload {
  email: string;
  cluster_role: string;      // enum_cluster_user_role
  business_units: InvitationBusinessUnit[];
}

/** An issued invitation, with the status the backend computes from its expiry and acceptance. */
export interface ClusterInvitation {
  id: string;
  email: string;
  cluster_role?: string;
  status?: string;
  expires_at?: string;
  created_at?: string;
  business_units?: InvitationBusinessUnit[];
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
  doc_version?: number; // optimistic-lock token (read model)
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

/** Scope of a platform-role assignment as returned by the registry endpoint, with the cluster's display name resolved server-side. */
export type PlatformUserScope =
  | { type: 'platform' }
  | { type: 'cluster'; cluster_id: string; cluster_name?: string | null };

export interface PlatformUserRoleAssignment {
  id: string;
  role_id: string;
  role_name?: string | null;
  scope: PlatformUserScope;
  // The gateway's @EnrichAuditUsers rewrites created_at/created_by_id into this shape.
  // `audit.created.name` is absent when the grant predates actor recording, and is the
  // literal "Unknown" when an id was recorded but no longer resolves to a user.
  audit?: Audit;
}

export interface PlatformUserRow {
  user_id: string;
  username?: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  is_active: boolean;
  roles: PlatformUserRoleAssignment[];
  last_granted_at?: string | null;
}

/**
 * Registry-wide aggregate for `GET /api-system/platform/users`: describes every holder
 * matching the current `advance` filter + `search`, not just the loaded page — so it stays
 * correct however pagination sorts the results (e.g. the one inactive holder landing on
 * page 3 must not make page 1 look clean). `holders` duplicates `paginate.total`
 * deliberately, per the design doc, so the summary band reads one coherent block instead
 * of stitching two response fields together.
 *
 * Optional on `PlatformUsersResponse` because it ships in a later backend deploy than this
 * frontend change — every request made against the current backend omits it, and callers
 * must render an explicit "unavailable" state rather than defaulting fields to 0, which
 * would misreport (e.g.) inactive holders as zero.
 */
export interface PlatformUserRegistrySummary {
  holders: number;
  platform_wide: number;
  cluster_only: number;
  assignments: number;
  inactive: number;
}

/** Response shape for `GET /api-system/platform/users` — `ApiListResponse` plus the registry-wide `summary` block (see `PlatformUserRegistrySummary`). */
export interface PlatformUsersResponse extends ApiListResponse<PlatformUserRow> {
  summary?: PlatformUserRegistrySummary;
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
  adminScope: AdminScope | null;
  isClusterAdminOf: (clusterId: string) => boolean;
  /** May this user use the platform-administration view at all? See checkPlatformAuthority. */
  hasPlatformAuthority: boolean;
  /** Does this user administer at least one cluster (or all of them)? */
  hasClusterAdminScope: boolean;
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
  tags?: string[];              // free-form tags (lowercased, de-duplicated by server)
  status?: NewsStatus;
  published_at?: string;
  audit?: Audit;                // enriched audit object (from getById)
  deleted_at?: string;          // set on soft-deleted records (present in the list payload)
  doc_version?: number; // optimistic-lock token (read model)
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

/**
 * A row of the platform super-admin allowlist as returned by
 * GET /api-system/platform/super-admins.
 *
 * `email` and `name` are joined server-side. They are optional because a
 * frontend deployed ahead of its backend still has to render the table — and
 * they can be empty/null for a real reason too: the user record behind
 * `user_id` may no longer exist. `user_id` is therefore the only field that
 * always identifies the row.
 */
export interface SuperAdmin {
  id: string;
  user_id: string;
  created_at?: string;
  is_active?: boolean;
  email?: string | null;
  name?: string | null;
  audit?: Audit; // gateway's @EnrichAuditUsers() nests created_at here as audit.created.at
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

// --- SQL Workbench ---
export interface DbObject {
  schema: string;
  name: string;
  kind?: string;
}

export interface DbColumn {
  table: string;
  column: string;
  data_type: string;
}

export interface DbObjectsResponse {
  tables: DbObject[];
  views: DbObject[];
  procedures: DbObject[];
  columns: DbColumn[];
}

export interface DbObjectDefinition {
  type: string;
  schema: string;
  name: string;
  definition: string;
}

export interface SqlExecuteResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
}

export interface SaveDdlInput {
  name?: string;
  sql_text: string;
  query_type: 'view' | 'stored_procedure' | 'function';
}

export interface SaveDdlResult {
  type: string;
  name: string;
  schema: string;
  executed_sql: string;
}

export interface TenantCurrency {
  id: string;
  code: string;
  name: string;
  symbol?: string;
  decimal_places?: number;
  is_active?: boolean;
  description?: string;
}

export type EmailSenderPurpose = 'no_reply' | 'support' | 'billing';

/**
 * Platform-wide outbound email sender profile.
 * `smtp_password` is ALWAYS the mask (`••••••`) when it comes from the API —
 * the real value is never returned. See docs/superpowers/specs/2026-07-30-*.
 */
export interface EmailSetting {
  id: string;
  doc_version?: number;
  purpose: EmailSenderPurpose;
  from_email: string;
  from_name?: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_username?: string | null;
  smtp_password?: string | null;
  is_active: boolean;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmailSettingTestResult {
  sent: boolean;
  reason?: string;
}

// ==================== Platform Config (tb_platform_config) ====================

/**
 * ค่า config ของคีย์ `invitation` — ใช้ประกอบลิงก์คำเชิญและกำหนดอายุคำเชิญ
 * backend ตรวจค่านี้ด้วย Zod ก่อนบันทึกเสมอ FE ตรวจซ้ำเพื่อ UX เท่านั้น
 */
export interface InvitationConfig {
  base_url: string;
  expiry_days: number;
}

/**
 * ค่าตั้งของการสมัคร — ปลายทางของลิงก์ยืนยันอีเมลที่ส่งก่อนสร้างบัญชี
 * เดิมเป็น env `SIGNUP_VERIFY_BASE_URL` ของ micro-business ย้ายมาที่นี่เพื่อให้แก้ได้โดยไม่ต้อง deploy
 */
export interface SignupConfig {
  verify_base_url: string;
  link_expiry_hours: number;
}

/**
 * ค่าตั้งที่มีรูปร่าง "ปลายทางลิงก์ + อายุลิงก์" — ใช้กับคีย์ email_verification และ password_reset
 * ทั้งคู่เคยเป็น env ของ micro-business ย้ายมาที่นี่เพื่อให้แก้ได้โดยไม่ต้อง deploy
 */
export interface LinkConfig {
  base_url: string;
  expiry_hours: number;
}

/**
 * หนึ่งรายการจาก /api-system/platform/configs
 * `id` เป็น null เมื่อยังไม่เคยบันทึกคีย์นี้ และ backend กำลังคืนค่าเริ่มต้นในตัวมาแทน
 */
export interface PlatformConfig {
  id: string | null;
  key: string;
  value: Record<string, unknown>;
  created_at?: string | null;
  created_by_id?: string | null;
  updated_at?: string | null;
  updated_by_id?: string | null;
}

// ==================== Usage Analytics (tb_activity_event) ====================

export interface AnalyticsSummary {
  events: number;
  clicks: number;
  page_views: number;
  sessions: number;
  users: number;
}

export interface AnalyticsDaily {
  /** 'YYYY-MM-DD' ตาม Asia/Bangkok — backend เป็นผู้ตัดขอบวัน */
  day: string;
  clicks: number;
  page_views: number;
  sessions: number;
  users: number;
}

export interface AnalyticsTopPage {
  page_path: string;
  events: number;
  sessions: number;
  users: number;
}

export interface AnalyticsTopElement {
  element_id: string;
  element_text?: string | null;
  page_path?: string | null;
  clicks: number;
}

export interface AnalyticsOverview {
  summary: AnalyticsSummary;
  daily: AnalyticsDaily[];
  top_pages: AnalyticsTopPage[];
  top_elements: AnalyticsTopElement[];
}

export interface ActivityEvent {
  id: string;
  event_id: string;
  session_id: string;
  user_id: string;
  user_name?: string | null;
  user_email?: string | null;
  bu_code?: string | null;
  app_id?: string | null;
  app_name?: string | null;
  domain?: string | null;
  user_agent?: string | null;
  event_type: string;
  page_path: string;
  element_id?: string | null;
  element_text?: string | null;
  props?: unknown;
  client_ts: string;
  server_ts: string;
}

/** ตัวกรองที่ใช้ร่วมทั้งหน้า dashboard และหน้า raw explorer */
export interface AnalyticsFilterParams {
  /** ISO 8601 UTC */
  from: string;
  /** ISO 8601 UTC */
  to: string;
  bu_code?: string;
  app_id?: string;
  event_type?: string;
  user_id?: string;
  session_id?: string;
  page_path?: string;
}
