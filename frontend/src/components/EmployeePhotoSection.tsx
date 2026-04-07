'use client';

import { useState, useEffect, useRef } from 'react';
import { employeesApi } from '@/lib/api';

// Compress image using canvas
function compressImage(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

interface Props {
  employeeId: number;
}

export default function EmployeePhotoSection({ employeeId }: Props) {
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPhoto = async () => {
    setLoading(true);
    try {
      const res = await employeesApi.getPhoto(employeeId);
      setHasPhoto(res.data.hasPhoto);
      setPhotoData(res.data.photo_base64 || null);
    } catch {
      setHasPhoto(false);
      setPhotoData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (employeeId) loadPhoto();
  }, [employeeId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setMessage('請選擇圖片檔案');
      return;
    }

    setUploading(true);
    setMessage('');

    try {
      // Compress image before upload
      const compressed = await compressImage(file, 800, 0.8);
      try {
        await employeesApi.updatePhoto(employeeId, compressed);
        setMessage('標準照已更新');
        await loadPhoto();
      } catch (err: any) {
        setMessage(err.response?.data?.message || '上傳失敗');
      } finally {
        setUploading(false);
      }
    } catch {
      setMessage('讀取檔案失敗');
      setUploading(false);
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async () => {
    if (!confirm('確定要刪除標準照嗎？')) return;
    setUploading(true);
    try {
      await employeesApi.deletePhoto(employeeId);
      setMessage('標準照已刪除');
      setPhotoData(null);
      setHasPhoto(false);
    } catch (err: any) {
      setMessage(err.response?.data?.message || '刪除失敗');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">標準照（人臉識別）</h2>
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-primary text-sm"
          >
            {uploading ? '上傳中...' : hasPhoto ? '更換照片' : '上傳照片'}
          </button>
          {hasPhoto && (
            <button
              onClick={handleDelete}
              disabled={uploading}
              className="btn-secondary text-sm text-red-600 hover:text-red-700"
            >
              刪除
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {message && (
        <div className={`mb-4 p-2 rounded-lg text-sm text-center ${
          message.includes('失敗') || message.includes('不能')
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : hasPhoto && photoData ? (
        <div className="flex justify-center">
          <img
            src={photoData}
            alt="Employee standard photo"
            className="max-w-xs max-h-64 rounded-xl border border-gray-200 shadow-sm object-cover"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm">尚未上傳標準照</p>
          <p className="text-xs mt-1">標準照用於公司打卡時的人臉識別驗證</p>
        </div>
      )}
    </div>
  );
}
