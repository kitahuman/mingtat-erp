'use client';

import { useState } from 'react';

interface ImageViewerProps {
  src: string;
  alt?: string;
}

export function ImageViewer({ src, alt = '圖片' }: ImageViewerProps) {
  const [lightbox, setLightbox] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="w-[200px] h-[150px] bg-[#2a3942] rounded-lg flex items-center justify-center text-[#8696a0] text-xs">
        圖片無法載入
      </div>
    );
  }

  return (
    <>
      <div
        className="relative cursor-pointer rounded-lg overflow-hidden max-w-[260px]"
        onClick={() => setLightbox(true)}
      >
        {!loaded && (
          <div className="w-[200px] h-[150px] bg-[#2a3942] rounded-lg flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className={`max-w-full max-h-[300px] object-cover rounded-lg transition-opacity ${loaded ? 'opacity-100' : 'opacity-0 absolute'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
        {loaded && (
          <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all flex items-center justify-center">
            <svg className="w-8 h-8 text-white opacity-0 hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
            onClick={() => setLightbox(false)}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-full object-contain"
            onClick={e => e.stopPropagation()}
          />
          <a
            href={src}
            download
            className="absolute bottom-4 right-4 bg-[#00a884] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#017561] transition-colors"
            onClick={e => e.stopPropagation()}
          >
            下載
          </a>
        </div>
      )}
    </>
  );
}
