export type WorkspaceGroup = 'invoices' | 'quotations';
export type WorkspaceTabKind = 'list' | 'detail';
export type WorkspaceSubrouteKind = 'entity' | 'child';

export const MAX_WORKSPACE_DETAIL_TABS = 5;
export const WORKSPACE_MESSAGE_SOURCE = 'mingtat-workspace';
export const WORKSPACE_PROTOCOL_VERSION = 2;

export type WorkspacePathDescriptor = {
  path: string;
  pathname: string;
  title: string;
  group: WorkspaceGroup;
  kind: WorkspaceTabKind;
  canonicalKey: string;
  listPath: string;
  listTitle: string;
  subrouteKind: WorkspaceSubrouteKind;
};

export type WorkspaceOpenDecision =
  | 'activate-existing'
  | 'open-new'
  | 'overflow';

type WorkspaceRouteDefinition = {
  group: WorkspaceGroup;
  listPath: string;
  listTitle: string;
  detailPattern: RegExp;
  detailKeyPrefix: string;
  detailTitle: (id: string, child?: string) => string;
};

const WORKSPACE_ROUTE_DEFINITIONS: WorkspaceRouteDefinition[] = [
  {
    group: 'invoices',
    listPath: '/invoices',
    listTitle: '發票列表',
    detailPattern: /^\/invoices\/(\d+)(?:\/(prepare|pricing|pdf-preview))?$/,
    detailKeyPrefix: 'invoice',
    detailTitle: (id, child) =>
      child === 'pdf-preview' ? `發票 #${id} · PDF` : `發票 #${id}`,
  },
  {
    group: 'quotations',
    listPath: '/quotations',
    listTitle: '報價單列表',
    detailPattern: /^\/quotations\/(\d+)(?:\/(pdf-preview))?$/,
    detailKeyPrefix: 'quotation',
    detailTitle: (id, child) =>
      child === 'pdf-preview' ? `報價單 #${id} · PDF` : `報價單 #${id}`,
  },
];

const getEnabledGroups = (): Set<WorkspaceGroup> => {
  const configured = process.env.NEXT_PUBLIC_WORKSPACE_TABS_MODULES;
  if (configured === undefined) {
    return new Set<WorkspaceGroup>(['invoices', 'quotations']);
  }

  return new Set(
    configured
      .split(',')
      .map((value) => value.trim())
      .filter((value): value is WorkspaceGroup =>
        WORKSPACE_ROUTE_DEFINITIONS.some(
          (definition) => definition.group === value,
        ),
      ),
  );
};

const ENABLED_GROUPS = getEnabledGroups();

const parseWorkspaceUrl = (path: string) => {
  try {
    const url = new URL(path, 'http://workspace.local');
    url.searchParams.delete('workspace_frame');
    const search = url.searchParams.toString();
    return {
      pathname: url.pathname,
      path: `${url.pathname}${search ? `?${search}` : ''}${url.hash}`,
    };
  } catch {
    return null;
  }
};

export const describeWorkspacePath = (
  path: string,
): WorkspacePathDescriptor | null => {
  const parsed = parseWorkspaceUrl(path);
  if (!parsed) return null;

  for (const definition of WORKSPACE_ROUTE_DEFINITIONS) {
    if (!ENABLED_GROUPS.has(definition.group)) continue;

    if (parsed.pathname === definition.listPath) {
      return {
        ...parsed,
        title: definition.listTitle,
        group: definition.group,
        kind: 'list',
        canonicalKey: `list:${definition.group}`,
        listPath: definition.listPath,
        listTitle: definition.listTitle,
        subrouteKind: 'entity',
      };
    }

    const match = parsed.pathname.match(definition.detailPattern);
    if (!match) continue;

    const [, id, child] = match;
    return {
      ...parsed,
      title: definition.detailTitle(id, child),
      group: definition.group,
      kind: 'detail',
      canonicalKey: `${definition.detailKeyPrefix}:${id}`,
      listPath: definition.listPath,
      listTitle: definition.listTitle,
      subrouteKind: child ? 'child' : 'entity',
    };
  }

  return null;
};

export const addWorkspaceFrameFlag = (path: string): string => {
  const parsed = parseWorkspaceUrl(path);
  if (!parsed) return path;

  const url = new URL(parsed.path, 'http://workspace.local');
  url.searchParams.set('workspace_frame', '1');
  return `${url.pathname}${url.search}${url.hash}`;
};

export const isWorkspaceDetailPath = (path: string): boolean =>
  describeWorkspacePath(path)?.kind === 'detail';

export const decideWorkspaceDetailOpen = (
  tabs: Array<Pick<WorkspacePathDescriptor, 'kind' | 'canonicalKey'>>,
  target: Pick<WorkspacePathDescriptor, 'kind' | 'canonicalKey'>,
): WorkspaceOpenDecision => {
  if (tabs.some((tab) => tab.canonicalKey === target.canonicalKey)) {
    return 'activate-existing';
  }
  if (target.kind !== 'detail') return 'open-new';

  const detailCount = tabs.filter((tab) => tab.kind === 'detail').length;
  return detailCount >= MAX_WORKSPACE_DETAIL_TABS ? 'overflow' : 'open-new';
};
