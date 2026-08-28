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
    },
    validation: {
      nameRequired: 'Name is required',
      clusterRequired: 'Cluster is required',
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
      refreshFailed: "Couldn't refresh — showing the last known numbers.",
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
