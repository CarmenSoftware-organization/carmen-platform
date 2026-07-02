import React from 'react';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';

interface BusinessUnitDebugSheetProps {
  rawResponse: unknown;
  rawClusterUsersResponse: unknown;
  id?: string;
  clusterId?: string;
}

const BusinessUnitDebugSheet: React.FC<BusinessUnitDebugSheetProps> = ({ rawResponse, rawClusterUsersResponse, id, clusterId }) => (
  <DevDebugSheet
    title="Business Unit Debug"
    tabs={[
      { key: 'bu', label: 'Business Unit', data: rawResponse, endpoint: `GET /api-system/business-units/${id}` },
      { key: 'users', label: 'Cluster Users', data: rawClusterUsersResponse, endpoint: `GET /api-system/user/clusters/${clusterId}` },
    ]}
  />
);

export default BusinessUnitDebugSheet;
