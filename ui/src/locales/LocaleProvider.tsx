import { createContext, type PropsWithChildren, useContext } from "react";
import { t } from "./localeCore.js";

const LocaleContext = createContext(t);
export function LocaleProvider({ children }: PropsWithChildren): React.JSX.Element {
  return <LocaleContext.Provider value={t}>{children}</LocaleContext.Provider>;
}
export function useLocale(): typeof t { return useContext(LocaleContext); }
