import React, { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface ImageUploadProps {
  value: string; // saved image URL (presigned) shown as preview
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
  maxSizeMB?: number;
  accept?: string[];
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  value,
  onFileSelect,
  disabled = false,
  maxSizeMB = 5,
  accept = DEFAULT_ACCEPT,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [localPreview, setLocalPreview] = useState('');

  useEffect(() => {
    return () => { if (localPreview) URL.revokeObjectURL(localPreview); };
  }, [localPreview]);

  const validate = (file: File): string => {
    if (!accept.includes(file.type)) {
      return `Unsupported file type. Allowed: ${accept.map((t) => t.replace('image/', '')).join(', ')}.`;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File is too large. Maximum size is ${maxSizeMB} MB.`;
    }
    return '';
  };

  const handleFile = (file: File) => {
    const err = validate(file);
    if (err) { toast.error(err); return; }
    setLocalPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    onFileSelect(file);
  };

  const clearSelection = () => {
    setLocalPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return ''; });
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // Read-only mode: show saved preview only.
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

  const previewSrc = localPreview || value;

  return (
    <div className="space-y-2">
      <div
        data-testid="image-drop-zone"
        role="button"
        tabIndex={0}
        aria-label="Upload image"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
        }}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground transition-colors cursor-pointer hover:bg-muted/50',
          dragActive && 'border-primary bg-primary/5',
        )}
      >
        <Upload className="h-5 w-5" />
        <span>
          Drag &amp; drop an image here, or <span className="text-primary underline">browse</span>
        </span>
        <span className="text-xs">
          {accept.map((t) => t.replace('image/', '').toUpperCase()).join(', ')} · up to {maxSizeMB} MB
        </span>
        <input
          ref={inputRef}
          type="file"
          data-testid="image-upload-input"
          accept={accept.join(',')}
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {previewSrc && (
        <div className="flex items-center gap-3">
          <img
            src={previewSrc}
            alt="News"
            data-testid="image-preview"
            className="h-16 w-auto rounded object-contain border"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          {localPreview && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="image-remove"
              onClick={clearSelection}
            >
              <X className="mr-2 h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
