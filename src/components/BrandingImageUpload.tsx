import React, { useRef, useState } from 'react';
import { Upload, Loader2, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { BrandMark } from './BrandMark';
import { parseApiError } from '../utils/errorParser';
import { useI18n } from '../hooks/useI18n';

const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

interface BrandingImageUploadProps {
  label: string;
  value?: string; // current presigned URL (empty when none)
  disabled?: boolean;
  shape?: 'rect' | 'square';
  /**
   * Slot-only rendering: the preview *is* the button, with the label carried on `aria-label`
   * and the format/size help dropped. Built for the cluster identity plate, where the two
   * marks sit beside the cluster's name and a labelled 20px-tall upload card each would turn
   * a one-line plate into a form. Every other call site keeps the full slot.
   */
  compact?: boolean;
  maxSizeMB?: number;
  accept?: string[];
  /** Entity name behind this branding — feeds the square slot's initials fallback. */
  fallbackName?: string;
  /** Entity code behind this branding — preferred over the name for initials. */
  fallbackCode?: string;
  // Uploads the file (the parent calls the dedicated endpoint and stores the returned URL).
  onUpload: (file: File) => Promise<void>;
}

export const BrandingImageUpload: React.FC<BrandingImageUploadProps> = ({
  label,
  value,
  disabled = false,
  shape = 'rect',
  compact = false,
  maxSizeMB = 5,
  accept = DEFAULT_ACCEPT,
  fallbackName,
  fallbackCode,
  onUpload,
}) => {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const validate = (file: File): string => {
    if (!accept.includes(file.type)) {
      return t('common.upload.unsupportedType', { types: accept.map((t2) => t2.replace('image/', '')).join(', ') });
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return t('common.upload.tooLarge', { size: maxSizeMB });
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
      toast.success(t('common.upload.updated', { label }));
    } catch (e) {
      toast.error(t('common.upload.uploadFailed', { label }), { description: parseApiError(e).message });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const frameClass = compact
    ? shape === 'square'
      ? 'h-12 w-12 rounded-full'
      : 'h-12 w-20 rounded-md'
    : shape === 'square'
      ? 'h-20 w-20 rounded-full'
      : 'h-20 w-auto max-w-[160px] rounded-md';
  const fitClass = shape === 'square' ? 'object-cover' : 'object-contain';

  /* Two different empty states, on purpose. A square slot falls back to initials — a real
   * identity the platform can keep using forever — so it renders solid and finished. A logo has
   * no substitute, so its empty state is a dashed frame at the footprint the image will occupy:
   * it reads as "nothing here yet" instead of "this is the branding". */
  const renderPreview = () => {
    if (value) {
      return (
        <div className={cn('flex shrink-0 items-center justify-center overflow-hidden border bg-muted/30', frameClass)}>
          <img
            src={value}
            alt={label}
            className={cn('h-full w-full', fitClass)}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      );
    }
    if (shape === 'square') {
      return (
        <BrandMark
          size="lg"
          shape="circle"
          name={fallbackName}
          code={fallbackCode}
          className={cn(compact && 'h-12 w-12 text-base')}
        />
      );
    }
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/30',
          compact ? 'h-12 w-20' : 'h-20 w-[160px]',
        )}
      >
        <ImagePlus className={cn('text-muted-foreground/70', compact ? 'h-4 w-4' : 'h-5 w-5')} aria-hidden />
      </div>
    );
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={accept.join(',')}
      className="hidden"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
    />
  );

  if (compact) {
    if (disabled) return <div className="shrink-0">{renderPreview()}</div>;
    return (
      <div className="shrink-0">
        {fileInput}
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          aria-label={
            value
              ? t('common.upload.replaceLabel', { label: label.toLowerCase() })
              : t('common.upload.uploadLabel', { label: label.toLowerCase() })
          }
          className="group focus-visible:ring-ring relative block rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
        >
          {renderPreview()}
          {/* The affordance is the overlay, not a separate button: it only has to appear on the
              way to the click, and a permanent "Replace" caption under each mark would be more
              chrome than the marks themselves. focus-visible keeps it reachable by keyboard. */}
          <span
            className={cn(
              'bg-foreground/55 absolute inset-0 grid place-items-center transition-opacity',
              shape === 'square' ? 'rounded-full' : 'rounded-md',
              busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
            )}
          >
            {busy ? (
              <Loader2 className="text-background h-4 w-4 animate-spin" />
            ) : (
              <Upload className="text-background h-4 w-4" />
            )}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex items-center gap-3">
        {renderPreview()}
        {!disabled && (
          <div className="space-y-1.5">
            {fileInput}
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {busy
                ? t('common.busy.uploading')
                : value
                  ? t('common.upload.replaceLabel', { label: label.toLowerCase() })
                  : t('common.upload.uploadLabel', { label: label.toLowerCase() })}
            </Button>
            <p className="text-xs text-muted-foreground">
              {accept.map((mime) => mime.replace('image/', '').toUpperCase()).join(', ')} ·{' '}
              {t('common.upload.maxSizeHint', { size: maxSizeMB })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
