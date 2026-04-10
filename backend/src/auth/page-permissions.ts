/**
 * Page Permission System
 *
 * Each page/route has a unique key. Roles have default allowed pages.
 * Individual users can override via page_permissions JSON field:
 *   { "grant": ["page_key1", ...], "deny": ["page_key2", ...] }
 *
 * Final permissions = (role defaults + grants) - denies
 */

// All controllable pages with display metadata
export interface PageDef {
  key: string;
  label: string;
  group: string;
  path: string;        // frontend route path
}

export const ALL_PAGES: PageDef[] = [
  // 儀表板
  { key: 'dashboard', label: '儀表板', group: '總覽', path: '/dashboard' },
  { key: 'chat', label: 'AI 助手', group: '總覽', path: '/chat' },
  { key: 'work-logs', label: '工作記錄', group: '總覽', path: '/work-logs' },

  // 工作紀錄核對
  { key: 'verification', label: '核對工作台', group: '工作紀錄核對', path: '/verification' },
  { key: 'verification-matching', label: '六來源比對', group: '工作紀錄核對', path: '/verification/matching' },
  { key: 'verification-upload', label: '上傳資料', group: '工作紀錄核對', path: '/verification/upload' },
  { key: 'verification-batches', label: '匯入紀錄', group: '工作紀錄核對', path: '/verification/batches' },
  { key: 'verification-records', label: '已匯入資料', group: '工作紀錄核對', path: '/verification/records' },
  { key: 'verification-whatsapp', label: 'WhatsApp Order', group: '工作紀錄核對', path: '/verification/whatsapp' },

  // 公司內部資料
  { key: 'company-profiles', label: '公司資料', group: '公司內部資料', path: '/company-profiles' },
  { key: 'companies', label: '公司管理', group: '公司內部資料', path: '/companies' },
  { key: 'employees', label: '員工管理', group: '公司內部資料', path: '/employees' },
  { key: 'vehicles', label: '車輛管理', group: '公司內部資料', path: '/vehicles' },
  { key: 'machinery', label: '機械管理', group: '公司內部資料', path: '/machinery' },
  { key: 'partners', label: '合作單位', group: '公司內部資料', path: '/partners' },
  { key: 'subcon-fleet-drivers', label: '街車車隊管理', group: '公司內部資料', path: '/subcon-fleet-drivers' },

  // 工程管理
  { key: 'contracts', label: '合約管理', group: '工程管理', path: '/contracts' },
  { key: 'projects', label: '工程項目', group: '工程管理', path: '/projects' },
  { key: 'daily-reports', label: '工程日報', group: '工程管理', path: '/daily-reports' },
  { key: 'acceptance-reports', label: '工程收貨', group: '工程管理', path: '/acceptance-reports' },

  // 人力資源
  { key: 'salary-config', label: '員工薪酬', group: '人力資源', path: '/salary-config' },
  { key: 'payroll', label: '計糧管理', group: '人力資源', path: '/payroll' },
  { key: 'payroll-records', label: '糧單記錄', group: '人力資源', path: '/payroll-records' },
  { key: 'subcon-payroll', label: '供應商計糧', group: '人力資源', path: '/subcon-payroll' },
  { key: 'clock-in', label: '公司打卡', group: '人力資源', path: '/clock-in' },
  { key: 'attendances', label: '打卡紀錄', group: '人力資源', path: '/attendances' },
  { key: 'leaves', label: '請假紀錄', group: '人力資源', path: '/leaves' },

  // 會計部門
  { key: 'expenses', label: '費用報銷', group: '會計部門', path: '/expenses' },
  { key: 'invoices', label: '發票管理', group: '會計部門', path: '/invoices' },
  { key: 'payment-in', label: '收款記錄', group: '會計部門', path: '/payment-in' },
  { key: 'payment-out', label: '付款記錄', group: '會計部門', path: '/payment-out' },
  { key: 'bank-reconciliation', label: '銀行對帳', group: '會計部門', path: '/bank-reconciliation' },

  // 報價及價目
  { key: 'quotations', label: '報價單', group: '報價及價目', path: '/quotations' },
  { key: 'project-rate-cards', label: '工程價目表', group: '報價及價目', path: '/project-rate-cards' },
  { key: 'rental-rate-cards', label: '客戶價目表', group: '報價及價目', path: '/rental-rate-cards' },
  { key: 'fleet-rate-cards', label: '租賃價目表', group: '報價及價目', path: '/fleet-rate-cards' },
  { key: 'subcon-rate-cards', label: '供應商價目表', group: '報價及價目', path: '/subcon-rate-cards' },

  // 報表
  { key: 'profit-loss', label: '工程損益總覽', group: '報表', path: '/profit-loss' },
  { key: 'company-profit-loss', label: '公司損益表', group: '報表', path: '/company-profit-loss' },

  // 系統設定
  { key: 'settings-users', label: '用戶管理', group: '系統設定', path: '/settings/users' },
  { key: 'settings-custom-fields', label: '自定義欄位', group: '系統設定', path: '/settings/custom-fields' },
  { key: 'settings-field-options', label: '選項管理', group: '系統設定', path: '/settings/field-options' },
  { key: 'settings-expense-categories', label: '支出類別管理', group: '系統設定', path: '/settings/expense-categories' },
  { key: 'settings-bank-accounts', label: '銀行帳戶管理', group: '系統設定', path: '/settings/bank-accounts' },
];

// All page keys for convenience
export const ALL_PAGE_KEYS = ALL_PAGES.map(p => p.key);

// ── Role default permissions ────────────────────────────────────

const ADMIN_PAGES = ALL_PAGE_KEYS; // admin can access everything

const MANAGER_PAGES = ALL_PAGE_KEYS.filter(k => !k.startsWith('settings-'));

const CLERK_PAGES = ALL_PAGE_KEYS.filter(k => !k.startsWith('settings-'));

const WORKER_PAGES: string[] = []; // workers use employee-portal, not main app

/**
 * Get the default page keys for a role.
 */
export function getRoleDefaultPages(role: string): string[] {
  switch (role) {
    case 'admin':
      return [...ADMIN_PAGES];
    case 'manager':
      return [...MANAGER_PAGES];
    case 'clerk':
      return [...CLERK_PAGES];
    case 'worker':
      return [...WORKER_PAGES];
    default:
      return [];
  }
}

/**
 * Compute the effective page permissions for a user.
 * @param role - user role
 * @param pagePermissions - user's page_permissions JSON (nullable)
 * @returns list of allowed page keys
 */
export function computeEffectivePages(
  role: string,
  pagePermissions?: { grant?: string[]; deny?: string[] } | null,
): string[] {
  // Admin always has full access (cannot be restricted)
  if (role === 'admin') {
    return [...ADMIN_PAGES];
  }

  const defaults = new Set(getRoleDefaultPages(role));

  if (pagePermissions) {
    // Add granted pages
    if (Array.isArray(pagePermissions.grant)) {
      for (const key of pagePermissions.grant) {
        if (ALL_PAGE_KEYS.includes(key)) {
          defaults.add(key);
        }
      }
    }
    // Remove denied pages
    if (Array.isArray(pagePermissions.deny)) {
      for (const key of pagePermissions.deny) {
        defaults.delete(key);
      }
    }
  }

  return Array.from(defaults);
}
