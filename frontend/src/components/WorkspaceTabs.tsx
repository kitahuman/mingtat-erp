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
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type WorkspaceGroup = 'invoices' | 'quotations';

type WorkspaceTab = {
  id: string;
  path: string;
  initialPath: string;
  title: string;
  group: WorkspaceGroup;
};

type WorkspacePath = {
  path: string;
  title: string;
  group: WorkspaceGroup;
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
const MESSAGE_SOURCE = 'mingtat-workspace';
let tabSequence = 0;

const WorkspaceTabsContext = createContext<WorkspaceTabsContextValue | null>(
  null,
);

const describePath = (path: string): WorkspacePath | null => {
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

const createWorkspaceTab = (descriptor: WorkspacePath, title?: string): WorkspaceTab => ({
  id: `workspace-tab-${Date.now()}-${++tabSequence}`,
  path: descriptor.path,
  initialPath: descriptor.path,
  title: title || descriptor.title,
  group: descriptor.group,
});

const addFrameFlag = (path: string) => {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}workspace_frame=1`;
};

const fallbackPathFor = (tab: WorkspaceTab) => {
  if (tab.path === '/invoices' || tab.path === '/quotations') {
    return '/dashboard';
  }
  return tab.group === 'invoices' ? '/invoices' : '/quotations';
};

const postToParent = (message: Record<string, unknown>) => {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage(
    { source: MESSAGE_SOURCE, ...message },
    window.location.origin,
  );
};

export function WorkspaceTabsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const [isWorkspaceFrame] = useState(
    () => searchParams.get('workspace_frame') === '1',
  );
  const currentDescriptor = useMemo(() => describePath(pathname), [pathname]);
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() =>
    !isWorkspaceFrame && currentDescriptor
      ? [createWorkspaceTab(currentDescriptor)]
      : [],
  );
  const previousPath = useRef(pathname);
  const tabsRef = useRef(tabs);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const activateParentTab = useCallback(
    (path: string, title?: string) => {
      const descriptor = describePath(path);
      if (!descriptor) {
        router.push(path);
        return;
      }

      setTabs((current) => {
        const existing = current.find((tab) => tab.path === path);
        if (existing) {
          return title
            ? current.map((tab) =>
                tab.id === existing.id ? { ...tab, title } : tab,
              )
            : current;
        }
        return [...current, createWorkspaceTab(descriptor, title)].slice(-MAX_TABS);
      });
      router.push(path);
    },
    [router],
  );

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

      if (isWorkspaceFrame) {
        postToParent({ action: 'open', path, title });
        return;
      }
      activateParentTab(path, title);
    },
    [activateParentTab, isWorkspaceFrame],
  );

  const setTabTitle = useCallback(
    (path: string, title: string) => {
      if (!title.trim()) return;
      if (isWorkspaceFrame) {
        postToParent({ action: 'set-title', path, title: title.trim() });
        return;
      }
      setTabs((current) =>
        current.map((tab) =>
          tab.path === path ? { ...tab, title: title.trim() } : tab,
        ),
      );
    },
    [isWorkspaceFrame],
  );

  const closeParentTabById = useCallback(
    (tabId: string) => {
      const current = tabsRef.current;
      const index = current.findIndex((tab) => tab.id === tabId);
      if (index < 0) return;

      const closing = current[index];
      const nextTabs = current.filter((tab) => tab.id !== tabId);
      setTabs(nextTabs);

      if (pathname === closing.path) {
        const adjacent = nextTabs[Math.min(index, nextTabs.length - 1)];
        router.push(adjacent?.path || fallbackPathFor(closing));
      }
    },
    [pathname, router],
  );

  const closeTab = useCallback(
    (path: string) => {
      if (isWorkspaceFrame) {
        postToParent({ action: 'close', path });
        return;
      }
      const tab = tabsRef.current.find((item) => item.path === path);
      if (tab) closeParentTabById(tab.id);
    },
    [closeParentTabById, isWorkspaceFrame],
  );

  useEffect(() => {
    if (isWorkspaceFrame) {
      postToParent({ action: 'frame-navigate', path: pathname });
      return;
    }

    if (!currentDescriptor) return;
    setTabs((current) => {
      if (current.some((tab) => tab.path === pathname)) return current;
      return [...current, createWorkspaceTab(currentDescriptor)].slice(-MAX_TABS);
    });
  }, [currentDescriptor, isWorkspaceFrame, pathname]);

  // Links rendered inside a workspace frame are delegated to the parent. This
  // prevents the iframe from destroying its current page instance when users
  // click 「返回列表」 or another invoice/quotation link.
  useEffect(() => {
    if (!isWorkspaceFrame) return;

    const interceptLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target as Element | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      ) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      event.preventDefault();
      const targetPath = `${url.pathname}${url.search}${url.hash}`;
      if (describePath(url.pathname)) {
        postToParent({ action: 'open', path: targetPath });
      } else {
        postToParent({ action: 'navigate-outside', path: targetPath });
      }
    };

    document.addEventListener('click', interceptLink, true);
    return () => document.removeEventListener('click', interceptLink, true);
  }, [isWorkspaceFrame]);

  // Parent receives navigation/title/resize requests from its persistent frames.
  useEffect(() => {
    if (isWorkspaceFrame) return;

    const handleFrameMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.data?.source !== MESSAGE_SOURCE
      ) {
        return;
      }

      const frame = Array.from(
        document.querySelectorAll<HTMLIFrameElement>('iframe[data-workspace-tab-id]'),
      ).find((item) => item.contentWindow === event.source);
      const tabId = frame?.dataset.workspaceTabId;
      const action = event.data?.action;

      if (action === 'open' && typeof event.data.path === 'string') {
        activateParentTab(event.data.path, event.data.title);
        return;
      }
      if (action === 'navigate-outside' && typeof event.data.path === 'string') {
        router.push(event.data.path);
        return;
      }
      if (!tabId) return;

      if (action === 'set-title' && typeof event.data.title === 'string') {
        setTabs((current) =>
          current.map((tab) =>
            tab.id === tabId ? { ...tab, title: event.data.title } : tab,
          ),
        );
        return;
      }
      if (action === 'close') {
        closeParentTabById(tabId);
        return;
      }
      if (
        action === 'frame-navigate' &&
        typeof event.data.path === 'string' &&
        event.data.path !== pathname
      ) {
        const descriptor = describePath(event.data.path);
        if (!descriptor) {
          router.push(event.data.path);
          return;
        }
        setTabs((current) =>
          current.map((tab) =>
            tab.id === tabId
              ? {
                  ...tab,
                  path: descriptor.path,
                  group: descriptor.group,
                  title: descriptor.title,
                }
              : tab,
          ),
        );
        router.replace(descriptor.path);
      }
    };

    window.addEventListener('message', handleFrameMessage);
    return () => window.removeEventListener('message', handleFrameMessage);
  }, [activateParentTab, closeParentTabById, isWorkspaceFrame, pathname, router]);

  useEffect(() => {
    if (isWorkspaceFrame || previousPath.current === pathname) return;
    previousPath.current = pathname;
    window.dispatchEvent(new Event('workspace-tab-change'));
  }, [isWorkspaceFrame, pathname]);

  const closeOtherTabs = useCallback(() => {
    const active = tabsRef.current.find((tab) => tab.path === pathname);
    if (active) setTabs([active]);
  }, [pathname]);

  const contextValue = useMemo(
    () => ({ openTab, setTabTitle, closeTab }),
    [closeTab, openTab, setTabTitle],
  );

  if (isWorkspaceFrame) {
    return (
      <WorkspaceTabsContext.Provider value={contextValue}>
        {children}
      </WorkspaceTabsContext.Provider>
    );
  }

  return (
    <WorkspaceTabsContext.Provider value={contextValue}>
      {tabs.length > 0 && (
        <WorkspaceTabBar
          tabs={tabs}
          activePath={pathname}
          onOpen={(path) => router.push(path)}
          onClose={closeParentTabById}
          onCloseOthers={closeOtherTabs}
        />
      )}

      {tabs.map((tab) => (
        <iframe
          key={tab.id}
          data-workspace-tab-id={tab.id}
          src={addFrameFlag(tab.initialPath)}
          title={tab.title}
          hidden={tab.path !== pathname}
          aria-hidden={tab.path !== pathname}
          className="block h-[calc(100vh-8rem)] min-h-[480px] w-full border-0 bg-white"
        />
      ))}

      {!currentDescriptor && children}
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
  onClose: (id: string) => void;
  onCloseOthers: () => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 border-b border-gray-200 bg-white">
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto px-1 pt-1">
        {tabs.map((tab) => {
          const active = tab.path === activePath;
          return (
            <div
              key={tab.id}
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
                  onClose(tab.id);
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
