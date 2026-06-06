'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ContractManagementTabs from '@/components/contracts/ContractManagementTabs';
import { contractsApi } from '@/lib/api';

export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contractId = Number(params.id);
  const [checkingRedirect, setCheckingRedirect] = useState(true);

  useEffect(() => {
    let mounted = true;

    contractsApi
      .get(contractId)
      .then(res => {
        const projectId = res.data?.projects?.[0]?.id;
        if (projectId) {
          router.replace(`/projects/${projectId}`);
          return;
        }
        if (mounted) setCheckingRedirect(false);
      })
      .catch(() => {
        if (mounted) setCheckingRedirect(false);
      });

    return () => {
      mounted = false;
    };
  }, [contractId, router]);

  if (checkingRedirect) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <ContractManagementTabs
      contractId={contractId}
      showHeader
      showTabs
      backHref="/contracts"
      backLabel="合約管理"
      fallbackHref="/contracts"
    />
  );
}
