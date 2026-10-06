import type { DashboardDatasetInfo, DashboardTemplate, DashboardTemplateKind } from '../../types';

export interface TemplateEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: DashboardTemplateKind;
  module: string;
  template: DashboardTemplate | null;
  datasets: DashboardDatasetInfo[];
  byId: Map<string, DashboardDatasetInfo>;
  nextOrderIndex: number;
  onSaved: () => void;
}

// placeholder — Task 3 เติมเนื้อหา
export default function TemplateEditDialog(_props: TemplateEditDialogProps) {
  return null;
}
