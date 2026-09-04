import { useState } from "react";
import { Icon } from "@/components/Icon/Icon.js";
import { confirmService } from "@/components/ConfirmDialog/ConfirmService.js";
import { authService, useAuthStore } from "@/services/auth/AuthService.js";
import { catalogService } from "@/services/catalog/CatalogService.js";
import styles from "../Settings.module.css";

export function AuthSettings(): React.JSX.Element {
  const auth = useAuthStore();
  const [advanced, setAdvanced] = useState(false);
  const [cookie, setCookie] = useState("");
  const active = auth.busy || ["STARTING_BROWSER", "WAITING_FOR_USER", "VALIDATING"].includes(auth.flow?.state ?? "");
  const importCookie = async (): Promise<void> => {
    const secret = cookie;
    setCookie("");
    if (await authService.importCookie(secret)) {
      setAdvanced(false);
      void catalogService.search({ signedIn: true });
    }
  };
  const logout = async (): Promise<void> => {
    if (!await confirmService.confirm({ title: "退出力扣登录？", message: "只删除本机保存或本次运行中的力扣会话；题库和代码会保留。", confirmLabel: "退出登录", tone: "danger" })) return;
    if (await authService.logout()) {
      catalogService.clearAccountFilters();
      void catalogService.search({ signedIn: false });
    }
  };
  return (
    <section id="auth-settings" tabIndex={-1} className={styles.card} aria-labelledby="auth-heading">
      <header className={styles.cardHeader}><span className={styles.icon}><Icon name="account" size="card" /></span><div><small>账号</small><h2 id="auth-heading">{auth.status.signedIn ? `已登录：${auth.status.username ?? "力扣账号"}` : "登录力扣"}</h2><p role="status">{auth.message}</p></div><span className={`${styles.badge} ${auth.status.signedIn ? styles.signedIn : ""}`}>{auth.status.signedIn ? "已登录" : "未登录"}</span></header>
      <div className={styles.authActions}>
        {!auth.status.signedIn ? <label><input type="checkbox" checked={auth.persistence === "memory"} disabled={active} onChange={(event) => authService.setPersistence(event.target.checked ? "memory" : "system")} /> 仅本次运行，不保存登录凭据</label> : null}
        <div className="button-row">
          {!auth.status.signedIn ? <button className="button primary" type="button" disabled={active} onClick={() => void authService.startBrowserLogin()}>使用浏览器登录</button> : null}
          {active ? <button className="button quiet" type="button" onClick={() => void authService.cancelBrowserLogin()}>取消登录</button> : null}
          {!auth.status.signedIn && !active ? <button className="button quiet" type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>高级登录</button> : null}
          {auth.status.signedIn ? <button className="button danger" type="button" onClick={() => void logout()}>退出登录</button> : null}
        </div>
      </div>
      {advanced && !auth.status.signedIn && !active ? <div className={styles.advanced}><label><span>Cookie</span><input type="password" autoComplete="off" value={cookie} onChange={(event) => setCookie(event.target.value)} placeholder="粘贴完整 Cookie（高级备用）" /></label><button className="button secondary" type="button" disabled={auth.busy} onClick={() => void importCookie()}>验证并保存</button><small>提交后立即清空输入；仅在浏览器登录不可用时使用。</small></div> : null}
    </section>
  );
}
