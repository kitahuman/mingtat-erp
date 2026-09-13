import { expect, test, type Page } from '@playwright/test';

const activeFrame = (page: Page) => page.frameLocator('iframe:not([hidden])');

const answerNextDialog = (page: Page, answer: 'accept' | 'dismiss') =>
  new Promise<string>((resolve, reject) => {
    page.once('dialog', async (dialog) => {
      const message = dialog.message();
      try {
        if (answer === 'accept') await dialog.accept();
        else await dialog.dismiss();
        resolve(message);
      } catch (error) {
        reject(error);
      }
    });
  });

const openInvoice = async (page: Page, id: number) => {
  await activeFrame(page).getByTestId(`open-invoice-${id}`).click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${id}$`));
  await expect(page.getByRole('tab', { name: `Invoice ${id}` })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(activeFrame(page).getByRole('heading', { name: `Invoice ${id}` })).toBeVisible();
};

const fillEightExtras = async (page: Page) => {
  for (let id = 1; id <= 7; id += 1) await openInvoice(page, id);
  await page.getByTestId('menu-field-options').click();
  await expect(page.getByRole('tab', { name: '選項設定' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
};

const attemptNinthInvoice = async (page: Page) => {
  await page.getByRole('tab', { name: 'Invoice 7' }).click();
  await activeFrame(page).getByTestId('open-invoice-8').click();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/invoices');
  await expect(
    activeFrame(page).getByRole('heading', { name: 'Invoice list harness' }),
  ).toBeVisible();
});

test('makes an initially opened detail deep link the single non-closable base', async ({ page }) => {
  await page.goto('/invoices/1');
  await expect(
    activeFrame(page).getByRole('heading', { name: 'Invoice 1' }),
  ).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'Invoice 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: '關閉 Invoice 1' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '發票列表' })).toHaveCount(0);
  await expect(page.getByText('0/8', { exact: true })).toBeVisible();
});

test('routes programmatic internal opens through Workspace instead of a browser popup', async ({ page }) => {
  await activeFrame(page).getByTestId('open-global-invoice-9').click();
  await expect(page).toHaveURL(/\/invoices\/9$/);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: 'Invoice 9' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('1/8', { exact: true })).toBeVisible();
});

test('keeps the invoice list as base and opens Sidebar pages as closable extra tabs', async ({ page }) => {
  await openInvoice(page, 1);
  await page.getByTestId('menu-field-options').click();

  await expect(page).toHaveURL(/\/settings\/field-options$/);
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.getByRole('tab', { name: '發票列表' })).toBeVisible();
  await expect(page.getByRole('button', { name: '關閉 發票列表' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Invoice 1' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '選項設定' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('button', { name: '關閉 選項設定' })).toBeVisible();
  await expect(page.getByText('2/8', { exact: true })).toBeVisible();
  await expect(
    activeFrame(page).getByRole('heading', { name: 'Field options harness' }),
  ).toBeVisible();
});

test('preserves each tab page instance and its local state while switching tabs', async ({ page }) => {
  await activeFrame(page)
    .getByRole('textbox', { name: 'Invoice filter' })
    .fill('unpaid invoices');
  await page.getByTestId('menu-field-options').click();
  await activeFrame(page)
    .getByRole('textbox', { name: 'Option draft' })
    .fill('temporary option');

  await page.getByRole('tab', { name: '發票列表' }).click();
  await expect(
    activeFrame(page).getByRole('textbox', { name: 'Invoice filter' }),
  ).toHaveValue('unpaid invoices');

  await page.getByRole('tab', { name: '選項設定' }).click();
  await expect(
    activeFrame(page).getByRole('textbox', { name: 'Option draft' }),
  ).toHaveValue('temporary option');
});

test('keeps non-pilot page-to-page navigation inside the existing work tab', async ({ page }) => {
  await page.getByTestId('menu-field-options').click();
  await activeFrame(page).getByTestId('navigate-system-settings').click();

  await expect(page).toHaveURL(/\/settings\/system$/);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: '發票列表' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '系統參數' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tab', { name: '選項設定' })).toHaveCount(0);
  await expect(page.getByText('1/8', { exact: true })).toBeVisible();
  await expect(
    activeFrame(page).getByRole('heading', { name: 'System settings harness' }),
  ).toBeVisible();
});

test('protects an unsaved general settings tab when the user tries to close it', async ({ page }) => {
  await page.getByTestId('menu-field-options').click();
  await activeFrame(page)
    .getByRole('textbox', { name: 'Option draft' })
    .fill('do not lose this');
  await expect(page.getByLabel('有未儲存修改')).toBeVisible();

  const dismissed = answerNextDialog(page, 'dismiss');
  await Promise.all([
    page.getByRole('button', { name: '關閉 選項設定' }).click(),
    dismissed,
  ]);
  await expect(page.getByRole('tab', { name: '選項設定' })).toBeVisible();
  await expect(
    activeFrame(page).getByRole('textbox', { name: 'Option draft' }),
  ).toHaveValue('do not lose this');

  const accepted = answerNextDialog(page, 'accept');
  await Promise.all([
    page.getByRole('button', { name: '關閉 選項設定' }).click(),
    accepted,
  ]);
  await expect(page.getByRole('tab', { name: '選項設定' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/invoices$/);
});

test('opens another list selected from Sidebar as an extra tab instead of replacing the base', async ({ page }) => {
  await page.getByTestId('menu-quotations').click();

  await expect(page).toHaveURL(/\/quotations$/);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: '發票列表' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '報價單' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('1/8', { exact: true })).toBeVisible();
});

test('uses whichever page was opened first as the single base and counts a later invoice list as one extra', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(
    activeFrame(page).getByRole('heading', { name: 'Dashboard harness' }),
  ).toBeVisible();
  await page.getByTestId('menu-invoices').click();

  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: '儀表板' })).toBeVisible();
  await expect(page.getByRole('button', { name: '關閉 儀表板' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: '發票管理' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('button', { name: '關閉 發票管理' })).toBeVisible();
  await expect(page.getByText('1/8', { exact: true })).toBeVisible();
});

test('allows eight mixed extra tabs and blocks only a ninth new tab', async ({ page }) => {
  await fillEightExtras(page);

  await expect(page.getByRole('tab')).toHaveCount(9);
  await expect(page.getByText('8/8', { exact: true })).toBeVisible();
  await attemptNinthInvoice(page);

  const dialog = page.getByRole('dialog', { name: '已達工作頁籤上限' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: '取消' })).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: '在新瀏覽器分頁開啟' }),
  ).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(9);
  await dialog.getByRole('button', { name: '取消' }).click();
});

test('reuses an existing entity child at the eight-tab limit and preserves query/hash', async ({ page }) => {
  await fillEightExtras(page);
  await page.getByRole('tab', { name: 'Invoice 7' }).click();
  await activeFrame(page).getByTestId('open-invoice-1-prepare').click();

  await expect(page).toHaveURL(/\/invoices\/1\/prepare\?mode=compact#totals$/);
  await expect(page.getByRole('tab')).toHaveCount(9);
  await expect(page.getByText('8/8', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(activeFrame(page).getByTestId('frame-path')).toContainText(
    '/invoices/1/prepare?mode=compact&workspace_frame=1#totals',
  );
});

test('dirty close is fail-closed on cancel and closes only after explicit confirmation', async ({ page }) => {
  await openInvoice(page, 1);
  await activeFrame(page).getByRole('textbox', { name: 'Draft' }).fill('unsaved');
  await expect(page.getByLabel('有未儲存修改')).toBeVisible();

  const dismissed = answerNextDialog(page, 'dismiss');
  await Promise.all([
    page.getByRole('button', { name: '關閉 Invoice 1' }).click(),
    dismissed,
  ]);
  await expect(page.getByRole('tab', { name: /Invoice 1/ })).toBeVisible();
  await expect(activeFrame(page).getByRole('textbox', { name: 'Draft' })).toHaveValue('unsaved');

  const accepted = answerNextDialog(page, 'accept');
  await Promise.all([
    page.getByRole('button', { name: '關閉 Invoice 1' }).click(),
    accepted,
  ]);
  await expect(page.getByRole('tab', { name: /Invoice 1/ })).toHaveCount(0);
  await expect(page).toHaveURL(/\/invoices$/);
});

test('dirty browser Back cancellation restores the original history entry without losing draft', async ({ page }) => {
  await openInvoice(page, 1);
  await activeFrame(page).getByTestId('open-prepare-link').click();
  await expect(page).toHaveURL(/\/invoices\/1\/prepare\?mode=compact#totals$/);
  await activeFrame(page).getByRole('textbox', { name: 'Draft' }).fill('keep me');

  const dismissed = answerNextDialog(page, 'dismiss');
  await Promise.all([page.evaluate(() => window.history.back()), dismissed]);
  await page.waitForTimeout(250);
  await expect(page).toHaveURL(/\/invoices\/1\/prepare\?mode=compact#totals$/);
  await expect(activeFrame(page).getByRole('textbox', { name: 'Draft' })).toHaveValue('keep me');

  const accepted = answerNextDialog(page, 'accept');
  await Promise.all([page.evaluate(() => window.history.back()), accepted]);
  await expect(page).toHaveURL(/\/invoices\/1$/);
});

test('opens the ninth new tab only in a new browser tab when explicitly chosen', async ({ context, page }) => {
  await fillEightExtras(page);
  await attemptNinthInvoice(page);

  const popupPromise = context.waitForEvent('page');
  await page
    .getByRole('dialog', { name: '已達工作頁籤上限' })
    .getByRole('button', { name: '在新瀏覽器分頁開啟' })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup).toHaveURL(/\/invoices\/8$/);
  await expect(page.getByRole('tab')).toHaveCount(9);
  await popup.close();
});

test('keeps the two-choice dialog open when the browser blocks the popup', async ({ page }) => {
  await fillEightExtras(page);
  await attemptNinthInvoice(page);
  await page.evaluate(() => {
    window.open = () => null;
  });

  const dialog = page.getByRole('dialog', { name: '已達工作頁籤上限' });
  await dialog.getByRole('button', { name: '在新瀏覽器分頁開啟' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('瀏覽器已阻擋新分頁');
  await expect(dialog.getByRole('button')).toHaveCount(2);
  await expect(page.getByRole('tab')).toHaveCount(9);
});

test('traps keyboard focus inside the two-choice limit dialog and supports Escape', async ({ page }) => {
  await fillEightExtras(page);
  await attemptNinthInvoice(page);

  const dialog = page.getByRole('dialog', { name: '已達工作頁籤上限' });
  const cancel = dialog.getByRole('button', { name: '取消' });
  const external = dialog.getByRole('button', { name: '在新瀏覽器分頁開啟' });
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(external).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(9);
});

test('replays a desired child path after a late frame-ready event', async ({ page }) => {
  await activeFrame(page).getByTestId('open-delayed-invoice-1').click();
  await expect(page).toHaveURL(/\/invoices\/1\?delay_frame=1$/);
  await page.evaluate(() => {
    window.history.pushState({}, '', '/invoices/1/prepare?mode=late#ready');
    window.dispatchEvent(new Event('next-navigation'));
  });

  await expect(page).toHaveURL(/\/invoices\/1\/prepare\?mode=late#ready$/);
  await expect(activeFrame(page).getByTestId('frame-path')).toContainText(
    '/invoices/1/prepare?mode=late&workspace_frame=1#ready',
    { timeout: 5_000 },
  );
});

test('rejects an uncontrolled cross-entity iframe mutation without breaking the 1+8 invariant', async ({ page }) => {
  for (let id = 1; id <= 8; id += 1) await openInvoice(page, id);
  await activeFrame(page).getByTestId('force-cross-entity').click();

  await expect(page.getByRole('dialog', { name: '已達工作頁籤上限' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(9);
  await expect(page.getByText('8/8', { exact: true })).toBeVisible();
  await expect(activeFrame(page).getByRole('heading', { name: 'Invoice 8' })).toBeVisible();
  await expect(activeFrame(page).getByTestId('frame-path')).toContainText(
    '/invoices/8?workspace_frame=1',
  );
});
