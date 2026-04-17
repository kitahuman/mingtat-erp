'use client';

import { useState, useRef, useEffect } from 'react';
import Cookies from 'js-cookie';

interface AudioPlayerProps {
  src: string;
}

/** 使用 fetch + Authorization header 取得受保護的音頻，轉為 blob URL */
async function fetchAudioBlob(url: string): Promise<string> {
  const token = Cookies.get('token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function AudioPlayer({ src }: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setLoading(false);
    });
    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });
    audio.addEventListener('ended', () => {
      setPlaying(false);
      setCurrentTime(0);
    });
    audio.addEventListener('error', () => {
      setLoading(false);
      setPlaying(false);
    });

    return () => {
      audio.pause();
      audio.src = '';
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    // 如果還沒有 blob URL，先 fetch
    if (!blobUrlRef.current) {
      setLoading(true);
      setFetchError(false);
      try {
        const blobUrl = await fetchAudioBlob(src);
        blobUrlRef.current = blobUrl;
        audio.src = blobUrl;
        // 等待 metadata 載入
        await new Promise<void>((resolve, reject) => {
          const onMeta = () => { audio.removeEventListener('loadedmetadata', onMeta); audio.removeEventListener('error', onErr); resolve(); };
          const onErr = () => { audio.removeEventListener('loadedmetadata', onMeta); audio.removeEventListener('error', onErr); reject(new Error('audio error')); };
          audio.addEventListener('loadedmetadata', onMeta);
          audio.addEventListener('error', onErr);
          audio.load();
        });
      } catch {
        setFetchError(true);
        setLoading(false);
        return;
      }
    }

    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setLoading(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !blobUrlRef.current) return;
    const t = parseFloat(e.target.value);
    audio.currentTime = t;
    setCurrentTime(t);
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const displayTime = playing || currentTime > 0 ? currentTime : duration;

  if (fetchError) {
    return (
      <div className="flex items-center gap-2 text-[#8696a0] text-xs min-w-[180px]">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        語音無法載入
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      {/* 播放/暫停按鈕 */}
      <button
        onClick={handlePlayPause}
        className="w-9 h-9 rounded-full bg-[#00a884] flex items-center justify-center text-white flex-shrink-0 hover:bg-[#017561] transition-colors disabled:opacity-60"
        disabled={loading}
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : playing ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* 進度條 + 時間 */}
      <div className="flex-1">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 accent-[#00a884] cursor-pointer"
          style={{ background: `linear-gradient(to right, #00a884 ${progress}%, #3b4a54 ${progress}%)` }}
        />
        <div className="flex justify-between mt-0.5">
          <span className="text-[10px] text-[#8696a0]">{formatTime(displayTime)}</span>
          <svg className="w-3 h-3 text-[#8696a0]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
