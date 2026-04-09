'use client';

import { useParams } from 'next/navigation';
import AcceptanceReportForm from '../AcceptanceReportForm';

export default function EditAcceptanceReportPage() {
  const params = useParams();
  const id = Number(params.id);
  return <AcceptanceReportForm reportId={id} />;
}
