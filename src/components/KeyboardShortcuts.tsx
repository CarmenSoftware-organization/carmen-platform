import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';

const shortcuts = [
  { keys: `${modKey} + S`, description: 'Save changes (in edit mode)' },
  { keys: `${modKey} + K`, description: 'Focus search (on list pages)' },
  { keys: 'Escape', description: 'Close dialog or cancel edit' },
  { keys: '?', description: 'Show keyboard shortcuts' },
];

export const useGlobalShortcuts = (callbacks: {
  onSave?: () => void;
  onSearch?: () => void;
  onCancel?: () => void;
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (modifier && e.key === 's') {
        e.preventDefault();
        callbacks.onSave?.();
      }

      if (modifier && e.key === 'k') {
        e.preventDefault();
        callbacks.onSearch?.();
      }

      if (e.key === 'Escape') {
        callbacks.onCancel?.();
      }

      if (e.key === '?' && !isInput) {
        // Handled by KeyboardShortcutsHelp component
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callbacks]);
};

export const KeyboardShortcutsHelp: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Quick actions to speed up your workflow</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.description}</span>
              <kbd className="inline-flex items-center rounded border bg-muted px-2 py-1 text-xs font-mono font-medium text-muted-foreground">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
