import { Activity, ChartArea, ChartColumn, ChartLine, ChartPie, Gauge, Grid3x3, Hash, LayoutDashboard, Table2, type LucideIcon } from 'lucide-react';

/** ไอคอนต่อ widget_type ตาม supported_renders ของ dataset — ชนิดที่ไม่รู้จักใช้ไอคอนกลาง */
const WIDGET_ICON: Record<string, LucideIcon> = {
  kpi: Hash,
  gauge: Gauge,
  bar: ChartColumn,
  pie: ChartPie,
  line: ChartLine,
  area: ChartArea,
  sparkline: Activity,
  heatmap: Grid3x3,
  table: Table2,
};

export const widgetIcon = (type: string): LucideIcon => WIDGET_ICON[type] ?? LayoutDashboard;
