'use client';

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  WorkspaceTabsProvider,
  openWorkspacePath,
  useWorkspaceTabDirty,
  useWorkspaceTabTitle,
  useWorkspaceTabs,
} from '../src/components/WorkspaceTabs';

const framePath = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('workspace_frame');
  return `${url.pathname}${url.search}${url.hash}`;
};

function OpenEntityButtons() {
  const { openTab } = useWorkspaceTabs();
  return (
    <div className="actions" data-testid="entity-actions">
      {Array.from({ length: 10 }, (_, index) => index + 1).map((id) => (
        <button
          key={id}
          type="button"
          data-testid={`open-invoice-${id}`}
          onClick={() => openTab(`/invoices/${id}`)}
        >
          Open invoice {id}
        </button>
      ))}
    </div>
  );
}

function InvoiceList() {
  const { openTab } = useWorkspaceTabs();
  const [filter, setFilter] = useState('');
  return (
    <section>
      <h1>Invoice list harness</h1>
      <label>
        Invoice filter
        <input
          aria-label="Invoice filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>
      <OpenEntityButtons />
      <button
        type="button"
        data-testid="open-delayed-invoice-1"
        onClick={() => openTab('/invoices/1?delay_frame=1')}
      >
        Open delayed invoice 1
      </button>
      <button
        type="button"
        data-testid="open-global-invoice-9"
        onClick={() => openWorkspacePath('/invoices/9')}
      >
        Open invoice 9 through global helper
      </button>
    </section>
  );
}

function QuotationList() {
  const { openTab } = useWorkspaceTabs();
  return (
    <section>
      <h1>Quotation list harness</h1>
      <button type="button" onClick={() => openTab('/quotations/7')}>
        Open quotation 7
      </button>
    </section>
  );
}

function FieldOptionsHarness() {
  const [draft, setDraft] = useState('');
  useWorkspaceTabDirty(
    draft.length > 0,
    'Field options draft is unsaved',
    '/settings/field-options',
  );
  return (
    <section>
      <h1>Field options harness</h1>
      <output data-testid="frame-path">{framePath()}</output>
      <label>
        Option draft
        <input
          aria-label="Option draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
    </section>
  );
}

function DetailHarness({ type, id }: { type: 'invoice' | 'quotation'; id: string }) {
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const { openTab } = useWorkspaceTabs();
  const [draft, setDraft] = useState('');
  const basePath = type === 'invoice' ? `/invoices/${id}` : `/quotations/${id}`;
  const label = type === 'invoice' ? `Invoice ${id}` : `Quotation ${id}`;
  const dirty = draft.length > 0;

  useWorkspaceTabTitle(label, basePath);
  useWorkspaceTabDirty(dirty, `${label} draft is unsaved`, basePath);

  const currentUrl = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}${window.location.hash}`;

  return (
    <section>
      <h1>{label}</h1>
      <output data-testid="frame-path">{currentUrl}</output>
      <label>
        Draft
        <input
          aria-label="Draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <button type="button" onClick={() => setDraft('')}>
        Save
      </button>
      {type === 'invoice' && (
        <>
          <a
            data-testid="open-prepare-link"
            href={`/invoices/${id}/prepare?mode=compact#totals`}
          >
            Open prepare
          </a>
          <button
            type="button"
            data-testid="open-invoice-1-prepare"
            onClick={() =>
              openTab('/invoices/1/prepare?mode=compact#totals')
            }
          >
            Open invoice 1 prepare
          </button>
          <button
            type="button"
            data-testid="force-cross-entity"
            onClick={() => {
              window.history.pushState(
                {},
                '',
                '/invoices/10?workspace_frame=1',
              );
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          >
            Force cross entity navigation
          </button>
          <OpenEntityButtons />
        </>
      )}
    </section>
  );
}

function HarnessRoute() {
  const pathname = usePathname() || '/';

  if (pathname === '/dashboard') {
    return (
      <section>
        <h1>Dashboard harness</h1>
      </section>
    );
  }
  if (pathname === '/invoices') return <InvoiceList />;
  if (pathname === '/quotations') return <QuotationList />;
  if (pathname === '/settings/field-options') return <FieldOptionsHarness />;

  const invoice = pathname.match(/^\/invoices\/(\d+)(?:\/(?:prepare|pricing|pdf-preview))?$/);
  if (invoice) return <DetailHarness type="invoice" id={invoice[1]} />;

  const quotation = pathname.match(/^\/quotations\/(\d+)(?:\/pdf-preview)?$/);
  if (quotation) return <DetailHarness type="quotation" id={quotation[1]} />;

  return (
    <section>
      <h1>Outside Workspace</h1>
      <output data-testid="outside-path">{framePath()}</output>
    </section>
  );
}

function HarnessSidebar() {
  const isFrame =
    new URLSearchParams(window.location.search).get('workspace_frame') === '1';
  if (isFrame) return null;
  const openMenu = (path: string, title: string) =>
    window.dispatchEvent(
      new CustomEvent('workspace-menu-open', { detail: { path, title } }),
    );
  return (
    <nav aria-label="Harness sidebar">
      <button
        type="button"
        data-testid="menu-invoices"
        onClick={() => openMenu('/invoices', '發票管理')}
      >
        發票管理
      </button>
      <button
        type="button"
        data-testid="menu-field-options"
        onClick={() => openMenu('/settings/field-options', '選項設定')}
      >
        選項設定
      </button>
      <button
        type="button"
        data-testid="menu-quotations"
        onClick={() => openMenu('/quotations', '報價單')}
      >
        報價單
      </button>
    </nav>
  );
}

function App() {
  return (
    <>
      <HarnessSidebar />
      <WorkspaceTabsProvider>
        <HarnessRoute />
      </WorkspaceTabsProvider>
    </>
  );
}

function DelayedRoot() {
  const shouldDelay =
    new URLSearchParams(window.location.search).get('workspace_frame') === '1' &&
    new URLSearchParams(window.location.search).get('delay_frame') === '1';
  const [ready, setReady] = useState(!shouldDelay);

  React.useEffect(() => {
    if (!ready) {
      const timer = window.setTimeout(() => setReady(true), 1500);
      return () => window.clearTimeout(timer);
    }
  }, [ready]);

  return ready ? <App /> : <p data-testid="delayed-frame">Delayed frame</p>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(<DelayedRoot />);
