import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useI18n } from '../../hooks/useI18n';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Drag-and-drop or click-to-browse .xlsx picker. Plain DOM events — the repo does not
 * carry react-dropzone and this feature must not add dependencies.
 */
export function WorkbookDropzone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = (file?: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error(t('pages.tenantImport.onlyXlsx'));
      return;
    }
    onFile(file);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t('pages.tenantImport.uploadAria')}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) accept(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-md border border-dashed p-10 text-center',
        dragging ? 'border-primary bg-accent' : 'border-input bg-card',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{t('pages.tenantImport.dropHere')}</p>
        <p className="text-xs text-muted-foreground">{t('pages.tenantImport.dropHint')}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={`.xlsx,${XLSX_MIME}`}
        className="hidden"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
