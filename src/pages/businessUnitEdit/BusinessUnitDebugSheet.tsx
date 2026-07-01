import React from 'react';
import { DevDebugSheet } from '../../components/ui/dev-debug-sheet';

interface BusinessUnitDebugSheetProps {
  rawResponse: unknown;
  rawClusterUsersResponse: unknown;
}

const BusinessUnitDebugSheet: React.FC<BusinessUnitDebugSheetProps> = ({ rawResponse, rawClusterUsersResponse }) => (
  <DevDebugSheet
    title="Business Unit Debug"
    tabs={[
      { key: 'bu', label: 'Business Unit', data: rawResponse },
      { key: 'users', label: 'Cluster Users', data: rawClusterUsersResponse },
    ]}
  />
);

export default BusinessUnitDebugSheet;
