import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";

type AppTheme = "light" | "dark";
const ThemeContext = createContext<AppTheme>("light");

export function ThemeProvider({ children }: PropsWithChildren): React.JSX.Element {
  const media = useMemo(() => window.matchMedia("(prefers-color-scheme: dark)"), []);
  const [theme, setTheme] = useState<AppTheme>(media.matches ? "dark" : "light");
  useEffect(() => {
    const update = (): void => setTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [media]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): AppTheme {
  return useContext(ThemeContext);
}
