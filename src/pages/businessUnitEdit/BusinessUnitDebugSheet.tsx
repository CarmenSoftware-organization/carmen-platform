import React from 'react';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';

interface BusinessUnitDebugSheetProps {
  rawResponse: unknown;
  rawClusterUsersResponse: unknown;
  id?: string;
  clusterId?: string;
  fabClassName?: string;
}

const BusinessUnitDebugSheet: React.FC<BusinessUnitDebugSheetProps> = ({
  rawResponse,
  rawClusterUsersResponse,
  id,
  clusterId,
  fabClassName,
}) => (
  <DevDebugSheet
    title="Business Unit Debug"
    fabClassName={fabClassName}
    tabs={[
      { key: 'bu', label: 'Business Unit', data: rawResponse, endpoint: `GET /api-system/business-units/${id}` },
      { key: 'users', label: 'Cluster Users', data: rawClusterUsersResponse, endpoint: `GET /api-system/user/clusters/${clusterId}` },
    ]}
  />
);

export default BusinessUnitDebugSheet;
