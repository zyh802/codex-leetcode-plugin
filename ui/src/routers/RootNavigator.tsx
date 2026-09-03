import { Workbench } from "@/pages/workbench/Workbench.js";
import { Settings } from "@/pages/settings/Settings.js";
import { useRouterStore } from "./RouterService.js";

export function RootNavigator(): React.JSX.Element {
  const route = useRouterStore((state) => state.route.name);
  return (
    <>
      <section className="route-layer" hidden={route !== "workbench"} aria-hidden={route !== "workbench"}>
        <Workbench />
      </section>
      <section className="route-layer" hidden={route !== "settings"} aria-hidden={route !== "settings"}>
        <Settings />
      </section>
    </>
  );
}
