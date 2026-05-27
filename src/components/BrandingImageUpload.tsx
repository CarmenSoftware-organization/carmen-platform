import React, { useRef, useState } from 'react';
import { Upload, Loader2, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { parseApiError } from '../utils/errorParser';

const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

interface BrandingImageUploadProps {
  label: string;
  value?: string; // current presigned URL (empty when none)
  disabled?: boolean;
  shape?: 'rect' | 'square';
  maxSizeMB?: number;
  accept?: string[];
  // Uploads the file (the parent calls the dedicated endpoint and stores the returned URL).
  onUpload: (file: File) => Promise<void>;
}

export const BrandingImageUpload: React.FC<BrandingImageUploadProps> = ({
  label,
  value,
  disabled = false,
  shape = 'rect',
  maxSizeMB = 5,
  accept = DEFAULT_ACCEPT,
  onUpload,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const validate = (file: File): string => {
    if (!accept.includes(file.type)) {
      return `Unsupported file type. Allowed: ${accept.map((t) => t.replace('image/', '')).join(', ')}.`;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File is too large. Maximum size is ${maxSizeMB} MB.`;
    }
    return '';
  };

  const handleFile = async (file: File) => {
    const err = validate(file);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      await onUpload(file);
      toast.success(`${label} updated`);
    } catch (e) {
      toast.error(`${label} upload failed`, { description: parseApiError(e).message });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const boxClass = shape === 'square' ? 'h-20 w-20 rounded-full' : 'h-20 w-auto max-w-[160px] rounded-md';
  const fitClass = shape === 'square' ? 'object-cover' : 'object-contain';

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex items-center gap-3">
        <div className={cn('flex shrink-0 items-center justify-center overflow-hidden border bg-muted/30', boxClass)}>
          {value ? (
            <img
              src={value}
              alt={label}
              className={cn('h-full w-full', fitClass)}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <ImageOff className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        {!disabled && (
          <div className="space-y-1.5">
            <input
              ref={inputRef}
              type="file"
              accept={accept.join(',')}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {busy ? 'Uploading…' : value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
            </Button>
            <p className="text-xs text-muted-foreground">
              {accept.map((t) => t.replace('image/', '').toUpperCase()).join(', ')} · up to {maxSizeMB} MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
