import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <span className="text-lg font-semibold">Synapse</span>
      <ThemeToggle />
    </header>
  );
}
