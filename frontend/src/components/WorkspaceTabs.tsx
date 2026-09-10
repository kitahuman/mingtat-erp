'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';

type WorkspaceTab = {
  path: string;
  title: string;
  group: 'invoices' | 'quotations';
};

type OpenTabEvent = {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  button?: number;
};

type WorkspaceTabsContextValue = {
  openTab: (path: string, title?: string, event?: OpenTabEvent) => void;
  setTabTitle: (path: string, title: string) => void;
  closeTab: (path: string) => void;
};

const MAX_TABS = 12;

const WorkspaceTabsContext = createContext<WorkspaceTabsContextValue | null>(
  null,
);

const describePath = (path: string): WorkspaceTab | null => {
  if (path === '/invoices') {
    return { path, title: '發票列表', group: 'invoices' };
  }
  const invoiceMatch = path.match(/^\/invoices\/(\d+)$/);
  if (invoiceMatch) {
    return {
      path,
      title: `發票 #${invoiceMatch[1]}`,
      group: 'invoices',
    };
  }
  if (path === '/quotations') {
    return { path, title: '報價單列表', group: 'quotations' };
  }
  const quotationMatch = path.match(/^\/quotations\/(\d+)$/);
  if (quotationMatch) {
    return {
      path,
      title: `報價單 #${quotationMatch[1]}`,
      group: 'quotations',
    };
  }
  return null;
};

const fallbackPathFor = (tab: WorkspaceTab) => {
  if (tab.path === '/invoices' || tab.path === '/quotations') {
    return '/dashboard';
  }
  return tab.group === 'invoices' ? '/invoices' : '/quotations';
};

export function WorkspaceTabsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const currentDescriptor = useMemo(() => describePath(pathname), [pathname]);
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() =>
    currentDescriptor ? [currentDescriptor] : [],
  );
  const [cachedPages, setCachedPages] = useState<Record<string, React.ReactNode>>(
    {},
  );
  const scrollPositions = useRef<Record<string, number>>({});
  const previousPath = useRef(pathname);

  useEffect(() => {
    const previous = previousPath.current;
    if (previous !== pathname) {
      window.dispatchEvent(new Event('workspace-tab-change'));
      scrollPositions.current[previous] = window.scrollY;
      previousPath.current = pathname;
      requestAnimationFrame(() => {
        window.scrollTo({
          top: scrollPositions.current[pathname] || 0,
          behavior: 'auto',
        });
        const hasVisibleModal = Array.from(
          document.querySelectorAll('[data-erp-modal-root]'),
        ).some((element) => !element.closest('[hidden]'));
        document.body.style.overflow = hasVisibleModal ? 'hidden' : '';
      });
    }

    if (!currentDescriptor) return;

    setTabs((current) => {
      const existing = current.find((tab) => tab.path === pathname);
      if (existing) return current;
      return [...current, currentDescriptor].slice(-MAX_TABS);
    });

    // Once a managed page is mounted, retain that exact React tree. Re-visiting
    // the URL only reveals the cached tree, so checkbox/form/filter state survives.
    setCachedPages((current) =>
      current[pathname] ? current : { ...current, [pathname]: children },
    );
  }, [pathname, currentDescriptor, children]);

  useEffect(() => {
    const retainedPaths = new Set(tabs.map((tab) => tab.path));
    if (currentDescriptor) retainedPaths.add(pathname);
    setCachedPages((current) => {
      const entries = Object.entries(current).filter(([path]) =>
        retainedPaths.has(path),
      );
      if (entries.length === Object.keys(current).length) return current;
      return Object.fromEntries(entries);
    });
  }, [currentDescriptor, pathname, tabs]);

  const openTab = useCallback(
    (path: string, title?: string, event?: OpenTabEvent) => {
      if (
        event?.ctrlKey ||
        event?.metaKey ||
        event?.shiftKey ||
        event?.button === 1
      ) {
        window.open(path, '_blank', 'noopener,noreferrer');
        return;
      }

      const descriptor = describePath(path);
      if (descriptor) {
        setTabs((current) => {
          const existing = current.find((tab) => tab.path === path);
          if (existing) {
            return current.map((tab) =>
              tab.path === path && title ? { ...tab, title } : tab,
            );
          }
          return [
            ...current,
            { ...descriptor, title: title || descriptor.title },
          ].slice(-MAX_TABS);
        });
      }
      router.push(path);
    },
    [router],
  );

  const setTabTitle = useCallback((path: string, title: string) => {
    if (!title.trim()) return;
    setTabs((current) =>
      current.map((tab) =>
        tab.path === path ? { ...tab, title: title.trim() } : tab,
      ),
    );
  }, []);

  const closeTab = useCallback(
    (path: string) => {
      const index = tabs.findIndex((tab) => tab.path === path);
      if (index < 0) return;

      const closing = tabs[index];
      const nextTabs = tabs.filter((tab) => tab.path !== path);
      setTabs(nextTabs);
      setCachedPages((current) => {
        const next = { ...current };
        delete next[path];
        return next;
      });
      delete scrollPositions.current[path];

      if (pathname === path) {
        const adjacent = nextTabs[Math.min(index, nextTabs.length - 1)];
        router.push(adjacent?.path || fallbackPathFor(closing));
      }
    },
    [pathname, router, tabs],
  );

  const closeOtherTabs = useCallback(() => {
    const descriptor = describePath(pathname);
    if (!descriptor) return;
    setTabs((current) => current.filter((tab) => tab.path === pathname));
    setCachedPages((current) => {
      const activePage = current[pathname];
      return activePage ? { [pathname]: activePage } : {};
    });
    scrollPositions.current = {
      [pathname]: scrollPositions.current[pathname] || 0,
    };
  }, [pathname]);

  const pagesToRender = useMemo(() => {
    if (!currentDescriptor || cachedPages[pathname]) return cachedPages;
    return { ...cachedPages, [pathname]: children };
  }, [cachedPages, children, currentDescriptor, pathname]);

  const contextValue = useMemo(
    () => ({ openTab, setTabTitle, closeTab }),
    [openTab, setTabTitle, closeTab],
  );

  if (!currentDescriptor) {
    return (
      <WorkspaceTabsContext.Provider value={contextValue}>
        {tabs.length > 0 && (
          <WorkspaceTabBar
            tabs={tabs}
            activePath={pathname}
            onOpen={(path) => router.push(path)}
            onClose={closeTab}
            onCloseOthers={closeOtherTabs}
          />
        )}
        {Object.entries(cachedPages).map(([path, page]) => (
          <div key={path} hidden aria-hidden="true">
            {page}
          </div>
        ))}
        {children}
      </WorkspaceTabsContext.Provider>
    );
  }

  return (
    <WorkspaceTabsContext.Provider value={contextValue}>
      <WorkspaceTabBar
        tabs={tabs}
        activePath={pathname}
        onOpen={(path) => router.push(path)}
        onClose={closeTab}
        onCloseOthers={closeOtherTabs}
      />
      {Object.entries(pagesToRender).map(([path, page]) => (
        <div
          key={path}
          data-workspace-page={path}
          hidden={path !== pathname}
          aria-hidden={path !== pathname}
        >
          {page}
        </div>
      ))}
    </WorkspaceTabsContext.Provider>
  );
}

function WorkspaceTabBar({
  tabs,
  activePath,
  onOpen,
  onClose,
  onCloseOthers,
}: {
  tabs: WorkspaceTab[];
  activePath: string;
  onOpen: (path: string) => void;
  onClose: (path: string) => void;
  onCloseOthers: () => void;
}) {
  if (tabs.length === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-2 border-b border-gray-200 bg-white">
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto px-1 pt-1">
        {tabs.map((tab) => {
          const active = tab.path === activePath;
          return (
            <div
              key={tab.path}
              className={`group flex max-w-[240px] shrink-0 items-center rounded-t-lg border border-b-0 text-sm transition-colors ${
                active
                  ? 'border-gray-300 bg-white text-primary-700 shadow-sm'
                  : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <button
                type="button"
                onClick={() => onOpen(tab.path)}
                className="min-w-0 truncate px-3 py-2"
                title={tab.title}
              >
                {tab.title}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  window.open(tab.path, '_blank', 'noopener,noreferrer');
                }}
                className="rounded px-1.5 py-1 text-gray-400 hover:bg-gray-300 hover:text-gray-700"
                aria-label={`在新瀏覽器分頁開啟 ${tab.title}`}
                title="在新瀏覽器分頁開啟"
              >
                ↗
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.path);
                }}
                className="mr-1 rounded px-1.5 py-1 text-gray-400 hover:bg-gray-300 hover:text-gray-700"
                aria-label={`關閉 ${tab.title}`}
                title="關閉頁籤（未儲存內容會被捨棄）"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      {tabs.length > 1 && describePath(activePath) && (
        <button
          type="button"
          onClick={onCloseOthers}
          className="mb-1 shrink-0 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          關閉其他
        </button>
      )}
    </div>
  );
}

export const useWorkspaceTabs = () => {
  const context = useContext(WorkspaceTabsContext);
  if (!context) {
    throw new Error('useWorkspaceTabs 必須在 WorkspaceTabsProvider 內使用');
  }
  return context;
};

export const useWorkspaceTabTitle = (title?: string, tabPath?: string) => {
  const pathname = usePathname() || '';
  const { setTabTitle } = useWorkspaceTabs();
  const targetPath = tabPath || pathname;

  useEffect(() => {
    if (title) setTabTitle(targetPath, title);
  }, [setTabTitle, targetPath, title]);
};
