import { expect, test, type Page } from '@playwright/test';

const activeFrame = (page: Page) => page.frameLocator('iframe:not([hidden])');

const openInvoice = async (page: Page, id: number) => {
  await activeFrame(page).getByTestId(`open-invoice-${id}`).click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${id}$`));
  await expect(page.getByRole('tab', { name: `Invoice ${id}` })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(activeFrame(page).getByRole('heading', { name: `Invoice ${id}` })).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/invoices');
  await expect(
    activeFrame(page).getByRole('heading', { name: 'Invoice list harness' }),
  ).toBeVisible();
});

test('pins one list and allows exactly five detail tabs', async ({ page }) => {
  await openInvoice(page, 1);
  for (let id = 2; id <= 5; id += 1) await openInvoice(page, id);

  await expect(page.getByRole('tab')).toHaveCount(6);
  await expect(page.getByText('5/5', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '關閉 發票列表' })).toHaveCount(0);

  await activeFrame(page).getByTestId('open-invoice-6').click();
  const dialog = page.getByRole('dialog', { name: '已達詳細頁籤上限' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: '取消' })).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: '在新瀏覽器分頁開啟' }),
  ).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(6);
  await dialog.getByRole('button', { name: '取消' }).click();
});

test('reuses an existing entity child at the five-detail limit and preserves query/hash', async ({
  page,
}) => {
  await openInvoice(page, 1);
  for (let id = 2; id <= 5; id += 1) await openInvoice(page, id);

  await activeFrame(page).getByTestId('open-invoice-1-prepare').click();
  await expect(page).toHaveURL(
    /\/invoices\/1\/prepare\?mode=compact#totals$/,
  );
  await expect(page.getByRole('tab')).toHaveCount(6);
  await expect(page.getByText('5/5', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(activeFrame(page).getByTestId('frame-path')).toContainText(
    '/invoices/1/prepare?mode=compact&workspace_frame=1#totals',
  );
});

test('dirty close is fail-closed on cancel and closes only after explicit confirmation', async ({
  page,
}) => {
  await openInvoice(page, 1);
  await activeFrame(page).getByRole('textbox', { name: 'Draft' }).fill('unsaved');
  await expect(page.getByLabel('有未儲存修改')).toBeVisible();

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '關閉 Invoice 1' }).click();
  await expect(page.getByRole('tab', { name: /Invoice 1/ })).toBeVisible();
  await expect(activeFrame(page).getByRole('textbox', { name: 'Draft' })).toHaveValue(
    'unsaved',
  );

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '關閉 Invoice 1' }).click();
  await expect(page.getByRole('tab', { name: /Invoice 1/ })).toHaveCount(0);
  await expect(page).toHaveURL(/\/invoices$/);
  await expect(
    activeFrame(page).getByRole('heading', { name: 'Invoice list harness' }),
  ).toBeVisible();
});

test('dirty browser Back cancellation restores the original history entry without losing draft', async ({
  page,
}) => {
  await openInvoice(page, 1);
  await activeFrame(page).getByTestId('open-prepare-link').click();
  await expect(page).toHaveURL(
    /\/invoices\/1\/prepare\?mode=compact#totals$/,
  );
  await activeFrame(page).getByRole('textbox', { name: 'Draft' }).fill('keep me');

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.evaluate(() => window.history.back());
  await page.waitForTimeout(250);
  await expect(page).toHaveURL(
    /\/invoices\/1\/prepare\?mode=compact#totals$/,
  );
  await expect(activeFrame(page).getByRole('textbox', { name: 'Draft' })).toHaveValue(
    'keep me',
  );

  page.once('dialog', (dialog) => dialog.accept());
  await page.evaluate(() => window.history.back());
  await expect(page).toHaveURL(/\/invoices\/1$/);
  await expect(activeFrame(page).getByTestId('frame-path')).toContainText(
    '/invoices/1?workspace_frame=1',
  );
});

test('opens the sixth new entity only in a new browser tab when explicitly chosen', async ({
  context,
  page,
}) => {
  await openInvoice(page, 1);
  for (let id = 2; id <= 5; id += 1) await openInvoice(page, id);
  await activeFrame(page).getByTestId('open-invoice-6').click();

  const popupPromise = context.waitForEvent('page');
  await page
    .getByRole('dialog', { name: '已達詳細頁籤上限' })
    .getByRole('button', { name: '在新瀏覽器分頁開啟' })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup).toHaveURL(/\/invoices\/6$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(6);
  await popup.close();
});

test('keeps the two-choice limit dialog open when the browser blocks the popup', async ({
  page,
}) => {
  await openInvoice(page, 1);
  for (let id = 2; id <= 5; id += 1) await openInvoice(page, id);
  await activeFrame(page).getByTestId('open-invoice-6').click();
  await page.evaluate(() => {
    window.open = () => null;
  });

  const dialog = page.getByRole('dialog', { name: '已達詳細頁籤上限' });
  await dialog.getByRole('button', { name: '在新瀏覽器分頁開啟' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('瀏覽器已阻擋新分頁');
  await expect(dialog.getByRole('button')).toHaveCount(2);
  await expect(page.getByRole('tab')).toHaveCount(6);
});

test('traps keyboard focus inside the two-choice limit dialog and supports Escape', async ({
  page,
}) => {
  await openInvoice(page, 1);
  for (let id = 2; id <= 5; id += 1) await openInvoice(page, id);
  await activeFrame(page).getByTestId('open-invoice-6').click();

  const dialog = page.getByRole('dialog', { name: '已達詳細頁籤上限' });
  const cancel = dialog.getByRole('button', { name: '取消' });
  const external = dialog.getByRole('button', {
    name: '在新瀏覽器分頁開啟',
  });
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(external).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(6);
});

test('replays a desired child path after a late frame-ready event', async ({ page }) => {
  await activeFrame(page).getByTestId('open-delayed-invoice-1').click();
  await expect(page).toHaveURL(/\/invoices\/1\?delay_frame=1$/);
  await page.getByRole('tab', { name: '發票 #1' }).click();

  const delayedFrame = activeFrame(page);
  await expect(delayedFrame.getByTestId('delayed-frame')).toBeVisible();
  await page.evaluate(() => {
    window.history.pushState(
      {},
      '',
      '/invoices/1/prepare?mode=late#ready',
    );
    window.dispatchEvent(new Event('next-navigation'));
  });

  await expect(page).toHaveURL(/\/invoices\/1\/prepare\?mode=late#ready$/);
  await expect(delayedFrame.getByTestId('frame-path')).toContainText(
    '/invoices/1/prepare?mode=late&workspace_frame=1#ready',
    { timeout: 5_000 },
  );
});

test('rejects an uncontrolled cross-entity iframe mutation without breaking the tab invariant', async ({
  page,
}) => {
  await openInvoice(page, 1);
  for (let id = 2; id <= 5; id += 1) await openInvoice(page, id);

  await activeFrame(page).getByTestId('force-cross-entity').click();
  await expect(
    page.getByRole('dialog', { name: '已達詳細頁籤上限' }),
  ).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(6);
  await expect(page.getByText('5/5', { exact: true })).toBeVisible();
  await expect(activeFrame(page).getByRole('heading', { name: 'Invoice 5' })).toBeVisible();
  await expect(activeFrame(page).getByTestId('frame-path')).toContainText(
    '/invoices/5?workspace_frame=1',
  );
});
