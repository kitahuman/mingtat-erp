'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { employeePortalApi } from '@/lib/employee-portal-api';

interface AttendanceRecord {
  id: number;
  type: string;
  timestamp: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  photo_url?: string | null;
}

export default function ClockPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number; address?: string } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadTodayRecords = useCallback(async () => {
    try {
      const res = await employeePortalApi.getTodayAttendance();
      setTodayRecords(res.data.records || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadTodayRecords();
  }, [loadTodayRecords]);

  const getLocation = () => {
    if (!navigator.geolocation) {
      setError(t('locationFailed'));
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setLocation({ lat, lng });
        setLocationLoading(false);
      },
      () => {
        setError(t('locationFailed'));
        setLocationLoading(false);
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  };

  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      // Fallback to file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          setPhotoFile(file);
          const reader = new FileReader();
          reader.onload = (ev) => setPhotoDataUrl(ev.target?.result as string);
          reader.readAsDataURL(file);
        }
      };
      input.click();
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `clock_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setPhotoFile(file);
        setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.8));
      }
    }, 'image/jpeg', 0.8);
    closeCamera();
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const handleClock = async (type: 'clock_in' | 'clock_out') => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      let photoUrl: string | undefined;
      if (photoFile) {
        const uploadRes = await employeePortalApi.uploadPhoto(photoFile);
        photoUrl = uploadRes.data.url;
      }

      await employeePortalApi.clockInOut({
        type,
        photo_url: photoUrl,
        latitude: location?.lat,
        longitude: location?.lng,
        address: location?.address,
      });

      setSuccess(type === 'clock_in' ? t('clockInSuccess') : t('clockOutSuccess'));
      setPhotoDataUrl(null);
      setPhotoFile(null);
      setLocation(null);
      await loadTodayRecords();
    } catch (err: any) {
      setError(err.response?.data?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">{t('clockInTitle')}</h1>

      {/* Success/Error messages */}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium text-center">
          ✅ {success}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
          ❌ {error}
        </div>
      )}

      {/* Camera Section */}
      {cameraOpen ? (
        <div className="bg-black rounded-2xl overflow-hidden relative">
          <video ref={videoRef} className="w-full" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
            <button
              onClick={capturePhoto}
              className="w-16 h-16 bg-white rounded-full border-4 border-gray-300 shadow-lg active:scale-95 transition-transform"
            />
            <button
              onClick={closeCamera}
              className="px-4 py-2 bg-gray-800 text-white rounded-xl text-sm"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
          {/* Photo Preview */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">{t('photo')}</p>
            {photoDataUrl ? (
              <div className="relative">
                <img
                  src={photoDataUrl}
                  alt="preview"
                  className="w-full h-48 object-cover rounded-xl"
                />
                <button
                  onClick={openCamera}
                  className="absolute bottom-2 right-2 px-3 py-1.5 bg-white rounded-lg text-xs font-medium shadow border"
                >
                  {t('retakePhoto')}
                </button>
              </div>
            ) : (
              <button
                onClick={openCamera}
                className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm font-medium">{t('takePhoto')}</span>
              </button>
            )}
          </div>

          {/* GPS Location */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">GPS</p>
            {location ? (
              <div className="bg-green-50 rounded-xl p-3 text-sm text-green-700">
                <p className="font-medium">✅ {t('locationObtained')}</p>
                <p className="text-xs mt-1 text-green-600">
                  {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                </p>
              </div>
            ) : (
              <button
                onClick={getLocation}
                disabled={locationLoading}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center gap-2 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm font-medium">
                  {locationLoading ? t('gettingLocation') : t('getLocation')}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Clock Buttons */}
      {!cameraOpen && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleClock('clock_in')}
            disabled={loading}
            className="py-5 bg-green-600 text-white font-bold rounded-2xl text-base hover:bg-green-700 active:bg-green-800 transition-colors disabled:opacity-50 shadow-md flex flex-col items-center gap-1"
          >
            <span className="text-2xl">🟢</span>
            <span>{t('clockIn')}</span>
          </button>
          <button
            onClick={() => handleClock('clock_out')}
            disabled={loading}
            className="py-5 bg-red-600 text-white font-bold rounded-2xl text-base hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 shadow-md flex flex-col items-center gap-1"
          >
            <span className="text-2xl">🔴</span>
            <span>{t('clockOut')}</span>
          </button>
        </div>
      )}

      {/* Today's Records */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-800 mb-3">{t('todayRecord')}</h3>
        {todayRecords.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-3">{t('noTodayRecord')}</p>
        ) : (
          <div className="space-y-2">
            {todayRecords.map((record) => (
              <div
                key={record.id}
                className={`flex items-center gap-3 p-3 rounded-xl ${
                  record.type === 'clock_in' ? 'bg-green-50' : 'bg-red-50'
                }`}
              >
                <span className="text-xl">{record.type === 'clock_in' ? '🟢' : '🔴'}</span>
                <div className="flex-1">
                  <p className={`font-semibold text-sm ${record.type === 'clock_in' ? 'text-green-700' : 'text-red-700'}`}>
                    {record.type === 'clock_in' ? t('clockIn') : t('clockOut')}
                  </p>
                  <p className="text-xs text-gray-500">{formatTime(record.timestamp)}</p>
                  {record.latitude && (
                    <p className="text-xs text-gray-400">
                      📍 {record.latitude.toFixed(4)}, {record.longitude?.toFixed(4)}
                    </p>
                  )}
                </div>
                {record.photo_url && (
                  <img
                    src={record.photo_url}
                    alt="clock photo"
                    className="w-12 h-12 object-cover rounded-lg"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
