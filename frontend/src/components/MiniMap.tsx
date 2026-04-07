'use client';

import { useEffect, useRef } from 'react';
import type L from 'leaflet';

interface MiniMapProps {
  latitude: number;
  longitude: number;
  height?: string;
  zoom?: number;
  className?: string;
}

/**
 * MiniMap — 使用 Leaflet + OpenStreetMap 顯示打卡位置
 * 動態載入 Leaflet 避免 Next.js SSR 問題
 */
export default function MiniMap({
  latitude,
  longitude,
  height = '250px',
  zoom = 16,
  className = '',
}: MiniMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    let isMounted = true;

    const initMap = async () => {
      // Dynamic import to avoid SSR issues
      const leaflet = await import('leaflet');

      // Import Leaflet CSS
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);
      }

      if (!isMounted || !mapRef.current) return;

      // Clean up previous map instance
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = leaflet.map(mapRef.current).setView([latitude, longitude], zoom);
      mapInstanceRef.current = map;

      leaflet
        .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        })
        .addTo(map);

      // Fix default marker icon issue with bundlers
      const defaultIcon = leaflet.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      leaflet
        .marker([latitude, longitude], { icon: defaultIcon })
        .addTo(map)
        .bindPopup(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)
        .openPopup();

      // Force a resize after a short delay to ensure proper rendering
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    };

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [latitude, longitude, zoom]);

  return (
    <div
      ref={mapRef}
      className={`rounded-lg border border-gray-200 ${className}`}
      style={{ height, width: '100%' }}
    />
  );
}
