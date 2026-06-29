import React from 'react';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { CollapsibleSection, ReadOnlyText } from '../shared';
import type { SectionFieldProps } from '../types';

const DateTimeFormatsSection: React.FC<SectionFieldProps> = ({ formData, editing, onChange }) => (
  <CollapsibleSection title="Date/Time Formats" description="Date, time, and timezone configuration" forceOpen>
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date_format">Date Format</Label>
          {editing ? (
            <Input
              type="text"
              id="date_format"
              name="date_format"
              value={formData.date_format}
              onChange={onChange}
              placeholder="e.g. YYYY-MM-DD"
            />
          ) : (
            <ReadOnlyText value={formData.date_format} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="date_time_format">Date/Time Format</Label>
          {editing ? (
            <Input
              type="text"
              id="date_time_format"
              name="date_time_format"
              value={formData.date_time_format}
              onChange={onChange}
              placeholder="e.g. YYYY-MM-DD HH:mm:ss"
            />
          ) : (
            <ReadOnlyText value={formData.date_time_format} />
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="time_format">Time Format</Label>
          {editing ? (
            <Input
              type="text"
              id="time_format"
              name="time_format"
              value={formData.time_format}
              onChange={onChange}
              placeholder="e.g. HH:mm:ss"
            />
          ) : (
            <ReadOnlyText value={formData.time_format} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="long_time_format">Long Time Format</Label>
          {editing ? (
            <Input
              type="text"
              id="long_time_format"
              name="long_time_format"
              value={formData.long_time_format}
              onChange={onChange}
              placeholder="e.g. HH:mm:ss.SSS"
            />
          ) : (
            <ReadOnlyText value={formData.long_time_format} />
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="short_time_format">Short Time Format</Label>
          {editing ? (
            <Input
              type="text"
              id="short_time_format"
              name="short_time_format"
              value={formData.short_time_format}
              onChange={onChange}
              placeholder="e.g. HH:mm"
            />
          ) : (
            <ReadOnlyText value={formData.short_time_format} />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          {editing ? (
            <Input
              type="text"
              id="timezone"
              name="timezone"
              value={formData.timezone}
              onChange={onChange}
              placeholder="e.g. Asia/Bangkok"
            />
          ) : (
            <ReadOnlyText value={formData.timezone} />
          )}
        </div>
      </div>
    </div>
  </CollapsibleSection>
);

export default DateTimeFormatsSection;
