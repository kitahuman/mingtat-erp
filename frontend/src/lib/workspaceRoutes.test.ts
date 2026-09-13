import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_WORKSPACE_EXTRA_TABS,
  addWorkspaceFrameFlag,
  decideWorkspaceOpen,
  describeWorkspacePath,
} from './workspaceRoutes';

const originalModules = process.env.NEXT_PUBLIC_WORKSPACE_TABS_MODULES;

test.beforeEach(() => {
  delete process.env.NEXT_PUBLIC_WORKSPACE_TABS_MODULES;
});

test.after(() => {
  if (originalModules === undefined) {
    delete process.env.NEXT_PUBLIC_WORKSPACE_TABS_MODULES;
  } else {
    process.env.NEXT_PUBLIC_WORKSPACE_TABS_MODULES = originalModules;
  }
});

test('describes registered lists and exact generic Sidebar pages', () => {
  const registeredLists = [
    ['/invoices', 'list:invoices'],
    ['/quotations', 'list:quotations'],
    ['/company-profiles', 'list:company-profiles'],
    ['/companies', 'list:companies'],
    ['/employees', 'list:employees'],
    ['/vehicles', 'list:vehicles'],
    ['/machinery', 'list:machinery'],
    ['/partners', 'list:partners'],
    ['/subcon-fleet-drivers', 'list:subcon-fleet-drivers'],
    ['/salary-config', 'list:salary-config'],
    ['/project-rate-cards', 'list:project-rate-cards'],
    ['/rental-rate-cards', 'list:rental-rate-cards'],
    ['/fleet-rate-cards', 'list:fleet-rate-cards'],
    ['/subcon-rate-cards', 'list:subcon-rate-cards'],
    ['/rate-cards', 'list:rate-cards'],
    ['/projects', 'list:projects'],
    ['/daily-reports', 'list:daily-reports'],
    ['/expenses', 'list:expenses'],
    ['/payment-in', 'list:payment-in'],
    ['/payment-out', 'list:payment-out'],
    ['/profit-loss', 'list:profit-loss'],
    ['/equipment-profit', 'list:equipment-profit'],
    ['/payroll-records', 'list:payroll'],
    ['/subcon-payroll/records', 'list:subcon-payroll'],
    ['/ai-knowledge', 'list:ai-knowledge'],
  ] as const;

  for (const [path, canonicalKey] of registeredLists) {
    const descriptor = describeWorkspacePath(path);
    assert.equal(descriptor?.kind, 'list', path);
    assert.equal(descriptor?.canonicalKey, canonicalKey, path);
  }

  const options = describeWorkspacePath('/settings/field-options');
  assert.equal(options?.kind, 'page');
  assert.equal(options?.canonicalKey, 'page:/settings/field-options');
  assert.equal(options?.title, '選項管理');
  assert.equal(describeWorkspacePath('/verification/ocr')?.title, 'AI OCR 辨識結果確認');
});

test('uses a Sidebar-provided title for a known internal page', () => {
  assert.equal(
    describeWorkspacePath('/settings/field-options', '選項設定')?.title,
    '選項設定',
  );
});

test('describes every approved persisted detail with its owner list', () => {
  const cases = [
    ['/company-profiles/11', 'company-profile:11', '/company-profiles'],
    ['/companies/12', 'company:12', '/companies'],
    ['/employees/13', 'employee:13', '/employees'],
    ['/vehicles/14', 'vehicle:14', '/vehicles'],
    ['/vehicles/plates/15', 'vehicle-plate:15', '/vehicles'],
    ['/machinery/16', 'machinery:16', '/machinery'],
    ['/partners/17', 'partner:17', '/partners'],
    ['/subcon-fleet-drivers/18', 'subcon-fleet-driver:18', '/subcon-fleet-drivers'],
    ['/salary-config/19', 'salary-config:19', '/salary-config'],
    ['/fleet-rate-cards/20', 'fleet-rate-card:20', '/fleet-rate-cards'],
    ['/subcon-rate-cards/21', 'subcon-rate-card:21', '/subcon-rate-cards'],
    ['/projects/22', 'project:22', '/projects'],
    ['/daily-reports/23/edit', 'daily-report:23', '/daily-reports'],
    ['/expenses/24', 'expense:24', '/expenses'],
    ['/payment-out/25', 'payment-out:25', '/payment-out'],
    ['/profit-loss/26', 'profit-loss:26::', '/profit-loss'],
    ['/payroll/27', 'payroll:27', '/payroll-records'],
    ['/payroll/ai-reconcile/28', 'ai-payroll-reconcile:28', '/payroll-records'],
    ['/subcon-payroll/29', 'subcon-payroll:29', '/subcon-payroll/records'],
    ['/ai-knowledge/30', 'ai-knowledge:30', '/ai-knowledge'],
  ] as const;

  for (const [path, canonicalKey, listPath] of cases) {
    const descriptor = describeWorkspacePath(path);
    assert.equal(descriptor?.kind, 'detail', path);
    assert.equal(descriptor?.canonicalKey, canonicalKey, path);
    assert.equal(descriptor?.listPath, listPath, path);
  }
});

test('canonicalizes entity child pages to one detail tab', () => {
  const cases = [
    ['/invoices/42', '/invoices/42/prepare', '/invoices/42/pricing', '/invoices/42/pdf-preview'],
    ['/quotations/17', '/quotations/17/pdf-preview'],
    ['/payment-in/31', '/payment-in/31/receipt-preview'],
    ['/invoice-statements/32', '/invoice-statements/32/pdf-preview'],
    ['/contracts/7/pa/33', '/contracts/7/pa/33/print'],
  ];

  for (const paths of cases) {
    const descriptors = paths.map((path) => describeWorkspacePath(path));
    assert.ok(descriptors.every(Boolean), paths.join(', '));
    assert.equal(
      new Set(descriptors.map((descriptor) => descriptor?.canonicalKey)).size,
      1,
      paths.join(', '),
    );
    assert.equal(descriptors.at(-1)?.subrouteKind, 'child', paths.at(-1));
  }

  assert.equal(
    describeWorkspacePath('/invoice-statements/32')?.listPath,
    '/invoices?tab=statements',
  );
});

test('reuses rate-card aliases that represent the same persisted record', () => {
  assert.equal(
    describeWorkspacePath('/project-rate-cards/42')?.canonicalKey,
    'rate-card:42',
  );
  assert.equal(
    describeWorkspacePath('/rental-rate-cards/42')?.canonicalKey,
    'rate-card:42',
  );
  assert.equal(
    describeWorkspacePath('/rate-cards/42')?.canonicalKey,
    'rate-card:42',
  );
});

test('keeps date ranges in report-detail identity', () => {
  assert.equal(
    describeWorkspacePath('/profit-loss/9?date_from=2026-01-01&date_to=2026-01-31')
      ?.canonicalKey,
    'profit-loss:9:2026-01-01:2026-01-31',
  );
  assert.equal(
    describeWorkspacePath('/equipment-profit/vehicle/4?date_from=2026-02-01&date_to=2026-02-28')
      ?.canonicalKey,
    'equipment-profit:vehicle:4:2026-02-01:2026-02-28',
  );
});

test('keeps meaningful query and hash while replacing the frame flag', () => {
  assert.equal(
    addWorkspaceFrameFlag('/invoices/42/prepare?mode=compact#totals'),
    '/invoices/42/prepare?mode=compact&workspace_frame=1#totals',
  );
  assert.equal(
    addWorkspaceFrameFlag('/equipment-profit/vehicle/4?date_from=2026-02-01#summary'),
    '/equipment-profit/vehicle/4?date_from=2026-02-01&workspace_frame=1#summary',
  );
});

test('does not turn create, redirect, capture, or upload flows into workspace tabs', () => {
  const excluded = [
    '/ai-knowledge/new',
    '/contracts',
    '/contracts/12',
    '/payroll',
    '/subcon-payroll',
    '/verification/upload',
    '/clock-in',
    '/daily-reports/12/export',
  ];

  for (const path of excluded) {
    assert.equal(describeWorkspacePath(path), null, path);
  }
});

test('honours an explicit module allow-list without generic fallback', () => {
  process.env.NEXT_PUBLIC_WORKSPACE_TABS_MODULES = 'invoices,quotations';
  assert.equal(describeWorkspacePath('/invoices/1')?.canonicalKey, 'invoice:1');
  assert.equal(describeWorkspacePath('/companies/1'), null);
  assert.equal(describeWorkspacePath('/companies'), null);
  assert.equal(
    describeWorkspacePath('/settings/field-options')?.canonicalKey,
    'page:/settings/field-options',
  );
});

test('supports all as an explicit build-time module setting', () => {
  process.env.NEXT_PUBLIC_WORKSPACE_TABS_MODULES = 'all';
  assert.equal(describeWorkspacePath('/companies/1')?.canonicalKey, 'company:1');
  assert.equal(
    describeWorkspacePath('/payroll/ai-reconcile/2')?.canonicalKey,
    'ai-payroll-reconcile:2',
  );
});

test('reuses an existing tab even when eight extra tabs are open', () => {
  const target = describeWorkspacePath('/companies/1');
  assert.ok(target);
  const tabs = [
    { isBase: true, canonicalKey: 'list:companies' },
    { isBase: false, canonicalKey: 'company:1' },
    ...Array.from({ length: MAX_WORKSPACE_EXTRA_TABS - 1 }, (_, index) => ({
      isBase: false,
      canonicalKey: `employee:${index + 1}`,
    })),
  ];

  assert.equal(decideWorkspaceOpen(tabs, target), 'activate-existing');
});

test('allows eight extra tabs and blocks only a ninth new tab', () => {
  const target = describeWorkspacePath('/expenses/99');
  assert.ok(target);
  const sevenExtras = [
    { isBase: true, canonicalKey: 'list:expenses' },
    ...Array.from({ length: MAX_WORKSPACE_EXTRA_TABS - 1 }, (_, index) => ({
      isBase: false,
      canonicalKey: `expense:${index + 1}`,
    })),
  ];
  const eightExtras = [
    ...sevenExtras,
    { isBase: false, canonicalKey: 'page:/settings/field-options' },
  ];

  assert.equal(decideWorkspaceOpen(sevenExtras, target), 'open-new');
  assert.equal(decideWorkspaceOpen(eightExtras, target), 'overflow');
});

test('the single base tab is not counted toward the eight-tab quota', () => {
  const target = describeWorkspacePath('/payment-in/99');
  assert.ok(target);
  const tabs = [
    { isBase: true, canonicalKey: 'list:payment-in' },
    ...Array.from({ length: MAX_WORKSPACE_EXTRA_TABS - 1 }, (_, index) => ({
      isBase: false,
      canonicalKey: `payment-in:${index + 1}`,
    })),
  ];

  assert.equal(decideWorkspaceOpen(tabs, target), 'open-new');
});
