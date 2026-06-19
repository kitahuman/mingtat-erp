"use client";

import React, { useState, useRef } from 'react';
import Image from 'next/image';

const slides = [
  {
    title: "Slide 1: 建立糧單",
    image: "/tutorial/slide_01_建立糧單.png",
    content: [
      "1. 在管理頁面選擇「公司」（可選）及「員工」。",
      "2. 選擇計糧的「開始日期」與「結束日期」。",
      "3. 點擊「計算」按鈕，系統會自動抓取該時段的工作記錄並進行初步計算。",
      "4. 系統會建立一個「準備中 (Preparing)」狀態的糧單，完成後自動轉為「草稿 (Draft)」並跳轉至詳情頁。"
    ]
  },
  {
    title: "Slide 2: 逐筆明細",
    image: "/tutorial/slide_02_逐筆明細.png",
    content: [
      "• 顯示該時段內「每一筆」原始工作記錄副本。",
      "• 您可以查看每筆記錄是否成功匹配到「價目表 (Rate Card)」。",
      "• 意義：作為審計追蹤，確保每一筆出車或機械記錄都已計入糧單，無一遺漏。"
    ]
  },
  {
    title: "Slide 3: 歸組結算",
    image: "/tutorial/slide_03_歸組結算.png",
    content: [
      "• 將相同客戶、合約、路線及服務類型的記錄「自動歸組」。",
      "• 您可以切換「計費數量類型」（按天數、按數量或商品數量）。",
      "• 意義：方便與客戶核對總數。若匹配價目有誤差，可在這裏手動修正單價或處理四捨五入差異。"
    ]
  },
  {
    title: "Slide 4: 逐日計算",
    image: "/tutorial/slide_04_逐日計算.png",
    content: [
      "• 這是計算的「單一事實來源 (Single Source of Truth)」。",
      "• 顯示每日的工作收入、OT/中直、補底薪差額及津貼。",
      "• 您可以手動為特定日期「新增津貼 (Badge)」、覆蓋補底薪金額或排除特定項目。"
    ]
  },
  {
    title: "Slide 5: 糧單項目",
    image: "/tutorial/slide_05_糧單項目.png",
    content: [
      "• 底薪邏輯：日薪員工 = 工作收入 + 補底薪；月薪員工 = 按有效天數比例計算（日薪 = 月薪 × 12 / 365）。",
      "• 津貼邏輯：固定津貼（如租車、夜班）按當天實質天數比例計算；「中直津貼」則不斬半，全額發放。",
      "• OT 計算：按不同時段（如 18:00-19:00）或標準倍率自動累計。"
    ]
  },
  {
    title: "Slide 6: 自定義津貼扣款",
    image: "/tutorial/slide_06_自定義津貼扣款.png",
    content: [
      "• 應收總額 (Gross Income) = 底薪 + 所有津貼 + OT + 司機分傭。",
      "• 扣除項目 = 強積金 (MPF) 僱員扣款（顯示為負數）。",
      "• 淨薪金 (Net Amount) = 應收總額 + 自定義調整項 - 強積金扣款。"
    ]
  },
  {
    title: "Slide 7: 合計與MPF",
    image: "/tutorial/slide_07_合計與MPF.png",
    content: [
      "• 行業計劃：日薪基數 = (應收總額 + 調整項) / 工作天數，再按政府分級表計算。",
      "• 一般計劃：(應收總額 + 調整項) × 5%，上限 $1,500。",
      "• 手動修改：在草稿狀態下，您可以手動修改「強積金基數」或「僱主供款額」。"
    ]
  },
  {
    title: "Slide 8: 付款",
    image: "/tutorial/slide_08_付款.png",
    content: [
      "1. 在糧單詳情頁下方找到「付款記錄」區塊。",
      "2. 點擊「新增付款記錄」，輸入日期、金額及付款方式。",
      "3. 系統會自動建立對應的「支出 (Payment Out)」記錄並更新糧單的未付餘額。",
      "4. 支持多次部分付款，直至結清為止。"
    ]
  }
];

export default function PayrollGuideSlides() {
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const next = () => setCurrent((current + 1) % slides.length);
  const prev = () => setCurrent((current - 1 + slides.length) % slides.length);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].screenX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].screenX;
    handleSwipe();
  };

  const handleSwipe = () => {
    const swipeThreshold = 50; // 最小滑動距離（像素）
    const diff = touchStartX.current - touchEndX.current;

    // 向左滑動（下一張）
    if (diff > swipeThreshold) {
      next();
    }
    // 向右滑動（上一張）
    else if (diff < -swipeThreshold) {
      prev();
    }
  };

  return (
    <div
      className="mt-12 mb-8 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">糧單管理教學指南</h2>
        <span className="text-sm text-gray-500 font-medium">
          {current + 1} / {slides.length}
        </span>
      </div>
      
      <div className="p-8 flex flex-col justify-center">
        {/* Text Section - 文字放上面 */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-primary-700 mb-6">
            {slides[current].title}
          </h3>
          <ul className="space-y-4">
            {slides[current].content.map((item, idx) => (
              <li key={idx} className="text-gray-700 leading-relaxed flex gap-3">
                <span className="flex-shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-primary-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Image Section - 圖片放下面 */}
        <div className="flex justify-center">
          <div className="w-full max-w-4xl">
            <div className="relative w-full bg-gray-100 rounded-lg overflow-hidden">
              <Image
                src={slides[current].image}
                alt={slides[current].title}
                width={1200}
                height={675}
                className="w-full h-auto"
                draggable={false}
                priority
              />
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
        <div className="flex gap-1.5">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrent(idx)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                current === idx ? 'bg-primary-600 w-6' : 'bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={prev}
            className="p-2 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
            title="上一張"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={next}
            className="p-2 rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
            title="下一張"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
