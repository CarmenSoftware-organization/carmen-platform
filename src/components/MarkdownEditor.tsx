import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Textarea } from './ui/textarea';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}

const proseClass =
  'max-w-none text-sm leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1 ' +
  '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:font-semibold ' +
  '[&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 ' +
  '[&_a]:text-primary [&_a]:underline [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs ' +
  '[&_table]:w-full [&_table]:my-2 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:px-2 [&_td]:py-1 ' +
  '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground';

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ value, onChange, readOnly, placeholder }) => {
  if (readOnly) {
    return (
      <div className="rounded-md border border-input bg-muted/50 px-3 py-2 min-h-[120px]">
        {value ? (
          <div className={proseClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}
      </div>
    );
  }

  return (
    <Tabs defaultValue="write" className="w-full">
      <TabsList>
        <TabsTrigger value="write">Write</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>
      <TabsContent value="write">
        <Textarea
          data-testid="markdown-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || 'Write your news content in Markdown...'}
          className="min-h-[200px] font-mono"
        />
      </TabsContent>
      <TabsContent value="preview">
        <div className="rounded-md border border-input px-3 py-2 min-h-[200px]">
          {value ? (
            <div className={proseClass}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Nothing to preview</span>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
};
