import { useEffect } from "react";
import { routerService, useRouterStore } from "@/routers/RouterService.js";
import { AuthSettings } from "./modules/AuthSettings.js";
import { WorkspaceSettings } from "./modules/WorkspaceSettings.js";
import { LifecycleSettings } from "./modules/LifecycleSettings.js";
import { settingsMessages } from "./i18n/messages.js";
import styles from "./Settings.module.css";

export function Settings(): React.JSX.Element {
  const focus = useRouterStore((state) => state.route.name === "settings" ? state.route.params?.focus : undefined);
  useEffect(() => {
    if (!focus) return;
    window.requestAnimationFrame(() => document.getElementById(focus === "auth" ? "auth-settings" : "workspace-settings")?.focus());
  }, [focus]);
  return (
    <main className={styles.settings}>
      <header className={styles.topbar}><button className="button quiet" type="button" onClick={() => routerService.navigate("workbench")}>← 返回题库</button></header>
      <div className={styles.scroll}>
        <header className={styles.heading}><span>Preferences</span><h1>{settingsMessages.title}</h1><p>{settingsMessages.description}</p></header>
        <div className={styles.content}><AuthSettings /><WorkspaceSettings /><LifecycleSettings /></div>
      </div>
    </main>
  );
}
