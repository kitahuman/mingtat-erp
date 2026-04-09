'use client';

import { useParams } from 'next/navigation';
import DailyReportForm from '../DailyReportForm';

export default function EditDailyReportPage() {
  const params = useParams();
  const id = Number(params.id);
  return <DailyReportForm reportId={id} />;
}
