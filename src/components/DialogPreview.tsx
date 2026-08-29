import React, { useMemo } from 'react';
import { AlertCircle, Eye } from 'lucide-react';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { useI18n } from '../hooks/useI18n';
import type { TFunction } from '../i18n/types';

export interface DialogPreviewProps {
  xml: string;
}

interface PreviewRow {
  key: string;
  label?: string;
  element: Element | null;
}

interface ParseResult {
  ok: boolean;
  error?: string;
  rows: PreviewRow[];
  counts: Record<string, number>;
}

function cleanDataSource(src: string | null | undefined): string {
  if (!src) return '';
  return src
    .replace(/^@/, '')
    .replace(/_list$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseDialogXml(xml: string, t: TFunction): ParseResult {
  if (!xml.trim()) {
    return { ok: false, error: t('components.dialogPreview.noXmlProvided'), rows: [], counts: {} };
  }
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : t('components.dialogPreview.parseError'),
      rows: [],
      counts: {},
    };
  }
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    return {
      ok: false,
      error: (parserError.textContent || t('components.xml.invalidXml'))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240),
      rows: [],
      counts: {},
    };
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== 'Dialog') {
    return {
      ok: false,
      error: t('components.dialogPreview.requiresDialogRoot'),
      rows: [],
      counts: {},
    };
  }
  const children = Array.from(root.children);
  const rows: PreviewRow[] = [];
  const counts: Record<string, number> = {};
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.tagName === 'Label') {
      const labelText = el.getAttribute('Text') || '';
      const next = children[i + 1];
      if (next && next.tagName !== 'Label') {
        rows.push({ key: `${i}`, label: labelText, element: next });
        counts[next.tagName] = (counts[next.tagName] || 0) + 1;
        i++;
      } else {
        rows.push({ key: `${i}`, label: labelText, element: null });
      }
    } else {
      rows.push({ key: `${i}`, label: undefined, element: el });
      counts[el.tagName] = (counts[el.tagName] || 0) + 1;
    }
  }
  return { ok: true, rows, counts };
}

function renderControl(el: Element, t: TFunction): React.ReactNode {
  const tag = el.tagName;
  const name = el.getAttribute('Name') || '';
  if (tag === 'Date') {
    return <Input type="date" disabled placeholder={name} />;
  }
  if (tag === 'Lookup') {
    const source = cleanDataSource(el.getAttribute('DataSource'));
    return (
      <select
        disabled
        className="flex h-9 w-full rounded-md border border-input bg-muted/30 px-3 py-1 text-sm text-muted-foreground shadow-xs"
      >
        <option>
          {t('components.dialogPreview.selectPlaceholder', {
            source: source || t('components.dialogPreview.genericValue'),
          })}
        </option>
      </select>
    );
  }
  const attrs = Array.from(el.attributes);
  return (
    <div className="flex min-h-9 w-full items-center rounded-md border border-dashed border-input bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-mono">&lt;{tag}&gt;</span>
      {attrs.length > 0 && (
        <div className="ml-2 flex flex-wrap gap-1">
          {attrs.map((a) => (
            <span key={a.name} className="font-mono">
              {a.name}="{a.value}"
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const DialogPreview: React.FC<DialogPreviewProps> = ({ xml }) => {
  const { t } = useI18n();
  const parsed = useMemo(() => parseDialogXml(xml, t), [xml, t]);

  if (!parsed.ok) {
    return (
      <div className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <div className="text-sm font-medium text-destructive">{t('components.dialogPreview.previewUnavailable')}</div>
            <div className="mt-1 text-xs text-muted-foreground">{parsed.error}</div>
          </div>
        </div>
      </div>
    );
  }

  const fieldCount = parsed.rows.filter((r) => r.element).length;
  const countBadges = Object.entries(parsed.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => (
      <Badge key={tag} variant="outline" className="text-xs">
        {n} {tag}
      </Badge>
    ));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{t('components.dialogPreview.title')}</span>
          <Badge variant="secondary" className="text-xs">
            {fieldCount === 1
              ? t('components.dialogPreview.fieldCountSingular', { count: fieldCount })
              : t('components.dialogPreview.fieldCountPlural', { count: fieldCount })}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1">{countBadges}</div>
      </div>
      <div className="rounded-md border bg-muted/20 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {parsed.rows.map((row) => (
            <div key={row.key} className="space-y-2">
              {row.label !== undefined && (
                <Label className="text-xs text-muted-foreground">{row.label || '\u00A0'}</Label>
              )}
              {row.element ? (
                renderControl(row.element, t)
              ) : (
                <div className="text-xs text-muted-foreground italic">{t('components.dialogPreview.noControl')}</div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground italic">
          {t('components.dialogPreview.previewOnlyNote')}
        </p>
      </div>
    </div>
  );
};

export default DialogPreview;
