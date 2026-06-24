import { useEffect, useRef, useCallback } from 'react';

interface PageRefreshOptions {
  onRefresh: () => Promise<void> | void;
  onBeforeRefresh?: () => Promise<boolean> | boolean;
  isDirty?: boolean;
}

/**
 * Hook 用於監聽全局頁面重新整理事件
 * 當用戶點擊 Sidebar 的重新整理按鈕時觸發
 * 
 * @param options - 配置選項
 * @param options.onRefresh - 重新整理時的回調函數（應執行 loadData）
 * @param options.onBeforeRefresh - 重新整理前的確認回調（如果有未儲存修改）
 * @param options.isDirty - 是否有未儲存的修改
 */
export function usePageRefresh({
  onRefresh,
  onBeforeRefresh,
  isDirty = false,
}: PageRefreshOptions) {
  const isRefreshingRef = useRef(false);

  const handlePageRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;

    // 如果有未儲存修改，先確認
    if (isDirty && onBeforeRefresh) {
      const shouldContinue = await onBeforeRefresh();
      if (!shouldContinue) return;
    }

    try {
      isRefreshingRef.current = true;
      await onRefresh();
    } catch (error) {
      console.error('頁面重新整理失敗:', error);
    } finally {
      isRefreshingRef.current = false;
    }
  }, [onRefresh, onBeforeRefresh, isDirty]);

  useEffect(() => {
    window.addEventListener('page-refresh', handlePageRefresh as EventListener);
    return () => {
      window.removeEventListener('page-refresh', handlePageRefresh as EventListener);
    };
  }, [handlePageRefresh]);
}

/**
 * 觸發全局頁面重新整理事件
 */
export function triggerPageRefresh() {
  window.dispatchEvent(new CustomEvent('page-refresh'));
}
