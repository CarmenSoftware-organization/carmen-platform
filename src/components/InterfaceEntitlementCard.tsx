import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Plug, Loader2, Save } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { parseApiError } from '../utils/errorParser';
import interfaceEntitlementService from '../services/interfaceEntitlementService';
import { INTERFACE_CATALOG } from '../utils/interfaceCatalog';

interface InterfaceEntitlementCardProps {
  buCode: string;
  isSuperAdmin: boolean;
}

const sameSet = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && Array.from(a).every((k) => b.has(k));

/**
 * Super-admin control for which interface brands a business unit is licensed for.
 * Self-contained: loads and saves its own entitlement. An empty selection means the BU is
 * not restricted and sees every interface (matching the gateway's show-all default).
 */
export const InterfaceEntitlementCard = ({
  buCode,
  isSuperAdmin,
}: InterfaceEntitlementCardProps): ReactElement => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const disabledReason = !isSuperAdmin
    ? 'Super-admin required.'
    : !buCode
    ? 'Save the business unit first.'
    : null;

  useEffect(() => {
    if (disabledReason) return;
    let active = true;
    setLoading(true);
    interfaceEntitlementService
      .getByBuCode(buCode)
      .then((keys) => {
        if (!active) return;
        setSelected(new Set(keys));
        setInitial(new Set(keys));
        setLoaded(true);
      })
      .catch((err) => {
        if (!active) return;
        const { message } = parseApiError(err);
        toast.error(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [buCode, disabledReason]);

  const dirty = useMemo(() => !sameSet(selected, initial), [selected, initial]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setGroup = (keys: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const stored = await interfaceEntitlementService.setByBuCode(
        buCode,
        Array.from(selected),
      );
      const next = new Set(stored);
      setSelected(next);
      setInitial(next);
      toast.success('Interface entitlement saved');
    } catch (err) {
      const { message } = parseApiError(err);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="h-4 w-4" /> Interface Entitlement
        </CardTitle>
        <CardDescription>
          Which external-system interfaces this business unit may configure. Leave empty to
          allow every interface; select specific brands to restrict the BU to those.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {disabledReason ? (
          <p className="text-sm text-muted-foreground">{disabledReason}</p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {INTERFACE_CATALOG.map((group) => {
              const keys = group.brands.map((b) => b.key);
              const selectedCount = keys.filter((k) => selected.has(k)).length;
              const allOn = selectedCount === keys.length;
              return (
                <div key={group.category} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{group.label}</span>
                      <Badge variant="secondary">
                        {selectedCount}/{keys.length}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => setGroup(keys, !allOn)}
                    >
                      {allOn ? 'None' : 'All'}
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.brands.map((brand) => (
                      <label
                        key={brand.key}
                        className="flex items-center gap-2 rounded-md border border-input p-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selected.has(brand.key)}
                          disabled={saving}
                          onChange={() => toggle(brand.key)}
                        />
                        {brand.label}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="flex items-center gap-3">
              <Button type="button" size="sm" disabled={!loaded || !dirty || saving} onClick={save}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {saving ? 'Saving…' : 'Save entitlement'}
              </Button>
              {selected.size === 0 && loaded && (
                <span className="text-xs text-muted-foreground">
                  Not restricted. BU sees all interfaces.
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default InterfaceEntitlementCard;
