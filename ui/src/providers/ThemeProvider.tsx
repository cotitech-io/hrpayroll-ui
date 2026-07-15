import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

interface ThemeProviderProps {
  children: ReactNode;
}

// Ported from portal-bridge's ThemeProvider (same defaultTheme/attribute/enableSystem
// behavior for visual + functional parity). storageKey is scoped to this app rather
// than reused verbatim — it's a storage implementation detail, not a visual one.
export const ThemeProvider = ({ children }: ThemeProviderProps) => (
  <NextThemesProvider
    attribute="class"
    defaultTheme="dark"
    enableSystem
    storageKey="coti-payroll-theme"
  >
    {children}
  </NextThemesProvider>
);
