'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  MAX_WORKSPACE_DETAIL_TABS,
  WORKSPACE_MESSAGE_SOURCE,
  WORKSPACE_PROTOCOL_VERSION,
  WorkspaceGroup,
  WorkspacePathDescriptor,
  WorkspaceTabKind,
  addWorkspaceFrameFlag,
  decideWorkspaceDetailOpen,
  describeWorkspacePath,
} from '@/lib/workspaceRoutes';

type WorkspaceTab = {
  id: string;
  path: string;
  initialPath: string;
  title: string;
  group: WorkspaceGroup;
  kind: WorkspaceTabKind;
  canonicalKey: string;
  listPath: string;
  dirty: boolean;
  dirtyReason?: string;
  openerTabId?: string;
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
  setTabDirty: (path: string, dirty: boolean, reason?: string) => void;
  closeTab: (path: string) => void;
};

type PendingExternalOpen = {
  path: string;
  title: string;
};

type PendingFrameNavigation = {
  tabId: string;
  path: string;
  epoch: number;
  outerMode: 'push' | 'replace' | 'pop' | 'none';
};

type PendingCloseRequest = {
  tabId: string;
  expectedPath: string;
  generation: number;
  resolve: (allowed: boolean) => void;
};

const WorkspaceTabsContext = createContext<WorkspaceTabsContextValue | null>(
  null,
);

let tabSequence = 0;
let workspaceDiscardAllowedUntil = 0;

const createWorkspaceTab = (
  descriptor: WorkspacePathDescriptor,
  title?: string,
  openerTabId?: string,
): WorkspaceTab => ({
  id: `workspace-tab-${Date.now()}-${++tabSequence}`,
  path: descriptor.path,
  initialPath: descriptor.path,
  title: title || descriptor.title,
  group: descriptor.group,
  kind: descriptor.kind,
  canonicalKey: descriptor.canonicalKey,
  listPath: descriptor.listPath,
  dirty: false,
  openerTabId,
});

const createListTabFor = (
  descriptor: WorkspacePathDescriptor,
): WorkspaceTab | null => {
  const listDescriptor = describeWorkspacePath(descriptor.listPath);
  return listDescriptor ? createWorkspaceTab(listDescriptor) : null;
};

const createInitialTabs = (
  descriptor: WorkspacePathDescriptor | null,
): WorkspaceTab[] => {
  if (!descriptor) return [];
  if (descriptor.kind === 'list') return [createWorkspaceTab(descriptor)];

  const listTab = createListTabFor(descriptor);
  return listTab
    ? [listTab, createWorkspaceTab(descriptor, undefined, listTab.id)]
    : [createWorkspaceTab(descriptor)];
};

const isExternalOpenEvent = (event?: OpenTabEvent) =>
  Boolean(
    event?.ctrlKey ||
      event?.metaKey ||
      event?.shiftKey ||
      event?.button === 1,
  );

const openInNewBrowserTab = (path: string): boolean => {
  const opened = window.open('about:blank', '_blank');
  if (!opened) return false;
  opened.opener = null;
  opened.location.replace(path);
  return true;
};

const postToParent = (message: Record<string, unknown>) => {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage(
    {
      source: WORKSPACE_MESSAGE_SOURCE,
      protocolVersion: WORKSPACE_PROTOCOL_VERSION,
      ...message,
    },
    window.location.origin,
  );
};

const confirmDiscardDirtyTab = (tab: WorkspaceTab) =>
  !tab.dirty ||
  window.confirm(
    `${tab.title} 有未儲存的修改。確定要捨棄修改並關閉此頁籤嗎？`,
  );

export function WorkspaceTabsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const [isWorkspaceFrame] = useState(
    () => searchParams.get('workspace_frame') === '1',
  );
  const [locationHash, setLocationHash] = useState('');
  useEffect(() => {
    const syncHash = () => setLocationHash(window.location.hash);
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);
  const currentPath = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('workspace_frame');
    const query = params.toString();
    const currentHash =
      typeof window === 'undefined' ? locationHash : window.location.hash;
    return `${pathname}${query ? `?${query}` : ''}${currentHash}`;
  }, [locationHash, pathname, searchParams]);
  const currentDescriptor = useMemo(
    () => describeWorkspacePath(currentPath),
    [currentPath],
  );
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() =>
    isWorkspaceFrame ? [] : createInitialTabs(currentDescriptor),
  );
  const [pendingExternalOpen, setPendingExternalOpen] =
    useState<PendingExternalOpen | null>(null);
  const previousPath = useRef(currentPath);
  const tabsRef = useRef(tabs);
  const activityByTabRef = useRef(new Map<string, boolean>());
  const frameDirtyRef = useRef(false);
  const frameReadySentRef = useRef(false);
  const incomingFrameNavigationRef = useRef<{
    path: string;
    epoch: number;
  } | null>(null);
  const closeRequestSequenceRef = useRef(0);
  const pendingCloseTabIdsRef = useRef(new Set<string>());
  const closeRequestResolversRef = useRef(
    new Map<string, PendingCloseRequest>(),
  );
  const frameReadyIdsRef = useRef(new Set<string>());
  const frameGenerationRef = useRef(new Map<string, number>());
  const navigationEpochRef = useRef(new Map<string, number>());
  const pendingFrameNavigationRef = useRef(
    new Map<string, PendingFrameNavigation>(),
  );
  const browserPopPendingRef = useRef(false);

  const commitTabs = useCallback((nextTabs: WorkspaceTab[]) => {
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
  }, []);

  const updateTabs = useCallback(
    (updater: (current: WorkspaceTab[]) => WorkspaceTab[]) => {
      setTabs((current) => {
        const next = updater(current);
        tabsRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useLayoutEffect(() => {
    if (isWorkspaceFrame) return;

    const handlePopState = () => {
      browserPopPendingRef.current = true;
    };

    window.addEventListener('popstate', handlePopState, true);
    return () => window.removeEventListener('popstate', handlePopState, true);
  }, [isWorkspaceFrame]);

  const postFrameNavigation = useCallback(
    (navigation: PendingFrameNavigation) => {
      if (!frameReadyIdsRef.current.has(navigation.tabId)) return;
      const frame = document.querySelector<HTMLIFrameElement>(
        `iframe[data-workspace-tab-id="${navigation.tabId}"]`,
      );
      frame?.contentWindow?.postMessage(
        {
          source: WORKSPACE_MESSAGE_SOURCE,
          protocolVersion: WORKSPACE_PROTOCOL_VERSION,
          action: 'navigate-to',
          path: navigation.path,
          epoch: navigation.epoch,
        },
        window.location.origin,
      );
    },
    [],
  );

  const navigateFrame = useCallback(
    (
      tabId: string,
      path: string,
      outerMode: PendingFrameNavigation['outerMode'] = 'none',
    ) => {
      closeRequestResolversRef.current.forEach((pending) => {
        if (pending.tabId === tabId) pending.resolve(false);
      });
      const epoch = (navigationEpochRef.current.get(tabId) || 0) + 1;
      navigationEpochRef.current.set(tabId, epoch);
      const navigation: PendingFrameNavigation = {
        tabId,
        path,
        epoch,
        outerMode,
      };
      pendingFrameNavigationRef.current.set(tabId, navigation);
      postFrameNavigation(navigation);
      return epoch;
    },
    [postFrameNavigation],
  );

  const pushWorkspacePath = useCallback(
    (path: string) => {
      browserPopPendingRef.current = false;
      router.push(path);
    },
    [router],
  );

  const replaceWorkspacePath = useCallback(
    (path: string) => {
      browserPopPendingRef.current = false;
      router.replace(path);
    },
    [router],
  );

  const requestCloseApproval = useCallback(
    (tab: WorkspaceTab): Promise<boolean> => {
      if (tab.kind === 'list') return Promise.resolve(false);
      const frame = document.querySelector<HTMLIFrameElement>(
        `iframe[data-workspace-tab-id="${tab.id}"]`,
      );
      if (!frame?.contentWindow) {
        return Promise.resolve(confirmDiscardDirtyTab(tab));
      }

      const requestId = `workspace-close-${Date.now()}-${++closeRequestSequenceRef.current}`;
      const generation = frameGenerationRef.current.get(tab.id) || 0;
      return new Promise((resolve) => {
        const timeout = window.setTimeout(() => {
          closeRequestResolversRef.current.delete(requestId);
          window.alert('頁面仍在載入，暫時無法安全關閉。請稍後再試。');
          resolve(false);
        }, 1500);

        closeRequestResolversRef.current.set(requestId, {
          tabId: tab.id,
          expectedPath: tab.path,
          generation,
          resolve: (allowed) => {
            window.clearTimeout(timeout);
            closeRequestResolversRef.current.delete(requestId);
            resolve(allowed);
          },
        });
        frame.contentWindow?.postMessage(
          {
            source: WORKSPACE_MESSAGE_SOURCE,
            protocolVersion: WORKSPACE_PROTOCOL_VERSION,
            action: 'request-close',
            requestId,
            expectedPath: tab.path,
            generation,
          },
          window.location.origin,
        );
      });
    },
    [],
  );

  const activateParentTab = useCallback(
    (path: string, title?: string, openerTabId?: string) => {
      const descriptor = describeWorkspacePath(path);
      if (!descriptor) {
        router.push(path);
        return;
      }

      const current = tabsRef.current;
      const decision = decideWorkspaceDetailOpen(current, descriptor);
      const existing = current.find(
        (tab) => tab.canonicalKey === descriptor.canonicalKey,
      );
      if (decision === 'activate-existing' && existing) {
        const nextPath = descriptor.path;
        const nextTabs = current.map((tab) =>
          tab.id === existing.id
            ? {
                ...tab,
                path: nextPath,
                ...(title ? { title } : {}),
              }
            : tab,
        );
        if (nextTabs !== current) commitTabs(nextTabs);
        pushWorkspacePath(nextPath);
        if (existing.path !== nextPath) {
          navigateFrame(existing.id, nextPath, 'push');
        }
        return;
      }

      if (decision === 'overflow') {
        setPendingExternalOpen({
          path: descriptor.path,
          title: title || descriptor.title,
        });
        return;
      }

      let nextTabs = current;
      if (descriptor.kind === 'list') {
        const nextListTab = createWorkspaceTab(descriptor, title);
        const currentListIndex = current.findIndex((tab) => tab.kind === 'list');
        if (currentListIndex >= 0) {
          nextListTab.id = current[currentListIndex].id;
          nextTabs = current.map((tab, index) =>
            index === currentListIndex ? nextListTab : tab,
          );
        } else {
          nextTabs = [nextListTab, ...current];
        }
      } else {
        if (!current.some((tab) => tab.kind === 'list')) {
          const listTab = createListTabFor(descriptor);
          if (listTab) nextTabs = [listTab, ...nextTabs];
        }
        nextTabs = [
          ...nextTabs,
          createWorkspaceTab(descriptor, title, openerTabId),
        ];
      }

      commitTabs(nextTabs);
      pushWorkspacePath(descriptor.path);
    },
    [commitTabs, navigateFrame, pushWorkspacePath, router],
  );

  const openTab = useCallback(
    (path: string, title?: string, event?: OpenTabEvent) => {
      if (isExternalOpenEvent(event)) {
        openInNewBrowserTab(path);
        return;
      }

      const targetDescriptor = describeWorkspacePath(path);
      if (
        isWorkspaceFrame &&
        currentDescriptor &&
        targetDescriptor?.canonicalKey === currentDescriptor.canonicalKey
      ) {
        if (
          frameDirtyRef.current &&
          !window.confirm('此頁有未儲存的修改。確定要捨棄修改並繼續嗎？')
        ) {
          return;
        }
        frameDirtyRef.current = false;
        postToParent({ action: 'navigate-within', path: targetDescriptor.path });
        return;
      }

      if (isWorkspaceFrame) {
        postToParent({ action: 'open', path, title });
        return;
      }
      activateParentTab(path, title);
    },
    [activateParentTab, currentDescriptor, isWorkspaceFrame, router],
  );

  const setTabTitle = useCallback(
    (path: string, title: string) => {
      if (!title.trim()) return;
      if (isWorkspaceFrame) {
        postToParent({ action: 'set-title', path, title: title.trim() });
        return;
      }

      const descriptor = describeWorkspacePath(path);
      updateTabs((current) =>
        current.map((tab) =>
          tab.path === path ||
          (descriptor && tab.canonicalKey === descriptor.canonicalKey)
            ? { ...tab, title: title.trim() }
            : tab,
        ),
      );
    },
    [isWorkspaceFrame, updateTabs],
  );

  const setTabDirty = useCallback(
    (path: string, dirty: boolean, reason?: string) => {
      if (isWorkspaceFrame) {
        frameDirtyRef.current = dirty;
        postToParent({ action: 'set-dirty', path, dirty, reason });
        return;
      }

      const descriptor = describeWorkspacePath(path);
      updateTabs((current) =>
        current.map((tab) =>
          tab.path === path ||
          (descriptor && tab.canonicalKey === descriptor.canonicalKey)
            ? { ...tab, dirty, dirtyReason: dirty ? reason : undefined }
            : tab,
        ),
      );
    },
    [isWorkspaceFrame, updateTabs],
  );

  const closeParentTabById = useCallback(
    async (tabId: string) => {
      if (pendingCloseTabIdsRef.current.has(tabId)) return;
      const current = tabsRef.current;
      const index = current.findIndex((tab) => tab.id === tabId);
      if (index < 0) return;

      const closing = current[index];
      if (closing.kind === 'list') return;
      pendingCloseTabIdsRef.current.add(tabId);
      const approved = await requestCloseApproval(closing);
      pendingCloseTabIdsRef.current.delete(tabId);
      if (!approved) return;

      const latest = tabsRef.current;
      const latestClosing = latest.find((tab) => tab.id === tabId);
      if (!latestClosing) return;
      const nextTabs = latest.filter((tab) => tab.id !== tabId);
      commitTabs(nextTabs);

      if (currentDescriptor?.canonicalKey === latestClosing.canonicalKey) {
        const opener = latestClosing.openerTabId
          ? nextTabs.find((tab) => tab.id === latestClosing.openerTabId)
          : null;
        const fallback = opener || nextTabs.find((tab) => tab.kind === 'list');
        pushWorkspacePath(fallback?.path || latestClosing.listPath);
      }
    },
    [commitTabs, currentDescriptor, pushWorkspacePath, requestCloseApproval],
  );

  const closeTab = useCallback(
    (path: string) => {
      if (isWorkspaceFrame) {
        postToParent({ action: 'close', path });
        return;
      }
      const descriptor = describeWorkspacePath(path);
      const tab = tabsRef.current.find(
        (item) =>
          item.path === path ||
          (descriptor && item.canonicalKey === descriptor.canonicalKey),
      );
      if (tab) closeParentTabById(tab.id);
    },
    [closeParentTabById, isWorkspaceFrame],
  );

  useEffect(() => {
    if (isWorkspaceFrame && !frameReadySentRef.current) {
      frameReadySentRef.current = true;
      postToParent({ action: 'frame-ready', path: currentPath });
    }
  }, [currentPath, isWorkspaceFrame]);

  useEffect(() => {
    if (isWorkspaceFrame) {
      const incomingNavigation = incomingFrameNavigationRef.current;
      if (incomingNavigation?.path === currentPath) {
        incomingFrameNavigationRef.current = null;
        postToParent({
          action: 'navigation-result',
          allowed: true,
          path: currentPath,
          epoch: incomingNavigation.epoch,
        });
      } else {
        postToParent({ action: 'frame-navigate', path: currentPath });
      }
      return;
    }

    if (!currentDescriptor) return;

    const current = tabsRef.current;
    const existing = current.find(
      (tab) => tab.canonicalKey === currentDescriptor.canonicalKey,
    );
    if (existing) {
      if (existing.path !== currentDescriptor.path) {
        commitTabs(
          current.map((tab) =>
            tab.id === existing.id
              ? {
                  ...tab,
                  path: currentDescriptor.path,
                  group: currentDescriptor.group,
                  kind: currentDescriptor.kind,
                  listPath: currentDescriptor.listPath,
                }
            : tab,
          ),
        );
        navigateFrame(
          existing.id,
          currentDescriptor.path,
          browserPopPendingRef.current ? 'pop' : 'replace',
        );
      } else {
        browserPopPendingRef.current = false;
      }
      return;
    }

    if (currentDescriptor.kind === 'detail') {
      const detailCount = current.filter((tab) => tab.kind === 'detail').length;
      if (detailCount >= MAX_WORKSPACE_DETAIL_TABS) {
        setPendingExternalOpen({
          path: currentDescriptor.path,
          title: currentDescriptor.title,
        });
        const listTab = current.find((tab) => tab.kind === 'list');
        replaceWorkspacePath(listTab?.path || currentDescriptor.listPath);
        return;
      }
    }

    let nextTabs = current;
    if (currentDescriptor.kind === 'list') {
      const listIndex = current.findIndex((tab) => tab.kind === 'list');
      const listTab = createWorkspaceTab(currentDescriptor);
      if (listIndex >= 0) {
        listTab.id = current[listIndex].id;
        nextTabs = current.map((tab, index) =>
          index === listIndex ? listTab : tab,
        );
      } else {
        nextTabs = [listTab, ...current];
      }
    } else {
      if (!current.some((tab) => tab.kind === 'list')) {
        const listTab = createListTabFor(currentDescriptor);
        if (listTab) nextTabs = [listTab, ...nextTabs];
      }
      nextTabs = [...nextTabs, createWorkspaceTab(currentDescriptor)];
    }
    browserPopPendingRef.current = false;
    commitTabs(nextTabs);
  }, [
    commitTabs,
    currentDescriptor,
    currentPath,
    isWorkspaceFrame,
    navigateFrame,
    replaceWorkspacePath,
  ]);

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

      const targetPath = `${url.pathname}${url.search}${url.hash}`;
      const targetDescriptor = describeWorkspacePath(targetPath);
      if (
        targetDescriptor &&
        currentDescriptor?.canonicalKey === targetDescriptor.canonicalKey
      ) {
        event.preventDefault();
        if (
          frameDirtyRef.current &&
          !window.confirm('此頁有未儲存的修改。確定要捨棄修改並繼續嗎？')
        ) {
          return;
        }
        frameDirtyRef.current = false;
        postToParent({ action: 'navigate-within', path: targetPath });
        return;
      }

      event.preventDefault();
      if (targetDescriptor) {
        postToParent({ action: 'open', path: targetPath });
      } else {
        postToParent({ action: 'navigate-outside', path: targetPath });
      }
    };

    document.addEventListener('click', interceptLink, true);
    return () => document.removeEventListener('click', interceptLink, true);
  }, [currentDescriptor, isWorkspaceFrame]);

  useEffect(() => {
    if (!isWorkspaceFrame) return;

    const handleParentMessage = (event: MessageEvent) => {
      if (
        event.source !== window.parent ||
        event.origin !== window.location.origin ||
        event.data?.source !== WORKSPACE_MESSAGE_SOURCE ||
        event.data?.protocolVersion !== WORKSPACE_PROTOCOL_VERSION
      ) {
        return;
      }

      if (
        event.data.action === 'activity' &&
        typeof event.data.active === 'boolean'
      ) {
        window.dispatchEvent(
          new CustomEvent('workspace-activity-change', {
            detail: { active: event.data.active },
          }),
        );
        window.dispatchEvent(new Event('workspace-tab-change'));
        if (event.data.active) {
          window.dispatchEvent(new Event('workspace-activated'));
        }
        return;
      }

      if (
        event.data.action === 'request-close' &&
        typeof event.data.requestId === 'string'
      ) {
        const allowed =
          !frameDirtyRef.current ||
          window.confirm('此頁有未儲存的修改。確定要捨棄修改並關閉嗎？');
        if (allowed) {
          if (frameDirtyRef.current) {
            workspaceDiscardAllowedUntil = Date.now() + 2_000;
            window.dispatchEvent(new Event('workspace-discard'));
          }
          frameDirtyRef.current = false;
        }
        postToParent({
          action: 'close-response',
          requestId: event.data.requestId,
          allowed,
          currentPath,
          expectedPath: event.data.expectedPath,
          generation: event.data.generation,
        });
        return;
      }

      if (
        event.data.action === 'navigate-to' &&
        typeof event.data.path === 'string' &&
        typeof event.data.epoch === 'number'
      ) {
        const targetDescriptor = describeWorkspacePath(event.data.path);
        if (
          !targetDescriptor ||
          targetDescriptor.canonicalKey !== currentDescriptor?.canonicalKey
        ) {
          return;
        }
        if (targetDescriptor.path === currentPath) {
          postToParent({
            action: 'navigation-result',
            allowed: true,
            path: currentPath,
            epoch: event.data.epoch,
          });
          return;
        }
        if (
          frameDirtyRef.current &&
          !window.confirm('此頁有未儲存的修改。確定要捨棄修改並繼續嗎？')
        ) {
          postToParent({
            action: 'navigation-result',
            allowed: false,
            path: currentPath,
            epoch: event.data.epoch,
          });
          return;
        }
        frameDirtyRef.current = false;
        incomingFrameNavigationRef.current = {
          path: targetDescriptor.path,
          epoch: event.data.epoch,
        };
        router.replace(addWorkspaceFrameFlag(targetDescriptor.path));
      }
    };

    window.addEventListener('message', handleParentMessage);
    return () => window.removeEventListener('message', handleParentMessage);
  }, [currentDescriptor, currentPath, isWorkspaceFrame, router]);

  useEffect(() => {
    if (isWorkspaceFrame) return;

    const handleFrameMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.data?.source !== WORKSPACE_MESSAGE_SOURCE ||
        event.data?.protocolVersion !== WORKSPACE_PROTOCOL_VERSION
      ) {
        return;
      }

      const frame = Array.from(
        document.querySelectorAll<HTMLIFrameElement>(
          'iframe[data-workspace-tab-id]',
        ),
      ).find((item) => item.contentWindow === event.source);
      const tabId = frame?.dataset.workspaceTabId;
      const action = event.data?.action;
      if (!tabId) return;

      if (action === 'open' && typeof event.data.path === 'string') {
        activateParentTab(event.data.path, event.data.title, tabId);
        return;
      }
      if (
        action === 'navigate-within' &&
        typeof event.data.path === 'string'
      ) {
        const descriptor = describeWorkspacePath(event.data.path);
        const tab = tabsRef.current.find((item) => item.id === tabId);
        if (!descriptor || descriptor.canonicalKey !== tab?.canonicalKey) return;
        commitTabs(
          tabsRef.current.map((item) =>
            item.id === tabId ? { ...item, path: descriptor.path } : item,
          ),
        );
        pushWorkspacePath(descriptor.path);
        navigateFrame(tabId, descriptor.path, 'push');
        return;
      }
      if (
        action === 'navigate-outside' &&
        typeof event.data.path === 'string'
      ) {
        router.push(event.data.path);
        return;
      }

      if (
        action === 'close-response' &&
        typeof event.data.requestId === 'string' &&
        typeof event.data.allowed === 'boolean'
      ) {
        const pending = closeRequestResolversRef.current.get(
          event.data.requestId,
        );
        if (!pending) return;
        const valid =
          pending.tabId === tabId &&
          pending.expectedPath === event.data.expectedPath &&
          pending.expectedPath === event.data.currentPath &&
          pending.generation === event.data.generation &&
          pending.generation === (frameGenerationRef.current.get(tabId) || 0);
        pending.resolve(valid && event.data.allowed);
        return;
      }
      if (
        action === 'navigation-result' &&
        typeof event.data.path === 'string' &&
        typeof event.data.epoch === 'number' &&
        typeof event.data.allowed === 'boolean'
      ) {
        const pending = pendingFrameNavigationRef.current.get(tabId);
        if (!pending || pending.epoch !== event.data.epoch) return;
        pendingFrameNavigationRef.current.delete(tabId);

        const descriptor = describeWorkspacePath(event.data.path);
        if (!descriptor) return;
        updateTabs((current) =>
          current.map((tab) =>
            tab.id === tabId ? { ...tab, path: descriptor.path } : tab,
          ),
        );

        if (event.data.allowed && descriptor.path === pending.path) {
          browserPopPendingRef.current = false;
          return;
        }

        if (pending.outerMode === 'pop' || pending.outerMode === 'push') {
          pushWorkspacePath(descriptor.path);
        } else {
          replaceWorkspacePath(descriptor.path);
        }
        return;
      }

      if (action === 'frame-ready') {
        const generation = (frameGenerationRef.current.get(tabId) || 0) + 1;
        frameGenerationRef.current.set(tabId, generation);
        frameReadyIdsRef.current.add(tabId);
        closeRequestResolversRef.current.forEach((pending) => {
          if (pending.tabId === tabId && pending.generation !== generation) {
            pending.resolve(false);
          }
        });
        frame?.contentWindow?.postMessage(
          {
            source: WORKSPACE_MESSAGE_SOURCE,
            protocolVersion: WORKSPACE_PROTOCOL_VERSION,
            action: 'activity',
            active:
              tabsRef.current.find((tab) => tab.id === tabId)
                ?.canonicalKey === currentDescriptor?.canonicalKey,
          },
          window.location.origin,
        );
        const pendingNavigation = pendingFrameNavigationRef.current.get(tabId);
        if (pendingNavigation) {
          postFrameNavigation(pendingNavigation);
          return;
        }
        const tab = tabsRef.current.find((item) => item.id === tabId);
        const reported =
          typeof event.data.path === 'string'
            ? describeWorkspacePath(event.data.path)
            : null;
        if (tab && reported?.path !== tab.path) {
          navigateFrame(tabId, tab.path, 'none');
        }
        return;
      }
      if (action === 'set-title' && typeof event.data.title === 'string') {
        updateTabs((current) =>
          current.map((tab) =>
            tab.id === tabId ? { ...tab, title: event.data.title } : tab,
          ),
        );
        return;
      }
      if (action === 'set-dirty' && typeof event.data.dirty === 'boolean') {
        updateTabs((current) =>
          current.map((tab) =>
            tab.id === tabId
              ? {
                  ...tab,
                  dirty: event.data.dirty,
                  dirtyReason: event.data.dirty
                    ? event.data.reason
                    : undefined,
                }
              : tab,
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
        typeof event.data.path === 'string'
      ) {
        const descriptor = describeWorkspacePath(event.data.path);
        const tab = tabsRef.current.find((item) => item.id === tabId);
        if (!descriptor || !tab) return;
        if (pendingFrameNavigationRef.current.has(tabId)) return;
        if (
          descriptor.canonicalKey !== tab.canonicalKey ||
          descriptor.kind !== tab.kind
        ) {
          frameReadyIdsRef.current.delete(tabId);
          frame.src = addWorkspaceFrameFlag(tab.path);
          activateParentTab(descriptor.path, undefined, tabId);
          return;
        }
        updateTabs((current) =>
          current.map((tab) =>
            tab.id === tabId
              ? {
                  ...tab,
                  path: descriptor.path,
                }
              : tab,
          ),
        );
        if (
          tab.canonicalKey === currentDescriptor?.canonicalKey &&
          descriptor.path !== currentPath
        ) {
          replaceWorkspacePath(descriptor.path);
        }
      }
    };

    window.addEventListener('message', handleFrameMessage);
    return () => window.removeEventListener('message', handleFrameMessage);
  }, [
    activateParentTab,
    closeParentTabById,
    commitTabs,
    currentDescriptor,
    currentPath,
    isWorkspaceFrame,
    navigateFrame,
    postFrameNavigation,
    pushWorkspacePath,
    replaceWorkspacePath,
    router,
    updateTabs,
  ]);

  useEffect(() => {
    if (isWorkspaceFrame) return;

    const activeKey = currentDescriptor?.canonicalKey;
    const existingTabIds = new Set(tabs.map((tab) => tab.id));
    activityByTabRef.current.forEach((_active, tabId) => {
      if (!existingTabIds.has(tabId)) activityByTabRef.current.delete(tabId);
    });
    document
      .querySelectorAll<HTMLIFrameElement>('iframe[data-workspace-tab-id]')
      .forEach((frame) => {
        const tab = tabs.find(
          (item) => item.id === frame.dataset.workspaceTabId,
        );
        if (!tab) return;
        const active = tab.canonicalKey === activeKey;
        if (activityByTabRef.current.get(tab.id) === active) return;
        activityByTabRef.current.set(tab.id, active);
        frame.contentWindow?.postMessage(
          {
            source: WORKSPACE_MESSAGE_SOURCE,
            protocolVersion: WORKSPACE_PROTOCOL_VERSION,
            action: 'activity',
            active,
          },
          window.location.origin,
        );
      });
  }, [currentDescriptor, isWorkspaceFrame, tabs]);

  useEffect(() => {
    if (isWorkspaceFrame || previousPath.current === currentPath) return;
    previousPath.current = currentPath;
    window.dispatchEvent(new Event('workspace-tab-change'));
  }, [currentPath, isWorkspaceFrame]);

  useEffect(() => {
    if (isWorkspaceFrame || !tabs.some((tab) => tab.dirty)) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isWorkspaceFrame, tabs]);

  const closeOtherTabs = useCallback(async () => {
    const current = tabsRef.current;
    const active = current.find(
      (tab) => tab.canonicalKey === currentDescriptor?.canonicalKey,
    );
    const list = current.find((tab) => tab.kind === 'list');
    const keepIds = new Set([list?.id, active?.id].filter(Boolean));
    const closing = current.filter((tab) => !keepIds.has(tab.id));
    if (closing.length === 0) return;
    for (const tab of closing) {
      if (!(await requestCloseApproval(tab))) return;
    }
    commitTabs(tabsRef.current.filter((tab) => keepIds.has(tab.id)));
  }, [commitTabs, currentDescriptor, requestCloseApproval]);

  const contextValue = useMemo(
    () => ({ openTab, setTabTitle, setTabDirty, closeTab }),
    [closeTab, openTab, setTabDirty, setTabTitle],
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
          activeCanonicalKey={currentDescriptor?.canonicalKey}
          onOpen={pushWorkspacePath}
          onClose={closeParentTabById}
          onCloseOthers={closeOtherTabs}
        />
      )}

      {tabs.map((tab) => (
        <iframe
          key={tab.id}
          data-workspace-tab-id={tab.id}
          src={addWorkspaceFrameFlag(tab.initialPath)}
          title={tab.title}
          hidden={tab.canonicalKey !== currentDescriptor?.canonicalKey}
          aria-hidden={tab.canonicalKey !== currentDescriptor?.canonicalKey}
          className={`${tab.canonicalKey === currentDescriptor?.canonicalKey ? 'block' : 'hidden'} h-[calc(100vh-8rem)] min-h-[480px] w-full border-0 bg-white`}
        />
      ))}

      {!currentDescriptor && children}

      {pendingExternalOpen && (
        <WorkspaceLimitDialog
          target={pendingExternalOpen}
          onCancel={() => setPendingExternalOpen(null)}
          onOpenExternal={() => {
            if (openInNewBrowserTab(pendingExternalOpen.path)) {
              setPendingExternalOpen(null);
              return true;
            }
            return false;
          }}
        />
      )}
    </WorkspaceTabsContext.Provider>
  );
}

function WorkspaceLimitDialog({
  target,
  onCancel,
  onOpenExternal,
}: {
  target: PendingExternalOpen;
  onCancel: () => void;
  onOpenExternal: () => boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>('button') || [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-limit-title"
        aria-describedby="workspace-limit-description"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h2
          id="workspace-limit-title"
          className="text-lg font-semibold text-gray-900"
        >
          已達詳細頁籤上限
        </h2>
        <p
          id="workspace-limit-description"
          className="mt-3 text-sm leading-6 text-gray-600"
        >
          已開啟 {MAX_WORKSPACE_DETAIL_TABS}{' '}
          個詳細頁籤。你可以取消，或將「{target.title}」在新的瀏覽器分頁開啟。既有頁籤不會被自動關閉。
        </p>
        {popupBlocked && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            瀏覽器已阻擋新分頁，請允許此網站開啟彈出式視窗後再試。
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => setPopupBlocked(!onOpenExternal())}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            在新瀏覽器分頁開啟
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceTabBar({
  tabs,
  activeCanonicalKey,
  onOpen,
  onClose,
  onCloseOthers,
}: {
  tabs: WorkspaceTab[];
  activeCanonicalKey?: string;
  onOpen: (path: string) => void;
  onClose: (id: string) => void;
  onCloseOthers: () => void;
}) {
  const detailCount = tabs.filter((tab) => tab.kind === 'detail').length;

  return (
    <div className="mb-3 flex items-center gap-2 border-b border-gray-200 bg-white">
      <div
        className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto px-1 pt-1"
        role="tablist"
        aria-label="工作區頁籤"
      >
        {tabs.map((tab) => {
          const active = tab.canonicalKey === activeCanonicalKey;
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
                role="tab"
                aria-selected={active}
                onClick={() => onOpen(tab.path)}
                className="min-w-0 truncate px-3 py-2"
                title={tab.dirty ? `${tab.title}（有未儲存修改）` : tab.title}
              >
                {tab.dirty && (
                  <span className="mr-1 text-amber-500" aria-label="有未儲存修改">
                    ●
                  </span>
                )}
                {tab.title}
              </button>
              {tab.kind === 'detail' && (
                <>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openInNewBrowserTab(tab.path);
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
                    title={
                      tab.dirty
                        ? '關閉頁籤（有未儲存修改）'
                        : '關閉頁籤'
                    }
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <span className="mb-1 shrink-0 text-xs text-gray-400">
        {detailCount}/{MAX_WORKSPACE_DETAIL_TABS}
      </span>
      {detailCount > 1 && activeCanonicalKey && (
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

export const useWorkspaceTabDirty = (
  dirty: boolean,
  reason = '有未儲存的修改',
  tabPath?: string,
) => {
  const pathname = usePathname() || '';
  const { setTabDirty } = useWorkspaceTabs();
  const targetPath = tabPath || pathname;

  useLayoutEffect(() => {
    setTabDirty(targetPath, dirty, reason);
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty || Date.now() < workspaceDiscardAllowedUntil) return;
      event.preventDefault();
      event.returnValue = '';
    };
    if (dirty) window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      if (dirty) window.removeEventListener('beforeunload', handleBeforeUnload);
      setTabDirty(targetPath, false);
    };
  }, [dirty, reason, setTabDirty, targetPath]);
};

export const useWorkspaceActivity = () => {
  const [active, setActive] = useState(true);

  useEffect(() => {
    const handleActivity = (event: Event) => {
      const customEvent = event as CustomEvent<{ active?: boolean }>;
      setActive(customEvent.detail?.active !== false);
    };
    window.addEventListener('workspace-activity-change', handleActivity);
    return () =>
      window.removeEventListener('workspace-activity-change', handleActivity);
  }, []);

  return active;
};
