import React, { useId, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { ChevronDown } from 'lucide-react';
import { ReadOnlyField } from '../../components/ReadOnlyField';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

export const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring";

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: React.ReactNode;
}

/**
 * A section card that can collapse. When `forceOpen` is set the content is pinned
 * open, so the header renders as plain, non-interactive text: no pointer cursor,
 * no chevron, no click handler. Advertising a control that cannot do anything is
 * worse than having no control — and every current call site pins itself open.
 *
 * When it does collapse, the header is a real control, not just a clickable div:
 * `role="button"` + `tabIndex={0}` + `aria-expanded` + `onKeyDown` (Enter/Space)
 * make it operable from the keyboard, and `aria-controls` ties it to the content
 * region it toggles.
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, description, defaultOpen = false, forceOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = forceOpen || open;
  const contentId = useId();
  const toggle = () => setOpen(o => !o);
  const handleHeaderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      toggle();
    } else if (e.key === ' ') {
      // Prevent the page from scrolling on Space, same as a native <button>.
      e.preventDefault();
      toggle();
    }
  };
  const heading = (
    <div>
      <CardTitle className="text-base">{title}</CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </div>
  );
  return (
    <Card className="flex flex-col h-full">
      {forceOpen ? (
        <CardHeader>{heading}</CardHeader>
      ) : (
        <CardHeader
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={toggle}
          onKeyDown={handleHeaderKeyDown}
          className="cursor-pointer select-none rounded-md focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
        >
          <div className="flex items-center justify-between">
            {heading}
            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </CardHeader>
      )}
      {isOpen && <CardContent id={contentId} className="flex-1">{children}</CardContent>}
    </Card>
  );
};

export const ReadOnlyText: React.FC<{ value: string; className?: string }> = ({ value, className }) => (
  <ReadOnlyField value={value} className={className} />
);

export const ReadOnlyTextarea: React.FC<{ value: string }> = ({ value }) => (
  <div className="flex w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm min-h-[4.5rem] whitespace-pre-wrap">{value || '-'}</div>
);

/** One edit/read-only text field for an address block (shared by Company/Hotel sections). */
export const AddrField: React.FC<{
  id: string;
  label: string;
  placeholder: string;
  value: string;
  editing: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}> = ({ id, label, placeholder, value, editing, onChange }) => (
  <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    {editing ? (
      <Input type="text" id={id} name={id} value={value} onChange={onChange} placeholder={placeholder} />
    ) : (
      <ReadOnlyText value={value} />
    )}
  </div>
);

/**
 * หนึ่งกลุ่มของ document: หัวข้อ + คำบรรยาย + เส้นคั่นด้านบน
 * ย้ายมาจาก BusinessUnitDocument.tsx (2026-08-19) เพราะหน้า cluster-admin
 * ใช้กลุ่มหน้าตาเดียวกันแต่เรียงคนละลำดับ — แก้หน้าตาของกลุ่มต้องแก้ที่นี่ที่เดียว
 *
 * หัวข้อใช้ทรงเดียวกับ CardTitle/CardDescription ของ CollapsibleSection (2026-08-31):
 * หน้า BU เรนเดอร์ทั้งสองแบบสลับกันในจอเดียว การมีหัวข้อสองทรงในระดับชั้นเดียวกัน
 * ทำให้สายตาอ่านลำดับชั้นผิด
 *
 * `cols={2}` แบ่งลูกเป็นสองคอลัมน์ตั้งแต่ lg ขึ้นไป — สำหรับกลุ่มที่มีหลาย field สั้น
 * (ที่อยู่ 13 ช่อง) ซึ่งเรียงคอลัมน์เดียวแล้วยาวเกินหนึ่งจอโดยที่ครึ่งขวาของหน้าว่างเปล่า
 */
export function Group({
  label,
  description,
  action,
  cols = 1,
  children,
}: {
  label: string;
  description?: string;
  action?: React.ReactNode;
  cols?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t p-4 sm:px-6 sm:py-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-none tracking-tight">{label}</h3>
          {description && <p className="text-muted-foreground mt-1.5 text-sm">{description}</p>}
        </div>
        {action}
      </div>
      <div className={cols === 2 ? 'lg:grid lg:grid-cols-2 lg:gap-x-10' : undefined}>{children}</div>
    </div>
  );
}

export { InlineField, type InlineOption, type InlineWidth } from './InlineField';
