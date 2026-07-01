import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from './sheet';
import { Button } from './button';
import { Badge } from './badge';
import { JsonViewer } from './json-viewer';
import { Code, Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface DevDebugTab { key: string; label: string; data: unknown }

export function DevDebugSheet({
  title, endpoint, data, tabs,
}: { title: string; endpoint?: string; data?: unknown; tabs?: DevDebugTab[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeKey, setActiveKey] = useState(tabs?.[0]?.key);

  if (!import.meta.env.DEV) return null;

  const hasTabs = !!tabs && tabs.length > 0;
  const activeTab = hasTabs ? (tabs!.find(t => t.key === activeKey) ?? tabs![0]) : undefined;
  const activeData = hasTabs ? activeTab?.data : data;
  const hasSomething = hasTabs ? tabs!.some(t => t.data != null) : data != null;
  if (!hasSomething) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(activeData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          aria-label="Open debug panel"
          className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
        >
          <Code className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" size="medium" className="w-full overflow-y-auto p-4 sm:p-6">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Code className="h-4 w-4 sm:h-5 sm:w-5" />
            {title}
            <Badge variant="outline" className="text-xs">DEV</Badge>
          </SheetTitle>
          {endpoint && <SheetDescription className="text-xs sm:text-sm">{endpoint}</SheetDescription>}
        </SheetHeader>
        <div className="mt-3 sm:mt-4 space-y-3">
          {hasTabs && (
            <div className="flex gap-1 border-b border-border overflow-x-auto">
              {tabs!.map(t => (
                <button
                  key={t.key}
                  onClick={() => setActiveKey(t.key)}
                  className={cn(
                    'px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
                    (activeTab?.key === t.key)
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
              {copied ? 'Copied!' : 'Copy JSON'}
            </Button>
          </div>
          <JsonViewer data={activeData} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
