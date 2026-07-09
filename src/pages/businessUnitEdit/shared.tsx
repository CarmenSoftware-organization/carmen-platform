import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { ChevronDown } from 'lucide-react';
import { ReadOnlyField } from '../../components/ReadOnlyField';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

export const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, description, defaultOpen = false, forceOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = forceOpen || open;
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </CardHeader>
      {isOpen && <CardContent className="flex-1">{children}</CardContent>}
    </Card>
  );
};

export const ReadOnlyText: React.FC<{ value: string }> = ({ value }) => (
  <ReadOnlyField value={value} />
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
