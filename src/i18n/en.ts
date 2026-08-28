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
    news: 'News',
    broadcasts: 'Broadcasts',
    usageAnalytics: 'Usage Analytics',
    activityEvents: 'Activity Events',
    applications: 'Applications',
    emailSettings: 'Email Settings',
    platformConfig: 'Platform Config',
    platformRoles: 'Platform Roles',
    superAdmins: 'Super Admins',
    userPlatform: 'User Platform',
    sqlWorkbench: 'SQL Workbench',
    databasePools: 'Database Pools',
    cluster: 'Cluster',
  },
  navGroup: {
    organization: 'Organization',
    content: 'Content',
    analytics: 'Analytics',
    platform: 'Platform',
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
    news: 'News',
    broadcasts: 'Broadcasts',
    applications: 'Applications',
    platform: 'Platform',
    roles: 'Roles',
    superAdmins: 'Super Admins',
    userPlatform: 'User Platform',
    sqlWorkbench: 'SQL Workbench',
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
    searchBu: 'Search business units',
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
      published: 'Published',
      updated: 'Updated',
      unknown: 'Unknown',
    },
    action: {
      saveChanges: 'Save Changes',
      delete: 'Delete',
      remove: 'Remove',
      clear: 'Clear',
      addUser: 'Add User',
      start: 'Start',
      manageLicences: 'Manage licences',   // British spelling, as in the source
      export: 'Export',
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
    },
    // Spinner/busy labels, split out of `action` — that namespace was conflating verbs
    // (delete), verb phrases (saveChanges) and these `...`-suffixed spinner labels. The
    // namespace name now carries the rule: an implementer looking for "Updating..." should
    // check here first.
    busy: {
      saving: 'Saving...',
      deleting: 'Deleting...',
      adding: 'Adding...',
      creating: 'Creating...',
      loading: 'Loading...',
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
      defaultCurrency: 'Default Currency',
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
    },
    // Section headings — a different register from a bare input label. `common.field.*`
    // used to hold these too, but a heading and a label want different translations, and
    // once nine more slices bind to one shared key the split becomes impossible.
    section: {
      identity: 'Identity',
      branding: 'Branding',
      configuration: 'Configuration',
      access: 'Access',
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
    },
    state: {
      noExpiry: 'No expiry',
      expires: 'Expires',
      quotaExpires: 'Quota Expires',
      unsavedChanges: 'Unsaved changes',
      noChanges: 'No changes',
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
  },

  /** Per-slice page vocabulary. One child object per phase-2 slice. */
  pages: {
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
      usernamePlaceholder: 'user@example.com',
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
      rowActions: 'Actions for {{name}}',
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
      removeBuAria: 'Remove {{name}}',
      addBu: 'Add BU',
      recentlyAdded: 'Recently added',
      activeInactiveSummary: '{{active}} active, {{inactive}} inactive',
      bulkPermanentlyDeleteUsers: 'Permanently Delete {{count}} User(s)',
      removeStatusFilter: 'Remove {{status}} filter',
      buColumn: 'BU',
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
      rowActions: 'Actions for {{name}}',
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
      // Interfaces block: Task 6 (SubscriptionSummary's own "expiring soon" card) reuses
      // this exact key.
      expiringSoon: 'Expiring soon',
      expiringWithinDays: 'Expiring within {{days}} days',
      expiry: 'Expiry',
      // Bare column headers — distinct from entity.* (toast-safe nouns) and from
      // common.validation.subscriptionNumber/startDate/endDate (lowercase field-name
      // fallbacks used by validateField, a different register and different casing).
      subscription: 'Subscription',
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
      // Source uses the single-character ellipsis (…), not three dots — distinct from
      // common.busy.loading ('Loading...'). Shared by both the cluster and business-unit
      // select's own "still loading" option.
      loadingOption: 'Loading…',
      effectiveState: 'Effective state:',
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
    licenses: {
      // ClusterLicenseDetail.tsx (nav section label, ALL_SECTIONS) + licenseKindConfig.ts
      // (BU_QUOTA_CONFIG.amountLabel) — both literally 'BU quota'.
      buQuota: 'BU quota',
      // licenseKindConfig.ts (BU_QUOTA_CONFIG.newPageTitle) + BuQuotaSection.tsx (the
      // "Add BU quota license" button — hardcoded there, not read from config).
      addBuQuotaLicense: 'Add BU quota license',
      // licenseKindConfig.ts (SEAT_CONFIG.newPageTitle) + SeatSection.tsx (the "Add seat
      // license" button — hardcoded there, not read from config).
      addSeatLicense: 'Add seat license',
      // PurchaseLicenseTable.tsx (column header + CSV export label) + LicensePurchaseForm.tsx
      // (field Label).
      licenseNumber: 'License Number',
      // BuQuotaSection.tsx + SeatSection.tsx inline ledger tables — the compact column
      // header, a different register from common.field.startDate ("Start Date", a
      // form-field label) — same table-header-vs-form-label split the file already uses
      // for common.section.* vs common.field.*. Fix round 1: this namespace used to also
      // hold `start` ('Start'), byte-identical to common.action.start — deleted, Tasks 2-4
      // bind that shared key instead. `end` has no common.action counterpart to reuse, so
      // it stays here alone.
      end: 'End',
      // BuQuotaSection.tsx + SeatSection.tsx ConfirmDialog title — the two files' dialog
      // descriptions differ (BU count vs. seat count) and stay page-local; only the shared
      // title is seeded here.
      removeLicenseTitle: 'Remove license',
      // BuQuotaSection.tsx + SeatSection.tsx EmptyState title — the two files' descriptions
      // differ and stay page-local; only the shared title is seeded here.
      noLicensesYetTitle: 'No licenses yet',
      // ClusterLicenseTable.tsx + PurchaseLicenseTable.tsx "Clear all filters" button —
      // lowercase, NOT common.action.clearAllFilters ('Clear All Filters', Title Case).
      // Different capitalization is a different byte-identical string, so it is not that
      // key's reuse candidate.
      clearAllFilters: 'Clear all filters',
      // ClusterLicenseDetail.tsx (page title while the cluster loads) + SeatSection.tsx
      // (card description while the seat batch loads) — confirmed U+2026 (…) in both
      // source files, not three ASCII dots, so this is genuinely distinct from
      // common.busy.loading ('Loading...'), not a duplicate of it.
      loadingEllipsis: 'Loading…',

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
      // Badge inside the Quota Expires cell — days remaining before a winning BU-quota
      // license expires.
      daysLeft: '{{count}} days left',
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
