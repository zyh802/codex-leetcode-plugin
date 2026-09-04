import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon/Icon.js";
import { confirmService } from "@/components/ConfirmDialog/ConfirmService.js";
import { useWorkspaceStore, workspaceService } from "@/services/workspace/WorkspaceService.js";
import styles from "../Settings.module.css";

export function WorkspaceSettings(): React.JSX.Element {
  const workspace = useWorkspaceStore();
  const [directory, setDirectory] = useState(workspace.settings.solutionRoot ?? "");
  useEffect(() => setDirectory(workspace.settings.solutionRoot ?? ""), [workspace.settings.solutionRoot]);
  const apply = async (value: string | null): Promise<void> => {
    if (value !== null && !value.trim()) return;
    if (workspace.dirty && !await confirmService.confirm({ title: "更改解答目录？", message: "当前代码还有未保存修改。更改目录会关闭这份代码。", confirmLabel: "更改目录", tone: "danger" })) return;
    await workspaceService.setSolutionRoot(value);
  };
  return (
    <section id="workspace-settings" tabIndex={-1} className={styles.card} aria-labelledby="directory-heading">
      <header className={styles.cardHeader}><span className={styles.icon}><Icon name="directory" size="card" /></span><div><small>本地文件</small><h2 id="directory-heading">解答目录</h2><p>{workspace.settings.workspaceRoot ? `当前工作区：${workspace.settings.workspaceRoot}` : "未检测到当前工作区，请设置绝对路径"}</p></div></header>
      <div className={styles.directory}><label htmlFor="solution-directory">保存路径</label><input id="solution-directory" type="text" autoComplete="off" value={directory} onChange={(event) => setDirectory(event.target.value)} placeholder={workspace.settings.workspaceRoot ?? "请输入绝对路径"} /><p>这是全题库公共设置；新建解答保存在这里，已有代码不会被覆盖。</p></div>
      <footer className={styles.cardFooter}><span role="status">{workspace.saveMessage}</span><div className="button-row"><button className="button quiet" type="button" disabled={!workspace.settings.customized || workspace.saveBusy} onClick={() => void apply(null)}>恢复工作区</button><button className="button primary" type="button" disabled={workspace.saveBusy || !directory.trim()} onClick={() => void apply(directory)}>保存路径</button></div></footer>
    </section>
  );
}
