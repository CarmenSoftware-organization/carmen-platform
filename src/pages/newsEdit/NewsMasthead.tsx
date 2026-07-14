import { Newspaper, Globe, Building2 } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import type { NewsStatus } from '../../types';

/** Human-readable audience for the masthead eyebrow. */
export function describeReach(isGlobal: boolean, count: number): string {
  if (isGlobal || count === 0) return 'Global';
  return `${count} business unit${count === 1 ? '' : 's'}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const statusVariant = (s: NewsStatus): 'success' | 'secondary' | 'outline' =>
  s === 'published' ? 'success' : s === 'archived' ? 'outline' : 'secondary';

/** Short state note trailing the eyebrow — the publish date once live, else who can see it. */
function stateNote(status: NewsStatus, publishedLabel?: string): string | undefined {
  if (status === 'published') return publishedLabel;
  if (status === 'archived') return 'Hidden from readers';
  return 'Not visible to readers';
}

interface NewsMastheadProps {
  status: NewsStatus;
  isGlobal: boolean;
  buCount: number;
  title: string;
  publishedLabel?: string;
  editing: boolean;
  coverUrl?: string;
  coverEditor?: React.ReactNode; // ImageUpload, shown in place of the banner while editing
  titleEditor?: React.ReactNode; // the headline input, shown in place of the <h1> while editing
  actions?: React.ReactNode; // the Edit control, read mode only
}

/** The editorial header of one article: cover, status, audience, and the headline itself. */
export function NewsMasthead({
  status,
  isGlobal,
  buCount,
  title,
  publishedLabel,
  editing,
  coverUrl,
  coverEditor,
  titleEditor,
  actions,
}: NewsMastheadProps) {
  const global = isGlobal || buCount === 0;
  const note = stateNote(status, publishedLabel);

  return (
    <Card className="overflow-hidden p-0">
      {editing ? (
        coverEditor && <div className="bg-muted/30 border-b p-4 sm:p-5">{coverEditor}</div>
      ) : coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          className="h-40 w-full border-b object-cover sm:h-48"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="bg-muted/40 text-muted-foreground/40 flex h-20 items-center justify-center border-b">
          <Newspaper className="size-6" />
        </div>
      )}

      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-muted-foreground mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <Badge variant={statusVariant(status)}>{cap(status)}</Badge>
              <span className="inline-flex items-center gap-1">
                {global ? <Globe className="size-3" /> : <Building2 className="size-3" />}
                {describeReach(isGlobal, buCount)}
              </span>
              {note && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{note}</span>
                </>
              )}
            </div>
            {editing ? titleEditor : <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title || '(untitled)'}</h1>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      </div>
    </Card>
  );
}
