export interface BuEditSection {
  id: string;
  label: string;
  /** Small caution chip shown in the nav (e.g. "SA" = contains super-admin tools). */
  badge?: string;
  /** Rendered only for an existing BU (hidden while creating). */
  existingOnly?: boolean;
}

export const BU_EDIT_SECTIONS: BuEditSection[] = [
  { id: 'general', label: 'General' },
  { id: 'address', label: 'Address & Tax' },
  { id: 'localization', label: 'Localization' },
  { id: 'branding', label: 'Branding', existingOnly: true },
  { id: 'advanced', label: 'Advanced', badge: 'SA' },
  { id: 'users', label: 'Users', existingOnly: true },
];

export const getVisibleSections = (isNew: boolean): BuEditSection[] =>
  isNew ? BU_EDIT_SECTIONS.filter((s) => !s.existingOnly) : BU_EDIT_SECTIONS;
