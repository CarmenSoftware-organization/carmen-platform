
import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FunctionSquare,
  Loader2,
  Search,
  Database,
  Table,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { DbObject, DbObjectsResponse } from '../../types';

interface DbObjectTreeProps {
  data: DbObjectsResponse | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelect: (obj: {
    type: 'view' | 'procedure' | 'function' | 'table';
    schema: string;
    name: string;
  }) => void;
  loadingKey?: string | null;
}

export function DbObjectTree({
  data,
  isLoading,
  isError,
  onRetry,
  onSelect,
  loadingKey,
}: DbObjectTreeProps) {
  const [search, setSearch] = useState('');
  const [openTables, setOpenTables] = useState(true);
  const [openViews, setOpenViews] = useState(true);
  const [openProcs, setOpenProcs] = useState(true);

  const lower = search.trim().toLowerCase();
  const filtered = (() => {
    if (!data) return { tables: [], views: [], procedures: [] };
    const match = (o: DbObject) => {
      if (!lower) return true;
      const fq = `${o.schema}.${o.name}`.toLowerCase();
      return fq.includes(lower);
    };
    return {
      tables: data.tables.filter(match),
      views: data.views.filter(match),
      procedures: data.procedures.filter(match),
    };
  })();

  const isSearching = lower.length > 0;
  const showTables = isSearching ? filtered.tables.length > 0 : openTables;
  const showViews = isSearching ? filtered.views.length > 0 : openViews;
  const showProcs = isSearching ? filtered.procedures.length > 0 : openProcs;

  const keyOf = (type: string, o: DbObject) => `${type}:${o.schema}.${o.name}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Database className="text-muted-foreground size-4" />
        <span className="text-sm font-semibold">Database Objects</span>
      </div>
      <div className="border-b p-2">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <input
            type="text"
            className="bg-background ring-offset-background focus:ring-ring h-7 w-full rounded border pr-2 pl-7 text-xs outline-none focus:ring-2"
            placeholder="Search tables, views, procedures..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1 text-sm">
        {isLoading ? (
          <div className="text-muted-foreground flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : isError ? (
          <div className="text-destructive px-3 py-4 text-xs">
            Failed to load.{" "}
            <button
              className="underline"
              onClick={onRetry}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <Section
              title="Tables"
              icon={<Table className="size-3.5" />}
              count={filtered.tables.length}
              total={data?.tables.length ?? 0}
              open={showTables}
              onToggle={() => setOpenTables((v) => !v)}
            >
              {filtered.tables.map((t) => (
                <ItemRow
                  key={keyOf("table", t)}
                  name={t.name}
                  loading={loadingKey === keyOf("table", t)}
                  onClick={() =>
                    onSelect({ type: "table", schema: t.schema, name: t.name })
                  }
                />
              ))}
              {filtered.tables.length === 0 && (
                <EmptyHint>{search ? "No matches" : "No tables"}</EmptyHint>
              )}
            </Section>
            <Section
              title="Views"
              icon={<Eye className="size-3.5" />}
              count={filtered.views.length}
              total={data?.views.length ?? 0}
              open={showViews}
              onToggle={() => setOpenViews((v) => !v)}
            >
              {filtered.views.map((v) => (
                <ItemRow
                  key={keyOf("view", v)}
                  name={v.name}
                  loading={loadingKey === keyOf("view", v)}
                  onClick={() =>
                    onSelect({ type: "view", schema: v.schema, name: v.name })
                  }
                />
              ))}
              {filtered.views.length === 0 && (
                <EmptyHint>{search ? "No matches" : "No views"}</EmptyHint>
              )}
            </Section>
            <Section
              title="Procedures / Functions"
              icon={<FunctionSquare className="size-3.5" />}
              count={filtered.procedures.length}
              total={data?.procedures.length ?? 0}
              open={showProcs}
              onToggle={() => setOpenProcs((v) => !v)}
            >
              {filtered.procedures.map((p) => {
                const type = (p.kind as "procedure" | "function") || "function";
                return (
                  <ItemRow
                    key={keyOf(type, p)}
                    name={p.name}
                    badge={p.kind === "procedure" ? "PROC" : "FN"}
                    loading={loadingKey === keyOf(type, p)}
                    onClick={() =>
                      onSelect({ type, schema: p.schema, name: p.name })
                    }
                  />
                );
              })}
              {filtered.procedures.length === 0 && (
                <EmptyHint>
                  {search ? "No matches" : "No procedures/functions"}
                </EmptyHint>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  count,
  total,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onToggle}
        className="text-muted-foreground hover:bg-muted/50 flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold"
      >
        {open ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        {icon}
        <span>{title}</span>
        <span className="ml-auto text-[10px]">
          {count === total ? count : `${count}/${total}`}
        </span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

function ItemRow({
  name,
  badge,
  loading,
  onClick,
}: {
  name: string;
  badge?: string;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        "group hover:bg-muted/60 flex w-full items-center gap-2 px-3 py-1 text-left text-xs",
        "disabled:opacity-60",
      )}
      title={name}
    >
      {loading && <Loader2 className="size-3 animate-spin" />}
      <span className="truncate">{name}</span>
      {badge && (
        <span className="bg-muted text-muted-foreground ml-auto rounded px-1 py-0.5 text-[9px] font-semibold">
          {badge}
        </span>
      )}
    </button>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground px-3 py-2 text-[11px] italic">
      {children}
    </div>
  );
}
