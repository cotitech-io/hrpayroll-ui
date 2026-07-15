import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Default to dark (matches ThemeProvider defaultTheme) until hydrated.
  const isDark = !mounted || resolvedTheme !== "light";

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        "rounded-full h-10 w-10 shrink-0 border shadow-sm",
        "border-foreground/20 bg-foreground/5 text-foreground hover:bg-foreground/10",
        "dark:border-white/30 dark:bg-white/10 dark:text-white dark:hover:bg-white/20",
        !mounted && "opacity-80",
      )}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
