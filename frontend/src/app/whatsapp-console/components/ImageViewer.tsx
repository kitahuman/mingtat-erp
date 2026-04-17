'use client';

import { useState, useEffect } from 'react';
import Cookies from 'js-cookie';

interface ImageViewerProps {
  src: string;
  alt?: string;
}

/** 使用 fetch + Authorization header 取得受保護的圖片，轉為 blob URL 顯示 */
async function fetchProtectedBlob(url: string): Promise<string> {
  const token = Cookies.get('token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function ImageViewer({ src, alt = '圖片' }: ImageViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    setLoading(true);
    setError(false);
    setBlobUrl(null);

    fetchProtectedBlob(src)
      .then(url => {
        objectUrl = url;
        setBlobUrl(url);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (loading) {
    return (
      <div className="w-[200px] h-[150px] bg-[#2a3942] rounded-lg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="w-[200px] h-[100px] bg-[#2a3942] rounded-lg flex flex-col items-center justify-center gap-1 text-[#8696a0]">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-xs">圖片無法載入</span>
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={blobUrl}
        alt={alt}
        className="max-w-[260px] max-h-[200px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => setLightbox(true)}
      />

      {/* 全螢幕 Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setLightbox(false)}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={blobUrl}
            alt={alt}
            className="max-w-full max-h-full object-contain rounded"
            onClick={e => e.stopPropagation()}
          />
          <a
            href={blobUrl}
            download="image"
            className="absolute bottom-4 right-4 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            onClick={e => e.stopPropagation()}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            下載
          </a>
        </div>
      )}
    </>
  );
}
