// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterProvider } from "./RouterContext.js";
import { RootNavigator } from "./RootNavigator.js";
import { useRouterStore } from "./RouterService.js";
import { resetStores } from "@/test/resetStores.js";
import { useWorkspaceStore } from "@/services/workspace/WorkspaceService.js";
import { render } from "@testing-library/react";

describe("RootNavigator keepAlive", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    resetStores();
    useRouterStore.setState({ route: { name: "workbench" }, previousRoute: null });
    useWorkspaceStore.setState({
      settings: { workspaceRoot: "/workspace", solutionRoot: "/workspace", customized: false },
      solution: { filePath: "/workspace/a.ts", content: "draft", codeHash: "a".repeat(64) },
      draft: "unsaved draft",
      dirty: true,
      tab: "code",
    });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = ""; });

  it("preserves the editor while Settings is shown and restores focusable content on return", () => {
    render(<RouterProvider><RootNavigator /></RouterProvider>);
    expect((screen.getByRole("textbox", { name: "解答代码" }) as HTMLTextAreaElement).value).toBe("unsaved draft");
    fireEvent.click(screen.getByRole("button", { name: /用户/u }));
    fireEvent.click(screen.getByRole("menuitem", { name: "设置" }));
    expect(screen.getByRole("heading", { name: "设置" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "← 返回题库" }));
    expect((screen.getByRole("textbox", { name: "解答代码" }) as HTMLTextAreaElement).value).toBe("unsaved draft");
  });
});
