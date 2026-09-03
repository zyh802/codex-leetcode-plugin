// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workbench } from "./Workbench.js";
import { renderApp } from "@/test/render.js";
import { resetStores } from "@/test/resetStores.js";
import { useCatalogStore } from "@/services/catalog/CatalogService.js";
import { useAuthStore } from "@/services/auth/AuthService.js";
import { useWorkspaceStore } from "@/services/workspace/WorkspaceService.js";

describe("Workbench", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    resetStores();
    useCatalogStore.setState({
      stats: { total: 1, lastUpdatedAt: null, categories: [] },
      problems: [{ id: 1, frontendId: "1", slug: "two-sum", title: "Two Sum", difficulty: "Easy", paidOnly: false, status: null, favorite: false, categories: ["algorithms"] }],
      hasMore: false,
    });
    useWorkspaceStore.setState({
      settings: { workspaceRoot: "/workspace", solutionRoot: "/workspace", customized: false },
      solution: { filePath: "/workspace/two-sum.ts", content: "export {};", codeHash: "a".repeat(64) },
      draft: "export {};",
      dirty: false,
    });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("keeps catalog and workspace as independent regions and gives code the full tab panel", () => {
    renderApp(<Workbench />);
    expect(screen.getByRole("region", { name: "题目列表" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "题目工作区" })).toBeTruthy();
    expect(screen.queryByText("1 道题", { exact: true })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "代码" }));
    expect((screen.getByRole("textbox", { name: "解答代码" }) as HTMLTextAreaElement).value).toBe("export {};");
    expect(screen.queryByText("取消等待")).toBeNull();
  });

  it("opens Settings and catalog sync from the account menu and collapses to an icon rail", () => {
    useAuthStore.setState({
      status: { signedIn: true, username: "exciting-austinbut", premium: false, persistence: "memory" },
    });
    renderApp(<Workbench />);

    expect(screen.getByRole("button", { name: "用户 exciting-austinbut" })).toBeTruthy();
    expect(screen.queryByText("力扣账号")).toBeNull();
    expect(screen.queryByRole("menu", { name: "用户菜单" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "用户 exciting-austinbut" }));
    expect(screen.getByRole("menu", { name: "用户菜单" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "设置" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "同步题库" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "用户菜单" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));
    expect(screen.queryByRole("region", { name: "题目列表" })).toBeNull();
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "用户 exciting-austinbut" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "用户 exciting-austinbut" }));
    expect(screen.getByRole("menuitem", { name: "设置" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "同步题库" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "用户 exciting-austinbut" }));

    fireEvent.click(screen.getByRole("button", { name: "展开侧边栏" }));
    expect(screen.getByRole("region", { name: "题目列表" })).toBeTruthy();
  });
});
