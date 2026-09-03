import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState/EmptyState.js";
import { toastService } from "@/services/feedback/ToastService.js";
import { useProblemStore } from "@/services/problem/ProblemService.js";
import { useWorkspaceStore, workspaceService } from "@/services/workspace/WorkspaceService.js";
import { JudgeDrawer } from "./JudgeDrawer.js";
import { EditorToolbar } from "./EditorToolbar.js";
import styles from "../Workbench.module.css";

export function CodeWorkspace(): React.JSX.Element {
  const workspace = useWorkspaceStore();
  const detail = useProblemStore((state) => state.detail);
  const [selectedSample, setSelectedSample] = useState("custom");
  const [judgeInput, setJudgeInput] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const samples = useMemo(() => detail?.samples ?? [], [detail]);
  useEffect(() => {
    const first = samples[0];
    setSelectedSample(first ? String(first.ordinal) : "custom");
    setJudgeInput(first?.input ?? "");
  }, [detail?.id]);
  useEffect(() => { textarea.current?.focus(); }, [workspace.solution?.filePath]);
  if (!workspace.solution) return <EmptyState title="还没有打开代码" description="先在题目页选择语言并创建本地解答。" />;
  const selectSample = (value: string): void => {
    setSelectedSample(value);
    if (value === "custom") return;
    const sample = samples.find((item) => item.ordinal === Number(value));
    if (sample) setJudgeInput(sample.input);
  };
  const keydown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void workspaceService.save(); return; }
    if (event.key !== "Tab") return;
    event.preventDefault();
    const target = event.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    workspaceService.updateDraft(`${workspace.draft.slice(0, start)}  ${workspace.draft.slice(end)}`);
    window.requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = start + 2; });
  };
  const copyPath = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(workspace.solution!.filePath); toastService.show("文件路径已复制。", "success"); }
    catch { toastService.show("无法自动复制，请手动选择上方路径。", "error"); }
  };
  return (
    <section className={styles.codeWorkspace}>
      <header className={styles.editorHeader}><div><span>{"{ }"}</span><div><h2>代码编辑器</h2><p title={workspace.solution.filePath}>{workspace.solution.filePath}</p></div></div><button className="button quiet" type="button" onClick={() => void copyPath()}>复制路径</button></header>
      <textarea ref={textarea} className={styles.codeInput} value={workspace.draft} onChange={(event) => workspaceService.updateDraft(event.target.value)} onKeyDown={keydown} aria-label="解答代码" autoComplete="off" autoCapitalize="off" spellCheck={false} wrap="off" />
      <div className={styles.editorFooter}><span data-tone={workspace.saveMessage.includes("失败") || workspace.saveMessage.includes("冲突") ? "error" : workspace.dirty ? "working" : "success"}>{workspace.dirty ? "有未保存修改" : workspace.saveMessage || "已保存"}</span><span>⌘/Ctrl+S 保存 · Tab 缩进</span></div>
      <JudgeDrawer input={judgeInput} onInputChange={(value) => { setSelectedSample("custom"); setJudgeInput(value); }} samples={samples} selectedSample={selectedSample} onSampleChange={selectSample} />
      <EditorToolbar judgeInput={judgeInput} />
    </section>
  );
}
