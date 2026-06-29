import React from 'react';
import { Label } from '../../../components/ui/label';
import DbConnectionView from '../../../components/DbConnectionView';
import { CollapsibleSection } from '../shared';
import type { SectionFieldProps } from '../types';

const DatabaseConnectionSection: React.FC<SectionFieldProps> = ({ formData }) => (
  <CollapsibleSection title="Database Connection" description="Database connection configuration (JSON)" forceOpen>
    <div className="space-y-2">
      <Label htmlFor="db_connection">Connection Config</Label>
      <DbConnectionView value={formData.db_connection} />
    </div>
  </CollapsibleSection>
);

export default DatabaseConnectionSection;
