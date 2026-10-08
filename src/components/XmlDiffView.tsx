import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { xml } from '@codemirror/lang-xml';
import { MergeView, unifiedMergeView } from '@codemirror/merge';
import { carmenEditorTheme, carmenHighlightStyle } from '../lib/codemirrorTheme';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface XmlDiffViewProps {
  /** เนื้อหาของเวอร์ชันที่เลือก (ฝั่งซ้าย/ต้นฉบับ) */
  original: string;
  /** เนื้อหาปัจจุบัน (ฝั่งขวา) */
  current: string;
  height?: string;
}

const readOnlyExtensions = () => [
  lineNumbers(),
  xml(),
  syntaxHighlighting(carmenHighlightStyle, { fallback: true }),
  EditorView.lineWrapping,
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  carmenEditorTheme('12px'),
];

const COLLAPSE = { margin: 3, minSize: 4 };

/**
 * diff XML แบบอ่านอย่างเดียว — side-by-side ที่ md ขึ้นไป, unified บนจอแคบ
 */
export const XmlDiffView: React.FC<XmlDiffViewProps> = ({ original, current, height = '420px' }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    if (wide) {
      const view = new MergeView({
        a: { doc: original, extensions: readOnlyExtensions() },
        b: { doc: current, extensions: readOnlyExtensions() },
        parent,
        collapseUnchanged: COLLAPSE,
        highlightChanges: true,
        gutter: true,
      });
      return () => view.destroy();
    }
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: current,
        extensions: [
          ...readOnlyExtensions(),
          unifiedMergeView({ original, mergeControls: false, collapseUnchanged: COLLAPSE }),
        ],
      }),
    });
    return () => view.destroy();
  }, [original, current, wide]);

  return <div ref={hostRef} className="overflow-auto rounded-md border" style={{ maxHeight: height }} />;
};
