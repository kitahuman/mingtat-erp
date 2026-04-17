'use client';

import { useState, useRef, useEffect } from 'react';

interface VoiceRecorderProps {
  onSend: (audioBase64: string, mimeType: string) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // 自動開始錄音
    startRecording();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 選擇最佳 mimeType
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/ogg';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start(100);
      setRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } catch (err: any) {
      setError('無法存取麥克風：' + (err.message || err));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleSend = async () => {
    if (!audioBlob) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      onSend(base64, audioBlob.type);
    };
    reader.readAsDataURL(audioBlob);
  };

  const handlePlayPause = () => {
    if (!audioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (error) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33]">
        <span className="text-red-400 text-sm flex-1">{error}</span>
        <button onClick={onCancel} className="text-[#8696a0] text-sm hover:text-white">取消</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] flex-shrink-0">
      {/* 取消按鈕 */}
      <button
        onClick={() => {
          if (recording) stopRecording();
          onCancel();
        }}
        className="w-10 h-10 flex items-center justify-center text-[#8696a0] hover:text-red-400 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* 錄音狀態 */}
      <div className="flex-1 flex items-center gap-2">
        {recording ? (
          <>
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <div className="flex-1 flex items-center gap-1">
              {/* 波形動畫 */}
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-[#00a884] rounded-full animate-pulse"
                  style={{
                    height: `${8 + Math.random() * 16}px`,
                    animationDelay: `${i * 0.05}s`,
                  }}
                />
              ))}
            </div>
            <span className="text-[#e9edef] text-sm font-mono flex-shrink-0">{formatTime(duration)}</span>
          </>
        ) : audioUrl ? (
          <>
            <button
              onClick={handlePlayPause}
              className="w-8 h-8 rounded-full bg-[#00a884] flex items-center justify-center text-white"
            >
              {playing ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <span className="text-[#e9edef] text-sm font-mono">{formatTime(duration)}</span>
          </>
        ) : null}
      </div>

      {/* 停止/發送按鈕 */}
      {recording ? (
        <button
          onClick={stopRecording}
          className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white hover:bg-[#017561] transition-colors"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h12v12H6z" />
          </svg>
        </button>
      ) : audioBlob ? (
        <button
          onClick={handleSend}
          className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white hover:bg-[#017561] transition-colors"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
