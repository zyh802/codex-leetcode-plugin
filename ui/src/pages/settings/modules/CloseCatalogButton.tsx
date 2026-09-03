import { confirmService } from "@/components/ConfirmDialog/ConfirmService.js";
import { catalogLifecycleService } from "@/services/lifecycle/CatalogLifecycleService.js";
import { workspaceService } from "@/services/workspace/WorkspaceService.js";

export function CloseCatalogButton(): React.JSX.Element {
  const close = async (): Promise<void> => {
    const dirtyWarning = workspaceService.isDirty() ? "当前代码还有未保存修改。\n\n" : "";
    const accepted = await confirmService.confirm({
      title: "关闭本地前端？",
      message: `${dirtyWarning}只停止本地 HTTP 前端，不会退出 MCP 插件；之后可再次打开并获得新地址。`,
      confirmLabel: "关闭前端",
      tone: "danger",
    });
    if (accepted) await catalogLifecycleService.closeCatalog();
  };
  return <button className="button danger" type="button" onClick={() => void close()}>关闭本地前端</button>;
}
