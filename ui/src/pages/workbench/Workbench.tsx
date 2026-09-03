import { useState } from "react";
import { SegmentedTabs } from "@/components/SegmentedTabs/SegmentedTabs.js";
import { useWorkspaceStore, workspaceService } from "@/services/workspace/WorkspaceService.js";
import { CatalogSidebar } from "./modules/CatalogSidebar.js";
import { ProblemWorkspace } from "./modules/ProblemWorkspace.js";
import { CodeWorkspace } from "./modules/CodeWorkspace.js";
import styles from "./Workbench.module.css";

export function Workbench(): React.JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const tab = useWorkspaceStore((state) => state.tab);
  const hasCode = useWorkspaceStore((state) => state.solution !== null);
  return (
    <main className={`${styles.workbench} ${sidebarCollapsed ? styles.sidebarCollapsed : ""}`}>
      <CatalogSidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <section className={styles.main} aria-label="题目工作区">
        <SegmentedTabs
          label="题目工作区"
          value={tab}
          options={[{ value: "problem", label: "题目" }, { value: "code", label: "代码", disabled: !hasCode }]}
          onChange={(value) => workspaceService.setTab(value)}
        />
        <div className={styles.tabPanel} hidden={tab !== "problem"}><ProblemWorkspace /></div>
        <div className={styles.tabPanel} hidden={tab !== "code"}><CodeWorkspace /></div>
      </section>
    </main>
  );
}
