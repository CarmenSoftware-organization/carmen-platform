import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import type { DashboardDatasetParam } from '../../types';

interface DatasetParamFieldsProps {
  params: DashboardDatasetParam[];
  value: Record<string, string | number>;
  onChange: (next: Record<string, string | number>) => void;
  disabled?: boolean;
}

/** ฟอร์ม param ของ dataset — ตัดค่าว่างออกเพื่อไม่ส่ง '' ที่ backend อาจ 422 */
export default function DatasetParamFields({ params, value, onChange, disabled }: DatasetParamFieldsProps) {
  const setValue = (name: string, v: string | number | undefined) => {
    const next = { ...value };
    if (v === undefined || v === '') delete next[name];
    else next[name] = v;
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {params.map((p) => {
        const id = `dt-param-${p.name}`;
        const current = value[p.name];
        return (
          <div key={p.name} className="space-y-2">
            <Label htmlFor={id}>
              {p.label}
              {p.required && <span className="text-destructive"> *</span>}
            </Label>
            {p.options?.length ? (
              <Select
                value={current !== undefined ? String(current) : undefined}
                onValueChange={(v) => setValue(p.name, v)}
                disabled={disabled}
              >
                <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {p.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : p.type === 'number' ? (
              <Input
                id={id}
                type="number"
                value={current ?? ''}
                disabled={disabled}
                onChange={(e) => setValue(p.name, e.target.value === '' ? undefined : Number(e.target.value))}
              />
            ) : (
              <Input
                id={id}
                value={current ?? ''}
                disabled={disabled}
                onChange={(e) => setValue(p.name, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
