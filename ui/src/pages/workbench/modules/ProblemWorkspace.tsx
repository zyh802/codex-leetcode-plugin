import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState/EmptyState.js";
import { Skeleton } from "@/components/Skeleton/Skeleton.js";
import { confirmService } from "@/components/ConfirmDialog/ConfirmService.js";
import { useProblemStore } from "@/services/problem/ProblemService.js";
import { useWorkspaceStore, workspaceService } from "@/services/workspace/WorkspaceService.js";
import { judgeService } from "@/services/judge/JudgeService.js";
import { routerService } from "@/routers/RouterService.js";
import styles from "../Workbench.module.css";

export function ProblemWorkspace(): React.JSX.Element {
  const { detail, loading, error } = useProblemStore();
  const workspace = useWorkspaceStore();
  const preferred = useMemo(() => detail?.templates.find((item) => item.langSlug === "typescript") ?? detail?.templates.find((item) => item.langSlug === "python3") ?? detail?.templates[0], [detail]);
  const [language, setLanguage] = useState("");
  useEffect(() => setLanguage(preferred?.langSlug ?? ""), [preferred?.langSlug]);
  if (loading) return <div className={styles.workspaceScroll}><Skeleton lines={12} /></div>;
  if (error) return <EmptyState title="题面加载失败" description={error} glyph="!" />;
  if (!detail) return <EmptyState title="选择一道题开始" description="题面会在点击后从力扣实时获取，不写入本地缓存。" />;
  const content = detail.contents.find((item) => item.locale === "zh-CN") ?? detail.contents[0];
  const create = async (): Promise<void> => {
    if (!workspaceService.requireSolutionRoot()) {
      routerService.navigate("settings", { focus: "workspace" });
      return;
    }
    if (workspace.dirty && !await confirmService.confirm({ title: "打开另一份代码？", message: "当前代码还有未保存修改。继续会切换到新文件。", confirmLabel: "继续" })) return;
    judgeService.resetForSolution();
    if (await workspaceService.create(detail.id, language)) {
      const filePath = useWorkspaceStore.getState().solution?.filePath;
      if (filePath) void judgeService.restore(filePath);
    }
  };
  return (
    <article className={styles.workspaceScroll}>
      <div className={styles.problemContent}>
        <header className={styles.problemHeading}><div><p>题目 {detail.frontendId} · {detail.slug}{detail.paidOnly ? " · Premium" : ""}</p><h1>{detail.translatedTitle ?? detail.title}</h1></div><span className={`${styles.difficulty} ${styles[detail.difficulty.toLowerCase()]}`}>{detail.difficulty === "Easy" ? "简单" : detail.difficulty === "Medium" ? "中等" : "困难"}</span></header>
        <div className={styles.tags}>{detail.tags.map((tag) => <span key={tag.slug}>{tag.translatedName ?? tag.name}</span>)}</div>
        <div className={styles.statement} dangerouslySetInnerHTML={{ __html: content?.html ?? "<p>当前账号未返回可显示的题面。</p>" }} />
        <section className={styles.solutionPanel}>
          <div><h2>创建本地解答</h2><p>{workspace.settings.solutionRoot ? `将创建到 ${workspace.settings.solutionRoot}；所有题目共用此目录。` : "请先在设置页选择解答目录。"}</p></div>
          <div className={styles.solutionControls}><label><span>语言</span><select value={language} onChange={(event) => setLanguage(event.target.value)}>{detail.templates.map((template) => <option key={template.langSlug} value={template.langSlug}>{template.langName}</option>)}</select></label><button className="button primary" type="button" disabled={!language || workspace.createBusy} onClick={() => void create()}>创建代码</button></div>
          {workspace.createMessage ? <p className="status-view" data-tone={workspace.createMessage.includes("正在") ? "working" : workspace.createMessage.includes("失败") ? "error" : "success"}>{workspace.createMessage}</p> : null}
        </section>
      </div>
    </article>
  );
}
