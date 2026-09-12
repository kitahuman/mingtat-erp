import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_WORKSPACE_DETAIL_TABS,
  addWorkspaceFrameFlag,
  decideWorkspaceDetailOpen,
  describeWorkspacePath,
} from './workspaceRoutes';

test('describes a list as the pinned list slot', () => {
  const descriptor = describeWorkspacePath('/invoices');
  assert.equal(descriptor?.kind, 'list');
  assert.equal(descriptor?.canonicalKey, 'list:invoices');
  assert.equal(descriptor?.listPath, '/invoices');
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
    addWorkspaceFrameFlag('/invoices/42?workspace_frame=0'),
    '/invoices/42?workspace_frame=1',
  );
});

test('reuses an existing detail even when five details are open', () => {
  const target = describeWorkspacePath('/invoices/3');
  assert.ok(target);
  const tabs = Array.from({ length: MAX_WORKSPACE_DETAIL_TABS }, (_, index) => ({
    kind: 'detail' as const,
    canonicalKey: `invoice:${index + 1}`,
  }));

  assert.equal(decideWorkspaceDetailOpen(tabs, target), 'activate-existing');
});

test('allows details one through five and blocks only a sixth new detail', () => {
  const target = describeWorkspacePath('/invoices/99');
  assert.ok(target);
  const fourDetails = Array.from(
    { length: MAX_WORKSPACE_DETAIL_TABS - 1 },
    (_, index) => ({
      kind: 'detail' as const,
      canonicalKey: `invoice:${index + 1}`,
    }),
  );
  const fiveDetails = [
    ...fourDetails,
    { kind: 'detail' as const, canonicalKey: 'quotation:5' },
  ];

  assert.equal(decideWorkspaceDetailOpen(fourDetails, target), 'open-new');
  assert.equal(decideWorkspaceDetailOpen(fiveDetails, target), 'overflow');
});

test('the list slot is not counted toward the five-detail limit', () => {
  const target = describeWorkspacePath('/quotations/99');
  assert.ok(target);
  const tabs = [
    { kind: 'list' as const, canonicalKey: 'list:invoices' },
    ...Array.from({ length: 4 }, (_, index) => ({
      kind: 'detail' as const,
      canonicalKey: `invoice:${index + 1}`,
    })),
  ];

  assert.equal(decideWorkspaceDetailOpen(tabs, target), 'open-new');
});
