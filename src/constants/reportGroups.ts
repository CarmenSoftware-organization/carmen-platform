// Fixed report-group codes for form-type report templates. The stored
// report_group value === the bare code. This order is the canonical display
// order for the Form Groups page and the Edit-page select. Legacy report_group
// values present in data but absent here are handled by the page at runtime,
// not by this list.
export const FORM_REPORT_GROUPS = [
  'PR', 'PO', 'GRN', 'SR', 'CN', 'SI', 'SO', 'IA', 'PC', 'SC', 'RFP', 'EOP',
] as const;

export type FormReportGroupCode = (typeof FORM_REPORT_GROUPS)[number];
