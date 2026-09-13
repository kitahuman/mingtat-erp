export type WorkspaceGroup = 'invoices' | 'quotations' | 'general';
export type WorkspaceTabKind = 'list' | 'detail' | 'page';
export type WorkspaceSubrouteKind = 'entity' | 'child';

export const MAX_WORKSPACE_EXTRA_TABS = 8;
export const WORKSPACE_MESSAGE_SOURCE = 'mingtat-workspace';
export const WORKSPACE_PROTOCOL_VERSION = 3;

export const WORKSPACE_PAGE_TITLES: Record<string, string> = {
  '/dashboard': '儀表板',
  '/chat': '對話助手',
  '/ai-knowledge': 'AI 知識庫',
  '/work-logs': '工作記錄',
  '/document-management': '文件管理',
  '/verification': '核對工作台',
  '/verification/matching': '六來源比對',
  '/verification/upload': '上傳資料',
  '/verification/batches': '匯入紀錄',
  '/verification/records': '已匯入資料',
  '/verification/whatsapp': 'WhatsApp Order',
  '/company-profiles': '公司資料',
  '/companies': '公司管理',
  '/employees': '員工管理',
  '/vehicles': '車輛管理',
  '/machinery': '機械管理',
  '/partners': '合作單位',
  '/subcon-fleet-drivers': '街車車隊管理',
  '/projects': '工程項目',
  '/daily-reports': '工程日報',
  '/acceptance-reports': '工程收貨',
  '/daily-report-stats': '日報統計',
  '/salary-config': '員工薪酬',
  '/payroll': '計糧管理',
  '/payroll-records': '糧單記錄',
  '/subcon-payroll': '供應商計糧',
  '/subcon-payroll/records': '判頭糧單記錄',
  '/clock-in': '公司打卡',
  '/attendances': '打卡紀錄',
  '/leaves': '請假紀錄',
  '/expenses': '支出管理',
  '/invoices': '發票列表',
  '/payment-in': '收款記錄',
  '/payment-out': '付款記錄',
  '/bank-reconciliation': '銀行對帳',
  '/quotations': '報價單列表',
  '/project-rate-cards': '工程價目表',
  '/rental-rate-cards': '客戶價目表',
  '/fleet-rate-cards': '租賃價目表',
  '/subcon-rate-cards': '供應商價目表',
  '/profit-loss': '工程損益總覽',
  '/company-profit-loss': '公司損益表',
  '/reports/fixed-expenses': '固定支出統計',
  '/equipment-profit': '機械收支',
  '/settings/users': '用戶管理',
  '/settings/custom-fields': '自定義欄位',
  '/settings/field-options': '選項管理',
  '/options/payment-terms': '付款條款',
  '/settings/expense-categories': '支出類別管理',
  '/settings/payment-in-source-types': '收款來源類型',
  '/settings/bank-accounts': '銀行帳戶管理',
  '/settings/statutory-holidays': '法定假期',
  '/settings/system': '系統參數',
  '/audit-logs': '操作歷史',
  '/recycle-bin': '垃圾桶',
  '/invoice-statements': '發票清單',
  '/contracts': '合約管理',
  '/rate-cards': '價目表',
  '/reports': '報表',
  '/settings/profile': '個人設定',
};

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
  group: Exclude<WorkspaceGroup, 'general'>;
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

const getEnabledGroups = (): Set<WorkspaceRouteDefinition['group']> => {
  const configured = process.env.NEXT_PUBLIC_WORKSPACE_TABS_MODULES;
  if (configured === undefined) {
    return new Set<WorkspaceRouteDefinition['group']>([
      'invoices',
      'quotations',
    ]);
  }

  return new Set(
    configured
      .split(',')
      .map((value) => value.trim())
      .filter((value): value is WorkspaceRouteDefinition['group'] =>
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

export const getWorkspacePageTitle = (pathname: string): string => {
  if (WORKSPACE_PAGE_TITLES[pathname]) return WORKSPACE_PAGE_TITLES[pathname];
  const segments = pathname.split('/');
  while (segments.length > 1) {
    segments.pop();
    const parent = segments.join('/') || '/';
    if (WORKSPACE_PAGE_TITLES[parent]) return WORKSPACE_PAGE_TITLES[parent];
  }
  return '';
};

export const describeWorkspacePath = (
  path: string,
  preferredTitle?: string,
): WorkspacePathDescriptor | null => {
  const parsed = parseWorkspaceUrl(path);
  if (!parsed) return null;

  for (const definition of WORKSPACE_ROUTE_DEFINITIONS) {
    if (!ENABLED_GROUPS.has(definition.group)) continue;

    if (parsed.pathname === definition.listPath) {
      return {
        ...parsed,
        title: preferredTitle || definition.listTitle,
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
      title: preferredTitle || definition.detailTitle(id, child),
      group: definition.group,
      kind: 'detail',
      canonicalKey: `${definition.detailKeyPrefix}:${id}`,
      listPath: definition.listPath,
      listTitle: definition.listTitle,
      subrouteKind: child ? 'child' : 'entity',
    };
  }

  const pageTitle = preferredTitle || getWorkspacePageTitle(parsed.pathname);
  if (!pageTitle) return null;
  return {
    ...parsed,
    title: pageTitle,
    group: 'general',
    kind: 'page',
    canonicalKey: `page:${parsed.pathname}`,
    listPath: parsed.pathname,
    listTitle: pageTitle,
    subrouteKind: 'entity',
  };
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

export const decideWorkspaceOpen = (
  tabs: Array<Pick<WorkspacePathDescriptor, 'canonicalKey'> & { isBase: boolean }>,
  target: Pick<WorkspacePathDescriptor, 'canonicalKey'>,
): WorkspaceOpenDecision => {
  if (tabs.some((tab) => tab.canonicalKey === target.canonicalKey)) {
    return 'activate-existing';
  }

  const extraCount = tabs.filter((tab) => !tab.isBase).length;
  return extraCount >= MAX_WORKSPACE_EXTRA_TABS ? 'overflow' : 'open-new';
};
