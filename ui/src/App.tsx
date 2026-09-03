import { ConfirmDialogHost } from "@/components/ConfirmDialog/ConfirmDialogHost.js";
import { ThemeProvider } from "@/components/AppTheme/AppTheme.js";
import { ToastHost } from "@/components/Toast/ToastHost.js";
import { ErrorBoundary } from "@/components/ErrorBoundary/ErrorBoundary.js";
import { LocaleProvider } from "@/locales/LocaleProvider.js";
import { RouterProvider, RootNavigator } from "@/routers/index.js";
import { AppBootstrap } from "@/services/app/AppBootstrap.js";
import { useAppLifecycleStore } from "@/services/app/AppLifecycleService.js";
import { useCatalogLifecycleStore } from "@/services/lifecycle/CatalogLifecycleService.js";

function AppSurface(): React.JSX.Element {
  const app = useAppLifecycleStore();
  const closed = useCatalogLifecycleStore((state) => state.closed);
  return (
    <>
      <RootNavigator />
      {app.loading ? <div className="app-loading"><section><h1>正在启动本地工作台</h1><p>连接题库、工作区与登录状态…</p></section></div> : null}
      {app.error ? <div className="app-error"><section><h1>本地服务连接失败</h1><p>{app.error}</p></section></div> : null}
      {closed ? <div className="app-closed"><section><h1>本地前端已关闭</h1><p>MCP 插件仍在运行。需要时再次使用“打开力扣题库”即可获得新的本地地址。</p></section></div> : null}
    </>
  );
}

export function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <RouterProvider>
          <AppBootstrap>
            <ErrorBoundary><AppSurface /></ErrorBoundary>
            <ConfirmDialogHost />
            <ToastHost />
          </AppBootstrap>
        </RouterProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
