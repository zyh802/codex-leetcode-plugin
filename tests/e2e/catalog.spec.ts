import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => { await request.get("/__test/reset"); });

test("selects a problem, opens the full editor, runs code, and protects Submit", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /1 Two Sum/u })).toBeVisible();
  await page.getByRole("button", { name: /1 Two Sum/u }).click();
  await expect(page.getByRole("heading", { name: "两数之和" })).toBeVisible();
  await page.getByRole("button", { name: "创建代码" }).click();
  const editor = page.getByRole("textbox", { name: "解答代码" });
  await expect(editor).toBeVisible();
  await editor.fill("function twoSum() { return [0, 1]; }");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("heading", { name: "运行通过" })).toBeVisible();
  await expect(page.getByRole("button", { name: "取消等待" })).toHaveCount(0);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("正式提交记录");
  await page.getByRole("button", { name: "取消" }).click();
  const state = await (await request.get("/__test/state")).json();
  expect(state.submitCalls).toBe(0);
});

test("opens account actions above the person entry, collapses the sidebar, and centers the empty workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "用户 codex-user" })).toBeVisible();
  await expect(page.getByText("力扣账号", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("menu", { name: "用户菜单" })).toHaveCount(0);
  await page.getByRole("button", { name: "用户 codex-user" }).click();
  await expect(page.getByRole("menuitem", { name: "设置", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "同步题库", exact: true })).toBeVisible();
  const accountMenuBox = await page.getByRole("menu", { name: "用户菜单" }).boundingBox();
  const accountButtonBox = await page.getByRole("button", { name: "用户 codex-user" }).boundingBox();
  expect((accountMenuBox?.y ?? 0) + (accountMenuBox?.height ?? 0)).toBeLessThan(accountButtonBox?.y ?? 0);
  await page.getByRole("button", { name: "用户 codex-user" }).click();
  await expect(page.getByRole("button", { name: "题库", exact: true })).toHaveCount(0);

  const workspace = page.getByRole("region", { name: "题目工作区" });
  const emptyState = page.getByText("选择一道题开始").locator("..");
  const workspaceBefore = await workspace.boundingBox();
  const emptyStateBox = await emptyState.boundingBox();
  expect(emptyStateBox?.height).toBeGreaterThan(600);
  const workbench = workspace.locator("..");
  await expect(workbench).toHaveCSS("transition-property", "grid-template-columns");
  await expect(workbench).toHaveCSS("transition-duration", "0.22s");

  await page.getByRole("button", { name: "收起侧边栏" }).click();
  await expect(page.getByRole("button", { name: "展开侧边栏" })).toBeVisible();
  await expect(page.getByRole("region", { name: "题目列表" })).toHaveCount(0);
  await expect.poll(async () => (await workspace.boundingBox())?.x ?? Number.POSITIVE_INFINITY).toBeLessThan(100);
  const workspaceAfter = await workspace.boundingBox();
  expect(workspaceAfter?.x).toBeLessThan(workspaceBefore?.x ?? 0);

  await page.getByRole("button", { name: "展开侧边栏" }).click();
  await expect(page.getByRole("button", { name: "收起侧边栏" })).toBeVisible();
  await expect.poll(async () => (await workspace.boundingBox())?.x ?? 0).toBeGreaterThan(300);
});

test("keeps narrow catalog controls within the sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 500 });
  await page.goto("/");

  const search = page.getByPlaceholder("搜索题号、标题或 slug");
  await search.focus();
  await expect(search).toHaveCSS("box-shadow", "none");
  await expect(search.locator("..")).not.toHaveCSS("box-shadow", "none");
  await expect(page.getByText("1 道题", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "筛选", exact: true }).click();
  const popover = page.locator('section[aria-label="题库筛选"]');
  await expect(popover).toBeVisible();
  const popoverBox = await popover.boundingBox();
  expect(popoverBox?.x).toBeGreaterThanOrEqual(0);
  expect((popoverBox?.x ?? 0) + (popoverBox?.width ?? 0)).toBeLessThanOrEqual(240);
  const accountButtonBox = await page.getByRole("button", { name: "用户 codex-user" }).boundingBox();
  expect((popoverBox?.y ?? 0) + (popoverBox?.height ?? 0)).toBeLessThanOrEqual(accountButtonBox?.y ?? 0);
  const columns = await popover.locator(":scope > div").first().evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(columns.trim().split(/\s+/u)).toHaveLength(1);
});

test("completes browser login and closes only the local frontend", async ({ page, request }) => {
  await request.get("/__test/signout");
  await page.goto("/#/settings");
  await expect(page.getByRole("button", { name: "使用浏览器登录" })).toBeVisible();
  await page.getByRole("button", { name: "使用浏览器登录" }).click();
  await expect(page.getByRole("heading", { name: /已登录：codex-user/u })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "关闭本地前端" }).click();
  await page.getByRole("button", { name: "关闭前端" }).click();
  await expect(page.getByRole("heading", { name: "本地前端已关闭" })).toBeVisible();
});
