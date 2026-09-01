import React, { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { xml } from '@codemirror/lang-xml';
import {
  foldGutter,
  foldKeymap,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { search, searchKeymap } from '@codemirror/search';
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete';
import { Check, Copy, Download, Upload, Wand2, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ConfirmDialog } from './ui/confirm-dialog';
import {
  formatXml,
  validateXml,
  countLines,
  byteSize,
  formatBytes,
  downloadText,
  type XmlValidation,
} from '../utils/xml';
import { carmenEditorTheme, carmenHighlightStyle } from '../lib/codemirrorTheme';
import { useI18n } from '../hooks/useI18n';

export interface XmlEditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  label?: string;
  filename?: string;
  onParseChange?: (status: XmlValidation) => void;
  readOnly?: boolean;
  uploadAccept?: string;
}

const baseExtensions = () => [
  lineNumbers(),
  foldGutter(),
  highlightActiveLine(),
  history(),
  bracketMatching(),
  indentOnInput(),
  closeBrackets(),
  autocompletion(),
  syntaxHighlighting(carmenHighlightStyle, { fallback: true }),
  search({ top: true }),
  xml(),
  EditorView.lineWrapping,
  keymap.of([
    ...defaultKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...searchKeymap,
    ...completionKeymap,
    ...closeBracketsKeymap,
    indentWithTab,
  ]),
  carmenEditorTheme('12px'),
];

export const XmlEditor: React.FC<XmlEditorProps> = ({
  value,
  onChange,
  placeholder,
  minHeight = 320,
  maxHeight = 560,
  label = 'XML',
  filename,
  onParseChange,
  readOnly = false,
  uploadAccept = '.xml,.txt',
}) => {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestValueRef = useRef(value);
  const [copied, setCopied] = useState(false);
  const [validation, setValidation] = useState<XmlValidation>({ valid: true });
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const runValidate = useCallback(
    (text: string) => {
      const result = validateXml(text);
      setValidation(result);
      onParseChange?.(result);
    },
    [onParseChange],
  );

  useEffect(() => {
    if (!hostRef.current) return;
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const next = update.state.doc.toString();
        latestValueRef.current = next;
        onChange?.(next);
      }
    });
    const state = EditorState.create({
      doc: value,
      extensions: [
        ...baseExtensions(),
        updateListener,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    latestValueRef.current = value;
    runValidate(value);
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === latestValueRef.current) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
    latestValueRef.current = value;
    runValidate(value);
  }, [value, runValidate]);

  useEffect(() => {
    const handle = setTimeout(() => runValidate(latestValueRef.current), 300);
    return () => clearTimeout(handle);
  }, [value, runValidate]);

  const replaceAll = (text: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  };

  const handleFormat = () => {
    const formatted = formatXml(latestValueRef.current);
    if (formatted === latestValueRef.current) {
      toast.info(t('components.xmlEditor.alreadyFormatted'));
      return;
    }
    replaceAll(formatted);
    toast.success(t('components.xmlEditor.formatted'));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(latestValueRef.current);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t('common.action.copiedToClipboard'));
    } catch {
      toast.error(t('common.action.copyFailed'));
    }
  };

  const handleDownload = () => {
    if (!latestValueRef.current) {
      toast.info(t('components.xmlEditor.nothingToDownload'));
      return;
    }
    const name = filename || `${label.toLowerCase().replace(/\s+/g, '-')}.xml`;
    downloadText(latestValueRef.current, name);
    toast.success(t('components.xmlEditor.downloaded', { name }));
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const formatted = formatXml(text);
      replaceAll(formatted);
      toast.success(t('components.xmlEditor.fileLoaded', { name: file.name }));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClear = () => {
    if (!latestValueRef.current) return;
    setConfirmClearOpen(true);
  };

  const confirmClear = () => {
    replaceAll('');
    setConfirmClearOpen(false);
    toast.success(t('components.xmlEditor.cleared'));
  };

  const lines = countLines(latestValueRef.current);
  const size = byteSize(latestValueRef.current);

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="cursor-pointer inline-flex h-8 items-center rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs hover:bg-accent hover:text-accent-foreground">
              <input
                ref={fileInputRef}
                type="file"
                accept={uploadAccept}
                className="hidden"
                onChange={handleUpload}
              />
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {t('common.action.upload')}
            </label>
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={handleFormat}>
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              {t('common.action.format')}
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={handleCopy}>
              {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              {copied ? t('common.action.copied') : t('common.action.copy')}
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={handleDownload}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t('common.action.download')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-destructive hover:text-destructive"
              onClick={handleClear}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t('common.action.clear')}
            </Button>
          </div>
        </div>
      )}
      {readOnly && (
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={handleCopy}>
            {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
            {copied ? t('common.action.copied') : t('common.action.copy')}
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={handleDownload}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t('common.action.download')}
          </Button>
        </div>
      )}
      <div
        ref={hostRef}
        className="rounded-md border border-input bg-background overflow-hidden"
        style={{ minHeight, maxHeight }}
        data-placeholder={placeholder}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {validation.valid ? (
          <div className="flex items-center gap-2 text-success">
            <Check className="h-3.5 w-3.5" />
            <span>{t('components.xmlEditor.validXml')}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {validation.line
                ? `${t('components.xmlEditor.lineLabel', { line: validation.line })}${
                    validation.column ? t('components.xmlEditor.colLabel', { column: validation.column }) : ''
                  }: `
                : ''}
              {validation.message || t('components.xml.invalidXml')}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Badge variant="outline" className="text-xs">
            {t('components.xmlEditor.linesCount', { count: lines })}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {formatBytes(size)}
          </Badge>
        </div>
      </div>
      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title={t('components.xmlEditor.clearDialogTitle')}
        description={t('components.xmlEditor.clearDialogDescription')}
        confirmText={t('common.action.clear')}
        cancelText={t('common.cancel')}
        confirmVariant="destructive"
        onConfirm={confirmClear}
      />
    </div>
  );
};
