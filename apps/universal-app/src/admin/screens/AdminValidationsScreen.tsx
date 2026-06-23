import React, { useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { Text, TouchableOpacity } from 'react-native';
import { useAdminImageValidations } from '@/admin/api/admin';
import { AdminPagination } from '@/admin/components/AdminControls';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { AdminTable } from '@/admin/components/AdminTable';
import type { AdminStackParamList } from '@/types/navigation';

const PAGE_SIZE = 20;

function formatValidationScore(score: number | null, status: string): string {
  if (score != null) return String(score);
  if (status === 'provider_blocked') return 'blocked';
  return 'n/a';
}

export default function AdminValidationsScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const [offset, setOffset] = useState(0);
  const { data, isLoading, error } = useAdminImageValidations({ limit: PAGE_SIZE, offset });

  const rows = (data?.items ?? []).map((item) => [
    item.storyId,
    item.sceneIndex,
    item.attempt,
    formatValidationScore(item.validationScore, item.validationStatus),
    item.validationStatus,
    item.visionModel ?? 'n/a',
    new Date(item.createdAt).toLocaleString(),
    <TouchableOpacity
      key={`open-${item.id}`}
      onPress={() => navigation.navigate('AdminValidationDetail', { id: item.id })}
    >
      <Text style={{ color: '#2563eb', textDecorationLine: 'underline', fontWeight: '600' }}>
        Open
      </Text>
    </TouchableOpacity>,
  ]);

  return (
    <AdminLayout navigation={navigation} activeRoute="AdminValidations" title="Admin / Validations">
      {isLoading ? <AdminLoadingState /> : null}
      {error ? <AdminErrorState message={(error as Error).message} /> : null}
      {!isLoading && !error ? (
        <>
          <AdminTable
            headers={[
              'Story',
              'Scene',
              'Attempt',
              'Score',
              'Status',
              'Vision model',
              'Created',
              'View',
            ]}
            rows={rows}
            emptyText="No validations found."
          />
          <AdminPagination
            limit={PAGE_SIZE}
            offset={offset}
            total={data?.meta.total ?? 0}
            onChange={setOffset}
          />
        </>
      ) : null}
    </AdminLayout>
  );
}
