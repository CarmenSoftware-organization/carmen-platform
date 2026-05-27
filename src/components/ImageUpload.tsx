import React, { useRef, useState } from 'react';
import { Upload, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { parseApiError } from '../utils/errorParser';
import uploadService from '../services/uploadService';

const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  folder?: string;
  maxSizeMB?: number;
  accept?: string[];
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  value,
  onChange,
  disabled = false,
  folder,
  maxSizeMB = 5,
  accept = DEFAULT_ACCEPT,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

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
    setUploading(true);
    setProgress(0);
    try {
      const url = await uploadService.uploadImage(file, { folder, onProgress: setProgress });
      onChange(url);
      toast.success('Image uploaded');
    } catch (e: unknown) {
      const { message } = parseApiError(e);
      toast.error('Image upload failed' + (message ? `: ${message}` : ''));
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  // Read-only mode: show preview only.
  if (disabled) {
    return value ? (
      <div className="mt-1">
        <img
          src={value}
          alt="News"
          data-testid="image-preview"
          className="h-16 w-auto rounded object-contain border"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
    ) : null;
  }

  return (
    <div className="space-y-2">
      <div
        data-testid="image-drop-zone"
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground transition-colors cursor-pointer hover:bg-muted/50',
          dragActive && 'border-primary bg-primary/5',
          uploading && 'pointer-events-none opacity-70',
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>Uploading… {progress}%</span>
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <>
            <Upload className="h-5 w-5" />
            <span>
              Drag &amp; drop an image here, or <span className="text-primary underline">browse</span>
            </span>
            <span className="text-xs">
              {accept.map((t) => t.replace('image/', '').toUpperCase()).join(', ')} · up to {maxSizeMB} MB
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          data-testid="image-upload-input"
          accept={accept.join(',')}
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {value && (
        <div className="flex items-center gap-3">
          <img
            src={value}
            alt="News"
            data-testid="image-preview"
            className="h-16 w-auto rounded object-contain border"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="image-remove"
            onClick={() => onChange('')}
          >
            <X className="mr-2 h-4 w-4" />
            Remove
          </Button>
        </div>
      )}
    </div>
  );
};
