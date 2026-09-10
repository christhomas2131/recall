import { expect, test } from '@playwright/test';

const RESUME = `Northline Health Collaborative
Program Operations Lead
March 2021 - Present
Remote
Built a shared intake tracker for six partner clinics.
Skills: Excel, Salesforce
Education: State University, BA Sociology

Additional context for testing: I coordinated reporting, intake, and handoffs across partner teams while maintaining the shared process documentation.`;

test('new user can create, generate, persist, and reach export', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /writes wrong answers on purpose/i })).toBeVisible();
  await page.getByRole('button', { name: /I understand/i }).first().click();

  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Project name').fill('E2E Operations Role');
  await page.getByLabel('…or paste it').fill(RESUME);
  await page.getByRole('button', { name: 'Parse resume' }).click();

  await expect(page.getByRole('heading', { name: /Check the parse/i })).toBeVisible();
  await expect(page.getByLabel('Employer')).toHaveValue('Northline Health Collaborative');
  await page.getByRole('button', { name: /Looks right/i }).click();

  await expect(page.getByRole('heading', { name: /How you actually talk/i })).toBeVisible();
  await page.getByRole('button', { name: /On to the questions/i }).click();
  await page.getByRole('button', { name: /Generate questions/i }).click();

  const question = page.getByRole('link', { name: 'Tell me about yourself.' });
  await expect(question).toBeVisible();
  await question.click();
  await expect(page).toHaveURL(/\/verify\/.+/);
  await page.getByRole('button', { name: 'Draft an answer' }).click();
  await expect(page.getByText('three duplicate approvals')).toBeVisible();

  await page.reload();
  await expect(page.getByText('three duplicate approvals')).toBeVisible();
  await page.getByRole('link', { name: 'Export' }).click();
  await expect(page.getByRole('heading', { name: 'Export' })).toBeVisible();
  await expect(page.getByText(/Standard mode is holding this export/)).toBeVisible();
});

test('invalid and malformed inputs fail visibly without creating a project', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('recall.settings', JSON.stringify({
      hasAcknowledged: true,
    }));
  });
  await page.goto('/new');

  await page.getByLabel('…or paste it').fill('Too short.');
  await page.getByRole('button', { name: 'Parse resume' }).click();
  await expect(page.getByText(/Paste at least a few lines/)).toBeVisible();

  await page.getByLabel('…or paste it').fill(
    `MALFORMED_E2E ${'resume content '.repeat(20)}`,
  );
  await page.getByRole('button', { name: 'Parse resume' }).click();
  await expect(page.getByText(/wrong shape/)).toBeVisible();
  await page.getByRole('link', { name: 'Recall' }).click();
  await expect(page.getByText(/Nothing here yet/)).toBeVisible();
});
