import { createContext, type PropsWithChildren, useContext } from "react";
import { routerService } from "./RouterService.js";

const RouterContext = createContext(routerService);

export function RouterProvider({ children }: PropsWithChildren): React.JSX.Element {
  return <RouterContext.Provider value={routerService}>{children}</RouterContext.Provider>;
}

export function useRouter(): typeof routerService {
  return useContext(RouterContext);
}
