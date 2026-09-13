import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_WORKSPACE_EXTRA_TABS,
  addWorkspaceFrameFlag,
  decideWorkspaceOpen,
  describeWorkspacePath,
} from './workspaceRoutes';

test('describes invoice list and generic Sidebar pages', () => {
  const invoices = describeWorkspacePath('/invoices');
  const options = describeWorkspacePath('/settings/field-options');

  assert.equal(invoices?.kind, 'list');
  assert.equal(invoices?.canonicalKey, 'list:invoices');
  assert.equal(options?.kind, 'page');
  assert.equal(options?.canonicalKey, 'page:/settings/field-options');
  assert.equal(options?.title, '選項管理');
});

test('uses a Sidebar-provided title for a known internal page', () => {
  assert.equal(
    describeWorkspacePath('/settings/field-options', '選項設定')?.title,
    '選項設定',
  );
});

test('canonicalizes invoice child pages to one detail entity', () => {
  const detail = describeWorkspacePath('/invoices/42');
  const prepare = describeWorkspacePath('/invoices/42/prepare');
  const pricing = describeWorkspacePath('/invoices/42/pricing');
  const pdf = describeWorkspacePath('/invoices/42/pdf-preview');

  assert.equal(detail?.canonicalKey, 'invoice:42');
  assert.equal(prepare?.canonicalKey, 'invoice:42');
  assert.equal(pricing?.canonicalKey, 'invoice:42');
  assert.equal(pdf?.canonicalKey, 'invoice:42');
  assert.equal(prepare?.subrouteKind, 'child');
});

test('canonicalizes quotation PDF preview to its quotation detail', () => {
  assert.equal(
    describeWorkspacePath('/quotations/17/pdf-preview')?.canonicalKey,
    'quotation:17',
  );
});

test('keeps meaningful query and hash while replacing the frame flag', () => {
  assert.equal(
    addWorkspaceFrameFlag('/invoices/42/prepare?mode=compact#totals'),
    '/invoices/42/prepare?mode=compact&workspace_frame=1#totals',
  );
  assert.equal(
    addWorkspaceFrameFlag('/settings/field-options?group=invoice#choices'),
    '/settings/field-options?group=invoice&workspace_frame=1#choices',
  );
});

test('reuses an existing tab even when eight extra tabs are open', () => {
  const target = describeWorkspacePath('/settings/field-options');
  assert.ok(target);
  const tabs = [
    { isBase: true, canonicalKey: 'list:invoices' },
    { isBase: false, canonicalKey: 'page:/settings/field-options' },
    ...Array.from({ length: MAX_WORKSPACE_EXTRA_TABS - 1 }, (_, index) => ({
      isBase: false,
      canonicalKey: `invoice:${index + 1}`,
    })),
  ];

  assert.equal(decideWorkspaceOpen(tabs, target), 'activate-existing');
});

test('allows eight extra tabs and blocks only a ninth new tab', () => {
  const target = describeWorkspacePath('/invoices/99');
  assert.ok(target);
  const sevenExtras = [
    { isBase: true, canonicalKey: 'list:invoices' },
    ...Array.from({ length: MAX_WORKSPACE_EXTRA_TABS - 1 }, (_, index) => ({
      isBase: false,
      canonicalKey: `invoice:${index + 1}`,
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
  const target = describeWorkspacePath('/quotations');
  assert.ok(target);
  const tabs = [
    { isBase: true, canonicalKey: 'list:invoices' },
    ...Array.from({ length: MAX_WORKSPACE_EXTRA_TABS - 1 }, (_, index) => ({
      isBase: false,
      canonicalKey: `invoice:${index + 1}`,
    })),
  ];

  assert.equal(decideWorkspaceOpen(tabs, target), 'open-new');
});
