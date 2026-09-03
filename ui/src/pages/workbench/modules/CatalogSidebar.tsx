import { useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue.js";
import { SEARCH_DEBOUNCE_MS } from "@/config/constants.js";
import { catalogService, useCatalogStore } from "@/services/catalog/CatalogService.js";
import { useAuthStore } from "@/services/auth/AuthService.js";
import { useSyncStore, syncService } from "@/services/sync/SyncService.js";
import { routerService } from "@/routers/RouterService.js";
import { CatalogFilters } from "./CatalogFilters.js";
import { ProblemList } from "./ProblemList.js";
import styles from "../Workbench.module.css";
import pluginIconUrl from "../../../../../assets/codex-leetcode-icon.png";

interface CatalogSidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function CatalogSidebar({ collapsed, onCollapsedChange }: CatalogSidebarProps): React.JSX.Element {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const query = useCatalogStore((state) => state.query);
  const filters = useCatalogStore((state) => state.filters);
  const scrollTop = useCatalogStore((state) => state.sidebarScrollTop);
  const auth = useAuthStore((state) => state.status);
  const sync = useSyncStore();
  const [searchText, setSearchText] = useState(query);
  const debouncedSearch = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS);
  const scrollReference = useRef<HTMLDivElement>(null);
  const accountMenuReference = useRef<HTMLDivElement>(null);
  const accountButtonReference = useRef<HTMLButtonElement>(null);
  useEffect(() => setSearchText(query), [query]);
  useEffect(() => {
    if (debouncedSearch === useCatalogStore.getState().query) return;
    catalogService.setQuery(debouncedSearch.trim());
    void catalogService.search({ signedIn: auth.signedIn });
  }, [debouncedSearch, auth.signedIn]);
  useEffect(() => {
    if (scrollReference.current) scrollReference.current.scrollTop = scrollTop;
  }, []);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (event.target instanceof Node && !accountMenuReference.current?.contains(event.target)) setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setAccountMenuOpen(false);
      accountButtonReference.current?.focus();
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);
  const filterCount = useMemo(() => [filters.difficulty, filters.category, filters.paid !== "all", filters.status, filters.favorite].filter(Boolean).length, [filters]);
  const accountLabel = auth.signedIn ? auth.username ?? "已登录" : "未登录";
  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`} aria-label="题库侧边栏">
      <header className={styles.brand}>
        <img className={styles.brandMark} src={pluginIconUrl} alt="" />
        <span className={styles.brandCopy}><strong>力扣题库</strong><small>本地练习工作台</small></span>
        <div className={styles.brandActions}>
          <button className={styles.collapseButton} type="button" aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"} aria-expanded={!collapsed} onClick={() => onCollapsedChange(!collapsed)}>
            <span aria-hidden="true">‹</span>
          </button>
        </div>
      </header>
      {collapsed ? <div className={styles.collapsedSpacer} /> : (
        <>
          <section className={styles.explorer}>
            <div className={styles.controls}>
              <label className={styles.search}><span aria-hidden="true">⌕</span><input type="search" maxLength={200} autoComplete="off" placeholder="搜索题号、标题或 slug" value={searchText} onChange={(event) => setSearchText(event.target.value)} /></label>
              <div className={styles.filterMenu}>
                <button className={filterCount ? styles.filterActive : undefined} type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>筛选{filterCount ? ` · ${filterCount}` : ""}</button>
                <CatalogFilters open={filtersOpen} onClose={() => setFiltersOpen(false)} />
              </div>
            </div>
            <div ref={scrollReference} className={styles.catalogScroll} role="region" aria-label="题目列表" onScroll={(event) => catalogService.setSidebarScrollTop(event.currentTarget.scrollTop)}>
              <ProblemList />
            </div>
          </section>
        </>
      )}
      <footer className={styles.sidebarFooter}>
        <div ref={accountMenuReference} className={styles.accountMenu}>
          <button ref={accountButtonReference} className={styles.accountButton} type="button" title={accountLabel} aria-label={`用户 ${accountLabel}`} aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}>
            <span className={styles.accountAvatar} aria-hidden="true">{auth.signedIn ? accountLabel.slice(0, 1).toUpperCase() : "○"}</span>
            <span className={styles.accountDetails}><strong className={styles.accountName}>{accountLabel}</strong>{auth.signedIn ? null : <small>点击登录力扣</small>}</span>
          </button>
          {accountMenuOpen ? (
            <div className={styles.accountPopover} role="menu" aria-label="用户菜单">
              <button type="button" role="menuitem" onClick={() => { setAccountMenuOpen(false); routerService.navigate("settings"); }}><span aria-hidden="true">⚙</span><strong>设置</strong></button>
              <button type="button" role="menuitem" disabled={sync.busy} onClick={() => { setAccountMenuOpen(false); accountButtonReference.current?.focus(); void syncService.synchronize(); }}><span aria-hidden="true">↻</span><strong>同步题库</strong></button>
            </div>
          ) : null}
        </div>
      </footer>
    </aside>
  );
}
