export type WorkspaceModule =
  | 'invoices'
  | 'quotations'
  | 'company-profiles'
  | 'companies'
  | 'employees'
  | 'vehicles'
  | 'vehicle-plates'
  | 'machinery'
  | 'partners'
  | 'subcon-fleet-drivers'
  | 'salary-config'
  | 'project-rate-cards'
  | 'rental-rate-cards'
  | 'fleet-rate-cards'
  | 'subcon-rate-cards'
  | 'rate-cards'
  | 'projects'
  | 'contract-pa'
  | 'daily-reports'
  | 'expenses'
  | 'payment-in'
  | 'payment-out'
  | 'invoice-statements'
  | 'profit-loss'
  | 'equipment-profit'
  | 'payroll'
  | 'ai-payroll-reconcile'
  | 'subcon-payroll'
  | 'ai-knowledge';

export type WorkspaceGroup = WorkspaceModule | 'general';
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
  '/verification/ocr': 'AI OCR 辨識結果確認',
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

type ParsedWorkspaceUrl = {
  pathname: string;
  path: string;
  searchParams: URLSearchParams;
};

type WorkspaceRouteDefinition = {
  group: WorkspaceModule;
  listPath: string;
  listTitle: string;
  detailPattern: RegExp;
  getCanonicalKey: (
    match: RegExpMatchArray,
    parsed: ParsedWorkspaceUrl,
  ) => string;
  getDetailTitle: (match: RegExpMatchArray) => string;
  isChild?: (match: RegExpMatchArray) => boolean;
};

const idKey = (prefix: string, index = 1) => (match: RegExpMatchArray) =>
  `${prefix}:${match[index]}`;
const numberedTitle = (label: string, index = 1) =>
  (match: RegExpMatchArray) => `${label} #${match[index]}`;

const WORKSPACE_ROUTE_DEFINITIONS: WorkspaceRouteDefinition[] = [
  {
    group: 'invoices',
    listPath: '/invoices',
    listTitle: '發票列表',
    detailPattern: /^\/invoices\/(\d+)(?:\/(prepare|pricing|pdf-preview))?$/,
    getCanonicalKey: idKey('invoice'),
    getDetailTitle: (match) =>
      match[2] === 'pdf-preview'
        ? `發票 #${match[1]} · PDF`
        : `發票 #${match[1]}`,
    isChild: (match) => Boolean(match[2]),
  },
  {
    group: 'quotations',
    listPath: '/quotations',
    listTitle: '報價單列表',
    detailPattern: /^\/quotations\/(\d+)(?:\/(pdf-preview))?$/,
    getCanonicalKey: idKey('quotation'),
    getDetailTitle: (match) =>
      match[2] === 'pdf-preview'
        ? `報價單 #${match[1]} · PDF`
        : `報價單 #${match[1]}`,
    isChild: (match) => Boolean(match[2]),
  },
  {
    group: 'company-profiles',
    listPath: '/company-profiles',
    listTitle: '公司資料',
    detailPattern: /^\/company-profiles\/(\d+)$/,
    getCanonicalKey: idKey('company-profile'),
    getDetailTitle: numberedTitle('公司資料'),
  },
  {
    group: 'companies',
    listPath: '/companies',
    listTitle: '公司管理',
    detailPattern: /^\/companies\/(\d+)$/,
    getCanonicalKey: idKey('company'),
    getDetailTitle: numberedTitle('公司'),
  },
  {
    group: 'employees',
    listPath: '/employees',
    listTitle: '員工管理',
    detailPattern: /^\/employees\/(\d+)$/,
    getCanonicalKey: idKey('employee'),
    getDetailTitle: numberedTitle('員工'),
  },
  {
    group: 'vehicles',
    listPath: '/vehicles',
    listTitle: '車輛管理',
    detailPattern: /^\/vehicles\/(\d+)$/,
    getCanonicalKey: idKey('vehicle'),
    getDetailTitle: numberedTitle('車輛'),
  },
  {
    group: 'vehicle-plates',
    listPath: '/vehicles',
    listTitle: '車輛管理',
    detailPattern: /^\/vehicles\/plates\/(\d+)$/,
    getCanonicalKey: idKey('vehicle-plate'),
    getDetailTitle: numberedTitle('車牌'),
  },
  {
    group: 'machinery',
    listPath: '/machinery',
    listTitle: '機械管理',
    detailPattern: /^\/machinery\/(\d+)$/,
    getCanonicalKey: idKey('machinery'),
    getDetailTitle: numberedTitle('機械'),
  },
  {
    group: 'partners',
    listPath: '/partners',
    listTitle: '合作單位',
    detailPattern: /^\/partners\/(\d+)$/,
    getCanonicalKey: idKey('partner'),
    getDetailTitle: numberedTitle('合作單位'),
  },
  {
    group: 'subcon-fleet-drivers',
    listPath: '/subcon-fleet-drivers',
    listTitle: '街車車隊管理',
    detailPattern: /^\/subcon-fleet-drivers\/(\d+)$/,
    getCanonicalKey: idKey('subcon-fleet-driver'),
    getDetailTitle: numberedTitle('街車司機'),
  },
  {
    group: 'salary-config',
    listPath: '/salary-config',
    listTitle: '員工薪酬',
    detailPattern: /^\/salary-config\/(\d+)$/,
    getCanonicalKey: idKey('salary-config'),
    getDetailTitle: numberedTitle('員工薪酬'),
  },
  {
    group: 'project-rate-cards',
    listPath: '/project-rate-cards',
    listTitle: '工程價目表',
    detailPattern: /^\/project-rate-cards\/(\d+)$/,
    getCanonicalKey: idKey('rate-card'),
    getDetailTitle: numberedTitle('工程價目'),
  },
  {
    group: 'rental-rate-cards',
    listPath: '/rental-rate-cards',
    listTitle: '客戶價目表',
    detailPattern: /^\/rental-rate-cards\/(\d+)$/,
    getCanonicalKey: idKey('rate-card'),
    getDetailTitle: numberedTitle('客戶價目'),
  },
  {
    group: 'fleet-rate-cards',
    listPath: '/fleet-rate-cards',
    listTitle: '租賃價目表',
    detailPattern: /^\/fleet-rate-cards\/(\d+)$/,
    getCanonicalKey: idKey('fleet-rate-card'),
    getDetailTitle: numberedTitle('租賃價目'),
  },
  {
    group: 'subcon-rate-cards',
    listPath: '/subcon-rate-cards',
    listTitle: '供應商價目表',
    detailPattern: /^\/subcon-rate-cards\/(\d+)$/,
    getCanonicalKey: idKey('subcon-rate-card'),
    getDetailTitle: numberedTitle('供應商價目'),
  },
  {
    group: 'rate-cards',
    listPath: '/rate-cards',
    listTitle: '價目表',
    detailPattern: /^\/rate-cards\/(\d+)$/,
    getCanonicalKey: idKey('rate-card'),
    getDetailTitle: numberedTitle('價目'),
  },
  {
    group: 'projects',
    listPath: '/projects',
    listTitle: '工程項目',
    detailPattern: /^\/projects\/(\d+)$/,
    getCanonicalKey: idKey('project'),
    getDetailTitle: numberedTitle('工程'),
  },
  {
    group: 'contract-pa',
    listPath: '/projects',
    listTitle: '工程項目',
    detailPattern: /^\/contracts\/(\d+)\/pa\/(\d+)(?:\/(print))?$/,
    getCanonicalKey: (match) => `contract-pa:${match[1]}:${match[2]}`,
    getDetailTitle: (match) => `付款申請 #${match[2]}`,
    isChild: (match) => Boolean(match[3]),
  },
  {
    group: 'daily-reports',
    listPath: '/daily-reports',
    listTitle: '工程日報',
    detailPattern: /^\/daily-reports\/(\d+)\/edit$/,
    getCanonicalKey: idKey('daily-report'),
    getDetailTitle: numberedTitle('工程日報'),
  },
  {
    group: 'expenses',
    listPath: '/expenses',
    listTitle: '支出管理',
    detailPattern: /^\/expenses\/(\d+)$/,
    getCanonicalKey: idKey('expense'),
    getDetailTitle: numberedTitle('支出'),
  },
  {
    group: 'payment-in',
    listPath: '/payment-in',
    listTitle: '收款記錄',
    detailPattern: /^\/payment-in\/(\d+)(?:\/(receipt-preview))?$/,
    getCanonicalKey: idKey('payment-in'),
    getDetailTitle: (match) =>
      match[2] ? `收款 #${match[1]} · 收據` : `收款 #${match[1]}`,
    isChild: (match) => Boolean(match[2]),
  },
  {
    group: 'payment-out',
    listPath: '/payment-out',
    listTitle: '付款記錄',
    detailPattern: /^\/payment-out\/(\d+)$/,
    getCanonicalKey: idKey('payment-out'),
    getDetailTitle: numberedTitle('付款'),
  },
  {
    group: 'invoice-statements',
    listPath: '/invoices?tab=statements',
    listTitle: '發票清單',
    detailPattern: /^\/invoice-statements\/(\d+)(?:\/(pdf-preview))?$/,
    getCanonicalKey: idKey('invoice-statement'),
    getDetailTitle: (match) =>
      match[2] ? `發票清單 #${match[1]} · PDF` : `發票清單 #${match[1]}`,
    isChild: (match) => Boolean(match[2]),
  },
  {
    group: 'profit-loss',
    listPath: '/profit-loss',
    listTitle: '工程損益總覽',
    detailPattern: /^\/profit-loss\/(\d+)$/,
    getCanonicalKey: (match, parsed) =>
      `profit-loss:${match[1]}:${parsed.searchParams.get('date_from') || ''}:${parsed.searchParams.get('date_to') || ''}`,
    getDetailTitle: numberedTitle('工程損益'),
  },
  {
    group: 'equipment-profit',
    listPath: '/equipment-profit',
    listTitle: '機械收支',
    detailPattern: /^\/equipment-profit\/(machinery|vehicle)\/(\d+)$/,
    getCanonicalKey: (match, parsed) =>
      `equipment-profit:${match[1]}:${match[2]}:${parsed.searchParams.get('date_from') || ''}:${parsed.searchParams.get('date_to') || ''}`,
    getDetailTitle: (match) =>
      `${match[1] === 'vehicle' ? '車輛' : '機械'}收支 #${match[2]}`,
  },
  {
    group: 'payroll',
    listPath: '/payroll-records',
    listTitle: '糧單記錄',
    detailPattern: /^\/payroll\/(\d+)$/,
    getCanonicalKey: idKey('payroll'),
    getDetailTitle: numberedTitle('糧單'),
  },
  {
    group: 'ai-payroll-reconcile',
    listPath: '/payroll-records',
    listTitle: '糧單記錄',
    detailPattern: /^\/payroll\/ai-reconcile\/(\d+)$/,
    getCanonicalKey: idKey('ai-payroll-reconcile'),
    getDetailTitle: numberedTitle('AI 計糧核對'),
  },
  {
    group: 'subcon-payroll',
    listPath: '/subcon-payroll/records',
    listTitle: '判頭糧單記錄',
    detailPattern: /^\/subcon-payroll\/(\d+)$/,
    getCanonicalKey: idKey('subcon-payroll'),
    getDetailTitle: numberedTitle('判頭糧單'),
  },
  {
    group: 'ai-knowledge',
    listPath: '/ai-knowledge',
    listTitle: 'AI 知識庫',
    detailPattern: /^\/ai-knowledge\/(\d+)$/,
    getCanonicalKey: idKey('ai-knowledge'),
    getDetailTitle: numberedTitle('AI 知識'),
  },
];

const WORKSPACE_EXCLUDED_PATHS = [
  /^\/ai-knowledge\/new$/,
  /^\/contracts$/,
  /^\/contracts\/\d+$/,
  /^\/payroll$/,
  /^\/subcon-payroll$/,
  /^\/verification\/upload$/,
  /^\/clock-in$/,
];

const parseWorkspaceUrl = (path: string): ParsedWorkspaceUrl | null => {
  try {
    const url = new URL(path, 'http://workspace.local');
    url.searchParams.delete('workspace_frame');
    const search = url.searchParams.toString();
    return {
      pathname: url.pathname,
      path: `${url.pathname}${search ? `?${search}` : ''}${url.hash}`,
      searchParams: url.searchParams,
    };
  } catch {
    return null;
  }
};

const getEnabledGroups = (): Set<WorkspaceModule> => {
  const configured = process.env.NEXT_PUBLIC_WORKSPACE_TABS_MODULES?.trim();
  const allGroups = WORKSPACE_ROUTE_DEFINITIONS.map(({ group }) => group);
  if (!configured || configured === 'all') return new Set(allGroups);

  return new Set(
    configured
      .split(',')
      .map((value) => value.trim())
      .filter((value): value is WorkspaceModule =>
        allGroups.includes(value as WorkspaceModule),
      ),
  );
};

export const getWorkspacePageTitle = (pathname: string): string =>
  WORKSPACE_PAGE_TITLES[pathname] || '';

export const describeWorkspacePath = (
  path: string,
  preferredTitle?: string,
): WorkspacePathDescriptor | null => {
  const parsed = parseWorkspaceUrl(path);
  if (!parsed) return null;

  const enabledGroups = getEnabledGroups();
  let matchedDisabledRoute = false;
  for (const definition of WORKSPACE_ROUTE_DEFINITIONS) {
    const listPathname = parseWorkspaceUrl(definition.listPath)?.pathname;
    if (parsed.pathname === listPathname) {
      if (!enabledGroups.has(definition.group)) {
        matchedDisabledRoute = true;
        continue;
      }
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
    if (!enabledGroups.has(definition.group)) {
      matchedDisabledRoute = true;
      continue;
    }

    return {
      ...parsed,
      title: preferredTitle || definition.getDetailTitle(match),
      group: definition.group,
      kind: 'detail',
      canonicalKey: definition.getCanonicalKey(match, parsed),
      listPath: definition.listPath,
      listTitle: definition.listTitle,
      subrouteKind: definition.isChild?.(match) ? 'child' : 'entity',
    };
  }

  if (matchedDisabledRoute) return null;
  if (WORKSPACE_EXCLUDED_PATHS.some((pattern) => pattern.test(parsed.pathname))) {
    return null;
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
