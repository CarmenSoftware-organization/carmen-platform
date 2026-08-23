import type { TabStripItem } from '../../components/TabStrip';

export type ClusterTabId = 'licensing' | 'business-units' | 'users';

export const CLUSTER_TAB_IDS: ClusterTabId[] = ['licensing', 'business-units', 'users'];

export const isClusterTabId = (v: string | null): v is ClusterTabId =>
  !!v && (CLUSTER_TAB_IDS as string[]).includes(v);

export type ClusterTab = TabStripItem<ClusterTabId>;
