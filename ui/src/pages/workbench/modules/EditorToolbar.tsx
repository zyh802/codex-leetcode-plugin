import { confirmService } from "@/components/ConfirmDialog/ConfirmService.js";
import { toastService } from "@/services/feedback/ToastService.js";
import { authService, useAuthStore } from "@/services/auth/AuthService.js";
import { judgeService, useJudgeStore } from "@/services/judge/JudgeService.js";
import { useWorkspaceStore, workspaceService } from "@/services/workspace/WorkspaceService.js";
import { routerService } from "@/routers/RouterService.js";
import styles from "../Workbench.module.css";

export function EditorToolbar({ judgeInput }: { judgeInput: string }): React.JSX.Element {
  const workspace = useWorkspaceStore();
  const judge = useJudgeStore();
  const signedIn = useAuthStore((state) => state.status.signedIn);
  const solution = workspace.solution;
  const requireLogin = (): boolean => {
    if (authService.requireLogin()) return true;
    routerService.navigate("settings", { focus: "auth" });
    return false;
  };
  const run = async (): Promise<void> => {
    if (!solution || !requireLogin() || !await workspaceService.save()) return;
    await judgeService.run(solution.filePath, judgeInput);
  };
  const submit = async (): Promise<void> => {
    if (!solution || !requireLogin() || !await workspaceService.save()) return;
    const confirmation = await judgeService.prepareSubmission(solution.filePath);
    if (!confirmation) return;
    const accepted = await confirmService.confirm({
      title: `确认提交 ${confirmation.slug}？`,
      message: `语言：${confirmation.langSlug}\n文件：${confirmation.filePath}\n代码 hash：${confirmation.codeHash.slice(0, 12)}\n\n此操作会在力扣产生正式提交记录。`,
      confirmLabel: "正式提交",
      tone: "danger",
    });
    if (!accepted) { judgeService.cancelPreparedSubmission(); return; }
    await judgeService.submit(solution.filePath, confirmation.confirmationToken);
  };
  const review = async (): Promise<void> => {
    if (!solution || !await workspaceService.save()) return;
    const prompt = await judgeService.prepareReview(solution.filePath);
    if (!prompt) return;
    try { await navigator.clipboard.writeText(prompt); toastService.show("评审提示已复制，回到 Codex 对话粘贴即可。", "success"); }
    catch { toastService.show(prompt, "neutral"); }
  };
  const pendingSubmit = judge.activePollType === "submit" || (judge.operation === "submit" && judge.resumableJobId !== null);
  const availability = !signedIn
    ? "登录力扣后可使用 Run 和 Submit。"
    : judge.activePollType === "run"
      ? "Run 正在查询结果；你仍然可以 Submit。"
      : pendingSubmit
        ? "上一次提交尚未得到最终结果，请先继续查询。"
        : judge.resumableJobId !== null ? "判题任务已停止自动等待，可以继续查询。" : "";
  return (
    <footer className={styles.commandBar}>
      <div className={styles.commandContext}><p>{availability}</p><div>
        {judge.activePollJobId !== null ? <button className="button quiet" type="button" onClick={() => void judgeService.cancelPolling()}>取消等待</button> : null}
        {judge.activePollJobId === null && judge.resumableJobId !== null ? <button className="button quiet" type="button" onClick={() => void judgeService.resumePolling()}>继续查询</button> : null}
        <button className="button quiet" type="button" disabled={judge.reviewBusy} onClick={() => void review()}>让 Codex 评审</button>
      </div></div>
      <div className={styles.commandActions}>
        <button className="button secondary" type="button" disabled={!workspace.dirty || workspace.saveBusy} onClick={() => void workspaceService.save()}>保存代码</button>
        <button className="button secondary" type="button" disabled={judge.runBusy || pendingSubmit} onClick={() => void run()}>Run</button>
        <button className="button primary" type="button" disabled={judge.submitBusy || pendingSubmit} onClick={() => void submit()}>Submit</button>
      </div>
    </footer>
  );
}
