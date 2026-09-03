import { type PropsWithChildren, useEffect } from "react";
import { appLifecycleService } from "./AppLifecycleService.js";

export function AppBootstrap({ children }: PropsWithChildren): React.JSX.Element {
  useEffect(() => {
    void appLifecycleService.startup();
    return () => { void appLifecycleService.shutdown(); };
  }, []);
  return <>{children}</>;
}
