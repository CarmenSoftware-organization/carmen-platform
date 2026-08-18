// STUB — Task B3 เขียนทับทั้งไฟล์นี้ทั้งหมด (Toggle/Edit-in-place/Relationship mode ตาม
// agent-os/standards/pages/edit-page-modes.md ยังไม่ได้เลือก) Task B2 สร้างไว้แค่ให้
// route /subscriptions/new และ /subscriptions/:id/edit import ได้และ typecheck ผ่าน
// — อย่าลงแรงกับไฟล์นี้เกินความจำเป็นก่อน B3
import React from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { PageHeader } from '../components/PageHeader';

const SubscriptionEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title={isNew ? 'Add Subscription' : 'Edit Subscription'}
          subtitle="Coming in Task B3."
          backTo="/subscriptions"
        />
      </div>
    </Layout>
  );
};

export default SubscriptionEdit;
