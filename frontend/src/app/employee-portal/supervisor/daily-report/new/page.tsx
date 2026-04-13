'use client';

import { useSearchParams } from 'next/navigation';
import DailyReportForm from '../DailyReportForm';

export default function NewDailyReportPage() {
  const searchParams = useSearchParams();
  const copyFrom = searchParams.get('copy_from');
  
  return <DailyReportForm copyFromId={copyFrom ? parseInt(copyFrom) : undefined} />;
}
