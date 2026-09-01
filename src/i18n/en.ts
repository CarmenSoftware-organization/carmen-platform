/**
 * English catalog — the source of truth for the key set.
 *
 * Adding a key here makes it available (and required) everywhere. Removing one
 * breaks every call site at compile time, which is the intent.
 *
 * Values must stay byte-identical to the strings they replaced in JSX: English is
 * the default language and the provider-less fallback, so existing component tests
 * assert against exactly these strings.
 */
export const en = {
  language: {
    label: 'Language',
    switch: 'Switch language',
  },
  nav: {
    dashboard: 'Dashboard',
    clusters: 'Clusters',
    businessUnits: 'Business Units',
    licenses: 'Licenses',
    tenantMigrations: 'Tenant Migrations',
    dataImport: 'Data Import',
    users: 'Users',
    reportTemplates: 'Report Templates',
    formGroups: 'Form Groups',
    licenseFeatureGroups: 'License Feature Groups',
    licenseFeatures: 'License Features',
    news: 'News',
    broadcasts: 'Broadcasts',
    usageAnalytics: 'Usage Analytics',
    activityEvents: 'Activity Events',
    applications: 'Applications',
    emailSettings: 'Email Settings',
    platformConfig: 'Config',
    platformRoles: 'Roles',
    superAdmins: 'Super Admins',
    userPlatform: 'Users',
    platformMigrations: 'Platform Migrations',
    sqlWorkbench: 'SQL Workbench',
    databasePools: 'Database Pools',
    cluster: 'Cluster',
    featureFlags: 'Feature Flags',
  },
  navGroup: {
    organization: 'Organization',
    licenseManagement: 'License Management',
    content: 'Content',
    analytics: 'Analytics',
    platform: 'Platform',
    database: 'Database',
    // กลุ่มของเมนูฝั่งดูแลคลัสเตอร์ ใช้โดยหน้าสวิตช์ฟีเจอร์เพื่อจัดกลุ่มคีย์ cluster_admin_*
    // ตัว Sidebar ของ ClusterAdminLayout เองไม่ได้ตั้ง groupKey จึงไม่แสดงหัวข้อนี้
    clusterAdmin: 'Cluster administration',
  },
  sidebar: {
    collapse: 'Collapse',
    collapseAria: 'Collapse sidebar',
    expandAria: 'Expand sidebar',
    mainNavigation: 'Main navigation',
    openMenu: 'Open navigation menu',
  },
  header: {
    userMenu: 'User menu',
    platformAdminView: 'Platform Admin view',
    clusterAdminView: 'Cluster Admin view',
    profile: 'Profile',
    logOut: 'Log out',
    theme: 'Theme',
    viewChangelog: 'view changelog',
    version: 'Version',
    appVersion: 'App',
    apiVersion: 'API',
    userFallback: 'User',
  },
  theme: {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    switch: 'Switch theme',
  },
  breadcrumb: {
    label: 'Breadcrumb',
    clusters: 'Clusters',
    businessUnits: 'Business Units',
    tenantMigrations: 'Tenant Migrations',
    dataImport: 'Data Import',
    users: 'Users',
    reportTemplates: 'Report Templates',
    // เติมตอนตรวจเบราว์เซอร์ slice 6 — ช่องว่างแบบเดียวกับ analytics: route
    // /report-form-groups ไม่เคยอยู่ใน SEGMENT_KEYS ป้ายจึงมาจาก titleCase() เป็น
    // 'Report Form Groups' ทุกภาษา ค่าใหม่ตรงกับ nav.formGroups และหัวเรื่องของหน้า
    formGroups: 'Form Groups',
    licenseFeatureGroups: 'License Feature Groups',
    licenseFeatures: 'License Features',
    news: 'News',
    broadcasts: 'Broadcasts',
    // เติมตอน browser pass ของ fix wave 2: /analytics กับ /activity-events ไม่เคยอยู่ใน
    // SEGMENT_KEYS ของ Breadcrumbs.tsx เลย ตัว titleCase() จึงคืนคำอังกฤษให้ทุกภาษา —
    // ป้ายบนหัวหน้ายังเป็น 'Activity Events' ทั้งที่ทั้งหน้าเป็นไทยแล้ว
    usageAnalytics: 'Usage Analytics',
    activityEvents: 'Activity Events',
    applications: 'Applications',
    platform: 'Platform',
    roles: 'Roles',
    superAdmins: 'Super Admins',
    userPlatform: 'User Platform',
    sqlWorkbench: 'SQL Workbench',
    // เติมตอนตรวจเบราว์เซอร์ slice 9b — route /platform/database-pools ไม่เคยอยู่ใน
    // SEGMENT_KEYS ป้ายจึงมาจาก titleCase() เป็นอังกฤษทุกภาษา (ช่องว่างแบบเดียวกับ analytics)
    databasePools: 'Database Pools',
    platformConfig: 'Platform Config',
    emailSettings: 'Email Settings',
    clusterAdmin: 'Cluster Admin',
    profile: 'Profile',
    changelog: 'Changelog',
    new: 'New',
    edit: 'Edit',
  },
  switcher: {
    selectCluster: 'Select cluster',
    switchCluster: 'Switch cluster',
    chooseCluster: 'Choose which cluster to administer',
    searchClusters: 'Search clusters...',
    noClustersFound: 'No clusters found.',
    switchBu: 'Switch business unit',
    chooseBu: 'Search and select the tenant business unit you want to operate on.',
    buList: 'Business units',
    searchBuPlaceholder: 'Search {{count}} business units by code, name or cluster…',
    buCount: '{{count}} BUs',
    buNoMatches: 'No BU matches “{{search}}”.',
    buNoMatchesHint: 'Try a code (T02) or a cluster name.',
    recent: 'Recent',
    otherCluster: 'Other',
    connected: 'connected',
    navigate: 'navigate',
    connect: 'connect',
    close: 'close',
  },
  shortcuts: {
    title: 'Keyboard Shortcuts',
    description: 'Quick actions to speed up your workflow',
    save: 'Save changes (in edit mode)',
    search: 'Focus search (on list pages)',
    escape: 'Close dialog or cancel edit',
    help: 'Show keyboard shortcuts',
  },
  table: {
    noResultsFound: 'No results found',
    noResults: 'No results',
    showingRange: 'Showing {{from}}–{{to}} of {{total}}',
    show: 'Show',
    rowsPerPage: 'Rows per page',
    pagination: 'Pagination',
    previousPage: 'Previous page',
    nextPage: 'Next page',
    page: 'Page {{page}}',
    pageOfTotal: 'Page {{page}} of {{total}}',
    selectAllOnPage: 'Select all on this page',
    selectRow: 'Select row',
  },
  common: {
    confirm: 'Confirm',
    cancel: 'Cancel',
    searchPlaceholder: 'Search…',
    clearSearch: 'Clear search',
    tryAgain: 'Try again',
    comingSoon: 'Coming soon',
    couldNotLoad: "Couldn't load this.",
    noMatchesFound: 'No matches found',
    noMatchesDescription: 'No results match your search or filters. Try adjusting or clearing them.',
    // ── phase 2 shared vocabulary ──
    // Seeded from measurement: each of these occurs >=3 times across page files AND
    // appears in >=2 slices. Strings that clear the count but sit in one slice
    // (Published, Edit, Standard, Custom, Severity, …) stay in that slice's own
    // namespace — see the spec's shared-vs-local rule.
    status: {
      label: 'Status',
      active: 'Active',
      inactive: 'Inactive',
      deleted: 'Deleted',
      archived: 'Archived',
      expired: 'Expired',
      scheduled: 'Scheduled',
      superseded: 'Superseded',
      cancelled: 'Cancelled',
      published: 'Published',
      updated: 'Updated',
      unknown: 'Unknown',
    },
    action: {
      // PageHeader.tsx's own back-link aria-label (i18n phase-2 slice-5 fix wave FIX 4):
      // rendered inside the component's own render with no caller override point (same
      // "caller cannot override" test BrandingImageUpload.tsx was fixed under), so it needs
      // a shared home rather than a page-local key. Checked existing keys first — nothing
      // held the bare word 'Back' — before adding this one.
      back: 'Back',
      saveChanges: 'Save Changes',
      delete: 'Delete',
      remove: 'Remove',
      // Cancelling is not removing — a cancelled licence stays in the ledger, it just stops granting quota
      cancelLicense: 'Cancel license',
      clear: 'Clear',
      addUser: 'Add User',
      start: 'Start',
      // Promoted from pages.licenses.end (i18n phase-2 slice-4 Task 5 fix round 1): reused
      // directly by clusterAdmin/licenses/QuotaLedgerCard.tsx (slice 4) alongside 3 slice-3b
      // files (BuQuotaSection.tsx, SeatSection.tsx, SubscriptionSection.tsx) — 4 files across
      // 2 slices, clearing the promote-to-common bar. Kept beside `start` above rather than
      // in common.field: both are the same compact table-column-header register `start` was
      // already promoted into — NOT the common.field.startDate/endDate form-field register,
      // a different register per pages.licenses' own (now-deleted) comment. Keeping the pair
      // together avoids splitting one matched Start/End column-header pair across two
      // namespaces. Thai copied verbatim from pages.licenses.end, unchanged — all four call
      // sites already shared the one key, so there was nothing to reconcile.
      end: 'End',
      manageLicences: 'Manage licences',   // British spelling, as in the source
      export: 'Export',
      // The two analytics pages' header button, which says 'Export CSV' rather than the
      // bare 'Export' above; DatabasePoolManagement.tsx holds a third, still-untranslated
      // occurrence that should bind here when its slice lands.
      exportCsv: 'Export CSV',
      edit: 'Edit',
      add: 'Add',
      retry: 'Retry',
      preview: 'Preview',
      // Promoted from pages.users (phase-2 final review): the sweep task that filed these
      // page-local never re-ran the shared-vs-local arithmetic. clearAll occurs 12x outside
      // this slice, clearAllFilters 8x, filtersLabel 11x — all well past the >=3-occurrences-
      // in->=2-slices bar. showDeleted moved alongside them.
      clearAll: 'Clear all',
      clearAllFilters: 'Clear All Filters',
      filtersLabel: 'Filters:',
      showDeleted: 'Show Deleted',
      // Promoted from pages.users.rowActions / pages.news.rowActions / pages.clusterAdmin.rowActions
      // (i18n phase-2 slice-4 Task 1 fix round 1): the same aria-label template held at three
      // page-local keys across three slices (UserManagement.tsx, NewsManagement.tsx,
      // MembersTable.tsx + InvitationsTable.tsx) — an aria-label carries one meaning, so there
      // was nothing for the three copies to diverge on. All three page-local keys deleted, all
      // call sites repointed here.
      rowActions: 'Actions for {{name}}',
      // i18n phase-2 slice-5.5 (shared components): generic verb-only button labels used
      // by XmlEditor.tsx in both its editable and read-only modes. Kept bare (not nested
      // under a feature-specific object) since these mean the same thing anywhere a
      // copy/upload/download/format action appears.
      copy: 'Copy',
      copied: 'Copied',
      copyFailed: 'Copy failed',
      copiedToClipboard: 'Copied to clipboard',
      download: 'Download',
      upload: 'Upload',
      format: 'Format',
      // Pairs with clearAll above — PermissionPicker.tsx's per-resource toggle button.
      selectAll: 'Select all',
      // BusinessUnitMultiSelect.tsx / UserMultiSelect.tsx's selected-chip remove
      // aria-label — byte-identical template in both files.
      removeAria: 'Remove {{name}}',
      // TenantSeedCard.tsx / TenantMigrationCard.tsx's shared status-check button
      // (three-way ternary with busy.checking above).
      checkStatus: 'Check status',
      recheckStatus: 'Re-check status',
    },
    // Spinner/busy labels, split out of `action` — that namespace was conflating verbs
    // (delete), verb phrases (saveChanges) and these `...`-suffixed spinner labels. The
    // namespace name now carries the rule: an implementer looking for "Updating..." should
    // check here first.
    notAvailable: 'N/A',
    busy: {
      saving: 'Saving...',
      // Distinct from `saving` above by ellipsis form (…, U+2026 vs ASCII '...'), same
      // reasoning as loading/loadingEllipsis below. InterfaceEntitlementCard.tsx's own
      // save button uses this glyph in the source ('Saving…').
      savingEllipsis: 'Saving…',
      deleting: 'Deleting...',
      adding: 'Adding...',
      creating: 'Creating...',
      // TenantSeedCard.tsx / TenantMigrationCard.tsx's shared status-check button label
      // (three-way ternary alongside common.action.checkStatus/recheckStatus below).
      checking: 'Checking...',
      loading: 'Loading...',
      // Distinct from `loading` above on purpose, not a casing/whitespace slip: this one
      // uses the single-character ellipsis (…, U+2026), `loading` uses three ASCII dots
      // ('...') — two different glyphs the source files themselves use inconsistently, so
      // both must exist as separate values rather than collapsing to one. Promoted here
      // (F5, 2026-08-28 fix wave) from two page-local duplicates that both held this exact
      // '…' string byte-identically in English and Thai — `pages.subscriptions.loadingOption`
      // and `pages.licenses.loadingEllipsis` — once a third file's call site cleared the
      // ≥3-files-AND-≥2-slices promotion bar. Call sites: SubscriptionInfoCard.tsx (x2),
      // ClusterLicenseDetail.tsx, SeatSection.tsx.
      loadingEllipsis: 'Loading…',
      // BrandingImageUpload.tsx's busy-state button caption — a distinct verb from
      // `loading` above, not a duplicate. Uses the U+2026 ellipsis to match the literal
      // that was already in the source ('Uploading…'), same glyph as loadingEllipsis.
      uploading: 'Uploading…',
    },
    // BrandingImageUpload.tsx's own render/validate/toast copy — a shared component with
    // no per-call-site override (label text lands inside its own JSX and toast() calls,
    // not something a caller can swap), so unlike auditColumns.tsx/AuditMeta.tsx/
    // relativeTime.ts this cannot be deferred. `label` arrives already translated from the
    // caller (e.g. pages.businessUnits.logoLabel, common.field.avatar); these templates
    // supply only the surrounding frame. No exact or near match existed anywhere in the
    // catalog for any of these six values — fresh keys, fresh Thai.
    upload: {
      // `.toLowerCase()` still runs on `label` before interpolation (kept from the
      // original source): a no-op on Thai text (Thai has no case) but required to keep
      // the English output byte-identical ('Upload logo', not 'Upload Logo').
      uploadLabel: 'Upload {{label}}',
      replaceLabel: 'Replace {{label}}',
      unsupportedType: 'Unsupported file type. Allowed: {{types}}.',
      tooLarge: 'File is too large. Maximum size is {{size}} MB.',
      // Paired with the accept-types list, which stays untranslated data (MIME types
      // upper-cased, e.g. 'JPEG, PNG, WEBP') — this key supplies only the trailing half:
      // '{{types}} · {{this key}}'.
      maxSizeHint: 'up to {{size}} MB',
      updated: '{{label}} updated',
      uploadFailed: '{{label}} upload failed',
    },
    audit: {
      createdAt: 'Created at',
      createdBy: 'Created by',
      updatedAt: 'Updated at',
      updatedBy: 'Updated by',
      // Date-column headers, distinct from the `common.status.*` badge values that share
      // their English spelling by coincidence — a status badge and a date column can sit
      // in the same row (e.g. News: "Published" badge + "Published" date column), and
      // Thai must not spell both the same way. English stays byte-identical to what each
      // header renders today; see the fix-round-2 report for the audit trail.
      created: 'Created',
      publishedDate: 'Published',
      updatedDate: 'Updated',
      deletedDate: 'Deleted',
      // Broadcasts: the `scheduled_at` date column vs. the "Scheduled" status badge —
      // same collision shape, found while sweeping the slice for more instances.
      scheduledDate: 'Scheduled',
    },
    field: {
      name: 'Name',
      email: 'Email',
      username: 'Username',
      description: 'Description',
      aliasName: 'Alias Name',
      company: 'Company',
      avatar: 'Avatar',
      note: 'Note',
      scope: 'Scope',
      reference: 'Reference',
      content: 'Content',
      // ไม่มีผู้ใช้แล้ว: เดิมเป็นหัวข้อของกล่องรายละเอียดสกุลเงินใน CalculationSettingsSection
      // ซึ่งซ้ำคำต่อคำกับป้ายของ field เหนือมัน จึงถูกถอดออก คงคีย์ไว้ให้ th.ts ตรงกัน
      defaultCurrency: 'Default currency',
      type: 'Type',
      title: 'Title',
      severity: 'Severity',
      delivery: 'Delivery',
      // Title Case, used as form labels and column headers. Note the neighbours
      // common.validation.startDate / endDate hold the SENTENCE-case variants
      // ('Start date', 'End date'), which are default field NAMES for validation
      // messages — different job, different casing, deliberately both.
      seats: 'Seats',
      startDate: 'Start Date',
      endDate: 'End Date',
      // Required-field marker template (task J): every Edit page re-solves "label + asterisk"
      // page-locally otherwise. Unlike the old per-field `*Label`/`*LabelRequired` pairs, the
      // asterisk is interpolated data here, because this one template has to hold for every
      // field name at once, not just username/email.
      required: '{{label}} *',
      // i18n phase-2 slice-4 Task 2: composed with common.validation.requiredMessage for
      // BusinessUnitForm.tsx's (dead, defensive-only) code-required check — same shape as
      // the existing title/name entries above, added on demand rather than up front.
      code: 'Code',
      // Promoted from pages.clusterAdmin.aliasLabel (i18n phase-2 slice-5 Task 1); the old
      // key has been deleted and every former reader repointed here. Verified by grep for
      // t('common.field.alias') across src/, excluding src/i18n/ and comment lines: 3 call
      // sites in 3 files across 2 slices — ClusterBuDocument.tsx (clusterAdmin) plus
      // BusinessUnitManagement.tsx's column header and BusinessUnitDocument.tsx's
      // InlineField label (both businessUnits). NOT the same key as aliasName ('Alias
      // Name') above: that one is the Title-Case two-word CSV/full-form label; this is the
      // bare single word used as a column header and a compact InlineField label — the same
      // form-label/column-header register this whole namespace already covers. Thai copied
      // verbatim from pages.clusterAdmin.aliasLabel, unchanged.
      alias: 'Alias',
    },
    // Section headings — a different register from a bare input label. `common.field.*`
    // used to hold these too, but a heading and a label want different translations, and
    // once nine more slices bind to one shared key the split becomes impossible.
    section: {
      identity: 'Identity',
      branding: 'Branding',
      configuration: 'Configuration',
      access: 'Access',
      // Promoted from pages.clusterAdmin.hotel / pages.clusterAdmin.company (i18n phase-2
      // slice-5 Task 1); both old keys have been deleted and every former reader repointed
      // here. Both are Group/tab section headings — see the doc comment that used to sit at
      // pages.clusterAdmin.company explaining `company` is a SECTION heading for the whole
      // company_* field group, NOT a reuse of common.field.company (the single-input field
      // label, still unbound). Verified by grep for each key across src/, excluding
      // src/i18n/ and comment lines: each key has 4 call sites in 3 files across 2 slices —
      // BusinessUnitForm.tsx (2 sites: tab label + hero label) and ClusterBuDocument.tsx (1
      // site: Group heading) in clusterAdmin, plus BusinessUnitDocument.tsx's own Group
      // heading (1 site) in businessUnits. Thai copied verbatim from the sibling keys,
      // unchanged.
      hotel: 'Hotel',
      company: 'Company',
    },
    // <option> values inside a <select> — never a heading, never an input label.
    option: {
      function: 'Function',
      average: 'Average',
      all: 'All',
      custom: 'Custom',
      global: 'Global',
      // Deliberately the same English as theme.system, which is the THEME setting.
      // A broadcast's scope of `system` means platform-wide; the theme's means
      // "follow the OS". English spells both "System"; Thai must not.
      system: 'System',
      // Promoted from pages.clusterAdmin.fifo (i18n phase-2 slice-5 Task 1); the old key
      // has been deleted and its reader repointed here. Verified by grep for
      // t('common.option.fifo') across src/, excluding src/i18n/ and comment lines: 3 call
      // sites in 3 files across 2 slices — BusinessUnitForm.tsx (clusterAdmin) plus
      // BusinessUnitEdit.tsx's getCalculationMethodLabel() and
      // CalculationSettingsSection.tsx's <option> (both businessUnits). Thai copied
      // verbatim from pages.clusterAdmin.fifo (identical to English; FIFO is not translated
      // in either language).
      fifo: 'FIFO',
    },
    // Nouns used as labels, headings and column titles — NOT toast-insertable (see entity.*
    // below for the toast-safe forms). Ten of these lived in `entity.*` until the phase-2
    // final review: a namespace whose contract promises "safe to interpolate into a toast"
    // invited '{{entity}} deleted successfully' to render 'Licensing deleted successfully'.
    // `filters` (from common.action) and `default` (from common.status) joined them for the
    // same reason — a noun, not a verb or a lifecycle state.
    label: {
      cluster: 'Cluster',
      platform: 'Platform',
      application: 'Application',
      clusterRole: 'Cluster Role',
      buRole: 'BU Role',
      databasePool: 'Database Pool',
      subscriptions: 'Subscriptions',
      licensing: 'Licensing',
      businessUnitsTitle: 'Business Units',
      businessUnitsLabel: 'Business units',
      filters: 'Filters',
      default: 'Default',
      // Promoted from pages.clusterAdmin.hq (i18n phase-2 slice-5 Task 1); the old key has
      // been deleted and every former reader repointed here. Verified by grep for
      // t('common.label.hq') across src/, excluding src/i18n/ and comment lines: 8 call
      // sites in 5 files across 2 slices — BusinessUnitList.tsx (4 sites), BuPropertyPlate.tsx,
      // BuRankingCard.tsx and SeatsByBuTable.tsx (1 site each) in clusterAdmin, plus
      // BusinessUnitDocument.tsx's hero Badge (1 site) in businessUnits. Thai copied
      // verbatim from pages.clusterAdmin.hq (identical to English; HQ is an abbreviation,
      // not translated in either language).
      hq: 'HQ',
    },
    // AuditMeta.tsx's relative timestamps, reached through relativeTime()'s trailing
    // optional `t` (same shape as auditColumns.tsx). English values are byte-identical to
    // the literals relativeTime() returned before this change: the function still produces
    // them verbatim when no `t` is passed, so relativeTime.test.ts keeps passing untouched
    // and dashboard/ActivityStream.tsx — a page with no useI18n() yet — is unaffected.
    // Distinct from pages.news.time.* ('{{count}} min ago'), which is that page's own
    // longer-form register; these are the compact 'Nd ago' forms AuditMeta renders inline.
    timeAgo: {
      justNow: 'just now',
      // No space before the unit in English ('30m ago'), a space in Thai — the Thai
      // convention spaces around an interpolated parameter (see the note above `toast:`
      // in th.ts) and Thai has no compact unit suffix to butt against the number.
      minutes: '{{count}}m ago',
      hours: '{{count}}h ago',
      days: '{{count}}d ago',
      months: '{{count}}mo ago',
      years: '{{count}}y ago',
    },
    dayGroup: {
      today: 'Today',
      yesterday: 'Yesterday',
      earlier: 'Earlier',
      // อังกฤษเรียง 'Aug 29' ไทยเรียง '29 ส.ค.' — สลับลำดับที่ค่าแปล ไม่ใช่ที่โค้ด
      monthDay: '{{month}} {{day}}',
    },
    weekday: {
      sun: 'Sunday',
      mon: 'Monday',
      tue: 'Tuesday',
      wed: 'Wednesday',
      thu: 'Thursday',
      fri: 'Friday',
      sat: 'Saturday',
    },
    monthShort: {
      jan: 'Jan',
      feb: 'Feb',
      mar: 'Mar',
      apr: 'Apr',
      may: 'May',
      jun: 'Jun',
      jul: 'Jul',
      aug: 'Aug',
      sep: 'Sep',
      oct: 'Oct',
      nov: 'Nov',
      dec: 'Dec',
    },
    state: {
      versionConflictTitle: 'This record was changed by someone else',
      versionConflictBody: 'Reloading the latest version. Please re-apply your changes.',
      noExpiry: 'No expiry',
      expires: 'Expires',
      quotaExpires: 'Quota Expires',
      // Promoted from pages.subscriptions.expiringSoon / pages.licenses.expiringSoonBadge
      // (i18n phase-2 slice-3b Task 4 fix round 1): byte-identical value bound at 4 call
      // sites across 2 slices (SubscriptionTable.tsx x2, SubscriptionSummary.tsx,
      // SubscriptionSection.tsx) — clears the promote-to-common bar. Both page-local keys
      // were deleted, both call sites' explanatory comments removed.
      expiringSoon: 'Expiring soon',
      // Promoted from pages.licenses.daysLeft (i18n phase-2 slice-4 Task 5 fix round 1):
      // reused directly by clusterAdmin/licenses/SeatsByBuTable.tsx (slice 4) alongside 3
      // slice-3b files (ClusterLicenseTable.tsx, BuQuotaSection.tsx, SeatSection.tsx) — 4
      // files across 2 slices, clearing the promote-to-common bar. A count-driven expiry
      // state, same register as noExpiry/expires/quotaExpires/expiringSoon above, not a
      // field name. Thai copied verbatim from pages.licenses.daysLeft, unchanged — all four
      // call sites already shared the one key, so there was nothing to reconcile.
      daysLeft: '{{count}} days left',
      unsavedChanges: 'Unsaved changes',
      noChanges: 'No changes',
      // TabStrip.tsx's own error-dot aria-label (i18n phase-2 slice-5 fix wave FIX 4):
      // rendered inside the component's own render with no caller override point, same
      // reasoning as common.action.back above. Same register as unsavedChanges/noChanges
      // above — a short state phrase, not a field name.
      hasErrors: 'Has errors',
      unknownUser: 'Unknown user',
      noBusinessUnits: 'No business units',
      noBusinessUnitsYet: 'No business units yet',
      noBusinessUnitsInCluster: 'No business units in this cluster.',
      noClustersToAdminister: 'No clusters to administer',
      loadingBusinessUnits: 'Loading business units...',
      failedToLoadBusinessUnits: 'Failed to load business units',
      selectACluster: 'Select a cluster',
      selectABusinessUnit: 'Select a business unit',
      searchBusinessUnits: 'Search business units...',
      // Promoted from pages.users (phase-2 final review, alongside common.action.clearAll/
      // clearAllFilters/filtersLabel/showDeleted).
      nSelected: '{{count}} selected',
      summaryStale: "Couldn't refresh — showing the last known numbers.",
      // BusinessUnitMultiSelect.tsx's search-input aria-label — same concept as
      // searchBusinessUnits above (the placeholder, with trailing dots) but this one has
      // none, matching the source's separate aria-label string.
      searchBusinessUnitsAria: 'Search business units',
      noBusinessUnitsFound: 'No business units found.',
      // TenantSeedCard.tsx / TenantMigrationCard.tsx / InterfaceEntitlementCard.tsx all
      // gate on isSuperAdmin with this exact disabledReason string — byte-identical
      // across all three files, so one shared key rather than three copies.
      superAdminRequired: 'Super-admin required.',
      // TenantSeedCard.tsx / TenantMigrationCard.tsx's shared precondition message
      // (byte-identical in both).
      configureDbPoolFirst: 'Configure a database pool and schema first.',
      // InterfaceEntitlementCard.tsx's own precondition message — same disabledReason
      // family as configureDbPoolFirst above, kept alongside it.
      saveBusinessUnitFirst: 'Save the business unit first.',
      // TenantSeedCard.tsx / TenantMigrationCard.tsx's shared "last checked HH:MM:SS" caption.
      lastChecked: 'Last checked {{time}}',
      // TenantSeedCard.tsx / TenantMigrationCard.tsx: the state before anyone presses
      // Check — the card used to render no status at all, which reads as "fine".
      notCheckedYet: 'Not checked',
    },
    validation: {
      // `requiredMessage` replaces the former nameRequired/clusterRequired pair. Neither had
      // a call site yet, and 'Name is required' appears in five more pages that later slices
      // will translate — one template beats one key per field name. Named `requiredMessage`,
      // not `required`, to keep it apart from `common.field.required` (the '{{label}} *'
      // marker) — same parent depth, same param, different string, too easy to autocomplete
      // the wrong one.
      requiredMessage: '{{label}} is required',
      // English has one verb for "required" regardless of control type, so this is
      // byte-identical to requiredMessage above — Thai isn't, and needs to choose between
      // "please fill in" and "please select". See th.ts. Nothing consumes this yet.
      selectRequired: '{{label}} is required',
      invalidEmail: 'Invalid email format',
      invalidPhone: 'Invalid phone number format',
      invalidUrl: 'Must be a valid http(s) URL',
      invalidDate: 'Must be a valid date',
      invalidCode: 'Code must be 2-20 alphanumeric characters',
      usernameEmail: 'Username must be a valid email address',
      nonNegativeInt: 'Must be a non-negative integer',
      positiveInt: 'Must be a positive whole number',
      invalidSchema: 'Schema must start with a letter or underscore and contain only letters, numbers, and underscores',
      invalidSubNo: 'Subscription number must be 1-50 characters (letters, numbers, spaces, - _ . /)',
      invalidAlias: 'Alias must be 1-{{max}} alphanumeric characters',
      // Default field names, substituted when a caller passes no `label`. These are
      // user-visible strings that live inside a `??` mid-expression — easy to miss.
      //
      // Five of the six — `amount`, `schema`, `startDate`, `endDate`, `subscriptionNumber`
      // — are unreachable as `validateField` is written today. Each backs a
      // per-case `options?.required ? tr('common.validation.X') : ''` ternary, but
      // `validateField`'s top-level guard already returns before the `switch` runs whenever
      // `options?.required && !value?.trim()` is true — so inside any case, `options?.required`
      // being true means the value can't also be blank there, and being false always sends
      // the ternary down the `''` branch. No value can satisfy both halves at once. Every
      // real caller also passes an explicit `label`, so this was never observed live even
      // before the guard made it provably dead.
      //
      // They stay in the catalog rather than being deleted: `validation.ts`'s dead branches
      // still reference them by key, `TKey` derives from this file, and a literal in their
      // place would reintroduce the hardcoded-string problem this design exists to avoid.
      // If `validateField`'s top-level guard is ever changed to check requiredness per-case
      // instead of once up front, these five become reachable again — don't delete them on
      // the assumption they are permanently dead.
      fieldDefault: 'This field',
      amount: 'Amount',
      schema: 'Schema',
      startDate: 'Start date',
      endDate: 'End date',
      subscriptionNumber: 'Subscription number',
    },
    // The four broadcast severity values. Title case here; the two call sites that want
    // all-caps apply .toUpperCase() to the translated string, which is a no-op in Thai.
    severity: {
      critical: 'Critical',
      warning: 'Warning',
      info: 'Info',
      maintenance: 'Maintenance',
    },
    // Membership role labels. Both `admin` and `user` are lowercase API values AND the raw
    // strings three cluster-admin files (InviteUserDialog.tsx's CLUSTER_ROLES/BU_ROLES,
    // MembersTable.tsx's ROLES) render directly today — those arrays stay untouched (Task 3
    // separates the API value from the label at the call sites). These two keys exist only
    // so the three files have one shared label pair to bind to instead of each inventing its
    // own; not a reuse of entity.user.title ('User') despite the byte match — that namespace
    // is toast-noun-only by its own doc comment above, not a role adjective.
    role: {
      admin: 'Admin',
      user: 'User',
    },
  },
  /**
   * Nouns that are safe to pass to a `toast.*` template. Three grammatical forms each,
   * because the templates need different ones: `{{entity}} deleted successfully` is
   * sentence-initial and needs Title; `Failed to delete {{entity}}` is mid-sentence and
   * needs lower. `sentence` covers templates that open with the noun un-capitalised in
   * running prose. Two forms were enough only while every entity here was one word.
   *
   * Anything that is a LABEL rather than a toast noun does not belong here — see
   * common.label.* below.
   */
  entity: {
    user: { title: 'User', sentence: 'User', lower: 'user' },
    businessUnit: { title: 'Business Unit', sentence: 'Business unit', lower: 'business unit' },
    broadcast: { title: 'Broadcast', sentence: 'Broadcast', lower: 'broadcast' },
    news: { title: 'News', sentence: 'News', lower: 'news' },
    // Promoted from pages.subscriptions.subscription (i18n phase-2 slice-3b Task 4 fix
    // round 1): already fed toast.created's {{entity}} param at SubscriptionForm.tsx:240,
    // which is exactly what this namespace exists for — a common.* promotion would have
    // been the wrong shape. 3 files across 2 slices once pages.licenses.subscriptionColumn
    // was counted, clearing the promote bar. pages.subscriptions.subscription and
    // pages.licenses.subscriptionColumn were both deleted.
    subscription: { title: 'Subscription', sentence: 'Subscription', lower: 'subscription' },
    // slice 6 — ป้อนให้ toast.deleted/deleteFailed ของหน้า ReportTemplateManagement
    reportTemplate: { title: 'Report template', sentence: 'Report template', lower: 'report template' },
    // slice 7 — ป้อนให้ toast.deleted/deleteFailed ของหน้า ClusterManagement
    cluster: { title: 'Cluster', sentence: 'Cluster', lower: 'cluster' },
    // slice 8 — ป้อนให้ toast.deleted/deleteFailed ของหน้า ApplicationManagement/RoleManagement
    application: { title: 'Application', sentence: 'Application', lower: 'application' },
    role: { title: 'Role', sentence: 'Role', lower: 'role' },
  },

  /**
   * CRUD toast templates. Any key here REQUIRES an `entity` param except `saved`
   * and `exported`. A missing or misnamed param renders literal `{{entity}}` to the
   * user; tsc and ESLint both pass it, so only the dev-mode warning in useI18n
   * catches it.
   */
  toast: {
    created: '{{entity}} created successfully',
    deleted: '{{entity}} deleted successfully',
    deleteFailed: 'Failed to delete {{entity}}',
    loadFailed: 'Failed to load {{entity}}',
    saveFailed: 'Failed to save {{entity}}',
    saved: 'Changes saved successfully',
    exported: 'Data exported successfully',
    // Third exception to the {{entity}} rule above, alongside `saved` and `exported`:
    // the guard both analytics pages hit when their export button is pressed with an
    // empty result set.
    nothingToExport: 'No data to export',
  },

  /**
   * Strings owned by shared components under src/components/ (excluding ui/). A shared
   * component must never read a `pages.*` key — it renders under many pages, so its own
   * copy lives here instead, split by component name (i18n phase-2 slice-5.5).
   */
  components: {
    // FleetCapacity / CapacityGauge / CapacityMeter (i18n slice 7)
    // อยู่ใต้ src/pages/clusterManagement/ ก็จริง แต่เป็น component ร่วม: LicenseCenter
    // (slice 3b) import ข้าม slice มาใช้ และ meter ทั้งสองตัวถูกใช้ใน 8 ไฟล์ 4 slice
    // ที่ตั้งไฟล์จึงหลอก — ข้อความของมันต้องอยู่ที่นี่ ไม่ใช่ใน pages.clusters
    fleetCapacity: {
      heading: 'Fleet capacity',
      unavailable: 'Capacity unavailable',
      businessUnits: 'Business units',
      clusters: 'clusters',
      active: 'active',
      nearLimit: 'near limit',
      // ค่าเริ่มต้นของ prop `expiringLabel` — LicenseCenter ส่งป้ายของตัวเองมาทับ
      quotaExpiring: 'quota expiring',
      // ประกอบตอนรันจากสองตัวเลข แยกเอกพจน์/พหูพจน์ที่ call site (ไทยไม่ผันตามจำนวน)
      uncappedNote: '+ {{count}} cluster with no cap ({{used}} in use)',
      uncappedNotePlural: '+ {{count}} clusters with no cap ({{used}} in use)',
      // CapacityGauge — ต่อท้ายตัวเลข cap
      noCap: '∞ (no cap)',
      licensedSuffix: '{{cap}} licensed',
      // CapacityMeter — ป้ายเตือนเมื่อใกล้เต็ม (uppercase มาจาก CSS ค่าจึงเป็นตัวเล็ก)
      nearTag: 'near',
    },
    dialogPreview: {
      title: 'Dialog Preview',
      noXmlProvided: 'No XML provided',
      parseError: 'Parse error',
      // `<Dialog>` names the XML root element this component requires — an element name,
      // not prose, so it stays untranslated inside the sentence.
      requiresDialogRoot: 'Preview requires a <Dialog> root element',
      // {{source}} is the cleaned DataSource attribute (e.g. "Vendor") — data pulled from
      // the XML being previewed, not a translatable label, so it never becomes a catalog
      // value itself.
      selectPlaceholder: 'Select {{source}}…',
      // Fallback noun substituted for {{source}} when the XML carries no DataSource
      // attribute at all.
      genericValue: 'value',
      noControl: '(no control)',
      previewUnavailable: 'Preview unavailable',
      // Plurals stay in the English value only — Thai does not inflect for number, same
      // pattern as pages.news.articleTotal/articlesTotal and
      // pages.broadcasts.sendToUserSingular/Plural.
      fieldCountSingular: '{{count}} field',
      fieldCountPlural: '{{count}} fields',
      previewOnlyNote: 'Preview only. Controls are disabled and lookup data is not loaded.',
    },
    // Shared between DialogPreview.tsx and XmlEditor.tsx — both render this exact fallback
    // when a document fails XML parsing with no more specific message available.
    xml: {
      invalidXml: 'Invalid XML',
    },
    xmlEditor: {
      alreadyFormatted: 'Already formatted',
      formatted: 'XML formatted',
      nothingToDownload: 'Nothing to download',
      downloaded: 'Downloaded {{name}}',
      fileLoaded: '{{name}} loaded',
      cleared: 'Cleared',
      validXml: 'Valid XML',
      // Composed as "{{line}}" then optionally ", col {{column}}" then a literal ": " —
      // two fragments because the column half only renders when the parser reports one.
      lineLabel: 'Line {{line}}',
      colLabel: ', col {{column}}',
      linesCount: '{{count}} lines',
      clearDialogTitle: 'Clear editor?',
      // "Ctrl/⌘+Z" is a keyboard-shortcut notation, not prose — kept as-is inside the
      // translated sentence, same treatment shortcuts.* gets elsewhere.
      clearDialogDescription: 'This removes all content from the editor. You can undo this with Ctrl/⌘+Z.',
    },
    markdownEditor: {
      writeTab: 'Write',
      defaultPlaceholder: 'Write your news content in Markdown...',
      nothingToPreview: 'Nothing to preview',
    },
    tenantSeedCard: {
      // Kept alongside breadcrumb.tenantMigrations's precedent of leaving Tenant-prefixed
      // infra names in English rather than translating "Tenant" — see th.ts.
      title: 'Tenant Seed Data',
      description: "Check and seed default master data into this BU's tenant database.",
      seeded: 'Seeded',
      missingCount: '{{count}} missing',
      hideMissingRowsAria: 'Hide missing rows for {{label}}',
      showMissingRowsAria: 'Show missing rows for {{label}}',
      nothingToSeed: 'Nothing to seed',
      seedRowsButton: 'Seed {{count}} row(s)',
      seedingEllipsis: 'Seeding…',
      // toast.info no-op message ("nothing happened") — kept at that severity, only the
      // text is translated.
      nothingToSeedUpToDate: 'Nothing to seed. Already up to date.',
      createdRowsToast: 'Created {{count}} row(s) for {{buCode}} (skipped {{skipped}}).',
      confirmTitle: 'Seed tenant data',
      confirmDescription: 'Seed {{count}} default row(s) into {{name}} ({{code}})? This creates missing default master data in the tenant database. Existing rows are left unchanged.',
      seedButton: 'Seed',
    },
    tenantMigrationCard: {
      // CardTitle text ('Tenant Migrations') reuses breadcrumb.tenantMigrations directly
      // — byte-identical, no key added here for it. See task-1-report.md.
      description: "Check and apply database schema migrations for this BU's tenant database.",
      upToDate: 'Up to date',
      pendingCount: '{{count}} pending',
      // The count is NOT interpolated here: the source renders it in its own
      // `text-muted-foreground` span, and folding it into the string would silently drop that
      // styling. Punctuation and a number are not translatable content anyway.
      pendingMigrationsHeading: 'Pending migrations',
      applyMigrationsButton: 'Apply {{count}} migration(s)',
      applyingEllipsis: 'Applying migrations…',
      // toast.info no-op message, same convention as tenantSeedCard.nothingToSeedUpToDate.
      alreadyUpToDateToast: 'Already up to date.',
      appliedToast: 'Applied {{count}} migration(s) to {{buCode}}.',
      hideRawOutput: 'Hide raw output',
      showRawOutput: 'Show raw output',
      confirmTitle: 'Apply tenant migrations',
      confirmDescription: 'Apply {{count}} pending migration(s) to {{name}} ({{code}})? This applies schema changes to the tenant database and cannot be undone.',
      applyButton: 'Apply migrations',
    },
    interfaceEntitlementCard: {
      title: 'Interface Entitlement',
      description: 'Which external-system interfaces this business unit may configure. Leave empty to allow every interface; select specific brands to restrict the BU to those.',
      toggleNone: 'None',
      saveButton: 'Save entitlement',
      savedToast: 'Interface entitlement saved',
      notRestrictedNote: 'Not restricted. BU sees all interfaces.',
      // INTERFACE_CATALOG group label (interfaceCatalog.ts). 'POS'/'PMS' and every brand
      // name (Carmen GL, Oracle Micros, …) are deliberately left untranslated — industry
      // abbreviations and product names — so only this one group label needs a key.
      catalogAccounting: 'Accounting',
      // INTERFACE_CATALOG brand label for accounting_external — the one brand name that is
      // a generic noun phrase rather than a product name, so it gets translated.
      catalogExternalSystem: 'External system',
    },
    businessUnitMultiSelect: {
      noneSelected: 'No business units selected',
    },
    userMultiSelect: {
      defaultPlaceholder: 'Search users by name or email',
      alreadySelected: 'Selected',
    },
    userPicker: {
      defaultPlaceholder: 'Search users by username or email',
      disabledLabel: 'Unavailable',
      clearSelectedAria: 'Clear selected user {{name}}',
    },
    // Shared between UserMultiSelect.tsx and UserPicker.tsx — both wrap useUserSearch and
    // render byte-identical dropdown copy.
    userSearch: {
      searchingEllipsis: 'Searching…',
      noMatch: 'No users match "{{query}}"',
      typeToSearch: 'Type to search users',
    },
    imageUpload: {
      uploadAriaLabel: 'Upload image',
      // ImageUpload.tsx has exactly one real importer today — src/pages/NewsEdit.tsx:319
      // (verified by import statement, comments stripped) — so this alt text is accurate.
      // A second caller would make this an `alt` prop instead of a hardcoded key; do not
      // add the prop speculatively.
      newsAlt: 'News',
      // Split in two because the source splits it: a plain text node followed by a nested
      // <span> styled as a link (no separate click handler — the whole drop zone is
      // already clickable). The implementer inserts a literal space between the two.
      dragDropText: 'Drag & drop an image here, or',
      browse: 'browse',
      uploadingImage: 'Uploading image…',
    },
    // AuditMeta.tsx's ActorPhrase ('header' variant) — free to call useI18n() itself per
    // the plan's 5a. This fragment was missed by the plan's own file-string count (an
    // under-6-characters blind spot): ` by ${who}` is a real English literal, not
    // punctuation like the middle-dot separator the 'compact' variant uses instead.
    auditMeta: {
      byActor: 'by {{name}}',
    },
    // DateRangeFilter.tsx runs the opposite direction: no prior English at all — its
    // labels are Thai and English users read Thai today. Every value below is NEW COPY,
    // not a translation — see task-1-report.md. RANGE_PRESETS' 'custom' entry (in
    // src/utils/analyticsRange.ts, DateRangeFilter's only importer) reuses
    // common.option.custom instead of a key here: its Thai already reads byte-identical
    // to this file's own literal ('กำหนดเอง').
    dateRangeFilter: {
      dateRangeLabel: 'Date range',
      fromLabel: 'From',
      toLabel: 'To',
      endBeforeStart: 'End date must not be before the start date',
      maxRangeDays: 'You can select at most {{max}} days',
      viewingRange: 'Viewing {{range}}',
      last7Days: 'Last 7 days',
      last30Days: 'Last 30 days',
      last90Days: 'Last 90 days',
    },
  },

  /** Per-slice page vocabulary. One child object per phase-2 slice. */
  pages: {
    landing: {
      brand: 'Carmen Platform',
      console: 'Operations console',
      loading: 'Loading…',
      signIn: 'Sign in',
      // พาดหัวคร่อม <span> สีเน้น จึงเป็นสองโหนด DOM — ห้ามยุบเป็นคีย์เดียว
      heroTitle: 'Run the whole operation from',
      heroTitleAccent: 'one console.',
      heroBody: 'Carmen brings your clusters, business units, users, and the documents that keep them running into a single admin platform.',
      whatsNew: "See what's new",
      insideConsole: 'Inside the console',
      captionOrganization: 'Who and what you operate.',
      captionContent: 'The documents and messages that run the day.',
      captionPlatform: 'Access, clients, and administration.',
      itemPrintMapping: 'Print Mapping',
      itemRolesAccess: 'Roles & Access',
      descClusters: 'Tenant groups & license limits',
      descBusinessUnits: 'Properties, formats, connections',
      descUsers: 'Accounts, roles, BU assignments',
      descTenantMigrations: 'Batch deploys, live progress',
      descReportTemplates: 'XML report definitions',
      descPrintMapping: 'Document → template rules',
      descNews: 'Announcements & posts',
      descBroadcasts: 'System & per-unit notices',
      descApplications: 'API clients (x-app-id)',
      descRolesAccess: 'Permissions & platform RBAC',
      descSuperAdmins: 'Top-level administration',
      designBy: 'design by @carmensoftware',
      build: 'build',
    },
    dashboard: {
      title: 'Dashboard',
      subtitle: 'What changed across everything you run.',
      activityReloaded: 'Activity reloaded',
      estate: 'Estate',
      recordsGoverned: 'records governed',
      estateLoadFailed: 'Couldn’t load estate counts.',
      loadingEstate: 'Loading estate counts',
      activityLoadFailed: 'Couldn’t load recent activity.',
      loadingActivity: 'Loading activity',
      filterAria: 'Filter activity by domain',
      filterAll: 'All',
      emptyTitle: 'Nothing changed here yet',
      emptyBody: 'When you create or edit anything, it shows up in this stream.',
      verbCreated: 'created',
      verbUpdated: 'updated',
      verbPublished: 'published',
      by: 'by {{who}}',
      unnamed: '(unnamed)',
      untitled: '(untitled)',
      unknownUser: '(unknown user)',
      debugTitle: 'Dashboard Data',
    },
    comingSoon: {
      title: 'Coming soon',
      description: 'This feature is still being built. It will appear here once it is ready.',
    },
    featureFlags: {
      title: 'Feature Flags',
      subtitle:
        'Choose what each feature shows on screen. Frontend visibility only — it does not close the matching API.',
      state: {
        active: 'Active',
        activeHint: 'Works as usual',
        inactive: 'Coming soon',
        inactiveHint: 'Menu visible but not clickable',
        hide: 'Hidden',
        hideHint: 'Menu and page both gone',
      },
      orphans: {
        title: 'Unknown keys',
        description: 'Saved on the server but missing from this app version. Safe to remove.',
        remove: 'Remove',
        confirmTitle: 'Remove unknown key?',
        confirmBody:
          'This deletes the saved state for a feature this app version does not know about.',
      },
      saved: 'Feature states saved',
      saveFailed: 'Could not save feature states',
    },
    statusPage: {
      notFoundTitle: 'Page Not Found',
      notFoundBody: "The page you're looking for doesn't exist or may have been moved.",
      // ยึดเป็นสัญญา — SuperAdminManagement.test.tsx ยิงผ่าน guard จริงแล้วหาข้อความนี้
      forbiddenTitle: 'Access Denied',
      forbiddenBody: "You don't have permission to access this page.",
      goBack: 'Go Back',
      goToDashboard: 'Go to Dashboard',
      goToClusterAdmin: 'Go to Cluster Admin',
    },
    changelog: {
      title: 'Changelog',
      subtitle: 'Release notes and updates across the platform.',
      searchLabel: 'Search changelog',
      searchPlaceholder: 'Search changelog…',
      unreleased: 'Unreleased',
      emptyTitle: 'No changelog entries yet',
      emptyBody: 'Check back after the next release.',
      noMatchTitle: 'No matching entries',
      noMatchBody: 'No changelog entries match "{{query}}".',
      catAdded: 'Added',
      catChanged: 'Changed',
      catDeprecated: 'Deprecated',
      catRemoved: 'Removed',
      catFixed: 'Fixed',
      catSecurity: 'Security',
    },
    profile: {
      title: 'Profile',
      subtitle: 'Manage your account settings and preferences',
      loadFailed: 'Failed to load profile: ',
      updated: 'Profile updated successfully!',
      updatedToast: 'Profile updated successfully',
      updateFailed: 'Failed to update profile',
      updateFailedPrefix: 'Failed to update profile: ',
      passwordMismatch: 'New passwords do not match',
      passwordTooShort: 'Password must be at least 6 characters',
      passwordChanged: 'Password changed successfully!',
      passwordChangedToast: 'Password changed successfully',
      passwordChangeFailed: 'Failed to change password',
      passwordChangeFailedPrefix: 'Failed to change password: ',
      overview: 'Profile Overview',
      memberSince: 'Member since',
      accountId: 'Account ID',
      information: 'Profile Information',
      descEditing: 'Update your account details',
      descReadOnly: 'View your account details',
      changePassword: 'Change Password',
      aliasName: 'Alias Name',
      aliasNamePlaceholder: 'Alias name (optional)',
      firstName: 'First Name',
      firstNamePlaceholder: 'First name',
      middleName: 'Middle Name',
      middleNamePlaceholder: 'Middle name (optional)',
      lastName: 'Last Name',
      lastNamePlaceholder: 'Last name',
      telephone: 'Telephone',
      telephonePlaceholder: 'Phone number (optional)',
      emailAddress: 'Email Address',
      emailImmutable: 'Email cannot be changed',
      businessUnits: 'Business Units',
      // อังกฤษเติม 's' ตอน runtime — 's' ไม่เคยปรากฏเป็นสตริงที่สกัดได้ ต้องแยกสองคีย์
      buAssigned: '{{count}} business unit assigned to your account',
      buAssignedPlural: '{{count}} business units assigned to your account',
      buNoneDesc: 'No business units assigned',
      buEmptyTitle: 'No business units',
      buEmptyBody: 'You are not assigned to any business unit yet.',
      passwordDialogDesc: 'Update your password to keep your account secure',
      currentPassword: 'Current Password',
      currentPasswordPlaceholder: 'Enter current password',
      newPassword: 'New Password',
      newPasswordPlaceholder: 'Enter new password',
      newPasswordHint: 'Password must be at least 6 characters',
      confirmPassword: 'Confirm New Password',
      confirmPasswordPlaceholder: 'Confirm new password',
      updating: 'Updating...',
      updatePassword: 'Update Password',
      fallbackName: 'User',
    },
    users: {
      title: 'User Management',
      subtitle: 'Manage users and permissions',
      searchPlaceholder: 'Search users...',
      loading: 'Loading users',
      // The plural has no `entity` form — entity.* only carries singular nouns, and a
      // fourth field there for one plural-only call site isn't worth it. A page-local key
      // is the honest place for this one-off.
      usersLower: 'users',
      emptyTitle: 'No users yet',
      emptyDescription: 'Get started by creating your first user.',
      filterByStatus: 'Filter users by status',
      removeShowDeletedFilter: 'Remove Show Deleted filter',
      deletedBy: 'Deleted By',
      copyUsername: 'Copy username',
      copiedUsername: 'Copied username',
      couldNotCopyUsername: 'Could not copy username',
      deleteTitle: 'Delete User',
      permanentlyDelete: 'Permanently Delete',
      confirmByUsername: 'Enter username to confirm',
      permanentlyDeleted: 'User permanently deleted',
      permanentDeleteFailed: 'Failed to permanently delete user',
      fetchKeycloak: 'Fetch Keycloak',
      fetching: 'Fetching...',
      keycloakFetched: 'Users fetched from Keycloak successfully',
      keycloakFetchFailed: 'Failed to fetch users from Keycloak',
      createTitle: 'Create User',
      createSubtitle: 'Create a new user',
      createHint: 'Fill in the details for the new user',
      editTitle: 'Edit account',
      editSubtitle: 'Modify the account details below',
      accountDetails: 'Account details',
      emailAddress: 'Email address',
      // Format-example placeholder, not prose — identical value in both languages.
      // Stays an email shape on purpose: validateField's `case 'username'` runs
      // isValidEmail, so a non-email hint would advertise a value the form rejects.
      usernamePlaceholder: 'user@example.com',
      // Section headings inside the single account card — subheadings, not nested cards.
      sectionSignIn: 'Sign-in details',
      sectionSignInHint: 'How this person is identified and reached.',
      sectionName: 'Display name',
      sectionNameHint: 'Shown across the platform. First and last name are required.',
      usernameLocked: "An email address. Can't be changed once the account exists.",
      aliasHint: 'Used in place of the full name where space is tight.',
      activeHint: 'An inactive user keeps every assignment but cannot sign in.',
      nextStepHint: 'Next you will set a password and assign business units.',
      firstNameLabel: 'First Name',
      firstNamePlaceholder: 'First name',
      middleNameLabel: 'Middle Name',
      middleNamePlaceholder: 'Middle name',
      lastNameLabel: 'Last Name',
      lastNamePlaceholder: 'Last name',
      aliasNamePlaceholder: 'Alias name',
      changePassword: 'Change Password',
      changePasswordHint: 'Set a new password for this user',
      newPassword: 'Enter new password',
      confirmNewPassword: 'Confirm new password',
      updatePassword: 'Update Password',
      updating: 'Updating...',
      passwordChanged: 'Password changed successfully',
      passwordChangeFailed: 'Failed to change password',
      passwordTooShort: 'Password must be at least 6 characters',
      passwordsDoNotMatch: 'Passwords do not match',
      addBusinessUnit: 'Add Business Unit',
      removeBusinessUnit: 'Remove Business Unit',
      assignHint: 'Select a cluster, then choose a business unit to assign',
      noAvailableBusinessUnits: 'No available business units in this cluster.',
      buAssigned: 'Business unit assigned successfully',
      buAssignFailed: 'Failed to add business unit',
      buRemoved: 'Business unit removed successfully',
      buRemoveFailed: 'Failed to remove business unit',
      notFound: 'User not found',
      directory: 'Directory',
      noAccessAssigned: 'No access assigned yet',
      notAssignedAnywhere: 'Not assigned to any cluster or business unit.',
      otherBusinessUnits: 'Other business units',
      unknownCluster: 'Unknown cluster',
      hardDelete: 'Hard Delete',
      showSoftDeleted: 'Show soft-deleted users',
      permanentlyDeleteUser: 'Permanently Delete User',
      hardDeleteWarning: 'This will permanently remove the user and all associated data. This action cannot be undone.',
      hardDeleteBulkWarning: 'This will permanently remove the selected users and all associated data. This action cannot be undone.',
      confirmCodePlaceholder: 'Enter the 6-character code',
      typeUsernameToConfirm: 'Type {{username}} to confirm',
      selectRow: 'Select {{name}}',
      deletedByName: 'Deleted by {{name}}',
      bulkDeleteTitle: 'Delete {{count}} user(s)',
      bulkDeleted: 'Deleted {{count}} user(s)',
      bulkDeleteFailed: 'Failed to delete {{count}} user(s)',
      bulkPartial: 'Deleted {{ok}}, {{fail}} failed',
      backToUsers: 'Back to users',
      changePasswordButton: 'Change password',
      newPasswordLabel: 'New Password *',
      confirmPasswordLabel: 'Confirm Password *',
      removeBuConfirm: 'Are you sure you want to remove "{{name}}" from this user?',
      // English fallback for when the BU record itself carries no name/code (task F).
      thisBusinessUnit: 'this business unit',
      addBu: 'Add BU',
      recentlyAdded: 'Recently added',
      activeInactiveSummary: '{{active}} active, {{inactive}} inactive',
      bulkPermanentlyDeleteUsers: 'Permanently Delete {{count}} User(s)',
      removeStatusFilter: 'Remove {{status}} filter',
      buColumn: 'BU',
      identityColumn: 'User',
      // The standalone label under the directory-summary total count. Deliberately a
      // separate key from `usersLower` above despite the identical English value — one is
      // a standalone label, the other sits inside a sentence, and Thai may want them apart.
      usersCountLabel: 'users',
      summaryLoadFailed: "Couldn't load the directory summary.",
      softDeleteConfirm: 'Are you sure you want to delete this user? This action cannot be undone.',
      bulkSoftDeleteConfirm: 'Soft-delete the selected user(s)? They can be restored later.',
      notFoundDescription: "This user doesn't exist, or they may have been deleted. Check the link, or pick one from the user list.",
    },
    broadcasts: {
      expireTitle: 'Expire Broadcast',
      expireNow: 'Expire now',
      toastExpired: 'Broadcast expired successfully',
      message: 'Message',
      pickDateTime: 'Pick a date and time',
      validation: {
        messageRequired: 'Message is required',
        expiryAfterSchedule: 'Expiry must be after the scheduled send time',
        // Task 3 (BroadcastCompose) field-validation additions below.
        maxChars: 'Max {{max}} characters',
        customTypeRequired: 'Custom type is required',
        customTypeFormat: 'Use uppercase letters, digits, and underscores only',
        invalidDateTime: 'Invalid date/time',
        scheduledTimeFuture: 'Scheduled time must be in the future',
        pickExpiryDateTime: 'Pick an expiry date and time',
        expiryFuture: 'Expiry must be in the future',
        chooseBusinessUnit: 'Choose a business unit',
        pickRecipient: 'Pick at least one recipient',
        // Task 4 (BroadcastEdit) field-validation additions below.
        expiryRequired: 'Expiry is required',
        invalidDate: 'Invalid date',
      },
      // Task 2 (Broadcast list surface: BroadcastManagement, BroadcastFilters,
      // BroadcastSummary, broadcastColumns) page-local additions below.
      subtitle: 'Manage platform-wide and business unit notifications.',
      searchPlaceholder: 'Search broadcasts...',
      newBroadcast: 'New Broadcast',
      emptyTitle: 'No broadcasts found',
      emptyDescription: 'Get started by creating your first broadcast.',
      loading: 'Loading broadcasts',
      loadingEllipsis: 'Loading broadcasts...',
      deleteTitle: 'Delete Broadcast',
      deleteConfirm: 'Are you sure you want to delete this broadcast? It will be hidden from everyone immediately.',
      // NOT toastDeleted/toastDeleteFailed page-local keys — those would duplicate
      // toast.deleted/toast.deleteFailed composed with entity.broadcast.sentence/lower,
      // which is what Task 1 added entity.broadcast for. toastExpireFailed stays
      // page-local: there is no shared expire template to compose from.
      toastExpireFailed: 'Failed to expire broadcast',
      loadFailedPrefix: 'Failed to load broadcasts: ',
      buCode: 'BU Code',
      scheduledAt: 'Scheduled At',
      expiresAt: 'Expires At',
      filterDescription: 'Filter broadcasts',
      showDeletedLabel: 'Show deleted broadcasts',
      summaryLoadFailed: 'Failed to load broadcast summary.',
      actions: 'Actions',
      // Fix-round-1: this line had no English at all — an English-language user was
      // reading raw Thai. See th.ts for why the Thai value here is unchanged verbatim.
      specificUserNote: "Broadcasts sent to specific users don't appear here — they're recorded as individual notifications.",
      // Fix-round-1: the Expire ConfirmDialog description used to concatenate a Thai
      // clause in front of an English sentence in ONE literal — a real bug, not a
      // translation gap. Split into two keys (effect statement + confirmation question)
      // since either half may be reused independently by a later slice.
      expireImmediateNote: 'The broadcast disappears from recipients immediately.',
      expireConfirm: 'Are you sure you want to expire this broadcast now?',
      // BroadcastEdit's own 'past'-expiry ConfirmDialog — a separate flow from the
      // list page's explicit Expire-now action above, kept as its own key so a future
      // reword of one never silently changes the other.
      expireConfirmEdit: 'Are you sure you want to expire this broadcast?',
      // Task 3 (BroadcastCompose page-local additions below).
      sendBroadcastTitle: 'Send Broadcast',
      pushNotificationSubtitle: 'Push a notification to all users, specific users, or a business unit.',
      audience: 'Audience',
      allUsers: 'All users',
      specificUsers: 'Specific users',
      recipients: 'Recipients',
      loadingBusinessUnitsEllipsis: 'Loading business units…',
      noneOptional: 'None (optional)',
      relatedBuMetadata: 'Related Business Unit (Metadata)',
      metadataBuHint: "Attaches this business unit code to the broadcast's metadata (e.g. for navigation).",
      scheduledMaintenancePlaceholder: 'Scheduled maintenance',
      systemUnavailablePlaceholder: 'The system will be unavailable from 02:00 to 03:00 UTC.',
      sendImmediately: 'Send immediately',
      scheduleForLater: 'Schedule for later',
      customEllipsis: 'Custom…',
      otherEllipsis: 'Other…',
      daysCount: '{{count}} days',
      reset: 'Reset',
      schedule: 'Schedule',
      send: 'Send',
      // Not in the brief's measured string list — a format-example placeholder (not
      // prose), same rationale as pages.users.usernamePlaceholder ('user@example.com'):
      // identical value in both languages because it illustrates the exact character
      // set TYPE_CUSTOM_RE accepts, not a translatable word.
      customTypePlaceholder: 'CUSTOM_TYPE',
      sendToAllUsers: 'Send to ALL users?',
      // Plurals stay in the English value only (brief step 3): Thai does not inflect
      // for number, so th.ts gives both keys the same value.
      sendToUserSingular: 'Send to {{count}} user?',
      sendToUserPlural: 'Send to {{count}} users?',
      sendToBu: 'Send to {{name}}?',
      // confirmTitle/confirmDescription are assembled from these whole-sentence keys —
      // never by slotting a translated fragment into a translated frame. `base`
      // (scheduledForNote / deliveredImmediately) is concatenated with one more whole
      // sentence per target mode, mirroring the expireImmediateNote+expireConfirm
      // concatenation Task 2 already established in BroadcastManagement.
      scheduledForNote: 'Scheduled for {{when}}.',
      deliveredImmediately: 'Will be delivered immediately.',
      systemAllReachNote: 'This broadcast will reach every user in the system. Title: "{{title}}".',
      recipientsNote: 'Recipients: {{names}}.',
      recipientsNoteWithExtra: 'Recipients: {{names}} and {{extraCount}} more.',
      buNote: 'Business unit: {{name}} ({{code}}).',
      toastScheduled: 'Broadcast scheduled for {{when}}',
      toastSent: 'Broadcast sent',
      sendFailedPrefix: 'Failed to send broadcast: ',
      fixHighlightedFields: 'Please fix the highlighted fields',
      // Task 4 (BroadcastEdit) page-local additions below.
      notFoundTitle: 'Broadcast not found',
      notFoundDescription: "This broadcast doesn't exist, or it may have been deleted. Check the link, or pick one from the list.",
      backToBroadcasts: 'Back to broadcasts',
      broadcastInfo: 'Broadcast Info',
      // Card 1 content, not DevDebugSheet content — the brief mis-grouped these with the
      // debug-sheet strings; they render as ordinary visible text well before the
      // DevDebugSheet element. Parentheses are part of the rendered text, kept in both
      // languages.
      event: 'Event',
      systemGenerated: '(System generated)',
      scheduledAtLabel: 'Scheduled at',
      leaveEmptyToSendImmediately: 'Leave empty to send immediately.',
      rescheduleTitle: 'Reschedule Broadcast',
      // rescheduleNote/rescheduleConfirm and the expireImmediateNote/expireConfirm pair
      // above are concatenated the same way (whole sentence + whole sentence, never a
      // translated fragment slotted into a translated frame) to build the two
      // ConfirmDialog descriptions in BroadcastEdit — mirroring the 'past' expiry
      // dialog's reuse of expireImmediateNote+expireConfirm below.
      rescheduleNote: 'The message disappears from recipients until the new time.',
      rescheduleConfirm: 'Are you sure you want to reschedule?',
      // Distinct from toastExpireFailed's plural loadFailedPrefix ('Failed to load
      // broadcasts: ') — this is BroadcastEdit's single-record load error, concatenated
      // inline with the parsed message rather than passed as a toast description.
      loadFailedDetail: 'Failed to load broadcast: ',
      toastNoChanges: 'No changes to save',
      noMessage: 'No message',
      untitled: 'Untitled',
      // Fix-round (Task 4): this line was raw Thai with no English at all, unconditionally
      // rendered regardless of app language — same class of bug as specificUserNote and
      // the expire/reschedule ConfirmDialog descriptions above. See th.ts: Thai kept
      // verbatim.
      contentLockedNote: "Already broadcast — content can't be edited, some recipients may have already seen it.",
      // BroadcastPreview.tsx (reachSummary) additions below.
      everyUserInSystem: 'Every user in the system',
      // Plural stays in the English value only (same pattern as sendToUserSingular/Plural
      // above) — Thai gives both keys the same value.
      selectedUserSingular: '{{count}} selected user',
      selectedUserPlural: '{{count}} selected users',
      noRecipientsPickedYet: 'No recipients picked yet',
      noBusinessUnitPickedYet: 'No business unit picked yet',
      // BroadcastPreview.tsx (component JSX) additions below.
      reaches: 'Reaches',
      sendsImmediately: 'Sends immediately',
      titlePlaceholder: 'Your title appears here',
      messagePlaceholder: 'Your message appears here.',
      // No trailing period — distinct from scheduledForNote above, which has one.
      scheduledForLabel: 'Scheduled for {{when}}',
      internalCategorisationNote: 'Colour and label are an internal categorisation — recipients see a standard notification.',
    },
    news: {
      publish: 'Publish',
      tags: 'Tags',
      loadFailedPrefix: 'Failed to load news: ',
      // Task 5 (NewsManagement + NewsroomSummary) additions below.
      title: 'News Management',
      subtitle: 'Manage announcements and news articles',
      addNews: 'Add News',
      searchPlaceholder: 'Search news...',
      filterDescription: 'Filter news by status',
      target: 'Target',
      // No shared common.status.* entry for 'draft' (only published/archived/updated do) —
      // used by both this page's statusLabel fallback and NewsroomSummary's Stage label.
      draft: 'Draft',
      untitled: '(untitled)',
      emptyTitle: 'No news yet',
      emptyDescription: 'Get started by creating your first news article.',
      loading: 'Loading news',
      loadingEllipsis: 'Loading news...',
      selectRow: 'Select {{name}}',
      deleteTitle: 'Delete News',
      deleteConfirm: 'Are you sure you want to delete this news article? This action cannot be undone.',
      publishSelected: 'Publish Selected',
      archiveSelected: 'Archive Selected',
      deleteSelected: 'Delete Selected',
      // 'Archive' as a VERB (dialog title prefix + confirm button label) — distinct from
      // common.status.archived, which is the completed-state adjective ('Archived'). Same
      // split as 'Publish' (this page's pages.news.publish) vs common.status.published: the
      // "Published {when}" line in NewsroomSummary uses the latter, this dialog uses the
      // former — see the task report's hazard-2 note.
      archive: 'Archive',
      archiving: 'Archiving...',
      publishing: 'Publishing...',
      // Whole-sentence bulk-dialog headline templates ('{verb} {{count}} News Article(s)') —
      // never a translated verb interpolated into a translated heading.
      bulkDeleteTitle: 'Delete {{count}} News Article(s)',
      bulkArchiveTitle: 'Archive {{count}} News Article(s)',
      bulkPublishTitle: 'Publish {{count}} News Article(s)',
      bulkDeleteDescription: 'This will delete {{count}} selected news article(s). This action cannot be undone.',
      bulkArchiveDescription: 'This will archive {{count}} selected news article(s). They can be un-archived later by editing each article.',
      bulkPublishDescription: 'This will publish {{count}} selected news article(s), making them visible to readers.',
      confirmCodePlaceholder: 'Enter the 6-character code',
      // The imperative "Type X to confirm", NOT common.field.type (a noun field label) —
      // identical English spelling, different meaning (hazard 2). Marker-split like
      // pages.users.typeUsernameToConfirm — the code itself stays a styled <span>, not
      // plain text, so it can't be baked into the translated string.
      typeCodeToConfirm: 'Type {{code}} to confirm',
      // NewsroomSummary.tsx additions below.
      summaryLoadFailed: "Couldn't load the newsroom summary.",
      latest: 'Latest',
      nothingPublishedYet: 'Nothing published yet',
      publishArticleHint: 'Publish an article to make it visible to readers.',
      // Not in the brief's measured string list (hazard 4: a curly-brace-led fragment,
      // invisible to a capital-letter-anchored scan) — frozen by NewsroomSummary.test.tsx's
      // `/20 articles total/`. The catalog has no plural support, so the singular/plural
      // branch stays at the call site — same pattern as timeAgo's hourAgo/hoursAgo below.
      articleTotal: '{{count}} article total',
      articlesTotal: '{{count}} articles total',
      // timeAgo (NewsroomSummary.tsx). Every output here was invisible to the string scan:
      // each starts with a lowercase letter or a digit/param. hourAgo/hoursAgo and
      // weekAgo/weeksAgo hold the same Thai value (see th.ts) since Thai does not inflect
      // for number; English keeps the inflection.
      time: {
        none: '-',
        justNow: 'just now',
        minAgo: '{{count}} min ago',
        hourAgo: '{{count}} hour ago',
        hoursAgo: '{{count}} hours ago',
        yesterday: 'yesterday',
        daysAgo: '{{count}} days ago',
        weekAgo: '{{count}} week ago',
        weeksAgo: '{{count}} weeks ago',
      },
      // summarizeBulk (NewsManagement.tsx) restructure: nine whole sentences (three verbs ×
      // three outcomes) replace an English verb interpolated into three frames — English
      // puts the verb first and inflects it, Thai does neither. English values here are
      // byte-identical to what the old frames produced.
      bulk: {
        publish: { ok: 'Published {{count}} news article(s)', failed: 'Failed to publish {{count}} news article(s)', partial: 'Published {{count}}, {{failed}} failed' },
        archive: { ok: 'Archived {{count}} news article(s)',  failed: 'Failed to archive {{count}} news article(s)',  partial: 'Archived {{count}}, {{failed}} failed' },
        delete:  { ok: 'Deleted {{count}} news article(s)',   failed: 'Failed to delete {{count}} news article(s)',   partial: 'Deleted {{count}}, {{failed}} failed' },
      },
      // Task 6 (NewsEdit.tsx) additions below.
      article: 'Article',
      articleDescription: 'The body readers see, plus its source and tags.',
      bodyMarkdown: 'Body (Markdown)',
      sourceUrl: 'Source URL',
      addTagPlaceholder: 'Add a tag...',
      coverImage: 'Cover image',
      headline: 'Headline',
      publishDescription: 'Who sees this, and when.',
      visibleToAllBu: 'Visible to all business units',
      // Whole-sentence template, NOT an interpolation of common.label.businessUnitsLabel's
      // sibling `visibleToAllBu` — the quoted term is written out in each language rather
      // than interpolated in, per the file's whole-sentence-reuse convention (see
      // rescheduleNote/rescheduleConfirm in pages.broadcasts above).
      selectBuOrEnableGlobal: 'Select at least one business unit, or enable "Visible to all business units".',
      publishedAt: 'Published at',
      // Whole-sentence template quoting common.status.published's value ('Published') —
      // same convention as selectBuOrEnableGlobal above: the quoted term is written out,
      // never interpolated from the translated key.
      publishedAtNote: 'Set automatically when status becomes "Published".',
      history: 'History',
      createNews: 'Create News',
      // Mirrors loadFailedPrefix's shape (prefix + concatenated message), not toast.saveFailed
      // (which has no trailing ': ' and is a standalone toast, not a concatenation target).
      saveFailedPrefix: 'Failed to save news: ',
      // Task 6 (NewsMasthead.tsx) additions below.
      hiddenFromReaders: 'Hidden from readers',
      notVisibleToReaders: 'Not visible to readers',
      // describeReach's audience-count pair. Thai holds one value for both (see th.ts).
      reachOne: '{{count}} business unit',
      reachMany: '{{count}} business units',
    },
    subscriptions: {
      // ทูลทิปของการ์ดสรุปที่กดไม่ได้ชั่วคราว — buildAdvance เมิน `states` ทั้งหมดเมื่อ
      // expiringSoon เปิดอยู่ ตัวกรองสถานะจึงต้องบอกว่าทำไมกดไม่ได้ ไม่ใช่กดแล้วเงียบ
      clearExpiringSoonFirst: 'Turn off "Expiring soon" to filter by state',
      notMigratedToGroups: 'This contract still holds {{count}} features directly and no group yet. Picking a group replaces them.',
      noGroupsAvailable: 'No licence feature groups exist yet. Create one in',
      groupsSelectedSummary: '{{groups}} groups selected · {{features}} features in total',
      manageGroups: 'Manage groups',
      purchasedGroups: 'Purchased groups',
      groupEntitlementsForBu: 'Licence groups granted to {{code}}',
      // --- authored English for strings that existed only in Thai ---
      // `clearSearch` and `selectedCount` were dropped from this object (fix round 1):
      // both duplicated an existing common.* key's English exactly while carrying different
      // Thai ('ล้างการค้นหา' vs common.clearSearch's 'ล้างคำค้นหา'; '{{count}} รายการที่เลือก' vs
      // common.state.nSelected's 'เลือกแล้ว {{count}} รายการ'). Task 4 binds this screen's
      // search-clear button to common.clearSearch and its selected-count line to
      // common.state.nSelected — so the Subscription screens' Thai wording moves to the
      // app-wide phrasing instead of keeping its own. If you're looking for either key here,
      // it isn't page-local; use the common.* one.
      //
      // `seats` was dropped the same way (slice 3b Task 1 fix round 1): it recurred in
      // 3+ files across 2 slices (here, SubscriptionForm.tsx, SeatsCard.tsx x2, and three
      // pages.licenses files), past the phase-2 promote-to-common threshold — moved to
      // common.field.seats verbatim (same English, same Thai). Call sites here now bind
      // common.field.seats.
      detailsTitle: 'Subscription details',
      // --- create branch (`/licenses/subscriptions/new`) ---
      issuedTo: 'Issued to',
      issuedToNote: 'A subscription belongs to one business unit, and cannot be moved to another later.',
      contractPeriod: 'Contract period',
      contractPeriodNote: 'Both dates are covered days — a term that starts on 1 Jan and runs a year ends on 31 Dec.',
      commonTerms: 'Common terms',
      // The month-end calendar replaced the old 1/2/3-year presets: these contracts end on a
      // month boundary, so the end date is picked, not computed from a length.
      pickStartDateFirst: 'Pick a start date to choose an end of month',
      // One number per sentence, never a translated fragment dropped into a translated frame.
      coversOneYear: 'Covers 1 year',
      coversYears: 'Covers {{count}} years',
      coversOneMonth: 'Covers 1 month',
      coversMonths: 'Covers {{count}} months',
      coversOneDay: 'Covers 1 day',
      coversDays: 'Covers {{count}} days',
      coversMonthsAndDays: 'Covers {{months}} months and {{days}} days',
      // เศษ 1 วันเคยอ่านว่า "and 1 days" — คำเดียวที่ต้องแยกกิ่ง ไม่ใช่ระบบ plural ทั้งชุด
      coversMonthsAndOneDay: 'Covers {{months}} months and 1 day',
      coversYearsAndDays: 'Covers {{years}} years and {{days}} days',
      coversYearsAndOneDay: 'Covers {{years}} years and 1 day',
      draftPlateAria: 'The subscription about to be created',
      noBusinessUnitYet: 'No business unit picked yet',
      noClusterYet: 'No cluster picked yet',
      noPeriodYet: 'No period yet',
      willBeCreatedAs: 'Will be created as',
      groupsNextStep: 'Entitlement groups are picked once the contract exists.',
      purchasedModules: 'Purchased modules',
      searchNumber: 'Search subscription numbers...',
      clearClusterFilter: 'Clear cluster filter',

      // FeatureSelectionCard
      featuresLoadFailed: "Couldn't load the feature list",
      featuresLoadFailedHint: "Features can't be edited right now. Try again.",
      featuresLoading: 'Loading features…',
      unrecognisedDisabled: 'Unrecognised (disabled) ({{count}})',
      removeUnrecognised: 'Remove unrecognised feature {{key}}',
      disabledStillAttached: 'These features are disabled system-wide but are still attached to this subscription.',
      disabledMustRemove: 'These features are disabled system-wide — remove them before the subscription\'s features can be saved.',
      // Split rather than one key with a fallback param (fix round 2): the source's
      // fallback branch interpolates a Thai word into a Thai sentence — a translated
      // value into a translated frame, the exact shape this project banned after
      // summarizeBulk. Two whole sentences instead.
      noFeaturesAssignedToBu: 'No features assigned to {{bu}} yet',
      noFeaturesAssignedToThis: 'No features assigned to this subscription yet',
      searchFeaturesPlaceholder: 'Search modules or features...',
      searchFeatures: 'Search features',
      noFeaturesDefined: 'No features defined in the system yet',
      noFeaturesMatch: 'No features match “{{query}}”',
      collapseAll: 'Collapse all',
      expandAll: 'Expand all',
      clearAllIn: 'Clear all in {{module}}',
      selectAllIn: 'Select all in {{module}}',
      none: 'None',

      // SeatsCard
      seatsPoolDescription: 'Seat pool shared across every business unit in this cluster',
      pendingCount: '{{count}} pending',
      upTo: ' → up to {{projected}}/{{cap}}',
      noBusinessUnitLinked: "This subscription isn't linked to any business unit",
      purchasedCount: '{{count}} purchased',
      capEditedOnBuPage: 'The cap is edited on the business unit page',
      editCap: 'Edit cap',
      seatsPoolNote: 'Seats are a cluster-wide pool — business units outside this subscription contribute to it too, so the purchased count above need not equal the total cap ({{cap}}).',

      // SubscriptionInfoCard
      selectClusterFirst: 'Select a cluster first',
      clusterHasNoBu: 'This cluster has no business units — create one before issuing a subscription',
      numberAutoAssigned: 'A number is assigned automatically on save',

      // Task 2 (SubscriptionTable page-local additions below).
      subtitle: 'Manage cluster license subscriptions, seat pools, and feature entitlements.',
      addSubscription: 'Add Subscription',
      loading: 'Loading subscriptions',
      loadingEllipsis: 'Loading subscriptions...',
      loadFailedPrefix: 'Failed to load subscriptions: ',
      summaryLoadFailed: 'Failed to load subscription summary.',
      emptyTitle: 'No subscriptions yet',
      emptyDescription: 'Get started by creating your first subscription for a cluster.',
      filterDescription: 'Filter subscriptions by state, cluster, and expiry',
      allClusters: 'All clusters',
      lockedToActive: 'Locked to Active while showing subscriptions expiring soon.',
      // expiringSoon moved to common.state.expiringSoon (i18n phase-2 slice-3b Task 4 fix
      // round 1) — see the comment there.
      expiringWithinDays: 'Expiring within {{days}} days',
      expiry: 'Expiry',
      // Bare column headers — distinct from entity.* (toast-safe nouns) and from
      // common.validation.subscriptionNumber/startDate/endDate (lowercase field-name
      // fallbacks used by validateField, a different register and different casing).
      // `subscription` itself moved to entity.subscription.title (Task 4 fix round 1) —
      // the rest of this group stays page-local.
      subscriptionNumber: 'Subscription Number',
      clusterCode: 'Cluster Code',
      businessUnitName: 'Business Unit Name',
      featureCount: 'Feature Count',
      features: 'Features',
      period: 'Period',
      // "State" is deliberately not common.status.label ("Status") — review I1 in the
      // source: the badge and this filter/column both read the backend-computed `state`
      // field, never the raw `status`, and the two words must not collide on screen.
      state: 'State',
      // startDate/endDate dropped here (slice 3b Task 1 fix round 1): 3+ files across
      // 2 slices (here, SubscriptionInfoCard.tsx, and LicensePurchaseForm.tsx in
      // pages.licenses) — moved to common.field.startDate/endDate verbatim (same English,
      // same Thai). Call sites here now bind those. Not the same key as
      // common.validation.startDate/endDate ('Start date'/'End date', sentence case,
      // default field NAMES for validation messages) — see the comment at
      // common.field.startDate.
      seatsUsed: 'Seats Used',
      seatsCap: 'Seats Cap',

      // Task 3 (SubscriptionForm + SubscriptionInfoCard page-local additions below).
      loadingAria: 'Loading subscription',
      notFoundTitle: 'Subscription not found',
      notFoundDescription: "This subscription doesn't exist, or it may have been deleted. Check the link, or pick one from the subscription list.",
      backToSubscriptions: 'Back to subscriptions',
      createSubtitle: 'Create a new subscription for a cluster',
      createSubscription: 'Create Subscription',
      unnamedSubscription: '(unnamed subscription)',
      clusterSubtitle: 'Cluster: {{name}} ({{code}})',
      // Singular record-detail failure banners — distinct from the plural loadFailedPrefix
      // above (Task 2, the management page's list load). Same shape as broadcasts'
      // loadFailedPrefix/loadFailedDetail split: English differs by number, Thai does not
      // (Thai has no plural inflection) — see th.ts.
      loadFailedDetail: 'Failed to load subscription: ',
      createFailedPrefix: 'Failed to create subscription: ',
      saveFailedPrefix: 'Failed to save subscription: ',
      missingDocVersion: 'Missing doc_version for this record — reload the page and try again.',
      endDateAfterStart: 'End date must be after start date',
      // Split rather than one key with a fallback param, matching noFeaturesAssignedToBu/
      // ToThis above — two whole sentences, not one template with a translated fallback noun.
      featureEntitlementsForBu: 'Feature entitlements for {{code}}',
      featureEntitlementsGeneric: 'Feature entitlements for this contract',
      detailsDescription: 'Contract identity, period, and status',
      effectiveState: 'Effective state:',
      // แผ่นสัญญาที่ออกแล้ว (#231) — คู่กับ draftPlateAria ของใบร่าง
      issuedPlateAria: 'Issued subscription',
      noBusinessUnitOnRecord: 'No business unit on record',
      amendTitle: 'Amend contract',
      amendDescription: 'The period and status are the only fields an issued contract can change.',
    },

    // Slice 3b (License Center, cluster license tables, the purchase form, and three
    // shared section cards — twelve files total). Catalog-only pass (Task 1): every key
    // below is seeded because its exact string recurs in MORE THAN ONE of those twelve
    // files — a later task binding any one of those files reuses the key here instead of
    // re-declaring it. A string that shows up in only one file stays out of this object;
    // that file's own task adds it page-locally.
    //
    // Reuse-checked first against common.*/entity.*/breadcrumb.*/error.* (exact value,
    // Thai read too) and toast.* composed with entity.* — every key below is what was
    // LEFT after that pass found no match. See task-1-report.md for the full reuse list
    // (e.g. 'No expiry' -> common.state.noExpiry, 'Status' -> common.status.label,
    // 'Active'/'Scheduled'/'Expired' -> common.status.*, 'Reference' -> common.field.reference,
    // 'Filters' -> common.label.filters, 'Cluster' -> common.label.cluster).
    licenseFeatures: {
      title: 'License Features',
      subtitle:
        'Choose which features can still be sold. The catalog itself is generated — only the state is yours to set.',
      key: 'Key',
      label: 'Name',
      module: 'Module',
      // ป้ายสั้นพอที่จะจบในบรรทัดเดียวของกลุ่มปุ่ม — คำอธิบายเต็มอยู่ใน *Hint ซึ่งเป็น title
      // ของแต่ละปุ่มอยู่แล้ว ป้ายยาว ("Closed to new sales") เคยทำให้กลุ่มปุ่มตัดสองบรรทัด
      // ในทุกแถวของ 76 แถว
      state: {
        active: 'Sellable',
        activeHint: 'Can be ticked into any feature group',
        inactive: 'Closed',
        inactiveHint:
          'Closed to new sales: groups that already hold it keep it; it cannot be added anywhere new',
        hide: 'Hidden',
        hideHint: 'Gone from the catalog entirely; keys already sold become orphans',
      },
      moduleFeatureCount: 'Features: {{count}}',
      moduleShowing: 'Showing {{shown}} of {{total}}',
      moduleClosedCount: 'closed {{count}}',
      moduleHiddenCount: 'hidden {{count}}',
      affectedBu: '{{count}} BU',
      affectedBuTooltip: 'In use by {{count}} business units — they lose this menu if it is hidden',
      affectedBuHeader: 'Business units',
      stateSaved: 'State updated',
      hideConfirmTitle: 'Hide this feature?',
      hideConfirmDescription:
        '“{{label}}” will disappear from the menu for {{count}} business units that hold it today, including ones that already paid, and their users will no longer be able to open that page. This deletes nothing — set it back to Active and the menu returns within a minute.',
      hideConfirmAction: 'Hide it',
      filterAll: 'All states',
      searchPlaceholder: 'Search by key or name',
      emptyTitle: 'No features match',
      emptyDescription: 'Try a different search term or state filter.',
    },
    licenseFeatureGroups: {
      title: 'License Feature Groups',
      subtitle: 'Curated bundles of licence features, used when selling a subscription',
      searchPlaceholder: 'Search by code or name',
      newGroup: 'New group',
      editGroup: 'Edit group',
      code: 'Code',
      codeHint: 'Cannot be changed after the group is created',
      name: 'Name',
      description: 'Description',
      sortOrder: 'Sort order',
      active: 'Active',
      featureCount: 'Features',
      subscriptionCount: 'Subscriptions',
      activeOnly: 'Active only',
      emptyTitle: 'No feature groups yet',
      emptyDescription: 'Create a group to bundle licence features for sale.',
      featuresCard: 'Features in this group',
      noFeaturesSelected: 'No features in this group yet.',
      created: 'Group created',
      updated: 'Group updated',
      deleted: 'Group deleted',
      deleteTitle: 'Delete this group?',
      deleteBody: 'The group and its feature list will be removed. This cannot be undone.',
      parentAutoAdded: 'Selecting a feature also grants its module, so the saved list can be longer than what you ticked.',
      // ── ชั้นวางชุดสิทธิ์ (FeatureGroupCard) ──
      // `featuresOfTotal` ใช้เมื่อโหลดขนาดแค็ตตาล็อกได้ · `featuresOnly` คือขากลับตอนโหลดไม่ได้
      // ซึ่งเป็นตอนเดียวกับที่แถบสัดส่วนหายไป — ตัวเลขที่ไม่มีตัวหารต้องไม่มีแถบด้วย
      featuresOfTotal: '{{count}} of {{total}} features',
      featuresOnly: '{{count}} features',
      ordinalHint: 'Sort order {{n}} — where this bundle sits on the sales form',
      ordinalDuplicateHint: 'Sort order {{n}} is shared with another group — the order on the sales form is not decided',
      inUseCount: 'Used by {{count}} contracts',
      inUseCountOne: 'Used by 1 contract',
      inUseNone: 'Not used by any contract',
      showingCount: '{{shown}} of {{total}} groups',
      deleteBodyInUse: '{{count}} live contracts are on this bundle. Check them before deleting — the group and its feature list will be removed. This cannot be undone.',
      // ── หน้าแก้ไข ──
      inUseWarningTitle: '{{count}} contracts are on this bundle',
      inUseWarningTitleOne: '1 contract is on this bundle',
      inUseWarningBody: 'Those contracts reference this group, so adding or removing a feature affects all of them at once — not just the group.',
      deactivateWarning: 'Turning this off takes the bundle off the sales form. Check the {{count}} contracts already on it first.',
      sortOrderHint: 'Where this bundle sits on the sales form — lower comes first',
      orderOnSalesForm: 'on the sales form',
      orderDuplicate: 'Another group already holds this order — the order on the sales form is not decided',
      activeHint: 'Can still be picked when selling a subscription',
      inactiveHint: 'Hidden from the sales form. Contracts already on it are untouched.',
      sellingOn: 'On sale',
      sellingOff: 'Withdrawn',
      // ── แผงสัดส่วน (GroupCompositionPanel) ──
      // ตัวเลขใหญ่คือยอดที่ **บันทึกจริง** (ลูก + module แม่ที่ถูกเติม) ตัวเดียวกับที่หน้ารายการโชว์
      // ไม่ใช่ยอดที่ติ๊ก — สองยอดนั้นต่างกัน และบรรทัดกระทบยอดข้างล่างคือที่ที่มันเจอกัน (66 กับ 76)
      compositionTitle: 'Features in this bundle',
      compositionOfCatalog: 'of {{total}} in the catalogue',
      compositionNoDenominator: 'features saved',
      compositionBreakdown: '{{children}} ticked · {{modules}} parent modules added',
      compositionEmpty: 'Nothing selected yet',
      // ── ตัวเลือกสิทธิ์ (FeatureSelectionCard) ──
      // ห้ามใช้คำเดียวกับปุ่ม All/None ต่อโมดูล: สองปุ่มนี้เคยอยู่คอลัมน์เดียวกันจนกดผิดกันได้
      // และการกดผิดคือติ๊กสิทธิ์เพิ่มให้ทุกสัญญาที่ผูกชุดนี้
      expandShort: 'Expand',
      collapseShort: 'Collapse',
      moduleFill: '{{module}} — {{count}} of {{total}} selected',
    },
    licenses: {
      // ClusterLicenseDetail.tsx (nav section label, ALL_SECTIONS) + licenseKindConfig.ts
      // (BU_QUOTA_CONFIG.amountLabel) — both literally 'BU quota'.
      buQuota: 'BU quota',
      // ── ClusterLicenseDetail.tsx — LicenseHealthStrip (แถบสรุปบรรทัดเดียวใต้หัวหน้า) ──
      // Numbers are pre-computed by the page; these keys only render them. Each layer can be
      // "unavailable" independently, which is NOT the same as zero — see the strip's docblock.
      healthBuUsage: '{{used}} / {{cap}} BU',
      healthBuNoQuota: 'No BU quota',
      healthSeatsCount: '{{count}} seats',
      healthContractsCount: '{{count}} contracts',
      healthOverQuota: '{{count}} BU over quota',
      healthBuWithoutSeats: '{{count}} BU without seats',
      healthExpiredContracts: '{{count}} expired',
      healthExpiringContracts: '{{count}} expiring soon',
      healthQuotaEndsIn: 'BU quota ends in {{count}} days',
      healthAllClear: 'Nothing needs attention',
      healthSomeUnavailable: 'Some figures could not be loaded',
      healthUnavailableShort: 'unavailable',
      hideExpired: 'Hide expired',
      // BuQuotaSection.tsx — the Business units table's subscription timeline cells.
      noActiveSubscription: 'No active contract',
      // Tab strip that replaced the 200px scrollspy sidenav.
      licenseLayersNav: 'License layers',
      // LicenseCoverageBar — the timeline axis in the seats + subscriptions tables. `text` is
      // an already-formatted date range assembled by the caller, not a raw date.
      coverageBarLabel: 'Coverage: {{text}}',
      coverageNone: 'No coverage',
      // Inline replacements for the hero-sized EmptyState the per-BU cards used to render.
      seatsNoLicenseInline: 'No seat license',
      activeLicensesCount: '{{count}} active',
      expiredDaysAgo: 'expired {{count}} days ago',
      // licenseKindConfig.ts (BU_QUOTA_CONFIG.newPageTitle) + BuQuotaSection.tsx (the
      // "Add BU quota license" button — hardcoded there, not read from config).
      addBuQuotaLicense: 'Add BU quota license',
      // licenseKindConfig.ts (SEAT_CONFIG.newPageTitle) + SeatSection.tsx (the "Add seat
      // license" button — hardcoded there, not read from config).
      addSeatLicense: 'Add seat license',
      // PurchaseLicenseTable.tsx (column header + CSV export label) + LicensePurchaseForm.tsx
      // (field Label).
      licenseNumber: 'License Number',
      // `end` promoted to common.action.end (i18n phase-2 slice-4 Task 5 fix round 1) — see
      // the comment there. BuQuotaSection.tsx / SeatSection.tsx / SubscriptionSection.tsx
      // bind to that key directly now.
      // BuQuotaSection.tsx + SeatSection.tsx ConfirmDialog title — the two files' dialog
      // descriptions differ (BU count vs. seat count) and stay page-local; only the shared
      // title is seeded here.
      removeLicenseTitle: 'Remove license',
      cancelLicenseTitle: 'Cancel this license',
      cancelBuQuotaDescription: 'Cancel this {{count}}-BU license. It stays in the ledger and remains auditable, but stops granting quota. Cancelling cannot be undone.',
      cancelBuQuotaInForceDescription: 'This is the license currently granting quota. Cancelling it changes the cluster quota from {{from}} to {{to}} business units immediately. Cancelling cannot be undone.',
      // BuQuotaSection.tsx + SeatSection.tsx EmptyState title — the two files' descriptions
      // differ and stay page-local; only the shared title is seeded here.
      noLicensesYetTitle: 'No licenses yet',
      // ClusterLicenseTable.tsx + PurchaseLicenseTable.tsx "Clear all filters" button —
      // lowercase, NOT common.action.clearAllFilters ('Clear All Filters', Title Case).
      // Different capitalization is a different byte-identical string, so it is not that
      // key's reuse candidate.
      clearAllFilters: 'Clear all filters',

      // Task 2 (call-site binding) — LicenseCenter.tsx page header + view switcher. `title`
      // doubles as the ClusterLicenseDetail.tsx subtitle fallback below (cluster not yet
      // loaded) — same page family, same 'Licenses' text, reused rather than duplicated.
      // Coincidentally byte-identical to nav.licenses ('Licenses') — out of this task's
      // reuse-check scope (common/entity/breadcrumb/error only), kept page-local per the
      // pages.news/pages.users precedent of a dedicated pages.<slice>.title key.
      title: 'Licenses',
      subtitle: 'Fleet-wide license status by cluster, subscription, seat license, or BU quota.',
      // FleetCapacity's `expiringLabel` prop — distinct from quotaExpiringToggle below
      // (ClusterLicenseTable's Sheet button/badge), a shorter, different string.
      buQuotaExpiring: 'BU quota expiring',
      selectViewAria: 'Select license view',
      viewByCluster: 'By cluster',
      viewBySubscription: 'By subscription',
      viewBySeat: 'By seat license',
      viewByBuQuota: 'By BU quota',

      // ClusterLicenseDetail.tsx
      clusterNotFoundOrDeleted: 'Cluster not found or deleted',
      clusterUnavailable: 'Cluster unavailable',
      subtitleWithCode: 'Licenses · {{code}}',

      // ClusterLicenseTable.tsx — LICENSE_FILTERS labels. `noLicence` also renders inline in
      // the BU Quota cell when cap is 0 (same string, same key, two call sites in the file).
      noLicence: 'No licence',
      overBuLimit: 'Over BU limit',
      seatsFull: 'Seats full',
      // Title Case column header — distinct from `buQuota` above ('BU quota', lowercase
      // 'quota', a nav-section label), not a reuse candidate despite the near-identical text.
      buQuotaColumn: 'BU Quota',
      // `daysLeft` promoted to common.state.daysLeft (i18n phase-2 slice-4 Task 5 fix round 1)
      // — see the comment there. ClusterLicenseTable.tsx / BuQuotaSection.tsx / SeatSection.tsx
      // bind to that key directly now.
      // Coincidentally byte-identical to switcher.searchClusters ('Search clusters...') and
      // to ClusterManagement.tsx's own (still untranslated) literal — out of this task's
      // reuse-check scope (common/entity/breadcrumb/error only), kept page-local per the
      // pages.users/pages.news precedent for byte-identical strings across unrelated
      // namespaces.
      searchClustersPlaceholder: 'Search clusters...',
      filtersSheetDescription: 'Filter clusters by status and licence state',
      licenceStateLabel: 'Licence state',
      // Sheet button + active-filter badge for the expiringSoonFilter toggle — distinct from
      // buQuotaExpiring above (FleetCapacity's stat label, a different string).
      quotaExpiringToggle: 'Quota expiring',
      filterNarrowsHint: 'Selecting more than one narrows the list — a cluster must match every choice.',
      // Shared by both the status-filter chip's aria-label (value = the translated Active/
      // Inactive label) and the license-filter chip's (value = the raw filter key — matches
      // the source's existing behaviour of leaving that one untranslated).
      //
      // NOT byte-identical to pages.users.removeStatusFilter ('Remove {{status}} filter') —
      // same shape, different param name, so the duplicate-value script does not flag it —
      // but it's the same promotion-signal shape Task 1 found for seats/startDate/endDate:
      // report it (task-2-report.md), don't silently fix pages.users from this task's scope.
      removeFilterAria: 'Remove {{value}} filter',
      removeQuotaExpiringFilterAria: 'Remove quota expiring filter',
      noClustersTitle: 'No clusters',
      noClustersMatchFilters: 'No cluster matches the current search and filters.',
      noClustersYet: 'There are no clusters yet.',
      clearFiltersAction: 'Clear filters',
      loadingClustersAria: 'Loading clusters',
      loadFailedPrefix: 'Failed to load clusters: ',

      // Task 3 (LicensePurchaseForm.tsx + PurchaseLicenseTable.tsx additions below).
      //
      // Neither file has its own `config.ownerLabel`/`amountLabel`/`newPageTitle` — both
      // read those three fields off `licenseKindConfig.ts`, a plain module (no `t`) shared
      // by more than these two files, so it stays untouched. Both files instead look the
      // per-kind translated value up locally (`OWNER_LABEL_KEYS`/`AMOUNT_LABEL_KEYS`/
      // `NEW_PAGE_TITLE_KEYS`) via keys already seeded (buQuota/addBuQuotaLicense/
      // addSeatLicense from Task 1, common.field.seats, common.label.cluster,
      // entity.businessUnit.title) — no new key needed for those three fields themselves.

      // LicensePurchaseForm.tsx — generic "License" noun, reused as both the toast.created
      // entity param and the notFound PageHeader's title fallback. SubscriptionForm.tsx
      // used to do the same dual-use with the single page-local
      // pages.subscriptions.subscription key; since Task 4 fix round 1 promoted that value
      // to entity.subscription, it now uses that object's two grammatical forms instead
      // (.sentence for the toast, .title for the PageHeader) rather than one shared key.
      license: 'License',
      // ── LicensePurchaseForm.tsx (โหมด edit) — IssuedLicensePlate + การ์ดช่องที่แก้ได้ ──
      // The edit page stopped being a 7-box grid in which 4 boxes were read-only: identity and
      // term moved onto a plate, and the card below it now holds only what can be typed.
      issuedPlateAria: 'Issued license',
      // Counterpart to expiredDaysAgo above, for a licence whose coverage has not started yet.
      startsInDays: 'Starts in {{count}} days',
      amendTitle: 'Amend this license',
      amendDescription: 'The amount, coverage period, and reference can be changed. The owner and license number cannot.',
      licenseDetailsTitle: 'License details',
      // CardDescription — `{{owner}}` is the kind's Title-Case owner label ('Business Unit'
      // or 'Cluster', from OWNER_LABEL_KEYS above), so this renders exactly what
      // `${config.ownerLabel}, amount, and coverage period` used to.
      licenseDetailsDescription: '{{owner}}, amount, and coverage period',
      // Trailing period — distinct from PurchaseLicenseTable.tsx's `referenceNoColumn`
      // below ('Reference No', no period), a genuinely different literal, not a casing
      // variant of the same string.
      referenceNoLabel: 'Reference No.',
      // `{{owner}}` here is the LOWERCASE form (OWNER_LABEL_KEYS[kind] run through
      // .toLowerCase() at the call site — safe because Thai has no case, so it's a no-op on
      // the Thai string, and a real lowercase on the English one, exactly reproducing what
      // `config.ownerLabel.toLowerCase()` used to render).
      missingOwnerTitle: 'Missing {{owner}}',
      missingOwnerDescription: "This page needs a {{owner}} to create a license for. Open it from a {{owner}}'s page instead of typing this URL directly.",
      notFoundTitle: 'License not found',
      notFoundDescription: "This license doesn't exist, or it may have been deleted. Check the link, or pick one from the license list.",
      // Shared by both EmptyState action buttons (notFound and ownerMissing).
      backToLicenses: 'Back to licenses',
      // `{{owner}}` is the lowercase form again, same as missingOwnerTitle/Description above.
      createSubtitle: 'Issue a new license for this {{owner}}',
      createLicense: 'Create License',
      unnamedLicense: '(unnamed license)',
      // Detail-view PageHeader subtitle — `{{owner}}` is the Title-Case form (unlike
      // createSubtitle/missingOwner* above), `{{value}}` is `ownerText` (already-resolved
      // display data, not translated).
      ownerSubtitle: '{{owner}}: {{value}}',
      loadingAria: 'Loading license',
      // Singular-record failure banners, matching pages.subscriptions.loadFailedDetail/
      // createFailedPrefix/saveFailedPrefix's naming (not this same object's list-page
      // loadFailedPrefix above, which is ClusterLicenseTable.tsx's and reads differently:
      // 'Failed to load clusters: ').
      loadFailedDetail: 'Failed to load license: ',
      createFailedPrefix: 'Failed to create license: ',
      saveFailedPrefix: 'Failed to save license: ',
      // Extends pages.subscriptions.missingDocVersion with "or owner id" — this form's
      // handleSave() checks both docVersion and ownerId before saving, subscriptions' does
      // not, so the two English strings genuinely differ and this stays its own key.
      missingDocVersionOrOwner: 'Missing doc_version or owner id for this record — reload the page and try again.',
      // Byte-identical to pages.subscriptions.endDateAfterStart ('End date must be after
      // start date') — a cross-slice pages.* coincidence (3a's SubscriptionForm.tsx vs this
      // slice's LicensePurchaseForm.tsx), reported per the reuse-check's promotion-signal
      // rule rather than silently reused: only 2 files hold it, short of the >=3-files
      // threshold, so it stays split rather than promoted to common.*. Thai copied verbatim
      // from pages.subscriptions.endDateAfterStart — confirmed identical, not retranslated.
      endDateAfterStart: 'End date must be after start date',
      // Heading of the full-width coverage block that owns start date, end date, and the
      // perpetual switch. Deliberately NOT reusing common.field.startDate/endDate: this
      // names the pair as one value, which is the whole reason the block exists.
      coveragePeriod: 'Coverage period',
      // The "off" side of the perpetual segmented control, opposite common.state.noExpiry.
      // A statement about the licence, not an imperative — the control reports which shape
      // the licence has, it does not order the user to do something.
      termHasEndDate: 'Has an end date',
      // The denominator under the licence's amount. Two bare numbers in one frame, no nested
      // translated fragment — the unit is already named by the line directly above it
      // (AMOUNT_LABEL_KEYS), so repeating it here would say "BU quota" twice in two lines.
      usageLine: '{{used}} of {{cap}} in use',
      // Cancellation facts on the plate. Two keys rather than one with an optional actor:
      // `cancelled_by_id` is a raw uuid and the display name is only trustworthy when the
      // audit trail's own timestamp matches the cancellation's — see IssuedLicensePlate's
      // caller. A frame with an empty "by" reads as a missing value, not an unknown actor.
      cancelledAt: 'Cancelled {{at}}',
      cancelledAtBy: 'Cancelled {{at}} by {{by}}',
      // Why the fields below are frozen. There is no uncancel endpoint — this is terminal,
      // and the page must say so rather than letting the user type into a dead record.
      cancelledReadOnly: 'This licence was cancelled and can no longer be changed. Issue a new licence instead.',

      // PurchaseLicenseTable.tsx
      filterByStatusDescription: 'Filter by license status',
      // Static — always "status", never the active status's own name (unlike
      // ClusterLicenseTable.tsx's removeFilterAria above), because this table allows only
      // one status filter at a time and the source literal never interpolated the value.
      removeStatusFilterAria: 'Remove status filter',
      searchLicensesPlaceholder: 'Search by license number or reference...',
      loadFailedTitle: 'Could not load licenses',
      loadFailedDescription: 'The list could not be loaded — this does not mean there are none.',
      retryingEllipsis: 'Retrying...',
      // English differs from pages.licenses.noLicence ('No licence', British, singular) by
      // spelling and number; Thai does not inflect for either, so the two keys' Thai values
      // coincide — matching the documented loadFailedPrefix/loadFailedDetail precedent in
      // pages.subscriptions (same Thai, different English by number).
      noLicensesTitle: 'No licenses',
      noLicensesMatchFilters: 'No license matches the current search and filters.',
      noLicensesIssuedYet: 'No licenses have been issued yet.',
      loadingLicensesAria: 'Loading licenses',
      // CSV export column labels — `{{owner}}` is the Title-Case owner label. Word order
      // flips in Thai ('รหัส {{owner}}' / 'ชื่อ {{owner}}', code/name-first) to match this
      // file's existing clusterCode/businessUnitName precedent in pages.subscriptions.
      ownerCodeColumn: '{{owner}} Code',
      ownerNameColumn: '{{owner}} Name',
      coverageColumn: 'Coverage',
      // No period — distinct from LicensePurchaseForm.tsx's referenceNoLabel above
      // ('Reference No.'), the form-field version of the same concept with different
      // punctuation. Reused twice within this file (CSV label + column header).
      referenceNoColumn: 'Reference No',

      // Task 4 (sections/* + hooks below) — BuQuotaSection.tsx.
      buQuotaCardTitle: 'BU Quota Licenses',
      buQuotaLoadFailedDescription: 'Could not load licenses for this cluster — the quota is unknown, not zero.',
      quotaNoExpiry: 'Quota: {{count}} business units · no expiry',
      quotaExpires: 'Quota: {{count}} business units · expires {{date}}',
      noLicenseInForce: 'No license in force — this cluster cannot create business units',
      buQuotaLoadFailedBanner: 'License data for this cluster could not be loaded — the quota and Over limit figures below are unknown, not zero.',
      businessUnitsInUse: 'Business units in use: {{used}} / {{total}}',
      overLimitReadOnly: '{{count}} over limit — those units are read-only',
      buQuotaDataUnavailable: 'License data for this cluster could not be loaded — it is unknown, not empty.',
      noBuQuotaLicenseDescription: 'The platform team has not issued a BU quota license for this cluster.',
      quotaColumn: 'Quota',
      showExpired: 'Show expired ({{count}})',
      removeBuQuotaDescription: 'Remove the {{count}}-BU license. If it is still in force, this cluster immediately loses the ability to create new business units until another license takes over.',
      buRankQuotaUnavailable: 'Quota unknown — the license data above failed to load, so Over-limit status cannot be determined right now.',
      // Thai is identical for both — Thai does not inflect for number, only the English
      // (business unit / business units) differs, matching the noLicensesTitle/noLicence
      // precedent above.
      overLimitCountOne: '{{count}} business unit rank beyond the licensed quota of {{cap}}. They are read-only until more quota is purchased.',
      overLimitCountMany: '{{count}} business units rank beyond the licensed quota of {{cap}}. They are read-only until more quota is purchased.',
      rankedExplanation: 'Ranked the same way the platform decides which units are covered — HQ first, then oldest.',
      rankColumn: 'Rank',
      overLimitBadge: 'Over limit',
      overLimitTitle: 'Quota {{cap}} · this unit ranks {{rank}}',

      // SeatSection.tsx
      noBusinessUnitsSeatsDescription: 'This cluster has no business units yet — seats are issued per business unit.',
      // Two independent pluralizable counts (seats, business units) in one sentence — four
      // whole-sentence combinations rather than composing translated fragments, matching the
      // noFeaturesAssignedToBu/ToThis precedent in pages.subscriptions ("two whole sentences
      // instead" of nesting a translated value inside a translated frame). Thai is identical
      // across all four combinations — only which English combination is picked differs.
      seatSummaryOneOne: '{{count}} seat across {{buCount}} business unit',
      seatSummaryOneMany: '{{count}} seat across {{buCount}} business units',
      seatSummaryManyOne: '{{count}} seats across {{buCount}} business unit',
      seatSummaryManyMany: '{{count}} seats across {{buCount}} business units',
      seatSummaryFailedOne: ' (+ {{count}} business unit unknown)',
      seatSummaryFailedMany: ' (+ {{count}} business units unknown)',
      seatCountUnavailable: 'Seat count unavailable',
      seatLoadFailedBanner: 'Could not load licenses for this business unit — the seat figures below are unknown, not zero.',
      seatDataUnavailable: 'License data for this business unit could not be loaded — it is unknown, not empty.',
      noSeatLicenseDescription: 'Add the first license to set how many seats this business unit has bought.',
      removeSeatDescription: 'Remove the {{count}}-seat license. If it is still in force, those seats leave the cluster pool immediately.',
      // Same two-axis pluralization shape as seatSummary* above (seat count x active-license
      // count), same reasoning.
      seatFromLicenseOneOne: '{{count}} seat from {{activeCount}} active license',
      seatFromLicenseOneMany: '{{count}} seat from {{activeCount}} active licenses',
      seatFromLicenseManyOne: '{{count}} seats from {{activeCount}} active license',
      seatFromLicenseManyMany: '{{count}} seats from {{activeCount}} active licenses',
      endDateRequiredBadge: 'End date required',

      // SubscriptionSection.tsx
      subscriptionsCardDescription: "Contracts issued for this cluster's business units.",
      addSubscriptionButton: 'Add subscription',
      subscriptionsLoadFailedPrefix: 'Could not load subscriptions for this cluster: ',
      subscriptionsLoadFailed: 'Could not load subscriptions for this cluster.',
      // Byte-identical to pages.subscriptions.emptyTitle ('No subscriptions yet') — a
      // cross-slice pages.* coincidence. Only 2 files hold it (SubscriptionTable.tsx there,
      // this file here), short of the >=3-files promotion bar, so it stays split. Thai
      // copied verbatim from pages.subscriptions.emptyTitle, not retranslated.
      noSubscriptionsYetTitle: 'No subscriptions yet',
      noSubscriptionContractsDescription: 'This cluster has no subscription contracts.',
      noBuBadge: 'No BU',
      // subscriptionColumn promoted to entity.subscription.title, and expiringSoonBadge
      // promoted to common.state.expiringSoon (i18n phase-2 slice-3b Task 4 fix round 1) —
      // both cleared the promote-to-common(/entity) bar once this file's binding was
      // counted. See the comments at their new locations.
      //
      // subscriptionStateColumn is confirmed NOT a promotion candidate — coordinator
      // review: Thai has no word separating "state" from "status", and the two never
      // appear on one screen, matching the reasoning already left at
      // pages.subscriptions.state (en.ts). Stays split, unchanged.
      subscriptionStateColumn: 'State',

      // useLicenseLedger.ts — the toast title for a failed GET reuses loadFailedTitle above
      // (byte-identical 'Could not load licenses', already seeded for PurchaseLicenseTable's
      // EmptyState title; the hook's toast renders the same words in a different UI shell).
      licenseRemoved: 'License removed',
      licenseCancelled: 'License cancelled',
      cancelLicenseFailedTitle: 'Could not cancel the license',
      removeLicenseFailedTitle: 'Could not remove the license',
    },

    // Slice 4 (Cluster Admin — 25 files under src/pages/clusterAdmin/, including the
    // businessUnitForm/ and licenses/ subdirectories). Catalog-only pass (Task 1): every key
    // below is seeded because its exact string recurs in MORE THAN ONE of those 25 files — a
    // later task binding any one of those files reuses the key here instead of re-declaring
    // it. A string that shows up in only one file stays out of this object; that file's own
    // task adds it page-locally.
    //
    // Reuse-checked first against common.*/entity.*/breadcrumb.*/error.* (exact value, Thai
    // read too) and toast.* composed with entity.* — every key below is what was LEFT after
    // that pass found no match. See task-1-report.md for the full reuse list (e.g. 'Cluster
    // Role' -> common.label.clusterRole, 'No business units in this cluster.' ->
    // common.state.noBusinessUnitsInCluster, 'Business units' -> common.label.businessUnitsLabel,
    // 'Identity'/'Branding'/'Configuration' -> common.section.*, 'Changes saved successfully'
    // -> toast.saved, 'Data exported successfully' -> toast.exported).
    //
    // `company` is NOT a reuse of common.field.company ('Company', byte-identical) — that key
    // is a single-input field label (see the field/section split documented above
    // common.section), while this one is a Group/tab SECTION heading for the whole
    // company_* field group. Same class of mismatch the phase-2 final review already fixed
    // once for entity.* vs common.label.*.
    clusterAdmin: {
      clusterUsersTitle: 'Cluster Users',
      people: 'People',
      viewLicenses: 'View licenses',
      clusterHasNoBusinessUnitsYet: 'This cluster has no business units yet.',
      inviteToAccessHint: 'Invite a user to give them access to this cluster.',
      invitationRateLimited: 'Invitation rate limit reached. Please try again later.',
      noSeatsOpen: 'No seats open',
      unnamed: '(unnamed)',
      // rowActions promoted to common.action.rowActions (fix round 1) — see the comment
      // there. MembersTable.tsx / InvitationsTable.tsx bind to that key directly; this
      // object never held its own call site.

      // --- Task 2: BusinessUnitList.tsx + BusinessUnitForm.tsx ---
      businessUnitListSubtitle: 'Manage the business units in this cluster',
      // Distinct from common.state.loadingBusinessUnits ('Loading business units...') —
      // that one is the visible overlay text (three ASCII dots); this is the overlay's
      // aria-label, which the source never suffixes with the ellipsis. Same split as
      // common.busy.loading/loadingEllipsis.
      loadingBusinessUnitsAria: 'Loading business units',
      // Edit-page skeleton aria-label (singular unit), matching the pages.subscriptions.
      // loadingAria / pages.licenses.loadingAria naming precedent for a form's own loading
      // state — distinct from the List page's loadingBusinessUnitsAria above (plural).
      loadingBusinessUnitAria: 'Loading business unit',
      filterBusinessUnitsByStatus: 'Filter business units by status',
      noBusinessUnitsDescription: 'Business units are created by a platform administrator. Once one is added to this cluster, it will appear here.',
      // The over-limit banner. NOT the same string as pages.licenses.overLimitCountOne/Many
      // (slice 3b) — that pair reads "business unit rank beyond…", this page's source reads
      // "business unit is/units are beyond…". Same tail, different lead clause; see the
      // task-1 report's hazard-4 note #5 for why these were not spliced together.
      overLimitCountOne: '{{count}} business unit is beyond the licensed quota of {{cap}}. They are read-only until more quota is purchased.',
      overLimitCountMany: '{{count}} business units are beyond the licensed quota of {{cap}}. They are read-only until more quota is purchased.',
      // Cross-slice fix (final review F2): the badge and title-tooltip on this page ARE
      // byte-identical to pages.licenses.overLimitBadge/overLimitTitle, but were reading that
      // key directly instead of duplicating it — a page namespace is owned by its own slice,
      // so reading another slice's pages.* creates an invisible coupling. Duplicated here
      // instead, matching this object's own fixHighlightedFields/send precedent below (2
      // files/2 slices each, below the >=3-files-AND->=2-slices promotion bar); Thai copied
      // verbatim from the sibling keys.
      overLimitBadge: 'Over limit',
      overLimitTitle: 'Quota {{cap}} · this unit ranks {{rank}}',
      aliasCannotBeCleared: 'Alias cannot be cleared',
      hotelEmailCannotBeCleared: 'Hotel email cannot be cleared',
      companyEmailCannotBeCleared: 'Company email cannot be cleared',
      // Byte-identical to pages.broadcasts.fixHighlightedFields (2 files / 2 slices — below
      // the >=3-files-AND->=2-slices promotion bar, see task-1 report's promotion-signal
      // table). Left split, not promoted.
      fixHighlightedFields: 'Please fix the highlighted fields',
      // Prefix-concatenation pattern, matching pages.subscriptions.loadFailedDetail /
      // pages.licenses.loadFailedDetail's shape (setError(prefix + getErrorDetail(err))).
      loadFailedDetail: 'Failed to load business unit: ',
      updateFailed: 'Failed to update business unit',
      copiedHotelAddressToCompany: 'Copied hotel address to company address',
      overview: 'Overview',
      regionalFormats: 'Regional formats',
      timezone: 'Timezone',
      dateFormat: 'Date format',
      dateTimeFormat: 'Date-time format',
      timeFormat: 'Time format',
      longTimeFormat: 'Long time format',
      shortTimeFormat: 'Short time format',
      // Overview tab's People-summary value ('{{count}} user'/'users') — plain count-noun
      // pair, distinct from common.state.nSelected ('{{count}} selected') and
      // pages.users.bulkDeleteTitle-style '(s)' shorthand (this page's source spells the two
      // forms out, not a parenthetical).
      userCount: '{{count}} user',
      userCountPlural: '{{count}} users',
      noContactDetails: 'No contact details',
      notSet: 'Not set',
      // Configuration tab's summary fallback ('Defaults') — distinct English from
      // common.label.default ('Default', singular), so not a byte match; same Thai concept.
      configDefaults: 'Defaults',
      taxLabel: 'TAX {{taxNo}}',
      unsavedChangeCount: '{{count}} unsaved change',
      unsavedChangeCountPlural: '{{count}} unsaved changes',
      // Sentence-case ('Save changes'), NOT a byte match for common.action.saveChanges
      // ('Save Changes', Title Case) — BusinessUnitForm.tsx's sticky-bar button differs from
      // ClusterProfile.tsx's by casing only. Flagged in task-1's hazard-4 note #3 as a
      // possible source typo; kept byte-identical to the source rather than silently
      // "corrected" to Title Case.
      saveChangesButton: 'Save changes',

      // --- Task 3: MembersTable.tsx ---
      noMembersYet: 'No members yet',
      loadingMembersAria: 'Loading members',
      loadingMembers: 'Loading members...',
      removeMemberTitle: 'Remove member',
      removeMemberConfirm: 'Remove "{{name}}" from this cluster?',
      roleUpdated: 'Role updated',
      roleUpdateFailed: 'Failed to update role',
      memberRemoved: 'Member removed',
      memberRemoveFailed: 'Failed to remove member',
      // Hazard 2 (MembersTable.tsx:139): the dropdown's "Make {r}" item — {{role}} is always
      // pre-translated via ROLE_LABEL_KEYS before interpolation, never the raw API value.
      makeRole: 'Make {{role}}',

      // --- Task 3: InvitationsTable.tsx ---
      // Hazard 2 (InvitationsTable.tsx:23/123): the invitation-status enum this table's status
      // Badge can render. Not `enum_user_invitation_status` itself — 'expired' is a computed
      // *display* status the backend derives from a lapsed `pending` row (see the file's own
      // doc comment) — but together with 'expired' this is every value `statusVariant()` (same
      // file) already switches on, i.e. the complete set this column can show. 'expired' reuses
      // common.status.expired directly rather than duplicating it.
      invitationStatusPending: 'Pending',
      invitationStatusAccepted: 'Accepted',
      invitationStatusDeclined: 'Declined',
      invitationStatusRevoked: 'Revoked',
      invitedColumn: 'Invited',
      resend: 'Resend',
      revoke: 'Revoke',
      noPendingInvitations: 'No pending invitations',
      loadingInvitationsAria: 'Loading invitations',
      loadingInvitations: 'Loading invitations...',
      revokeInvitationTitle: 'Revoke invitation',
      revokeInvitationConfirm: 'Revoke the invitation sent to "{{email}}"? They will no longer be able to accept it.',
      invitationResent: 'Invitation resent',
      resendFailed: 'Failed to resend invitation',
      invitationRevoked: 'Invitation revoked',
      revokeFailed: 'Failed to revoke invitation',

      // --- Task 3: InviteUserDialog.tsx ---
      // Hazard 1 (InviteUserDialog.tsx:22,23): CLUSTER_ROLES/BU_ROLES render via
      // ROLE_LABEL_KEYS (src/utils/roleLabels.ts — moved out of clusterAdmin/ in i18n
      // phase-2 slice-5 Task 4 fix round 1, since businessUnitEdit/BusinessUnitUsersCard.tsx
      // reuses it too), shared with MembersTable.tsx and InvitationsTable.tsx — see
      // common.role.* above for the two label values.
      enterValidEmail: 'Enter a valid email address',
      invitationSent: 'Invitation sent',
      invitationAlreadyPending: 'Invitation already pending',
      invitationAlreadyPendingDescription: 'An invitation to {{email}} is already outstanding for this cluster.',
      alreadyAMember: 'Already a member',
      alreadyAMemberDescription: '{{email}} already has membership in this cluster.',
      rateLimited: 'Rate limited',
      sendInvitationFailed: 'Failed to send invitation',
      // Shared with ClusterUsers.tsx's "Invite user" button — same dialog, same word, one key.
      inviteUser: 'Invite user',
      inviteUserDescription: "Send an invitation to join this cluster. The recipient does not need a Carmen account yet — the link lets them set a password and join in one step.",
      // Format-example placeholder, not prose — identical value in both languages, same
      // rationale as pages.users.usernamePlaceholder ('user@example.com').
      emailPlaceholder: 'name@example.com',
      // Sentence case ('Cluster role'), NOT a byte match for common.label.clusterRole
      // ('Cluster Role', Title Case, the column header) — this is a form field label.
      clusterRoleFieldLabel: 'Cluster role',
      businessUnitAccessLabel: 'Business unit access',
      businessUnitAccessHint: 'Select the business units this invitation grants access to, and optionally mark one as default.',
      roleInBu: 'Role in {{name}}',
      sending: 'Sending...',
      // Byte-identical to pages.broadcasts.send (2 files / 2 slices — below the promotion
      // bar, see task-1 report's promotion-signal table). Left split, not promoted.
      send: 'Send',

      // --- Task 3: ClusterUsers.tsx ---
      // Cross-slice fix (final review F2): the PageHeader title read nav.users directly. A
      // nav label and a page heading are different jobs that happen to share a word today —
      // an edit to the sidebar's nav label would have silently changed this page's own
      // heading too. Given its own key instead (1 file, well below the promotion bar); Thai
      // copied verbatim from nav.users.
      usersPageTitle: 'Users',
      failedToLoadMembers: 'Failed to load members',
      failedToLoadInvitations: 'Failed to load invitations',
      usersPageSubtitle: 'Manage members and pending invitations for this cluster',
      membersTabLabel: 'Members ({{count}})',
      invitationsTabLabel: 'Invitations ({{count}})',
      searchMembersPlaceholder: 'Search members...',

      // --- Task 3: ClusterPeopleCard.tsx ---
      viewAllClusterUsers: 'View all cluster users',
      // Distinct from noMembersYet above ('No members yet', MembersTable.tsx's empty state) —
      // this card's EmptyState title omits "yet".
      noMembers: 'No members',
      noMembersInvitedDescription: 'Nobody has been invited to this cluster yet.',
      noClusterAdministrators: 'No cluster administrators. Only platform administrators can manage this cluster.',
      administratorsHeading: 'Administrators',
      moreAdministrator: '{{count}} more administrator',
      moreAdministrators: '{{count}} more administrators',
      memberWithoutAdminRights: '{{count}} member without admin rights',
      membersWithoutAdminRights: '{{count}} members without admin rights',

      // --- Task 4: ClusterBuDocument.tsx ---
      elsewhere: 'Elsewhere',
      addressLabel: 'Address',
      logoLabel: 'Logo',
      hotelNameLabel: 'Hotel name',
      // Shared by hotel_tel and company_tel — both InlineField calls pass the identical
      // literal 'Phone'.
      phoneLabel: 'Phone',
      copyFromHotelAddress: 'Copy from hotel address',
      companyNameLabel: 'Company name',
      taxIdLabel: 'Tax ID',
      branchLabel: 'Branch',

      // --- Task 4: AddressBlock.tsx ---
      setAddressPlaceholder: 'Set address…',
      coordinatesLabel: 'Coordinates',
      addressLine1Label: 'Address line 1',
      addressLine2Label: 'Address line 2',
      subDistrictLabel: 'Sub-district',
      districtLabel: 'District',
      cityLabel: 'City',
      provinceLabel: 'Province',
      postalCodeLabel: 'Postal code',
      countryLabel: 'Country',
      latitudeLabel: 'Latitude',
      longitudeLabel: 'Longitude',
      doneButton: 'Done',

      // --- Task 4: BuPropertyPlate.tsx ---
      // The back-link text 'Business units' reuses common.label.businessUnitsLabel directly
      // (Task 1's reuse table already named this exact call site). Active/Inactive/HQ reuse
      // common.status.active/.inactive and this object's own .hq.
      noHotelNameSet: 'No hotel name set — add one under Hotel',
      notHq: 'Not HQ',

      // --- Task 4: SeatMeter.tsx ---
      // note's five branches (BuPropertyPlate.tsx:60 investigation found no union backing the
      // avatar-initial .toUpperCase() call — see the task-4 report; these are the file's real
      // translatable strings). noSeatsOpen and viewLicenses reuse this object's own Task 1 keys.
      overBySeatsOne: 'Over by {{overBy}} — deactivate {{overBy}} user who belongs to no other BU in this cluster',
      overBySeatsMany: 'Over by {{overBy}} — deactivate {{overBy}} users who belong to no other BU in this cluster',
      atCapacityDeactivateUser: 'At capacity — deactivate a user before adding another',
      nearingCapacitySeatOne: 'Nearing capacity — {{seatsLeft}} seat left',
      nearingCapacitySeatMany: 'Nearing capacity — {{seatsLeft}} seats left',
      seatsOpenOne: '{{seatsLeft}} seat open',
      seatsOpenMany: '{{seatsLeft}} seats open',
      clusterSeatsHeading: 'Cluster seats',
      capLicensedSuffix: '/ {{cap}} licensed',
      clusterSeatsAriaLabel: 'Cluster seats: {{used}} of {{cap}} licensed in use',

      // --- Task 5: CapacityStrip.tsx ---
      // Pool's numeric line ('/ no cap' vs '/ {{cap}} licensed') — the licensed branch reuses
      // SeatMeter.tsx's capLicensedSuffix directly (Task 4's key, same '/ {{cap}} licensed'
      // shape); this key covers only the uncapped branch, which that key has no equivalent for.
      noCapSuffix: '/ no cap',
      // AllocationTicks' aria-label, parameterized by the already-translated Pool label
      // ('Business units'/'Seats', both common.* reuses — see the call site). Distinct from
      // SeatMeter.tsx's clusterSeatsAriaLabel, which hardcodes "Cluster seats" instead of a
      // variable label.
      poolAriaNoCap: '{{label}}: {{used}} in use, no cap',
      poolAriaWithCap: '{{label}}: {{used}} of {{cap}} licensed in use',
      // buNote's four branches. NOT the same string as this object's own overLimitCountOne/Many
      // (BusinessUnitList.tsx's banner, a longer sentence naming the quota cap) — this is the
      // capacity strip's much shorter note line.
      buBeyondQuotaOne: '{{count}} business unit is beyond quota and read-only',
      buBeyondQuotaMany: '{{count}} business units are beyond quota and read-only',
      noBuQuotaPurchased: 'No business-unit quota purchased',
      noQuotaLeftForAnotherBu: 'No quota left for another business unit',
      buQuotaFree: '{{free}} of {{cap}} quota free',
      // Joined with buNote via a literal ' · ' in code, not composed into one template — same
      // non-linguistic-separator pattern ClusterPeopleCard.tsx (Task 3) already established.
      expiresOn: 'expires {{date}}',
      // seatNote's remaining branches. seatFree === 0 reuses noSeatsOpen above; the "seat(s)
      // open" branch is byte-identical to SeatMeter.tsx's seatsOpenOne/Many and reuses those
      // directly instead of duplicating.
      noSeatCapSet: 'No seat cap set',
      seatsBeyondLicensedOne: '{{count}} user beyond the licensed seat count',
      seatsBeyondLicensedMany: '{{count}} users beyond the licensed seat count',

      // --- Task 5: ClusterProfile.tsx ---
      unnamedCluster: '(unnamed cluster)',
      tenantGroup: 'Tenant group',
      brandingCardDescription: 'Shown in the sidebar, the cluster switcher, and lists across the platform.',
      loadingClusterProfileAria: 'Loading cluster profile',
      // Prefix-concatenation, matching this object's own loadFailedDetail (BusinessUnitForm.tsx)
      // and pages.subscriptions/pages.licenses' *Prefix keys — a different entity (cluster, not
      // business unit), so not that key's reuse candidate.
      loadClusterFailedDetail: 'Failed to load cluster: ',
      // No toast.updated template exists (only created/deleted/deleteFailed/loadFailed/
      // saveFailed) and no entity.cluster noun exists in the catalog yet (ClusterEdit.tsx, the
      // platform-admin twin, has never been run through t() to seed one) — both toast strings
      // stay page-local rather than composed.
      clusterUpdated: 'Cluster updated',
      updateClusterFailed: 'Failed to update cluster',

      // --- Task 5: ClusterAdminLicenses.tsx ---
      // Cross-slice fix (final review F2): the PageHeader title fallback read
      // pages.licenses.clusterNotFoundOrDeleted/clusterUnavailable directly — a page
      // namespace is owned by its own slice. Duplicated here instead, matching this object's
      // own fixHighlightedFields/send precedent above (2 files/2 slices each, below the
      // promotion bar); Thai copied verbatim from the sibling keys.
      clusterNotFoundOrDeleted: 'Cluster not found or deleted',
      clusterUnavailable: 'Cluster unavailable',
      // NOT a byte match for pages.licenses.subtitleWithCode ('Licenses · {{code}}', American
      // spelling) — this page's source spells it "Licences" (British), matching the hazard-4
      // spelling drift Task 1's report already flagged for this file. Thai is identical to
      // subtitleWithCode's (Thai doesn't distinguish the two spellings), reused verbatim rather
      // than retranslated.
      licencesSubtitleWithCode: 'Licences · {{code}}',
      // Shared with licenses/SeatsByBuTable.tsx's bare "Licences" column header below — same
      // English/Thai, no distinct contract between the two (unlike e.g. common.field.company
      // vs this object's own `company` section heading), so one key covers both rather than
      // two identical keys.
      licencesLabel: 'Licences',

      // --- Task 5: licenses/BuRankingCard.tsx ---
      // Cross-slice fix (final review F2): the Rank column header read pages.licenses.
      // rankColumn directly — duplicated here instead, matching this file's own
      // clusterNotFoundOrDeleted/clusterUnavailable precedent above (2 files/2 slices, below
      // the promotion bar); Thai copied verbatim from the sibling key.
      rankColumn: 'Rank',
      buRankingLabel: 'Business unit ranking',
      rankingExplanation: 'When quota runs short, the platform covers units in this order — HQ first, then oldest.',
      rankedQuotaUnknown: '{{count}} ranked · quota unknown',
      beyondQuotaReadOnly: '{{count}} beyond quota and read-only',
      rankedAllWithinQuota: '{{count}} ranked · all within quota',
      beyondQuotaBadge: 'Beyond quota',

      // --- Task 5: licenses/SeatsByBuTable.tsx ---
      seatsByBusinessUnitLabel: 'Seats by business unit',
      // Column header reuses this object's own licencesLabel above (ClusterAdminLicenses.tsx's
      // subtitle fallback) — British spelling, matching this file's/QuotaLedgerCard.tsx's
      // consistent "licence(s)" usage (hazard-4, Task 1 report) — not a reuse candidate for
      // nav.licenses ('Licenses', American).
      endsColumn: 'Ends',
      couldNotLoadLicencesForBu: 'Could not load licences for this business unit — its seats are unknown, not zero.',
      notPurchased: 'Not purchased',

      // --- Task 5: licenses/QuotaLedgerCard.tsx ---
      // Cross-slice fix (final review F2): the Quota column header read pages.licenses.
      // quotaColumn directly — duplicated here instead (2 files/2 slices, below the
      // promotion bar); Thai copied verbatim from the sibling key.
      quotaColumn: 'Quota',
      // Hazard: STATUS_BADGE was a module-scope const holding label STRINGS (same class as
      // Task 3's role arrays) — restructured to hold catalog KEYS (labelKey), resolved with t()
      // at the render site. See the file for the restructured shape.
      quotaSummaryLoadFailed: 'Could not load — the quota shown above is unknown, not zero',
      noQuotaLicenceIssued: 'No quota licence has been issued for this cluster',
      // The summary line's count + in-force clause, composed from these pieces and joined with
      // a literal ' · ' in code (not spliced from fragments of unrelated meaning — same whole-
      // phrase-per-branch discipline as pages.licenses.seatSummary*/quotaExpires).
      licenceCountOne: '{{count}} licence',
      licenceCountMany: '{{count}} licences',
      inForceBusinessUnitsNoExpiry: 'in force: {{count}} business units, no expiry',
      inForceBusinessUnitsToDate: 'in force: {{count}} business units, to {{date}}',
      noneInForce: 'none in force',
      buQuotaLicencesLabel: 'BU quota licences',
      // NOT a reuse of pages.licenses.buQuotaDataUnavailable ('License data...', American) —
      // this file spells it 'Licence' (British), byte-different by one letter. Hazard-4,
      // already flagged in Task 1's report as the sharpest spelling-drift find. Thai is
      // identical to buQuotaDataUnavailable's, reused verbatim.
      licenceDataUnavailable: 'Licence data for this cluster could not be loaded — it is unknown, not empty.',
      quotaLicencesIssuedByPlatformTeam: 'The platform team issues quota licences. Ask them to add one before this cluster needs another business unit.',
      inForceBadge: 'In force',

      // --- Task 5: ClusterAdminEntry.tsx ---
      // NOT a byte match for switcher.chooseCluster ('Choose which cluster to administer', no
      // period, different wording) — kept separate rather than silently normalized.
      chooseAClusterToAdminister: 'Choose a cluster to administer.',
      notAdministratorOfAnyCluster: 'You are not an administrator of any cluster. Ask a platform administrator to grant you access.',

      // --- Task 5: ClusterAccessLost.tsx ---
      accessLostTitle: 'You no longer administer this cluster',
      accessLostDescription: 'Your administrator access to this cluster was removed. Choose another cluster, or ask a platform administrator to restore it.',
      backToMyClusters: 'Back to my clusters',

      // --- Task 5: ClusterBusinessUnitsCard.tsx ---
      viewAllBusinessUnitsAria: 'View all business units',
      // NOT a byte match for this object's own clusterHasNoBusinessUnitsYet ('This cluster has
      // no business units yet.', no second sentence) — this card's EmptyState description adds
      // "A platform administrator creates them."
      noBusinessUnitsCreatedByPlatformAdmin: 'This cluster has no business units yet. A platform administrator creates them.',
      moreOnBusinessUnitsPage: '{{count}} more on the Business Units page',

      // --- Task 5: SummaryCardHeader.tsx ---
      // The card's own "View all" link text — distinct from the `viewAllLabel` prop the two
      // call sites (ClusterBusinessUnitsCard.tsx, ClusterPeopleCard.tsx) already pass in as an
      // aria-label (viewAllBusinessUnitsAria above / this object's own viewAllClusterUsers).
      viewAll: 'View all',
    },

    // Slice 5 (Business Unit surfaces — 18 files: BusinessUnitManagement.tsx,
    // BusinessUnitEdit.tsx, and the src/pages/businessUnitEdit/ + businessUnitManagement/
    // decomposition). Catalog-only pass (Task 1): every key below is seeded because its
    // exact string recurs in MORE THAN ONE of those 18 files — a later task binding any one
    // of those files reuses the key here instead of re-declaring it. A string used once
    // stays out of this object; that file's own task adds it page-locally.
    //
    // Reuse-checked first against common.*/entity.*/breadcrumb.*/error.* (exact value, Thai
    // read too) and toast.* composed with entity.* — this slice is unusually saturated with
    // matches, since six earlier slices already discuss business units constantly. Every one
    // of the following was reused directly rather than duplicated here (see task-1-report.md
    // for the full list with file counts): Code/Name/Alias Name/Cluster/Status/Created at/
    // Created by/Updated at/Updated by (CSV + column headers) -> common.field.*/
    // common.label.cluster/common.status.label/common.audit.*; Email/Username/Description/
    // Type/Avatar -> common.field.*; BU Role/Database Pool/Filters -> common.label.*;
    // Active/Inactive/Deleted/Archived -> common.status.*; Export/Clear/Clear All Filters/
    // Filters:/Show Deleted/Clear all/Delete/Edit/Add User/Remove/Actions for {{name}}/
    // Manage licences/Save Changes -> common.action.*; Saving…/Adding…/Loading.../Loading… ->
    // common.busy.*; Cancel -> common.cancel; Search business units.../No business units yet/
    // Unsaved changes/No changes/Couldn't refresh — showing the last known numbers. ->
    // common.state.*; Average -> common.option.average; Branding/Configuration ->
    // common.section.*; Business unit created/deleted successfully, Failed to delete
    // business unit, Changes saved successfully, Data exported successfully -> toast.*
    // composed with entity.businessUnit.*; Cluster/Code/Name is required ->
    // common.validation.requiredMessage composed with common.label.cluster/common.field.code/
    // common.field.name. One further reuse is notable: BusinessUnitDocument.tsx's
    // company_name InlineField label is the first-ever call site for common.field.company
    // ('Company') — that key has sat unbound in the catalog since an earlier slice; its Thai
    // ('บริษัท') was read and fits this field exactly.
    //
    // Four cross-slice promotion signals cleared the >=3-files-AND->=2-slices bar and were
    // promoted to common.* instead of landing here — see the comments at common.field.alias,
    // common.section.hotel/company, common.option.fifo, and common.label.hq. Every other
    // promotion signal found stayed below the bar (2 files / 2 slices each) AND is used by
    // only one of this slice's 18 files, so per this task's own rule it stays out of this
    // object too — that file's own task adds it page-locally with a comment naming the
    // sibling. Full list in task-1-report.md: Add Business Unit / Add BU (vs
    // pages.users.addBusinessUnit/addBu), Deleted by {{name}} (vs
    // pages.users.deletedByName), Loading business units [aria] (vs pages.clusterAdmin.
    // loadingBusinessUnitsAria), Filter business units by status (vs pages.clusterAdmin.
    // filterBusinessUnitsByStatus), Copy from hotel address / Copied hotel address to
    // company address (vs pages.clusterAdmin.copyFromHotelAddress/
    // copiedHotelAddressToCompany), Tax ID / Branch / Logo / Overview (vs pages.clusterAdmin.
    // taxIdLabel/branchLabel/logoLabel/overview), the ten AddressBlock.tsx field labels
    // (Hotel name/Address line 1/Address line 2/Sub-district/District/City/Province/Postal
    // code/Country/Latitude/Longitude/Phone vs pages.clusterAdmin.*Label), the six regional-
    // format labels (Timezone/Date format/Date-time format/Time format/Long time format/
    // Short time format vs pages.clusterAdmin.*), the {{active}}/{{inactive}} summary
    // sentence (vs pages.users.activeInactiveSummary), and the seat/license two-axis
    // pluralization templates (vs pages.licenses.seatFromLicense*).
    businessUnits: {
      // BusinessUnitEdit.tsx's Users-tab label and BusinessUnitUsersCard.tsx's CardTitle are
      // the one string that recurs across 2 of this slice's 18 files. NOT a reuse of
      // nav.users / breadcrumb.users ('Users') despite the byte match — pages.clusterAdmin.
      // usersPageTitle already hit this exact hazard (a nav label and a page heading are
      // different jobs that happen to share a word) and was given its own key rather than
      // reading nav.users directly; the same reasoning applies to a tab label / Card heading
      // here. Also a promotion signal against pages.clusterAdmin.usersPageTitle (1 file) —
      // 3 files across 2 slices in total, but clusterAdmin's is a full PageHeader title while
      // this slice's two call sites are a compact tab pill and a Card heading, a different
      // register, so left split rather than promoted. Thai copied verbatim from nav.users,
      // unchanged.
      usersLabel: 'Users',

      // --- Task 2: BusinessUnitManagement.tsx ---
      title: 'Business Unit Management',
      subtitle: 'Manage business units and departments',
      loadFailedPrefix: 'Failed to load business units: ',
      // Promotion signal (Task 1, below the >=3-files/>=2-slices bar): byte-identical to
      // pages.users.addBusinessUnit — 2 files / 2 slices total, so kept page-local per this
      // task's own rule rather than promoted.
      addBusinessUnit: 'Add Business Unit',
      // Promotion signal vs pages.users.addBu (2 files / 2 slices) — same reasoning as
      // addBusinessUnit above.
      addBu: 'Add BU',
      emptyDescription: 'Get started by creating your first business unit.',
      // Promotion signal vs pages.clusterAdmin.loadingBusinessUnitsAria (2 files / 2 slices)
      // — byte-identical aria-label ('Loading business units', no ellipsis; distinct from
      // common.busy.loading's 'Loading...' overlay text rendered alongside it).
      loading: 'Loading business units',
      // Promotion signal vs pages.clusterAdmin.filterBusinessUnitsByStatus (2 files / 2
      // slices).
      filterBusinessUnitsByStatus: 'Filter business units by status',
      showSoftDeleted: 'Show soft-deleted business units',
      // Promotion signal vs pages.users.deletedByName (2 files / 2 slices) — same template
      // shape, different entity noun.
      deletedByName: 'Deleted by {{name}}',
      deleteTitle: 'Delete Business Unit',
      deleteConfirm: 'Are you sure you want to delete this business unit? This action cannot be undone.',

      // --- Task 2: BuSummary.tsx ---
      // Promotion signal vs pages.clusterAdmin.overview (2 files / 2 slices).
      overview: 'Overview',
      summaryLoadFailed: "Couldn't load the business unit summary.",
      businessUnitsCountLabel: 'business units',
      acrossClustersOne: 'across {{count}} cluster',
      acrossClustersMany: 'across {{count}} clusters',
      // Promotion signal vs pages.users.activeInactiveSummary (2 files / 2 slices) — byte-
      // identical aria-label template.
      activeInactiveSummary: '{{active}} active, {{inactive}} inactive',

      // --- Task 3: BusinessUnitDocument.tsx ---
      // Hazard site (BusinessUnitDocument.tsx:139): `f.code.slice(0, 8).toUpperCase() || 'BU'`
      // — the `.toUpperCase()` operates on `code`, an open-ended free-text field (not a closed
      // union, so no Record here), but the `|| 'BU'` fallback shown when `code` is empty is a
      // real hardcoded label. Promotion signal vs pages.users.buColumn (2 files / 2 slices) —
      // same abbreviation, different job (a table column header there vs. this hero's
      // logo-placeholder fallback). Thai copied verbatim ('BU' is an abbreviation, not
      // translated in either language, same as common.label.hq).
      logoFallback: 'BU',
      // Hazard site (BusinessUnitDocument.tsx:146):
      // `(f.name || f.code || '?').slice(0, 1).toUpperCase()` — investigated and found NOT to
      // back a closed union, same as slice 4's BuPropertyPlate.tsx:60 finding (see this
      // object's own SeatMeter.tsx comment above): `name`/`code` are open-ended user text and
      // '?' is a universal placeholder glyph. Left untranslated, no key added — a Record here
      // would be fiction.
      detailsGroup: 'Details',
      // Group descriptions (2026-08-31): `Group` now renders a title + description in the
      // same shape as CollapsibleSection, so every section on the page reads at one level.
      detailsGroupDescription: 'Identity and cluster membership',
      hotelGroupDescription: 'The property this business unit operates',
      companyGroupDescription: 'The legal entity that invoices for it',
      taxGroupDescription: 'Registration numbers used on documents',
      dateAndTimeGroupDescription: 'How dates and times are displayed',
      maxUsersLabel: 'Max users',
      // One/Many pair for the "From N active license(s) · change these in the Users tab" hint
      // under the read-only Max users value — an English-only plural the source built with a
      // ternary (`activeLicenseCount === 1 ? 'license' : 'licenses'`), same hazard class as
      // BuSummary.tsx's acrossClustersOne/Many above (Task 2).
      maxUsersFromLicenseOne: 'From {{count}} active license · change these in the Users tab',
      maxUsersFromLicenseMany: 'From {{count}} active licenses · change these in the Users tab',
      // The AddressBlock.tsx-style field labels named in the Task 1 intro comment above —
      // promotion signals vs pages.clusterAdmin.*Label (2 files / 2 slices each).
      hotelNameLabel: 'Hotel name',
      addressLine1Label: 'Address line 1',
      addressLine2Label: 'Address line 2',
      subDistrictLabel: 'Sub-district',
      districtLabel: 'District',
      cityLabel: 'City',
      provinceLabel: 'Province',
      postalCodeLabel: 'Postal code',
      countryLabel: 'Country',
      latitudeLabel: 'Latitude',
      longitudeLabel: 'Longitude',
      phoneLabel: 'Phone',
      // Promotion signal vs pages.clusterAdmin.copyFromHotelAddress (2 files / 2 slices).
      copyFromHotelAddress: 'Copy from hotel address',
      // The company_* mirror of the fields above has no sibling anywhere in the catalog:
      // ClusterBuDocument.tsx reuses its own bare phoneLabel/common.field.email for BOTH
      // hotel_tel/company_tel and hotel_email/company_email (see ClusterBuDocument.tsx:
      // 181-182) rather than carrying a "Company X" variant — this file's design genuinely
      // differs. Fresh keys, fresh Thai.
      companyPhoneLabel: 'Company phone',
      companyEmailLabel: 'Company email',
      companyAddressLine1Label: 'Company address line 1',
      companyAddressLine2Label: 'Company address line 2',
      companySubDistrictLabel: 'Company sub-district',
      companyDistrictLabel: 'Company district',
      companyCityLabel: 'Company city',
      companyProvinceLabel: 'Company province',
      companyPostalCodeLabel: 'Company postal code',
      companyCountryLabel: 'Company country',
      companyLatitudeLabel: 'Company latitude',
      companyLongitudeLabel: 'Company longitude',
      taxGroup: 'Tax',
      // Promotion signal vs pages.clusterAdmin.taxIdLabel/branchLabel (2 files / 2 slices
      // each).
      taxIdLabel: 'Tax ID',
      branchLabel: 'Branch',
      dateAndTimeGroup: 'Date & time',
      // The six regional-format labels named in the Task 1 intro comment above — promotion
      // signals vs pages.clusterAdmin.timezone/dateFormat/dateTimeFormat/timeFormat/
      // longTimeFormat/shortTimeFormat (2 files / 2 slices each).
      timezoneLabel: 'Timezone',
      dateFormatLabel: 'Date format',
      dateTimeFormatLabel: 'Date-time format',
      timeFormatLabel: 'Time format',
      longTimeFormatLabel: 'Long time format',
      shortTimeFormatLabel: 'Short time format',

      // --- Task 3: HeroName.tsx ---
      // Shared beyond this slice: src/pages/clusterAdmin/businessUnitForm/BuPropertyPlate.tsx
      // (slice 4) renders this same component and passes neither `label` nor `emptyText`, so
      // it inherits these defaults too — matching the doc comment already on HeroName.tsx
      // ("They default to the business unit strings so this file's original call sites read
      // exactly as before").
      heroNameLabel: 'Business unit name',
      heroNameEmptyText: '(unnamed business unit)',

      // --- Task 3: InlineField.tsx ---
      // The read-mode/select-prompt/edit-placeholder text every InlineField falls back to
      // when its caller passes no explicit `placeholder`. Byte-identical shape to
      // src/pages/clusterEdit/PlateField.tsx:63's own `Set ${label.toLowerCase()}…` — but that
      // file has no `useI18n` import and isn't otherwise in the catalog, so there is nothing
      // to promote from; fresh key. InlineField.tsx is imported outside this slice too
      // (src/pages/clusterEdit/sections/DetailsSection.tsx directly, and
      // src/pages/clusterAdmin/businessUnitForm/ClusterBuDocument.tsx via shared.tsx's
      // re-export) — this key's English value must stay byte-identical to the old literal so
      // those cross-slice call sites render unchanged.
      setFieldPlaceholder: 'Set {{field}}…',

      // --- Task 3: BusinessUnitEdit.tsx ---
      generalTab: 'General',
      locationTab: 'Location',
      formatsTab: 'Formats',
      technicalTab: 'Technical',
      createSubtitle: 'Create a new business unit',
      // Shown in the sticky action bar on the create route in place of 'No changes', which
      // described a record that does not exist yet. The three required fields sit in two
      // different places (name is the <h1>, code and cluster are in the Details group), so
      // the bar is the one spot that can name all of them at once.
      stillNeeded: 'Still needed: {{fields}}',
      editSubtitle: 'Business unit details',
      // Prefix-concatenation, matching this object's own loadFailedPrefix (Task 2) — the
      // validateRequired() error banner appends Object.values(active).join(', ') after this.
      // NOT byte-identical to pages.clusterAdmin.fixHighlightedFields ('Please fix the
      // highlighted fields', no colon, used as a toast title with a separate description) —
      // different composition, so no reuse/promotion here despite the similar wording.
      fixHighlightedFieldsPrefix: 'Please fix the highlighted fields: ',
      clusterLicenseLimitReached: 'Cannot create business unit: cluster has reached its license limit ({{used}}/{{cap}})',
      createButton: 'Create Business Unit',
      repointTitle: 'Repoint this business unit?',
      repointDescription: 'This business unit will read and write {{schema}} in the selected database pool. Data in the previous location stays where it is and will no longer be reachable from this screen.',
      noSchemaFallback: '(no schema)',
      repointButton: 'Repoint',
      // Promotion signal vs pages.clusterAdmin.copiedHotelAddressToCompany (2 files / 2
      // slices).
      copiedHotelAddressToCompany: 'Copied hotel address to company address',

      // --- Task 4: BusinessUnitBrandingCard.tsx ---
      brandingDescription: 'Logo and avatar shown across the platform',
      // Promotion signal vs pages.clusterAdmin.logoLabel (2 files / 2 slices) — same
      // BrandingImageUpload label, same shape as ClusterBuDocument.tsx's call site.
      logoLabel: 'Logo',

      // --- Task 4: BusinessUnitLicensesCard.tsx ---
      userLicensesTitle: 'User Licenses',
      // One/Many pair for the "{{seats}} seats from {{count}} active license(s)" ternary
      // (`activeCount === 1 ? 'license' : 'licenses'`) — the seat count itself is always
      // rendered plural in the source ("seats", never "seat"), so only the license-count axis
      // needs a pair here, unlike pages.licenses' own two-axis seatFromLicense{One,Many}
      // {One,Many} template family. Renamed the params to match that family's own
      // (count/activeCount) so the English is byte-identical to its ManyOne/ManyMany members —
      // a promotion signal, but only 2 files / 2 slices (this file + licenses/sections/
      // SeatSection.tsx), below the promote bar. Thai copied verbatim from
      // pages.licenses.seatFromLicenseManyOne/ManyMany (identical Thai across all four
      // variants there, since Thai doesn't inflect for number).
      seatsFromActiveLicenseOne: '{{count}} seats from {{activeCount}} active license',
      seatsFromActiveLicenseMany: '{{count}} seats from {{activeCount}} active licenses',
      // NOT the same sentence as pages.businessUnits.clusterSeatsUsed below
      // (BusinessUnitUsersCard.tsx) — different word order and this one carries a
      // "Cluster pool:" label prefix the other doesn't. Task 1 flagged the two as a
      // near-duplicate pair to decide on deliberately; kept as two keys, see the comment at
      // clusterSeatsUsed for the full reasoning.
      clusterPoolSeatsUsed: 'Cluster pool: {{used}} / {{cap}} seats used',
      seatsManagedInLicenseCenter: 'Seats are managed in the License Center.',

      // --- Task 4: BusinessUnitUsersCard.tsx ---
      activeCountBadge: '{{count}} Active',
      ofTotalUsers: 'of {{total}} total',
      // NOT the same sentence as pages.businessUnits.clusterPoolSeatsUsed above
      // (BusinessUnitLicensesCard.tsx): that one reads "Cluster pool: {{used}} / {{cap}}
      // seats used" (label prefix, "seats used" last); this one reads "{{used}} / {{cap}}
      // cluster seats used" (no prefix, "cluster seats used" as one trailing phrase).
      // Different sentences, not a casing/whitespace slip — two files in this slice describe
      // the same cluster-wide seat pool with genuinely different wording, so this stays split
      // into two keys rather than being silently normalised into one.
      clusterSeatsUsed: '{{used}} / {{cap}} cluster seats used',
      // The leading "· " bullet stays a literal separator in the JSX (only rendered when
      // `over` is true), matching the established "joined with a literal ' · ' in code, not
      // composed into one template" convention (see pages.clusterAdmin's buNote comment) —
      // this key holds only the text that follows the bullet.
      deactivateMoreHint: 'deactivate {{count}} more who belong to no other BU in this cluster',
      noUsersAssignedYet: 'No users assigned yet.',
      // The bold lead word of the "Shared — ..." explanation paragraph, and the identical
      // text on the row Badge — both bind here, one key for the one word.
      sharedLabel: 'Shared',
      // The rest of the explanation paragraph, after the bold "Shared" span and the em dash
      // (which stays a literal JSX separator, same convention as deactivateMoreHint above).
      // NOT byte-identical to sharedBadgeTooltip below (different case on "also", and this
      // one carries the extra "so deactivating here frees no seat" clause the tooltip omits).
      sharedExplanation: 'also active in another business unit in this cluster, so deactivating here frees no seat.',
      // The Badge `title` tooltip — a standalone sentence, not a fragment continuing the bold
      // "Shared" span the way sharedExplanation is, so it gets its own key rather than reusing
      // that one with different capitalisation spliced in.
      sharedBadgeTooltip: 'Also active in another business unit in this cluster',
      buStatusLabel: 'BU Status',
      // "Edit" aria-label template for the per-row icon button, with the `entity.user.lower`
      // ('user') fallback when the row has neither a username nor an email. No sibling
      // anywhere in the catalog (fresh key). The matching "Remove" aria-label uses
      // common.action.removeAria instead — it was byte-identical to this file's own
      // removeUserAria and to pages.users.removeBuAria across 4 files / 3 slices, above the
      // promote bar, so it was promoted (moved, not copied) rather than kept page-local.
      editUserAria: 'Edit {{name}}',
      editUserInBuTitle: 'Edit User in Business Unit',
      // Bare "Save" — distinct from common.action.saveChanges ('Save Changes'), a different
      // (longer) button label used by every Edit page's own primary save action; this dialog's
      // Save button is scoped to just the BU-membership edit, not the whole page.
      saveButton: 'Save',
      removeUserTitle: 'Remove User',
      // Mirror-image template of pages.users.removeBuConfirm ('Are you sure you want to
      // remove "{{name}}" from this user?', removing a BU from a user) — this one removes a
      // USER from a BU, so the trailing noun differs ("this business unit" vs "this user").
      // Not byte-identical, so not a promotion candidate; own key, own Thai.
      removeUserConfirm: 'Are you sure you want to remove "{{name}}" from this business unit?',
      // English fallback when the user being removed has no name/username/email — mirrors
      // pages.users.thisBusinessUnit ('this business unit'), the same fallback shape for the
      // opposite direction. Not byte-identical (different noun), so own key, own Thai.
      thisUser: 'this user',
      addUserToBuTitle: 'Add User to Business Unit',
      selectUserFromClusterDesc: 'Select a user from this cluster to add',
      searchClusterUsersPlaceholder: 'Search cluster users...',
      loadingClusterUsers: 'Loading cluster users...',
      allClusterUsersAdded: 'All cluster users are already in this business unit.',
      noUsersInCluster: 'No users in this cluster.',
      availableOfTotalClusterUsers: '{{available}} available of {{total}} cluster users',

      // --- Task 4: useBusinessUnitUsers.ts ---
      // Six CRUD toast strings. None clears even the below-bar 2-file threshold against a
      // byte-identical sibling: pages.users.buRemoved/buRemoveFailed/buAssigned/
      // buAssignFailed exist for the mirror-image action (removing/adding a BU on a user
      // record) but use different verbs ("assigned" vs "added") and omit the "from/to
      // business unit" phrase this hook's messages carry — not byte matches, so fresh keys.
      userRemovedFromBu: 'User removed from business unit',
      removeUserFailed: 'Failed to remove user',
      userRoleUpdated: 'User role updated successfully',
      updateUserFailed: 'Failed to update user',
      userAddedToBu: 'User added to business unit',
      addUserFailed: 'Failed to add user',

      // --- Task 4: ConfigurationSection.tsx ---
      configDescription: 'Key-value configuration entries',
      // Bare "Key"/"Label"/"Value" field labels, reused as-is for the read-only table's
      // column headers too (same word, same job, one key each). Composed with
      // common.field.required ('{{label}} *') for the two required edit-mode Labels, the
      // same way UserEdit.tsx/LicensePurchaseForm.tsx already compose that template.
      configKeyLabel: 'Key',
      configLabelField: 'Label',
      configDataTypeLabel: 'Data Type',
      configValueLabel: 'Value',
      configKeyPlaceholder: 'Config key',
      configLabelPlaceholder: 'Config label',
      configValuePlaceholder: 'Config value',
      configSelectType: 'Select type',
      // The six <option> datatype names are schema/programming-language type vocabulary, not
      // prose — the same register as common.option.fifo (an acronym left untranslated). Kept
      // identical in both languages for internal consistency of the one list (translating
      // "Number"/"Boolean" while leaving "Enum"/"JSON" as acronyms would split one dropdown's
      // options across two conventions).
      datatypeString: 'String',
      datatypeNumber: 'Number',
      datatypeBoolean: 'Boolean',
      datatypeDate: 'Date',
      datatypeEnum: 'Enum',
      datatypeJson: 'JSON',
      addConfigEntry: 'Add Config Entry',
      noConfigEntries: 'No configuration entries.',

      // --- Task 4: CalculationSettingsSection.tsx ---
      // Sentence case, and the field label drops the internal column name ("… ID"): the
      // control shows "THB - Thai baht", not an id. Every label in this page's document
      // grammar (Code, Alias, Max users, Long time format) is sentence case — the Title Case
      // here was the visible seam between that grammar and the older card sections.
      calculationSettingsTitle: 'Calculation settings',
      calculationSettingsDescription: 'Calculation method and currency configuration',
      loadingCurrencies: 'Loading currencies…',
      calculationMethodLabel: 'Calculation method',
      selectMethodOption: 'Select method',
      defaultCurrencyIdLabel: 'Default currency',
      selectCurrencyOption: 'Select currency',
      // The fallback text-input's placeholder (shown only when the currency catalog fetch
      // failed) — a lowercase "currency" in the source, NOT byte-identical to
      // defaultCurrencyIdLabel above ("Currency", Title Case), so it gets its own key rather
      // than reusing that one.
      defaultCurrencyIdPlaceholder: 'Default currency ID',
      symbolLabel: 'Symbol',
      decimalPlacesLabel: 'Decimal places',
      // Shared with DatabaseConnectionSection.tsx's own pool-name " (inactive)" suffix —
      // byte-identical leading-space suffix, same file group (this task), same meaning; one
      // key for both call sites rather than two copies.
      inactiveSuffix: ' (inactive)',

      // --- Task 4: DatabaseConnectionSection.tsx ---
      loadingPoolsText: 'Loading pools…',
      notSetOption: '— Not set —',
      // "Schema" is a database-technical term, same register as common.label.databasePool
      // ('Database Pool', left untranslated in Thai) — kept identical in both languages.
      // Byte-duplicates common.validation.schema ('Schema', line ~473) — that is
      // deliberate, not an oversight: same split as common.field.startDate /
      // common.validation.startDate above (see the comment there). This is the form LABEL
      // register (Title Case, used as a form label / column header); common.validation.schema
      // is the default field NAME substituted into a validation message when no `label` is
      // passed. Different job, same English word, kept as two keys rather than merged.
      schemaLabel: 'Schema',
      // Format-example placeholder, not prose — identical value in both languages, same
      // rationale as pages.clusterAdmin.emailPlaceholder ('name@example.com').
      schemaPlaceholder: 'cbr_prod',
      databaseConnectionTitle: 'Database Connection',
      databaseConnectionDescription: 'Shared database pool and schema',
      databasePoolPermissionRequired: 'Changing the database pool requires a platform-level permission.',

      // --- Task 4: NumberFormatsSection.tsx ---
      numberFormatsTitle: 'Number formats',
      numberFormatsDescription: 'Numeric display format configuration',
      perPageFormatLabel: 'Per page format',
      amountFormatLabel: 'Amount format',
      quantityFormatLabel: 'Quantity format',
      recipeFormatLabel: 'Recipe format',
      // Live preview beside each JSON blob (2026-08-31). `sample` is the number the format
      // is applied to, so the caption and the rendered value always agree.
      formatPreviewSample: '{{sample}} shows as',
      formatPreviewPerPage: 'Rows per page:',
      formatPreviewEmpty: 'Not set — the tenant default applies.',
      formatPreviewInvalidJson: "Not valid JSON — this won't apply.",
      formatPreviewInvalidOptions: "Valid JSON, but not a usable format — this won't apply.",
    },
    // ── Analytics (i18n phase-2 slice-5.5 fix wave 2) ──
    // The two pages that render <DateRangeFilter>. Neither had ANY English before this
    // wave — both were Thai-only — so unlike every earlier slice these English values are
    // NEW COPY, not byte-preserved literals, and no existing test asserts against them.
    // The Thai is each page's existing wording moved across unchanged. Where a shared key
    // already held the same English but a different Thai word (common.field.type is
    // 'ประเภท'; this page's column says 'ชนิด'), a page-local key preserves the page's own
    // word instead of silently rewording the Thai UI — flagged for the owner's read.
    reportTemplates: {
      subtitle: 'Manage report templates with dialog (XML) and content (.frx to XML)',
      addTemplate: 'Add Template',
      searchPlaceholder: 'Search report templates...',
      filtersDescription: 'Filter report templates by status',
      sourceTypeLabel: 'Source Type',
      templateTypeLabel: 'Template Type',
      // ป้ายของค่า enum ฝั่ง API — เดิม render ค่าดิบแล้วพึ่ง `capitalize` ของ CSS ทำให้
      // ตัวอักษรใหญ่มาจาก stylesheet ไม่ใช่จากข้อความ (จุดบอด "ป้ายที่โค้ดปั้นตอนรัน")
      // ผูกเป็น Record<union, TKey> ที่ call site ไม่ใช่ t(`...${v}`) เพราะชุดค่าปิดตายแล้ว
      sourceTypeView: 'View',
      sourceTypeFunction: 'Function',
      sourceTypeProcedure: 'Procedure',
      templateTypeForm: 'Form',
      templateTypeList: 'List',
      removeFilterAria: 'Remove {{label}} filter',
      columnTemplateType: 'Template Type',
      columnReportGroup: 'Report Group',
      columnStandard: 'Standard',
      standard: 'Standard',
      emptyTitle: 'No report templates yet',
      emptyDescription: 'Get started by creating your first report template.',
      loadingAria: 'Loading report templates',
      loadingText: 'Loading report templates...',
      loadFailed: 'Failed to load report templates: {{detail}}',
      deleteTitle: 'Delete Report Template',
      deleteDescription: 'Are you sure you want to delete this report template? This action cannot be undone.',
      // ── ReportTemplateEdit.tsx — หน้าเดียวกันของฟีเจอร์เดียวกัน จึงอยู่ namespace เดียวกัน ──
      notFoundTitle: 'Report template not found',
      notFoundDescription: "This report template doesn't exist, or it may have been deleted. Check the link, or pick one from the report template list.",
      backToList: 'Back to report templates',
      // เอกพจน์ ต่างจาก loadingAria/loadingText ของหน้ารายการซึ่งเป็นพหูพจน์
      loadingOneAria: 'Loading report template',
      newTitle: 'New Report Template',
      singularTitle: 'Report Template',
      newSubtitle: 'Create a new report template',
      editSubtitle: 'View and edit report template details',
      loadFailedOne: 'Failed to load report template: {{detail}}',
      saveFailed: 'Failed to save report template: {{detail}}',
      templateInfo: 'Template Info',
      selectTypePlaceholder: 'Select type…',
      namePlaceholder: 'Template name',
      descriptionPlaceholder: 'Template description',
      selectGroupPlaceholder: 'Select group…',
      reportGroupPlaceholder: 'e.g. inventory, procurement',
      defaultForGroup: 'Default for this report group',
      defaultNote: 'Only one template per report group can be the default. If another template in this group is already marked default, saving here will fail — unset it there first.',
      kind: 'Kind',
      groupDefault: 'Group Default',
      notDefault: 'Not default',
      buScope: 'Business Unit Scope',
      allow: 'Allow',
      deny: 'Deny',
      allowPlaceholderForm: 'All business units (form template)',
      allowPlaceholder: 'Type BU code + Enter (blank = all)',
      denyPlaceholder: 'Type BU code + Enter (blank = none)',
      dataSource: 'Data Source',
      sourceName: 'Source Name',
      sourceNamePlaceholderView: 'e.g. v_pr_summary',
      sourceNamePlaceholderFunction: 'e.g. fn_pr_report',
      sourceNamePlaceholderProcedure: 'e.g. sp_pr_report',
      browseInBu: 'Browse in BU:',
      probeBuPlaceholder: 'e.g. T03',
      load: 'Load',
      dbObjectsFailed: "Couldn't load DB objects from {{bu}}.",
      dbObjectsToastFailed: 'Failed to load DB objects from {{bu}}: {{detail}}',
      // ชื่อชนิดวัตถุในฐานข้อมูล แยกเอกพจน์/พหูพจน์เป็นคีย์ต่างหาก เพราะเดิมโค้ดปั้น 's'
      // ต่อท้ายค่า enum ตอนรัน (`${type}s`) ซึ่งไม่มีสตริงไหนให้สกัดเลย และภาษาไทยไม่เติม s
      objectView: 'view',
      objectFunction: 'function',
      objectProcedure: 'procedure',
      objectsView: 'views',
      objectsFunction: 'functions',
      objectsProcedure: 'procedures',
      noObjectsFound: 'No {{objects}} found in {{bu}}.',
      pickFromAria: 'Pick from available {{objects}} in {{bu}}',
      pickFromOption: 'Pick from {{count}} {{objects}} in {{bu}}',
      identifierNote: "Plain identifier only. No schema prefix, no quotes. Resolved against each tenant's schema at runtime.",
      sourceParams: 'Source Parameters',
      notUsedForViews: '(not used for views)',
      addParam: '+ Add Param',
      viewsNoParams: 'Views do not take parameters. Filters apply via WHERE clause.',
      noParamsYet: 'No parameters defined yet. Add one to bind a dialog filter to the function/procedure argument list.',
      paramFilterField: 'Filter Field (ReportFilters)',
      paramPgType: 'PG Type',
      paramNullable: 'Nullable',
      paramFilterAria: 'Parameter {{n}} filter field',
      paramTypeAria: 'Parameter {{n}} PG type',
      paramNullableAria: 'Parameter {{n}} nullable',
      removeParamNamedAria: 'Remove parameter "{{name}}"',
      removeParamAria: 'Remove parameter {{n}}',
      paramFilterPlaceholder: 'e.g. DateFrom',
      paramTypePlaceholder: 'date / uuid / text...',
      // ตัวพิมพ์เล็กตามที่ render อยู่จริงในตารางพารามิเตอร์ ไม่ใช่ Yes/No
      yes: 'yes',
      no: 'no',
      procedureNote: 'Procedure must accept these positional args plus an INOUT refcursor at the end (default name "rs"). Filters are applied inside the procedure. The executor will not add a WHERE clause.',
      builderKey: 'Builder Key (optional)',
      builderKeyPlaceholder: 'e.g. pr-summary',
      dialogXmlTab: 'Dialog XML',
      contentXmlTab: 'Content XML',
      previewTab: 'Preview',
      invalidAria: 'Invalid',
      createTemplate: 'Create Template',
      // ป้ายฟิลด์บังคับ ป้อนเข้า common.validation.requiredMessage
      fieldLabelReportGroup: 'Report group',
      fieldLabelTemplateType: 'Template type',
    },
    // ── slice 9b: SQL Workbench ──
    sqlWorkbench: {
      databaseObjects: 'Database Objects',
      title: 'SQL Workbench',
      subtitle: 'Run queries · create views, stored procedures and functions in a tenant database',
      // ConnectionBar
      readWrite: 'read / write',
      readOnly: 'read-only',
      noTenantSelected: 'No tenant selected',
      chooseBuHint: 'Choose the business unit you want to operate on',
      switchBuAria: 'Switch business unit',
      switchBu: 'Switch',
      chooseBu: 'Choose BU',
      // DbObjectTree
      treeSearchPlaceholder: 'Search tables, views, procedures...',
      loadingObjectsAria: 'Loading database objects',
      tables: 'Tables',
      views: 'Views',
      proceduresFunctions: 'Procedures / Functions',
      noMatches: 'No matches',
      noTables: 'No tables',
      noViews: 'No views',
      noProcedures: 'No procedures/functions',
      // ResultPanel
      resultError: 'Error',
      resultRunning: 'Running…',
      results: 'Results',
      // นับแถว/คอลัมน์ — เดิมปั้น 's' ต่อท้ายตอนรัน
      rowCount: '{{count}} row',
      rowCountPlural: '{{count}} rows',
      colCount: '{{count}} col',
      colCountPlural: '{{count}} cols',
      msSuffix: '{{ms}} ms',
      closeResults: 'Close results',
      runningQuery: 'Running query…',
      noRowsReturned: 'Query executed successfully. No rows returned.',
      rangeOfTotal: '{{from}}-{{to}} of {{total}}',
      // SqlEditor
      formatFailed: 'Failed to format SQL. Check for syntax errors.',
      run: 'Run',
      formatSqlTitle: 'Format SQL',
      runTitle: 'Run (Ctrl/⌘+Enter)',
      findTitle: 'Find (Ctrl/⌘+F)',
      format: 'Format',
      find: 'Find',
      clearEditorTitle: 'Clear editor',
      clear: 'Clear',
      // SqlWorkbench
      typeView: 'View',
      typeProcedure: 'Stored Procedure',
      typeFunction: 'Function',
      loadBuFailed: 'Failed to load business units',
      executeFailed: 'Failed to execute SQL',
      selectBuFirst: 'Select a business unit first',
      invalidSql: 'Invalid SQL',
      loadDefinitionFailed: 'Failed to load definition',
      enterSql: 'Please enter SQL',
      enterViewName: 'Please enter a name for the view',
      saveFailed: 'Failed to save',
      dropFailed: 'Failed to drop',
      savedToast: '{{type}} "{{name}}" saved to schema "{{schema}}"',
      unnamedObject: '(unnamed)',
      droppedToast: 'Dropped {{type}}: {{name}}',
      drop: 'Drop',
      save: 'Save',
      destructiveTitle: 'Run destructive SQL?',
      destructiveDescription: 'This runs {{keywords}} on the {{bu}} database and cannot be undone.',
      destructiveUnguarded: ' A DELETE/UPDATE has no WHERE clause and will affect ALL rows.',
      tenantFallback: 'tenant',
      runAnyway: 'Run anyway',
      dropTitle: 'Drop {{type}}?',
      dropDescription: 'This permanently drops {{type}} "{{qualified}}" from the {{bu}} database. This cannot be undone.',
      selectBuToBegin: 'Select a business unit to begin.',
      objectName: 'Object Name',
      objectNamePlaceholder: 'e.g. v_pr_summary',
      typeLabel: 'Type',
      editingPrefix: 'Editing:',
      sqlEditor: 'SQL Editor',
      // แถบเครื่องมือของตัวแก้ไข — เดิมเป็นแถบสถานะแถวล่างที่ไม่ได้แปล
      metaLine: '{{count}} line',
      metaLines: '{{count}} lines',
      metaStatement: '{{count}} statement',
      metaStatements: '{{count}} statements',
      nothingToRun: 'Nothing to run — the editor is empty',
      resultsIdle: 'Run a query to see results here',
      resizeResults: 'Resize the result pane',
      resizeResultsHint: 'Drag to resize · double-click to reset · ↑/↓ to nudge',
    },
    // ── slice 9c: Email Settings ──
    // เช่นเดียวกับ platformConfig — หน้านี้เป็นไทยล้วนมาก่อน อังกฤษเป็นคำใหม่ทั้งหมด
    emailSettings: {
      senderProfiles: 'Sender profiles',
      smtpPassword: 'SMTP password',
      smtpHostRequired: 'SMTP host is required',
      title: 'Email Settings',
      subtitle: 'Platform-level sender profiles — the from-address and SMTP values the system uses to send mail',
      addProfile: 'Add profile',
      newProfileLabel: 'New profile',
      newProfileDescription: 'Name it, fill in the SMTP values and save; then pick it in the mapping table above',
      defaultProfileNote: 'Email sender profile',
      discardTitle: 'Discard unsaved changes?',
      discardDescription: 'You are editing another profile. Continuing will lose the unsaved changes.',
      discardAction: 'Discard changes',
      // PasswordField
      passwordSet: 'A password is set',
      passwordNotSet: 'No password set',
      changePassword: 'Change password',
      setPassword: 'Set password',
      noAuthNote: 'This profile sends mail without authenticating to the SMTP server',
      smtpPasswordAria: 'SMTP password',
      keepPasswordHint: 'Leave blank to keep the current password',
      cannotRemovePasswordHint: 'This page cannot remove a password from an existing profile — to move to an unauthenticated relay, delete the setting and create it again',
      // TestEmailDialog
      reasonSmtpError: "Couldn't connect over SMTP — check host, port, TLS and password",
      reasonDecryptFailed: "Couldn't decrypt the password — the server's SECRET_ENCRYPTION_KEY does not match; ask the platform team to check",
      reasonLookupFailed: "Couldn't read the profile from the database",
      reasonNoConfig: 'No SMTP settings found for this profile',
      yourEmail: 'your email',
      testSentToast: 'Sent to {{target}} — check the inbox and spam folder',
      testFailedToast: "Couldn't send the test email",
      testEmailTitle: 'Send a test email',
      testEmailDescription: 'Send a test message through the saved profile to confirm the SMTP values actually work',
      recipient: 'Recipient',
      recipientPlaceholder: 'Blank = send to your own email',
      sendTestEmail: 'Send test email',
      // EmailRoutingCard
      routingTitle: 'Email routing',
      routingDescription: 'Which flow sends through which sender profile',
      editRouting: 'Edit routing',
      defaultRequired: 'A default profile must be chosen',
      routingSavedToast: 'Email routing saved',
      chooseProfile: 'Choose a profile',
      useDefault: 'Use the default',
      defaultAppliesNote: 'Applies to every flow not chosen explicitly, including flows added later',
      // EMAIL_FLOWS descriptions (constants/emailFlows.ts)
      flowRegisterDescription: 'The verify-email link before an account is created, and the "account already exists" email',
      flowVerifyEmailDescription: 'The verify-email link for accounts created before the order was reversed, and the admin-created path',
      flowInvitationDescription: 'Cluster invitations, and the email sent when an account is created from an invitation',
      flowForgotPasswordDescription: 'The password-reset link',
      flowNotificationDescription: 'Internal notification email such as reports and business-unit alerts',
      // EmailSettingCard
      profileConfiguredToast: 'Profile {{label}} configured',
      profileSavedToast: 'Profile {{label}} saved',
      profileUnsetToast: 'Profile {{label}} cleared',
      notConfigured: 'Not configured',
      noProfileNote: 'No profile for this flow yet — the system falls back to the SMTP values from the server environment',
      profileName: 'Profile name',
      profileNamePlaceholder: 'No-reply',
      fromEmail: 'From email',
      fromName: 'From name',
      smtpHost: 'SMTP host',
      smtpPort: 'SMTP port',
      smtpUsername: 'SMTP username',
      implicitTls: 'Implicit TLS',
      implicitTlsHint: 'Turn on for implicit TLS (usually port 465) — port 587 normally uses STARTTLS, so leave it off',
      notePlaceholder: 'Who owns this mailbox / which provider',
      saveBeforeTest: 'Save before you can test',
      configure: 'Configure',
      unset: 'Clear setting',
      unsetTitle: 'Clear profile {{label}}',
      unsetDescription: 'After this the system falls back to the SMTP values from the server environment. If those are not set, email for this flow stops sending, and every password must be re-entered if this profile is created again.',
    },
    // ── slice 10a: Tenant Import + Tenant Migration ──
    tenantImport: {
      newReferenceDataWillBeCreated: 'New reference data will be created',
      columnVerdict: 'Verdict',
      notApplied: 'Not applied',
      workbookUnusableValues: 'The workbook has values this step cannot use',
      // StepRail
      importStepAria: 'Import step',
      // WorkbookDropzone
      onlyXlsx: 'Only .xlsx workbooks are supported',
      uploadAria: 'Upload Preconfig workbook',
      dropHere: 'Drop Preconfig.xlsx here',
      dropHint: 'or click to browse — .xlsx only, max 10 MB',
      // FileCheckPanel
      statusReady: 'Ready',
      statusSheetMissing: 'Sheet missing',
      statusColumnsMissing: 'Columns missing',
      fileSummary: '{{sheets}} sheets found · {{ready}} of {{total}} steps ready',
      chooseAnotherFile: 'Choose another file',
      continueAction: 'Continue',
      columnStep: 'Step',
      columnSheet: 'Sheet',
      columnRows: 'Rows',
      columnMissing: 'Missing',
      // TenantImportWizard
      title: 'Tenant Data Import',
      subtitle: "Load Preconfig.xlsx master data into a business unit's database",
      selectBu: 'Select business unit',
      buPrefix: 'BU: {{code}}',
      pickBuHint: 'Pick the business unit that will receive the data.',
      catalogError: 'The import step catalog could not be loaded ({{detail}}). The wizard cannot proceed until this is fixed — this usually means the platform permission for Preconfig imports has not been granted yet.',
      checkingWorkbook: 'Checking workbook…',
      runSummary: 'Run summary',
      noStepImported: 'No step has been imported yet.',
      stepCounts: '+{{inserted}} · ~{{updated}} · skip {{skipped}} · fail {{failed}}',
      rerun: 'Re-run',
      anotherStepImporting: 'Another step is still importing — wait for it to finish before starting this one.',
      // StepPanel
      preview: 'Preview',
      importing: 'Importing…',
      importAction: 'Import',
      onDuplicate: 'On duplicate',
      dupSkip: 'Skip duplicates',
      dupUpsert: 'Update duplicates',
      dupError: 'Report duplicates as errors',
      softDeleteFirst: 'Soft-delete existing rows first',
      runPreviewFirst: '(run a preview first)',
      noRowsOfVerdict: 'No {{verdicts}} rows in this preview.',
      noPreviewRows: 'No preview rows were returned for the {{count}} row in this sheet.',
      noPreviewRowsPlural: 'No preview rows were returned for the {{count}} rows in this sheet.',
      noDataRows: 'This sheet has no data rows.',
      importedSummary: 'Imported {{inserted}} · updated {{updated}} · skipped {{skipped}} · failed {{failed}}',
      createdLookups: ' · created {{count}} lookups',
      // Soft-delete dialog — เนื้อความสลับกับ <code>/<strong> จึงแยกเป็นท่อน ๆ
      softDeleteTitle: 'Soft-delete existing rows?',
      softDeleteNone1: 'There are no active rows in',
      softDeleteNone2: 'for',
      softDeleteNone3: 'to soft-delete right now. Type the BU code to confirm.',
      softDeleteSome1: 'This soft-deletes',
      softDeleteSome2: 'existing rows in',
      softDeleteSome3: 'for',
      softDeleteSome4: 'by setting',
      softDeleteRelated1: 'It also soft-deletes',
      softDeleteRelated2: 'dependent rows in related tables.',
      softDeleteConfirmHint: 'Existing documents that reference them keep working. Type the BU code to confirm.',
      softDeleteUnknown1: 'This soft-deletes every currently-active row in',
      softDeleteUnknown2: 'for',
      softDeleteUnknown3: 'by setting',
      buCodeLabel: 'BU code',
      confirmAction: 'Confirm',
      // CompanyProfilePanel
      cpTarget: '{{sheet}} → business unit record ({{code}})',
      cpRefresh: 'Refresh',
      cpApplying: 'Applying…',
      cpApplyToBu: 'Apply to BU',
      cpLoading: 'Loading Company Profile…',
      cpApplied: 'Company Profile applied to the business unit.',
      cpNoMappedFields: 'No mapped fields were returned for this sheet.',
      cpChanged: '{{count}} changed',
      cpSame: '{{count}} same',
      cpUnresolved: '{{count}} unresolved',
      cpNothingToApply: 'Every field already matches — nothing to apply.',
      cpColumnField: 'Field',
      cpColumnCurrent: 'Current (BU)',
      cpColumnWorkbook: 'Workbook',
      cpBuCode: 'BU Code',
      cpDefaultCurrency: 'Default Currency',
      cpMismatchReadOnly: 'Mismatch — read-only',
      cpMatchReadOnly: 'Match — read-only',
      cpResolvingTitle: 'Reading the tenant database to resolve this currency code.',
      cpResolving: 'Resolving…',
      cpUnreachableTitle: 'The tenant database could not be reached, so this currency code cannot be resolved to an id.',
      cpCannotResolve: 'Cannot resolve',
      cpNotFoundTitle: 'Run the Currency step first, then press Refresh.',
      cpNotFound: 'Not found — run Currency first',
      cpStatusChanged: 'Changed',
      cpStatusSame: 'Same',
      // แบนเนอร์เตือนรหัส BU ไม่ตรง — สลับกับ <strong> จึงแยกท่อน
      cpMismatch1: "The workbook's",
      cpMismatch2: 'is',
      cpMismatch3: ", not the selected business unit's",
      cpMismatch4: '. This usually means the wrong file or the wrong business unit was selected. Applying will',
      cpMismatchNot: 'not',
      cpMismatch5: 'rename anything — the BU code is never written back — but every other field below would still be written onto',
      cpMismatch6: ', not the property the workbook describes. Double-check before continuing.',
    },
    platformMigration: {
      title: 'Platform Database Migrations',
      subtitle: 'Prisma migrations for the shared platform database every cluster reads',
      refresh: 'Check status',
      statusTitle: 'Status',
      upToDate: 'Up to date',
      pendingCount: '{{count}} pending',
      statusUnknown: 'Unknown',
      lastChecked: 'Checked at {{time}}',
      rawOutput: 'Raw Prisma output',
      deployTitle: 'Apply pending migrations',
      deployDescription: 'Runs prisma migrate deploy against the platform database. Idempotent — with nothing pending it does nothing.',
      deployButton: 'Apply migrations',
      deployConfirmTitle: 'Apply platform migrations?',
      deployConfirmDescription: 'This runs every pending migration against the shared platform database used by all clusters. It cannot be interrupted once started.',
      deploySuccess: 'Applied {{count}} migration(s)',
      deployNothing: 'No pending migrations — nothing changed',
      resolveTitle: 'Resolve a stuck migration (advanced)',
      resolveDescription: 'Marks a row in _prisma_migrations as applied or rolled back WITHOUT running its SQL. Use it when a failed migration blocks every later one. Choosing wrong records a migration that never ran as if it had.',
      migrationNameLabel: 'Migration name',
      migrationNamePlaceholder: '20260612000000_add_doc_version',
      migrationNameInvalid: 'Invalid format — expected a migration folder name, e.g. 20260612000000_add_doc_version',
      actionLabel: 'Mark as',
      actionApplied: 'Applied',
      actionRolledBack: 'Rolled back',
      resolveButton: 'Resolve',
      resolveConfirmTitle: 'Resolve this migration?',
      resolveConfirmDescription: 'This marks {{name}} as "{{action}}" in the platform database. It cannot be undone from here.',
      resolveSuccess: 'Resolved {{name}}',
      disabledOrSuperAdmin: 'The platform migration API is disabled, or you are not a super-admin.',
      alreadyRunning: 'A platform migration is already running. Try again shortly.',
    },
    tenantMigration: {
      startingDeploy: 'Starting deploy…',
      disabledOrSuperAdmin: 'Migrations are disabled or require super-admin.',
      alreadyRunning: 'A migration is already running. Try again shortly.',
      seedDisabledOrSuperAdmin: 'Seeding is disabled or requires super-admin.',
      deployingAll: 'Deploying all tenants…',
      // TenantMigrationManagement
      title: 'Tenant migrations',
      subtitle: 'Check which tenant databases are behind on schema migrations, and roll them out.',
      superAdminRequired: 'Super-admin required.',
      alreadyUpToDate: 'Already up to date.',
      upToDate: 'up to date',
      deployCompleted: 'Deploy completed.',
      loadBuFailed: 'Failed to load business units: {{detail}}',
      columnPending: 'Pending',
      columnLastChecked: 'Last Checked',
      statusNotChecked: 'Not checked',
      checkAll: 'Check all',
      checking: 'Checking...',
      deployAll: 'Deploy all',
      deployBehind: 'Deploy {{count}} behind',
      nothingToDeploy: 'Every tenant is in sync — nothing to deploy.',
      deployUncheckedHint: 'Not checked yet. Run Check all first to see what this would touch.',
      searchPlaceholder: 'Search business units...',
      emptyTitle: 'No business units',
      emptyDescription: 'Create a business unit first to manage its tenant migrations.',
      goToBusinessUnits: 'Go to Business Units',
      applyTitle: 'Apply tenant migrations',
      applyDescription: 'Apply {{count}} pending migration(s) to {{name}} ({{code}})? This applies schema changes to the tenant database and cannot be undone.',
      applyAction: 'Apply migrations',
      deployAllTitle: 'Deploy migrations to all BUs',
      deployAllDescription: 'Apply all pending migrations to every business unit ({{count}} total)? This applies schema changes to every tenant database and cannot be undone.',
      check: 'Check',
      apply: 'Apply',
      tenantsInSync: 'tenants in sync',
      syncChartAria: '{{synced}} in sync, {{behind}} behind, {{errored}} errored',
      notCheckedYetAria: 'Not checked yet',
      inSync: 'In sync',
      behind: 'Behind',
      errored: 'Error',
      pendingMigration: 'pending migration',
      pendingMigrations: 'pending migrations',
      // ประโยคเดียวที่มี <span> เน้นชื่อปุ่มตรงกลาง — แยกสามท่อนไว้รักษาโครงสร้าง
      notCheckedYet1: 'Not checked yet. Run',
      notCheckedYetAction: 'Check all',
      notCheckedYet2: 'to see which tenants are behind.',
    },
    // ── slice 9c: Platform Config ──
    // หน้านี้และการ์ดทั้งหมดเป็น "ไทยล้วน" มาก่อน — ผู้ใช้อังกฤษอ่านไทยมาตลอด
    // อังกฤษทุกบรรทัดในบล็อกนี้จึงเป็นคำที่เขียนขึ้นใหม่ ไม่ใช่การรักษา byte เดิม
    // ส่วนภาษาไทยคือถ้อยคำเดิมย้ายมาทั้งดุ้น ไม่ได้เรียบเรียงใหม่
    platformConfig: {
      title: 'Platform Config',
      subtitle: 'Platform-level settings that can be changed without a redeploy',
      sectionEmailLinks: 'Email links & lifetimes',
      sectionInvitationLimits: 'Invitation limits',
      sectionNotifications: 'Notifications',
      sectionLicensing: 'Licensing',
      sectionPlatformMigration: 'Platform Database',
      migrationTitle: 'Platform migration API',
      migrationDesc1: 'Opens or closes the whole',
      migrationDesc2: ' route. It used to be a backend-gateway env var, and only super-admins may change it — not holders of platform_config.manage.',
      migrationApi: 'API status',
      migrationApiOn: 'Enabled',
      migrationApiOff: 'Disabled',
      migrationCheckbox: 'Enable the platform migration API',
      migrationHintOffStrong: 'Disabled:',
      migrationHintOff: 'every request to these routes gets a 403, super-admins included.',
      migrationHintOnStrong: 'Enabled:',
      migrationHintOn: 'a super-admin (or CI holding the deploy token) can run prisma migrate deploy against the database every cluster shares, from the browser.',
      migrationNoteCache: 'The backend caches this for 60 seconds, so a change takes effect within a minute rather than immediately.',
      migrationApiEnabledToast: 'Platform migration API enabled',
      migrationApiDisabledToast: 'Platform migration API disabled',
      migrationConfirmTitle: 'Enable the platform migration API?',
      migrationConfirmDescription: 'Super-admins will be able to run migrations against the database every cluster shares from the browser, with no server access required. You can turn it back off at any time.',
      migrationConfirmAction: 'Enable',
      emailVerificationTitle: 'Email Verification',
      emailVerificationDescription: 'The verification link for the legacy path (accounts created before the order was reversed, and those an admin creates)',
      passwordResetTitle: 'Password Reset',
      passwordResetDescription: 'The password-reset link and how long it stays valid',
      // การตรวจความถูกต้องของฟอร์ม config (ใช้ร่วมกันหลายการ์ด)
      baseUrlRequired: 'Base URL is required',
      urlInvalid: 'Invalid URL format (needs a scheme, e.g. https://)',
      hoursRequired: 'A number of hours is required',
      hoursRange: 'Must be a whole number from 1 to 720',
      daysRequired: 'A number of days is required',
      daysRange: 'Must be a whole number from 1 to 365',
      savedToast: '{{title}} settings saved',
      savedInvitationToast: 'Invitation settings saved',
      savedSignupToast: 'Sign-up settings saved',
      baseUrl: 'Base URL',
      expiryHours: 'Expiry (hours)',
      expiryDays: 'Expiry (days)',
      hoursValue: '{{count}} hours',
      daysValue: '{{count}} days',
      // คำอธิบายใต้ Base URL — แยกสามท่อนเพราะมี <code> คั่นกลางสองตัว
      // ยุบเป็นคีย์เดียวไม่ได้ ไม่งั้น <code> จะหายไปพร้อม font-mono ของมัน
      baseUrlHint1: 'The destination page in the inventory app that the link in the email points to — not this console. The system appends',
      baseUrlHint2: 'for you, so enter only the page URL, e.g.',
      invitationTitle: 'Invitation',
      invitationDescription: 'The destination link and lifetime of a cluster invitation',
      signupTitle: 'Sign-up',
      signupDescription: 'The destination link of the verify-email message sent before an account is created',
      verifyUrl: 'Verify URL',
      verifyUrlRequired: 'A Verify URL is required',
      invitationUrlPlaceholder: 'https://inventory.carmen.io/invitations',
      signupUrlPlaceholder: 'https://inventory.carmen.io/register/verify',
      // สองย่อหน้านี้เป็นอังกฤษมาแต่เดิม (ไม่เหมือนการ์ดอื่นในหน้านี้) แยกเป็นสองท่อน
      // เพราะมี <code> คั่นกลาง — ท่อนแรกยาว ท่อนสองต่อท้ายก่อน <code> ตัวที่สอง
      invitationHint1: 'Where the invitation link in the email points. This is the Carmen inventory app, not this console — the recipient accepts the invitation there, and can create their account from the same link without signing up first. The system appends',
      invitationHint2: 'itself, so enter the page URL only, e.g.',
      signupHint1: 'Where the link in the sign-up verification email points. This is the Carmen inventory app, not this console — the recipient sets their password there and the account is created only at that point. The system appends',
      signupHint2: 'itself, so enter the page URL only, e.g.',
      // Rate limits card
      countRequired: 'A number is required',
      countMin1: 'Must be a whole number of 1 or more',
      savedLimitsToast: 'Invitation limits saved',
      rateLimitsTitle: 'Rate limits',
      rateLimitsDescription: 'How many invitations may be issued in a given window',
      perAdminPerHour: 'Per admin / hour',
      perClusterPerDay: 'Per cluster / day',
      invitationsValue: '{{count}} invitations',
      // สองย่อหน้าคำเตือน — มี <strong> คั่นกลาง จึงแยกท่อน
      limitsNote1: 'The defaults are deliberately high — opening a new hotel and inviting 30–50 staff at once is normal. These caps guard against abuse,',
      limitsNoteStrong1: 'not a security boundary',
      limitsNote2: ', so do not lower them close to real usage.',
      limitsNote3: 'The counter lives in each process\u2019s memory —',
      limitsNoteStrong2: 'the effective cap multiplies by the number of instances',
      limitsNote4: 'running. Setting 100 across two instances means up to 200 in practice.',
      // Notification email card
      tooLong64: 'Longer than 64 characters',
      invalidEmails: 'Invalid email: {{list}}',
      savedNotificationToast: 'Notification email settings saved',
      notificationTitle: 'Notification Email',
      notificationDescription: 'Recipients of internal notification email (reports / business-unit alerts)',
      sending: 'Sending',
      sendInternalEmail: 'Send internal notification email',
      on: 'On',
      off: 'Off',
      sendingHint1: 'Off = no internal notification email is sent at all (formerly the',
      sendingHint2: 'env var) · Does not affect system email such as sign-up or password-reset links, which always send.',
      recipients: 'Recipients',
      recipientsPlaceholder: 'ops@example.com, finance@example.com',
      recipientsHint: 'Separate several addresses with commas. Leave blank so each notification resolves its own recipients from the target user\u2019s email.',
      cc: 'CC',
      ccPlaceholder: 'audit@example.com',
      subjectPrefix: 'Subject prefix',
      subjectPrefixHint: 'Text prepended to the email subject; blank means nothing is prepended · SMTP values (host / user / password) do not live here — set them on the Email Setting page.',
      // License Enforcement card — ทุกย่อหน้ามี <code>/<strong> คั่น จึงแยกเป็นท่อน ๆ
      enforcementEnabledToast: 'License enforcement is on — effective within 60 seconds',
      enforcementDisabledToast: 'License enforcement is off (shadow mode) — effective within 60 seconds',
      expiryThresholdsTitle: 'Expiring-soon thresholds',
      expiryThresholdsDescription:
        'How many days before a licence expires the "expiring soon" badge and the summary counter start.',
      subscriptionDays: 'Subscription licences',
      buQuotaDays: 'BU-quota licences',
      seatDays: 'BU seat licences',
      savedThresholdsToast: 'Expiring-soon thresholds saved',
      thresholdsNote1:
        'These are display thresholds, not enforcement ones. Raising them makes warnings appear earlier; it never grants or revokes access.',
      licenseTitle: 'License Enforcement',
      licenseDesc1: 'The single switch deciding whether licensing is actually enforced or merely logged (shadow mode) · Editing needs',
      licenseDesc2: 'on top of',
      licenseDesc3: '.',
      enforcement: 'Enforcement',
      enforced: 'Enforced',
      shadowMode: 'shadow mode',
      enforceCheckbox: 'Enforce licences for real (off = log only, nobody is blocked)',
      licenseNote1Strong: 'Off (default)',
      licenseNote1: '= permissions are checked as usual but nobody is refused; it is written as a',
      licenseNote2: 'log for later audit ·',
      licenseNote2Strong: 'On',
      licenseNote3: '= a business unit with no subscription covering that feature gets',
      licenseNote4: '. An expired subscription can still read but not write',
      licenseNote5: ', and inviting users beyond the seat cap gets',
      licenseNote6: 'Effective within 60 seconds, no redeploy needed, and reversible the same way · Covers only the business-unit app routes (',
      licenseNote7: '); this admin console is out of scope.',
      confirmEnableTitle: 'Turn on license enforcement?',
      confirmEnableDescription: 'Every business unit without a subscription covering the features it is using will be refused immediately, within 60 seconds, and inviting users beyond the seat cap will no longer be possible · Make sure first that every business unit has an active subscription holding all its features (see the Licenses page) · Reversible instantly by clearing the checkbox.',
      confirmEnableAction: 'Turn on enforcement',
    },
    // ── slice 9b: Database Pools ──
    databasePools: {
      filterDescription: 'Filter database pools by status',
      loading: 'Loading database pools...',
      title: 'Database Pools',
      subtitle: 'Manage shared database connection profiles',
      addPool: 'Add Pool',
      searchPlaceholder: 'Search database pools...',
      loadFailed: 'Failed to load database pools: {{detail}}',
      // The list collapses host/port/database/username into one address; these four stay
      // because the CSV still exports them as separate columns.
      columnHost: 'Host',
      columnPort: 'Port',
      columnDatabase: 'Database',
      columnNote: 'Note',
      columnConnection: 'Connection',
      copyDsn: 'Copy connection string',
      dsnCopied: 'Connection string copied',
      dsnCopyFailed: 'Could not copy. Select the address and copy it manually.',
      actionsAria: 'Actions',
      emptyTitle: 'No database pools yet',
      emptyDescription: 'Get started by creating your first shared database connection profile.',
      loadingAria: 'Loading database pools',
      deleteTitle: 'Delete Database Pool',
      // Names the 409 DATABASE_POOL_IN_USE rule up front. It used to surface only after the
      // user pressed Delete, which reads as a failure rather than as the rule it is.
      deleteDescription: 'Delete this database pool? This cannot be undone. A pool that any business unit still points at cannot be deleted — the attempt will name them.',
      // ── DatabasePoolEdit ──
      loadFailedOne: 'Failed to load database pool: {{detail}}',
      loadingOneAria: 'Loading database pool',
      singularTitle: 'Database Pool',
      notFoundTitle: 'Database pool not found',
      notFoundDescription: "This database pool doesn't exist, or it may have been deleted. Check the link, or pick one from the list.",
      portPlaceholder: '5432',
      backToList: 'Back to database pools',
      newTitle: 'New Database Pool',
      newSubtitle: 'Create a shared database connection profile',
      namePlaceholder: 'tenant-primary',
      descriptionPlaceholder: 'Optional description',
      hostPlaceholder: 'tenant-db.internal',
      databasePlaceholder: 'carmen_tenant',
      usernamePlaceholder: 'app_user',
      passwordLabel: 'Password',
      passwordPlaceholder: 'Enter a password',
      hidePassword: 'Hide password',
      revealPassword: 'Reveal password',
      passwordKeepHint: 'Leave blank to keep the current password.',
      passwordStoredHidden: 'Stored, hidden',
      notePlaceholder: 'Optional note',
      portInvalid: 'Port must be a number between 1 and 65535',
      hostRequired: 'Host is required',
      databaseRequired: 'Database is required',
      usernameRequired: 'Username is required',
      passwordRequired: 'Password is required',
      createdToast: 'Database pool created',
      savedToast: 'Changes saved',
      createPool: 'Create Pool',
    },
    // ── slice 9a: Super Admins ──
    superAdmins: {
      title: 'Super Admins',
      subtitle: 'Platform users who bypass all permission checks',
      searchPlaceholder: 'Search super admins...',
      addSuperAdmin: 'Add Super Admin',
      loadFailed: 'Failed to load super admins',
      addSuccess: 'Super admin added successfully',
      addFailed: 'Failed to add super admin',
      removeSuccess: 'Super admin removed successfully',
      removeFailed: 'Failed to remove super admin',
      columnUser: 'User',
      columnUserId: 'User ID',
      columnAdded: 'Added',
      emptyTitle: 'No super admins',
      emptyDescription: 'No platform users have super-admin privileges yet.',
      loadingAria: 'Loading super admins',
      loadingText: 'Loading super admins...',
      addDialogDescription: 'Grant a platform user full super-admin privileges (bypasses all permission checks).',
      alreadySuperAdmin: 'Already super admin',
      pickerPlaceholder: 'Search users by username or email',
      pickerAria: 'Select user to add as super admin',
      removeTitle: 'Remove Super Admin',
      removeDescription: "Are you sure you want to remove this user's super-admin privileges? They will no longer bypass permission checks.",
      grantedVerb: 'Granted',
      standingCountOne: 'One person on this platform bypasses every permission check',
      standingCountOther: '{{count}} people on this platform bypass every permission check',
      selfBadge: 'You',
      cannotRemoveSelf: 'You cannot revoke your own privileges',
      removeAria: 'Remove super admin {{name}}',
      rosterAria: 'Super admin roster',
    },
    // ── slice 9a: User Platform ──
    userPlatform: {
      filterDescription: 'Filter holders by role, scope and status',
      // roleChips.tsx — ป้ายขอบเขต 'Platform' ใช้ทั้งเป็นค่าที่แสดงและเป็นคีย์เรียงลำดับ
      // ตัวเรียงเทียบกับ 'Platform' ตรง ๆ จึงต้องเทียบกับค่าที่แปลแล้วด้วย ไม่ใช่ literal
      scopePlatform: 'Platform',
      // ── UserPlatformManagement ──
      title: 'User Platform',
      subtitle: 'Users holding platform roles',
      searchPlaceholder: 'Search users...',
      loadFailed: 'Failed to load platform users',
      accessRevoked: 'Access revoked',
      revokeFailed: 'Could not revoke: {{roles}}',
      columnUser: 'User',
      columnRolesScope: 'Roles & scope',
      columnGranted: 'Granted',
      grantedBy: 'by {{name}}',
      grantedByUnknown: 'by —',
      csvRole: 'Role',
      csvScope: 'Scope',
      csvGrantedAt: 'Granted at',
      csvGrantedBy: 'Granted by',
      manageRoles: 'Manage roles',
      revokeAllAccess: 'Revoke all access',
      roleFilterLabel: 'Role',
      anyScope: 'Any scope',
      emptyTitle: 'No one holds platform roles yet',
      emptyDescription: 'Grant access to give someone a platform role.',
      loadingAria: 'Loading platform users',
      revokeAllTitle: 'Revoke all platform access',
      revokeAllConfirm: 'Remove all {{count}} role assignment from {{name}}? They will no longer appear in this registry.',
      revokeAllConfirmPlural: 'Remove all {{count}} role assignments from {{name}}? They will no longer appear in this registry.',
      revokeAll: 'Revoke all',
      // ── UserPlatformEdit ──
      editSubtitle: 'Manage roles and scope',
      loadUserFailed: 'Failed to load user: {{detail}}',
      loadingRolesAria: 'Loading user roles',
      rolesAndScope: 'Roles & Scope',
      rolesAndScopeDescription: 'Platform roles assigned to this user',
      addRole: 'Add Role',
      noRolesAssigned: 'No roles assigned.',
      removeRoleAria: 'Remove {{name}}',
      roleFieldLabel: 'Role *',
      selectRole: 'Select role…',
      roleRequired: 'Role is required',
      clusterFieldLabel: 'Cluster *',
      clusterRequired: 'Cluster is required',
      scopeSpecificCluster: 'Specific cluster',
      adding: 'Adding…',
      roleAssigned: 'Role assigned',
      roleRemoved: 'Role removed',
      removeRoleTitle: 'Remove role',
      removeRoleConfirm: 'Are you sure you want to remove the role "{{role}}" from this user?',
      removeRoleLastSuffix: ' This is their last platform role — they will no longer appear in the User Platform registry.',
      // PlatformAccessSummary
      summaryStale: "Couldn't load the registry summary.",
      holder: 'holder',
      holders: 'holders',
      scopeBreakdownUnavailable: "Scope breakdown isn't available yet.",
      registrySummaryUnavailable: "Registry summary isn't available yet.",
      platformWide: 'Platform-wide',
      clusterScoped: 'Cluster-scoped',
      assignments: 'Assignments',
      inactiveHoldersWarning: '{{count}} inactive holder still hold access',
      inactiveHoldersWarningPlural: '{{count}} inactive holders still hold access',
      // GrantAccessDialog
      grantTitle: 'Grant platform access',
      grantDescription: 'Assign platform roles to a user. Every role in this request gets the same scope.',
      userLabel: 'User',
      userPickerAria: 'User to grant access to',
      rolesLabel: 'Roles',
      noPlatformRoles: 'No platform roles available.',
      alreadyGranted: 'Already granted',
      scopeLabel: 'Scope',
      scopeCluster: 'A specific cluster',
      clusterLabel: 'Cluster',
      selectCluster: 'Select cluster…',
      selectUserError: 'Select a user',
      selectRoleError: 'Select at least one role',
      selectClusterError: 'Select a cluster',
      accessGranted: 'Access granted',
      granting: 'Granting…',
      grantAccess: 'Grant access',
    },
    // ── slice 8: Platform Roles + Permission Catalog ──
    roles: {
      emptyPermissions: 'No permissions granted.',
      title: 'Platform Roles',
      subtitle: 'Manage platform roles and their permissions',
      addRole: 'Add Role',
      searchPlaceholder: 'Search roles...',
      filtersDescription: 'Filter roles by status',
      removeFilterAria: 'Remove {{label}} filter',
      permissionCatalog: 'Permission Catalog',
      columnPermissions: 'Permissions',
      emptyTitle: 'No roles yet',
      emptyDescription: 'Get started by creating your first role to manage platform permissions.',
      loadingAria: 'Loading roles',
      loadingText: 'Loading roles...',
      loadFailed: 'Failed to load roles: {{detail}}',
      deleteTitle: 'Delete Role',
      deleteDescription: 'Are you sure you want to delete this role? This action cannot be undone.',
      summaryStale: "Couldn't load the roles summary.",
      // RoleIdentityHero.permissionSummary — เดิมปั้นพหูพจน์ตอนรันจากสองตัวเลข
      fullAccessPermissions: 'Full access to every permission',
      noPermissionsYet: 'No permissions granted yet',
      permissionSpread: '{{permissions}} permission across {{resources}} resource',
      permissionSpreadPP: '{{permissions}} permissions across {{resources}} resources',
      permissionSpreadPS: '{{permissions}} permissions across {{resources}} resource',
      permissionSpreadSP: '{{permissions}} permission across {{resources}} resources',
      // PermissionCatalog
      catalogSubtitle: 'Read-only reference of all platform permissions',
      catalogLoadFailed: 'Failed to load permissions',
      catalogEmptyTitle: 'No permissions',
      catalogEmptyDescription: 'No platform permissions are defined in the catalog yet.',
      unnamedRole: '(unnamed role)',
      // RolesAccessSummary
      rolesLower: 'roles',
      broadestRoles: 'Broadest roles',
      noRolesYet: 'No roles yet.',
      activeCount: '{{count}} active',
      inactiveCount: '{{count}} inactive',
      roleBarAria: '{{name}}: {{count}} permission',
      roleBarAriaPlural: '{{name}}: {{count}} permissions',
      // ── RoleEdit ──
      loadFailedOne: 'Failed to load role: {{detail}}',
      catalogLoadFailedDetail: 'Failed to load permission catalog: {{detail}}',
      // เดิมเป็นภาษาไทยล้วนในซอร์ส — ผู้ใช้อังกฤษเห็นไทย (จุดบอด "ข้อความที่เป็นไทยอยู่แล้ว")
      // อังกฤษเป็นคำที่เขียนขึ้นใหม่ ไทยคือถ้อยคำเดิมย้ายมาทั้งดุ้น
      catalogForbidden: "Missing platform_role.read, so the permission list couldn't be loaded",
      catalogForbiddenDetail: "You can still edit the role's name and status, but not its permissions",
      singularTitle: 'Role',
      notFoundTitle: 'Role not found',
      notFoundDescription: "This role doesn't exist, or it may have been deleted. Check the link, or pick one from the role list.",
      backToList: 'Back to roles',
      loadingOneAria: 'Loading role',
      permissionsHeading: 'Permissions',
      selectPermissions: 'Select the permissions this role grants.',
      catalogFetchFailed: "Couldn't load the permission catalog.",
      catalogLoading: 'Loading permission catalog…',
      catalogEmpty: 'No permissions are defined in the catalog yet.',
      namePlaceholder: 'Role name',
      descriptionPlaceholder: 'Optional description',
      createRole: 'Create Role',
      settings: 'Settings',
      noAccessOther: 'No access to {{count}} other resource.',
      noAccessOtherPlural: 'No access to {{count}} other resources.',
      // grantSummary — ประกอบจากหลายท่อนคั่นด้วย ' · ' เดิมปั้นพหูพจน์ตอนรัน
      noPermissionsGranted: 'No permissions granted',
      nPermissions: '{{count}} permission',
      nPermissionsPlural: '{{count}} permissions',
      resourceSpread: '{{shown}} of {{total}} resources',
      readOnly: 'read only',
    },
    // ── slice 8: Applications ──
    applications: {
      noEndpointsGranted: 'No endpoints granted.',
      title: 'Application Management',
      subtitle: 'Manage applications and their API access',
      addApplication: 'Add Application',
      searchPlaceholder: 'Search applications...',
      filtersDescription: 'Filter applications by status and device',
      device: 'Device',
      allDevices: 'All devices',
      appId: 'App ID',
      copyAppId: 'Copy App ID',
      appIdCopied: 'App ID copied',
      copyFailed: 'Could not copy App ID',
      columnAccess: 'Access',
      allApis: 'All APIs',
      // {{count}} คือจำนวน api_name ที่แอปนี้เข้าถึงได้ — พหูพจน์อังกฤษไม่ผันตรงนี้ (APIs เสมอ)
      nApis: '{{count}} APIs',
      emptyTitle: 'No applications yet',
      emptyDescription: 'Get started by creating your first application.',
      loadingAria: 'Loading applications',
      loadingText: 'Loading applications...',
      loadFailed: 'Failed to load applications: {{detail}}',
      deleteTitle: 'Delete Application',
      deleteDescription: 'Are you sure you want to delete this application? This action cannot be undone.',
      // ApplicationRegistrySummary
      registry: 'Registry',
      registrySummaryStale: "Couldn't load the registry summary.",
      apiAccessScope: 'API access scope',
      fullAccess: 'Full access',
      scoped: 'Scoped',
      scopeChartAria: '{{full}} full access, {{scoped}} scoped',
      // ApplicationIdentityHero.accessSummary — เดิมปั้นพหูพจน์ตอนรันจากสองตัวเลข
      fullAccessEndpoints: 'Full access to every endpoint',
      noEndpointsYet: 'No endpoints granted yet',
      endpointSpread: '{{endpoints}} endpoint across {{modules}} module',
      endpointSpreadPP: '{{endpoints}} endpoints across {{modules}} modules',
      endpointSpreadPS: '{{endpoints}} endpoints across {{modules}} module',
      endpointSpreadSP: '{{endpoints}} endpoint across {{modules}} modules',
      unnamedApplication: '(unnamed application)',
      applicationsLower: 'applications',
      devices: 'Devices',
      activeCount: '{{count}} active',
      inactiveCount: '{{count}} inactive',
      // ── ApplicationEdit ──
      loadFailedOne: 'Failed to load application: {{detail}}',
      saveFailed: 'Failed to save application: {{detail}}',
      loadingOneAria: 'Loading application',
      singularTitle: 'Application',
      notFoundTitle: 'Application not found',
      notFoundDescription: "This application doesn't exist, or it may have been deleted. Check the link, or pick one from the application list.",
      backToList: 'Back to applications',
      newSubtitle: 'Create a new application',
      apiAccess: 'API access',
      apiAccessDescription: 'Which endpoints this app may call.',
      allowAllLabel: 'Full access to every API',
      allowAllNote: 'The app can call every endpoint. Turn off to grant specific endpoints only.',
      allowAllWarning: 'This app is not restricted to specific endpoints. It can call every API in the platform.',
      catalogFetchFailed: "Couldn't load the API catalog.",
      apiNamesPlaceholder: 'Type an api_name and press Enter',
      filterPlaceholder: 'Filter by module or api_name...',
      filterAria: 'Filter API names',
      clearFilter: 'Clear filter',
      catalogLoading: 'Loading catalog…',
      catalogEmpty: 'No API endpoints are defined in the catalog yet.',
      noApiNamesMatching: 'No API names matching “{{query}}”',
      collapseAll: 'Collapse all',
      expandAll: 'Expand all',
      selectAllModule: 'Select all {{module}}',
      deselectAllModule: 'Deselect all {{module}}',
      moduleNone: 'None',
      moduleAll: 'All',
      settings: 'Settings',
      namePlaceholder: 'Application name',
      createApplication: 'Create Application',
    },
    // ── slice 7: Clusters ──
    clusters: {
      addUserFailed: 'Failed to add user',
      userAdded: 'User added to cluster',
      title: 'Cluster Management',
      subtitle: 'Manage and configure clusters',
      addCluster: 'Add Cluster',
      searchPlaceholder: 'Search clusters...',
      filtersDescription: 'Filter clusters by status',
      deletedSectionLabel: 'Deleted',
      showSoftDeleted: 'Show soft-deleted clusters',
      deletedByTitle: 'Deleted by {{name}}',
      columnBusinessUnits: 'Business Units',
      // ป้ายคอลัมน์ CSV เท่านั้น — บนตารางคอลัมน์นี้ใช้หัวว่า Business Units
      columnBuQuota: 'BU Quota',
      columnMaxLicensedUsers: 'Max Licensed Users',
      emptyTitle: 'No clusters yet',
      emptyDescription: 'Get started by creating your first cluster to organize business units.',
      loadingAria: 'Loading clusters',
      loadingText: 'Loading clusters...',
      loadFailed: 'Failed to load clusters: {{detail}}',
      deleteTitle: 'Delete Cluster',
      deleteDescription: 'Are you sure you want to delete this cluster? This action cannot be undone.',
      // การ์ดกันลบ cluster ที่ยังมี BU อยู่ — ชื่ออาจว่างจึงมี fallback เป็นวลีของตัวเอง
      cantDelete: "Can't delete {{name}}",
      thisCluster: 'this cluster',
      // แยกเอกพจน์/พหูพจน์ที่ call site เพราะ catalog ไม่มีระบบพหูพจน์ (ไทยไม่ผันตามจำนวน)
      stillHasBu: 'It still has {{count}} business unit. Delete or move them to another cluster first.',
      stillHasBus: 'It still has {{count}} business units. Delete or move them to another cluster first.',
      // ── ClusterEdit + clusterManagement/ClusterCreateForm + clusterEdit/* ──
      identity: 'Identity',
      codePlaceholder: 'Cluster code',
      aliasPlaceholder: 'PEN',
      namePlaceholder: 'Cluster name',
      firstQuotaLicence: 'First quota licence',
      firstQuotaLicenceNote: 'Sets how many business units this cluster may create. Without one it can create none.',
      // ดาวบอกว่าจำเป็น อยู่ใน JSX เหมือนทุก label ในฟอร์มนี้ ไม่ใช่ในค่าคำแปล — ค่านี้ถูกใช้
      // เป็น label ของข้อความ "is required" ด้วย และ "Business units * is required" อ่านไม่ได้
      licensedBus: 'Business units',
      licensedBusPlaceholder: 'e.g. 5',
      expires: 'Expires',
      neverExpires: 'Never expires',
      creating: 'Creating...',
      createCluster: 'Create cluster',
      // ── ClusterEdit shell ──
      loadFailedOne: 'Failed to load cluster: {{detail}}',
      saveFailed: 'Failed to save cluster: {{detail}}',
      updateUserFailed: 'Failed to update user',
      removeUserFailed: 'Failed to remove user',
      loadingOneAria: 'Loading cluster',
      singularTitle: 'Cluster',
      notFoundTitle: 'Cluster not found',
      notFoundDescription: "This cluster doesn't exist, or it may have been deleted. Check the link, or pick one from the cluster list.",
      backToList: 'Back to clusters',
      tabLicensing: 'Licensing',
      tabBusinessUnits: 'Business Units',
      tabUsers: 'Users',
      licencesNote: 'The latest licences covering this cluster, newest expiry first',
      removeUsersTitle: 'Remove users',
      clearSelectedUser: 'Clear selected user',
      userSearchPlaceholder: 'Search by username or email...',
      allUsersAlreadyIn: 'All matching users are already in this cluster.',
      noUsersFound: 'No users found.',
      adding: 'Adding...',
      // ── clusterEdit/* ──
      clearSelection: 'Clear selection',
      sectionsNav: 'Cluster sections',
      logo: 'Logo',
      noLogo: 'No logo',
      noQuotaYet: 'No quota entered yet',
      setExpiryBelow: 'Set an expiry below',
      newCluster: 'New cluster',
      businessUnitsLower: 'Business units',
      aliasName: 'Alias name',
      maxThreeChars: 'Max 3 chars',
      notSet: 'Not set',
      notCreatedYet: 'Not created yet',
      runsTo: 'Runs to {{date}}',
      // แยกเอกพจน์/พหูพจน์ที่ call site — เดิมปั้น 's' ตอนรัน
      licence: 'licence',
      licences: 'licences',
      buLicenceCount: '{{count}} business unit licence',
      buLicenceCountPlural: '{{count}} business unit licences',
      unnamedCluster: '(unnamed cluster)',
      seats: 'Seats',
      licensedSuffix: 'licensed',
      // แถบสรุปใต้ plate — ประกอบจากหลายท่อน ผูกเป็นคีย์ทั้งท่อนแทนการต่อสตริง
      activeCount: '{{count}} active',
      inactiveCount: '{{count}} inactive',
      licenceFree: '{{count}} licence free',
      licencesFree: '{{count}} licences free',
      seatFree: '{{count}} seat free',
      seatsFree: '{{count}} seats free',
      noSeatCap: 'no seat cap set',
      searchBusinessUnits: 'Search business units',
      refreshBusinessUnits: 'Refresh business units',
      noBuInCluster: 'No business units found in this cluster.',
      noBuMatchFilters: 'No business units match your filters.',
      overLimit: 'Over limit',
      licenseLimitReached: 'License limit reached ({{used}}/{{cap}})',
      overLimitNote: '{{count}} business units are beyond the licensed quota of {{cap}}. They are read-only until more quota is purchased.',
      overLimitRankTitle: 'Quota {{cap}} · this unit ranks {{rank}}',
      editBuAria: 'Edit {{name}}',
      buSingularLower: 'business unit',
      searchUsers: 'Search users',
      refreshUsers: 'Refresh users',
      noUsersInCluster: 'No users found in this cluster.',
      noUsersMatchFilters: 'No users match your filters.',
      selectAllUsers: 'Select all users',
      removeSelectedUsers: 'Remove selected users',
      removeUserFromCluster: 'Remove User from Cluster',
      selectUserAria: 'Select {{name}}',
      roleForAria: 'Role for {{name}}',
      removeUserAria: 'Remove {{name}} from this cluster',
      removeSelectedConfirm: 'Remove {{count}} user(s) from this cluster?',
      removeOneConfirm: 'Remove "{{name}}" from this cluster?',
      columnRole: 'Role',
      subscriptionsHeading: 'Subscriptions',
      addUserTitle: 'Add User to Cluster',
      addUserDescription: 'Search and select a user to add',
      clusterRole: 'Cluster Role',
      showingUsers: 'Showing {{shown}} of {{total}} users',
      clusterLimitReached: 'Cluster license limit reached ({{used}}/{{cap}})',
      licensedUsersInCluster: '{{used}} of {{cap}} licensed users in this cluster',
      noSubscriptions: 'No subscriptions',
      noSubscriptionsNote: 'Create a subscription to grant this cluster its features and seats.',
      createSubscription: 'Create subscription',
      manage: 'Manage',
      subscriptionCardDescription: 'License subscriptions for this cluster',
      // สรุปหนึ่งบรรทัดใต้เลขที่สัญญา — เดิมต่อสตริงและปั้น 's' ตอนรัน
      subscriptionSummary: 'Expires {{date}} · {{count}} feature · {{used}}/{{cap}} seats',
      subscriptionSummaryPlural: 'Expires {{date}} · {{count}} features · {{used}}/{{cap}} seats',
    },
    // ── slice 6: Report Templates ──
    // สองหน้าของฟีเจอร์เดียวกัน แยก namespace ตามหน้าเหมือน slice ก่อน ๆ
    reportFormGroups: {
      subtitle: 'Manage the default form template for each report group',
      newFormTemplate: 'New Form Template',
      searchPlaceholder: 'Search group code or template name…',
      searchAria: 'Search form groups',
      activeOnly: 'Active only',
      noGroupsMatch: 'No groups match your search.',
      loadFailed: 'Failed to load form templates: {{detail}}',
      // GroupCard.tsx — การ์ดหนึ่งใบต่อหนึ่ง report group
      // catalog ไม่มีระบบพหูพจน์ การแตกกิ่ง singular/plural จึงอยู่ที่ call site
      // (แบบเดียวกับ pages.news.articleTotal/articlesTotal) ไทยไม่ผันตามจำนวนจึงค่าเดียวกัน
      templateCount: '{{count}} template',
      templatesCount: '{{count}} templates',
      noTemplatesTitle: 'No form templates',
      noTemplatesDescription: 'No form templates in {{code}} yet.',
      noDefaultSet: 'No default set — pick one.',
      activateFirstTitle: 'Activate the template to make it the default',
      setAsDefaultAria: 'Set {{name}} as default for {{code}}',
      standard: 'Standard',
      activate: 'Activate',
      deactivate: 'Deactivate',
      // ต่อท้ายชื่อเมนู Deactivate ตอนที่กดไม่ได้เพราะเป็นค่าเริ่มต้นอยู่ — ขึ้นต้นด้วยช่องว่าง
      // เพราะถูกต่อกับคำก่อนหน้าโดยตรง ไม่ได้อยู่ใน template เดียวกัน
      defaultSuffix: ' (default)',
      setDefaultTitle: 'Set default form template',
      setDefaultConfirm: 'Set "{{name}}" as the default for {{code}}?',
      setDefaultReplaces: ' Replaces "{{name}}".',
      setDefaultAction: 'Set default',
      toastDefaultSet: 'Set "{{name}}" as default for {{code}}',
      toastDefaultFailed: 'Failed to set default: {{detail}}',
      toastActivated: 'Activated "{{name}}"',
      toastDeactivated: 'Deactivated "{{name}}"',
      toastUpdateFailed: 'Failed to update: {{detail}}',
    },
    usageAnalytics: {
      subtitle: 'Usage overview from UI telemetry',
      // TopList's emptyLabel. Deliberately NOT table.noResultsFound: that key's Thai is
      // 'ไม่พบข้อมูล' ("none found", a search verdict); this one is 'ไม่มีข้อมูล' ("no data").
      noData: 'No data',
      emptyTitle: 'No events in the selected range',
      emptyDescription: 'Try widening the date range, or clearing the Business Unit / Application filters.',
      eventTypeLabel: 'Event type',
      // <SelectItem> labels for the API's two event_type values. Identical in both
      // catalogs on purpose: the Thai page already showed these two words in English, and
      // this wave adds a language rather than revising the Thai.
      eventTypeClick: 'Click',
      eventTypePageView: 'Page view',
      // Metric names, shared by the five StatCards, the chart legend and the CSV header
      // row — one key each rather than three copies. Same en==th reasoning as above.
      metricEvents: 'Events',
      metricClicks: 'Clicks',
      metricPageViews: 'Page views',
      metricSessions: 'Sessions',
      metricActiveUsers: 'Active users',
      csvDay: 'Day',
      chartTitle: 'Sessions & Active users by day',
      topPages: 'Top pages',
      topElements: 'Top elements',
      // Assembled at runtime from two numbers, so the finished string never appears in the
      // source and no text sweep can see it (blind spot 2 of the fix brief).
      topPageSub: '{{sessions}} sessions · {{users}} users',
    },
    activityTrail: {
      buttonLabel: 'Change history',
      title: 'Change history',
      description: 'Every recorded change to this record — who changed it, when, and what changed',
      // ไม่ใช่ "ไม่มีประวัติ" โดยเจตนา: เรคอร์ดที่ไม่เคยถูกแก้กับเรคอร์ดที่ถูกแก้ก่อนระบบเริ่ม
      // บันทึก หน้าตาเหมือนกันทุกประการ การเขียนว่า "ไม่มี" จะทำให้ผู้ใช้สรุปผิดในหน้าจอ audit
      emptyTitle: 'No recorded changes',
      emptyDescription: 'Recording started on {{date}}. Changes made before then were not kept.',
      loadMore: 'Load more',
      // ไม่มีระบบ plural ใน translate() — ใช้รูปเดียวที่อ่านได้ทั้ง 1 และหลายฟิลด์
      changedFields: '{{count}} field(s) changed',
      noFieldChanges: 'No field changes recorded',
      // ค่าที่ถูกปิดบังตอนบันทึก — บอกได้ว่าฟิลด์นี้เปลี่ยน แต่บอกไม่ได้ว่าเปลี่ยนเป็นอะไร
      redactedValue: 'changed (value hidden)',
      emptyValue: 'empty',
      childSummary: '{{relation}}: {{added}} added, {{removed}} removed, {{updated}} changed',
      actionCreate: 'created',
      actionUpdate: 'updated',
      actionDelete: 'deleted',
      membershipGranted: 'added {{name}}',
      membershipRevoked: 'removed {{name}}',
      // แถวที่มาจากคำเชิญไม่ได้เก็บว่าใครถูกเพิ่ม — พูดตามที่รู้ ไม่เดาชื่อ
      membershipUnknownSubject: 'a user',
      loadError: 'Could not load the change history',
    },
    activityEvents: {
      subtitle: 'Per-event UI telemetry — who clicked what, on which page, and when',
      searchLabel: 'Search',
      searchPlaceholder: 'page path / element id / element text',
      filtersDescription: 'Filter events by BU, application, type, user, page and session',
      // Duplicated from pages.usageAnalytics above rather than promoted to common.*: two
      // files in one slice does not clear the >=3-files-AND->=2-slices promotion bar.
      eventTypeLabel: 'Event type',
      eventTypeClick: 'Click',
      eventTypePageView: 'Page view',
      userIdLabel: 'User (User ID)',
      userIdPlaceholder: "User's UUID",
      pagePathLabel: 'Page path',
      sessionIdLabel: 'Session ID',
      // Column headers double as the CSV header row, so the exported file follows the UI
      // language — a CSV label read straight off a data object is user-visible text.
      columnTime: 'Time',
      columnUser: 'User',
      columnBu: 'BU',
      columnType: 'Type',
      columnPage: 'Page',
      columnElement: 'Element',
      columnApp: 'App',
      csvServerTime: 'Server time',
      viewDetailsAria: 'View event details {{id}}',
      clearFilterAria: 'Clear filter {{label}}',
      // Active-filter chips. Each is built at runtime and used as the chip's React key AND
      // interpolated into clearFilterAria, so the whole label must come from one template.
      chipSearch: 'Search: {{value}}',
      chipPage: 'Page: {{value}}',
      chipSession: 'session: {{value}}…',
      chipUser: 'User: {{value}}…',
      chipType: 'Type: {{value}}',
      chipBu: 'BU: {{value}}',
      chipApp: 'App: {{value}}',
      emptyTitle: 'No events found',
      emptyDescription: 'Try widening the date range, or clearing some filters.',
      detailTitle: 'Event Details',
      detailDescription: 'Every field of the selected event, including props and user agent',
      detailServerTime: 'Time (server)',
      detailClientTime: 'Time (client)',
      detailDomain: 'Domain',
      detailElementText: 'Element text',
      detailSession: 'Session',
      detailEventId: 'Event ID',
      // Lower-case on purpose in both languages: these caption the raw `props` object and
      // the raw `user_agent` string, which are field names from the API, not prose.
      detailProps: 'props',
      detailUserAgent: 'user agent',
      viewWholeSession: 'View this entire session',
    },
  },
  // Reserved for phase 2. `errorParser.ts` is a pure module: translating these three
  // means threading `t` through 132 call sites in pages that are otherwise untouched
  // this phase, so the strings stay English in the code for now. The keys live here
  // so phase 2 only has to change the utility, not invent a catalog shape.
  error: {
    unexpected: 'An unexpected error occurred',
    tryAgainLater: 'Please try again later.',
    unknown: 'Unknown error',
  },
  login: {
    accessDeniedPlatform: 'Access Denied. You are not authorized to access this platform.',
    unableToLogin: 'Unable to login. Please try again later.',
    invalidCredentials: 'Invalid email/username or password.',
    tooManyAttempts: 'Too many login attempts. Please try again later.',
    noToken: 'No token received from server',
    operationsConsole: 'Operations console',
    hero: 'One place to manage your clusters, business units, and the people who run them.',
    allSystemsOperational: 'All systems operational',
    signInHeading: 'Sign in',
    signInSubtitle: 'Access the Carmen operations console.',
    usernameLabel: 'Email or username',
    usernamePlaceholder: 'you@company.com',
    usernameRequired: 'Username is required',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    passwordRequired: 'Password is required',
    accessDenied: 'Access denied',
    failed: 'Login failed',
    submit: 'Sign in',
    submitting: 'Signing in…',
    locked: 'Please wait',
    backToHome: 'Back to home',
  },
};
