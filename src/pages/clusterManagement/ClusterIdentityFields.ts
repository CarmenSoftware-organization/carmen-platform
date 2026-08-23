/**
 * The shape a cluster's identity is edited through, wherever it is edited.
 *
 * Four surfaces share it and none of them share a layout: the create form
 * (`ClusterCreateForm`), the platform plate (`clusterEdit/ClusterPlate`), the cluster-admin
 * profile (`clusterAdmin/ClusterProfile`), and the document rows underneath it
 * (`clusterEdit/sections/DetailsSection`). The two-mode `ClusterIdentityFields` component that
 * used to live here had one caller left — the create form — and the create form stopped being
 * a stack of identical full-width rows, so what survives is the contract rather than the
 * rendering of it.
 */
export interface ClusterFormData {
  code: string;
  name: string;
  alias_name: string;
  is_active: boolean;
  /** Create-mode only: the quota issued as the cluster's first BU-quota licence. */
  licensed_bus?: string;
  license_end_date?: string;
  license_no_expiry?: boolean;
}
