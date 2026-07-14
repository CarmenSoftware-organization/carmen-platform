import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';

interface UserIdentityHeroProps {
  name: string;
  initials: string;
  avatarUrl?: string;
  username: string;
  email: string;
  alias?: string;
  isActive: boolean;
  buCount: number;
  clusterCount: number;
  actions?: React.ReactNode;
}

/** Read-first identity header for one user: who they are + how far their access reaches. */
export function UserIdentityHero({
  name,
  initials,
  avatarUrl,
  username,
  email,
  alias,
  isActive,
  buCount,
  clusterCount,
  actions,
}: UserIdentityHeroProps) {
  const hasAccess = buCount > 0 || clusterCount > 0;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
        <Avatar className="h-14 w-14 shrink-0 rounded-lg">
          <AvatarFallback className="bg-primary/90 rounded-lg text-lg font-bold text-white">
            {initials}
          </AvatarFallback>
          {avatarUrl && (
            <AvatarImage
              src={avatarUrl}
              alt=""
              className="absolute inset-0 rounded-lg object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
        </Avatar>

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{name || '(unnamed user)'}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            {username && (
              <span className="text-primary bg-primary/10 rounded px-1.5 py-0.5 font-mono text-xs font-semibold">
                {username}
              </span>
            )}
            {email && email !== username && (
              <span className="text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-xs">{email}</span>
            )}
            {alias && <span className="text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-xs">{alias}</span>}
            <Badge variant={isActive ? 'success' : 'secondary'}>{isActive ? 'Active' : 'Inactive'}</Badge>
          </div>
          <div className="text-muted-foreground/80 mt-2 text-[11.5px] leading-relaxed">
            {hasAccess ? (
              <>
                Access to {buCount} business unit{buCount === 1 ? '' : 's'} across {clusterCount} cluster
                {clusterCount === 1 ? '' : 's'}
              </>
            ) : (
              'No access assigned yet'
            )}
          </div>
        </div>

        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </Card>
  );
}
