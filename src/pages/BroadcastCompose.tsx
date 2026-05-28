import React from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Megaphone } from 'lucide-react';

const BroadcastCompose: React.FC = () => {
  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Send Broadcast</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Push a notification to all users, specific users, or a business unit.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Compose</CardTitle>
            <CardDescription>Form coming in Task 5.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* TARGET_MODE_SELECTOR */}
            {/* CONDITIONAL_TARGET */}
            {/* COMMON_FIELDS */}
            {/* ACTION_BAR */}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default BroadcastCompose;
