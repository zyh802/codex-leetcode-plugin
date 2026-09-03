import { useEffect, useRef } from "react";
import { catalogService, useCatalogStore, type CatalogFilters as Filters } from "@/services/catalog/CatalogService.js";
import { useAuthStore } from "@/services/auth/AuthService.js";
import styles from "../Workbench.module.css";

export function CatalogFilters({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element | null {
  const filters = useCatalogStore((state) => state.filters);
  const signedIn = useAuthStore((state) => state.status.signedIn);
  const reference = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent): void => {
      if (event.target instanceof Node && !reference.current?.contains(event.target)) onClose();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, onClose]);
  if (!open) return null;
  const update = <K extends keyof Filters>(key: K, value: Filters[K]): void => {
    catalogService.setFilter(key, value);
    void catalogService.search({ signedIn });
  };
  return (
    <section ref={reference} className={styles.filterPopover} aria-label="题库筛选">
      <header><strong>筛选题目</strong><button type="button" className="text-button" onClick={() => { catalogService.clearFilters(); void catalogService.search({ signedIn }); }}>清空</button></header>
      <div className={styles.filterGrid}>
        <label><span>难度</span><select value={filters.difficulty} onChange={(event) => update("difficulty", event.target.value as Filters["difficulty"])}><option value="">全部难度</option><option value="Easy">简单</option><option value="Medium">中等</option><option value="Hard">困难</option></select></label>
        <label><span>分类</span><select value={filters.category} onChange={(event) => update("category", event.target.value as Filters["category"])}><option value="">全部分类</option><option value="algorithms">算法</option><option value="database">数据库</option><option value="shell">Shell</option><option value="concurrency">并发</option></select></label>
        <label><span>付费类型</span><select value={filters.paid} onChange={(event) => update("paid", event.target.value as Filters["paid"])}><option value="all">全部题目</option><option value="free">免费</option><option value="paid">会员题</option></select></label>
        <label><span>完成状态</span><select disabled={!signedIn} value={filters.status} onChange={(event) => update("status", event.target.value as Filters["status"])}><option value="">全部状态</option><option value="solved">已解决</option><option value="attempted">尝试过</option><option value="not_started">未开始</option></select></label>
      </div>
      <label className={styles.favoriteFilter}><input type="checkbox" disabled={!signedIn} checked={filters.favorite} onChange={(event) => update("favorite", event.target.checked)} /><span>只看收藏题目</span></label>
      <p>完成状态与收藏筛选需要先登录力扣。</p>
    </section>
  );
}
