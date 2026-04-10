'use client';

import { useEffect, useState } from 'react';

export default function VersionBadge() {
  const [version, setVersion] = useState<{ commit: string; deployTime: string } | null>(null);

  useEffect(() => {
    fetch('/version.json')
      .then(res => res.json())
      .catch(() => null)
      .then(data => setVersion(data));
  }, []);

  if (!version) return null;

  return (
    <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-700 mt-auto">
      <div className="flex items-center gap-1">
        <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full"></span>
        <span className="font-mono">{version.commit}</span>
      </div>
      <div className="text-[10px] text-gray-500 mt-0.5">{version.deployTime}</div>
    </div>
  );
}
