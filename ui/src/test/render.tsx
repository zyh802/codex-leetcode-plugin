import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { ThemeProvider } from "@/components/AppTheme/AppTheme.js";
import { LocaleProvider } from "@/locales/LocaleProvider.js";
import { RouterProvider } from "@/routers/index.js";

export function renderApp(element: ReactElement, options?: RenderOptions): RenderResult {
  return render(<ThemeProvider><LocaleProvider><RouterProvider>{element}</RouterProvider></LocaleProvider></ThemeProvider>, options);
}
