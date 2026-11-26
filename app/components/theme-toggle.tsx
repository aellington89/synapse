"use client";

import { useSyncExternalStore } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

const NEXT_THEME = { system: "light", light: "dark", dark: "system" } as const;
type Theme = keyof typeof NEXT_THEME;

const ICONS = { system: MonitorIcon, light: SunIcon, dark: MoonIcon } satisfies Record<
  Theme,
  unknown
>;

const subscribe = () => () => {};

/**
 * One button that cycles the theme: system, light, dark. The server can't know the stored
 * theme, so until the component has mounted it renders as "system", and the server's markup
 * matches the client's first render.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const current: Theme =
    mounted && theme && Object.hasOwn(NEXT_THEME, theme) ? (theme as Theme) : "system";
  const Icon = ICONS[current];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Theme: ${current}`}
      title={`Theme: ${current}`}
      onClick={() => setTheme(NEXT_THEME[current])}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
