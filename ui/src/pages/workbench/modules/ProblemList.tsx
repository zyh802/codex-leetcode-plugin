import { EmptyState } from "@/components/EmptyState/EmptyState.js";
import { Skeleton } from "@/components/Skeleton/Skeleton.js";
import { catalogService, useCatalogStore } from "@/services/catalog/CatalogService.js";
import { useAuthStore } from "@/services/auth/AuthService.js";
import { useProblemSelection } from "../hooks/useProblemSelection.js";
import styles from "../Workbench.module.css";

export function ProblemList(): React.JSX.Element {
  const { problems, selectedProblemId, loading, error, hasMore, query, filters, stats } = useCatalogStore();
  const signedIn = useAuthStore((state) => state.status.signedIn);
  const select = useProblemSelection();
  if (loading) return <Skeleton lines={9} />;
  if (problems.length === 0) {
    const filtered = query.trim() || filters.difficulty || filters.category || filters.paid !== "all" || filters.status || filters.favorite || stats.total > 0;
    return <EmptyState title={error ? "题库加载失败" : filtered ? "没有匹配的题目" : "本地题库还是空的"} description={error ?? (filtered ? "调整搜索词或清空筛选条件后再试。" : "点击下方“同步题库”获取全部题目的轻量目录。")} />;
  }
  return (
    <>
      <div className={styles.problemList}>
        {problems.map((problem) => (
          <button key={problem.id} className={`${styles.problemRow} ${selectedProblemId === problem.id ? styles.selected : ""}`} type="button" onClick={() => select(problem.id)}>
            <span className={styles.problemNumber}>{problem.frontendId}</span>
            <span className={styles.problemTitle}>{problem.title}</span>
            <span className={styles.markers}>{problem.favorite ? "★" : ""}{problem.paidOnly ? " 🔒" : ""}{signedIn && problem.status?.toLowerCase() === "ac" ? " ✓" : ""}</span>
            <span className={`${styles.difficulty} ${styles[problem.difficulty.toLowerCase()]}`}>{problem.difficulty === "Easy" ? "简单" : problem.difficulty === "Medium" ? "中等" : "困难"}</span>
          </button>
        ))}
      </div>
      {hasMore ? <button className={styles.loadMore} type="button" onClick={() => void catalogService.search({ append: true, signedIn })}>加载更多</button> : null}
    </>
  );
}
