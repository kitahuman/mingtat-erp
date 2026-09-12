'use client';

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  WorkspaceTabsProvider,
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
      {Array.from({ length: 6 }, (_, index) => index + 1).map((id) => (
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
  return (
    <section>
      <h1>Invoice list harness</h1>
      <OpenEntityButtons />
      <button
        type="button"
        data-testid="open-delayed-invoice-1"
        onClick={() => openTab('/invoices/1?delay_frame=1')}
      >
        Open delayed invoice 1
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
                '/invoices/6?workspace_frame=1',
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

  if (pathname === '/invoices') return <InvoiceList />;
  if (pathname === '/quotations') return <QuotationList />;

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

function App() {
  return (
    <WorkspaceTabsProvider>
      <HarnessRoute />
    </WorkspaceTabsProvider>
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
