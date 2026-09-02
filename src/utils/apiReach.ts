import { moduleOf } from './apiCatalog';

export interface ApiReachInput {
  /** `allow_all` — every endpoint is granted by rule, so `apiNames` carries none of them. */
  allowAll: boolean;
  apiNames: string[];
  /** Size of the whole API catalog. `0` when it hasn't loaded or the fetch failed. */
  catalogSize: number;
}

export interface ApiReach {
  /** Endpoints reached. For `allow_all` this is the catalog itself. */
  granted: number;
  /** Whether a catalog size is known — without it there is no denominator to draw against. */
  anchored: boolean;
  /** The app reaches the whole catalog, by rule or by having been granted all of it. */
  full: boolean;
  /** Distinct modules reached. `0` for `allow_all`, whose module count comes from the catalog. */
  modules: number;
  /** Share of the catalog reached, 0–100. `0` when unanchored. */
  percent: number;
}

/**
 * An application's API reach measured against the catalog it is drawn from.
 *
 * The list (`ApplicationReachCell`) and the detail header (`ApplicationIdentityHero`) draw this
 * at different sizes, but they must never disagree about the numbers or about what counts as
 * full access — a list that says `883/883` over a detail page that says `883 endpoints` is the
 * defect this function exists to make impossible. The arithmetic lives here once; only the
 * rendering differs by context.
 */
export function reachOf({ allowAll, apiNames, catalogSize }: ApiReachInput): ApiReach {
  const anchored = catalogSize > 0;
  const granted = allowAll ? catalogSize : apiNames.length;
  const full = allowAll || (anchored && granted >= catalogSize);
  const modules = allowAll ? 0 : new Set(apiNames.map(moduleOf)).size;
  const percent = anchored ? Math.min(100, (granted / catalogSize) * 100) : 0;
  return { granted, anchored, full, modules, percent };
}
