import { useEffect, useMemo, useState } from 'react';

const getSnapshot = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

const notifyNavigation = () => {
  window.dispatchEvent(new Event('next-navigation'));
};

const router = {
  push(path: string) {
    window.history.pushState({}, '', path);
    notifyNavigation();
  },
  replace(path: string) {
    window.history.replaceState({}, '', path);
    notifyNavigation();
  },
};

const useLocationSnapshot = () => {
  const [snapshot, setSnapshot] = useState(() => getSnapshot());

  useEffect(() => {
    const sync = () => setSnapshot(getSnapshot());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    window.addEventListener('next-navigation', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('next-navigation', sync);
    };
  }, []);

  return snapshot;
};

export const useRouter = () => router;

export const usePathname = () => {
  const snapshot = useLocationSnapshot();
  return new URL(snapshot, window.location.origin).pathname;
};

export const useSearchParams = () => {
  const snapshot = useLocationSnapshot();
  return useMemo(
    () => new URLSearchParams(new URL(snapshot, window.location.origin).search),
    [snapshot],
  );
};

export const useParams = () => {
  const pathname = usePathname();
  const parts = pathname.split('/').filter(Boolean);
  return { id: parts[1] };
};

export const __forceNavigate = (path: string) => {
  window.history.pushState({}, '', path);
  notifyNavigation();
};
