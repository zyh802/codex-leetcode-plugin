import { CloseCatalogButton } from "./CloseCatalogButton.js";
import { Icon } from "@/components/Icon/Icon.js";
import { useCatalogLifecycleStore } from "@/services/lifecycle/CatalogLifecycleService.js";
import styles from "../Settings.module.css";

export function LifecycleSettings(): React.JSX.Element {
  const lifecycle = useCatalogLifecycleStore();
  return (
    <section className={styles.card} aria-labelledby="lifecycle-heading">
      <header className={styles.cardHeader}><span className={styles.icon}><Icon name="frontend" size="card" /></span><div><small>本地服务</small><h2 id="lifecycle-heading">前端进程</h2><p>页面通过租约心跳复用同一个本地监听；最后一个页面离开后会自动回收。</p></div><span className={styles.badge}>{lifecycle.activeClients} 个页面</span></header>
      <footer className={styles.cardFooter}><span role="status">{lifecycle.error}</span><CloseCatalogButton /></footer>
    </section>
  );
}
