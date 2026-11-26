import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { describe, expect, it } from "vitest";

import { ThemeToggle } from "@/components/theme-toggle";

function renderToggle() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle", () => {
  it("starts on the system theme", () => {
    renderToggle();

    expect(screen.getByRole("button", { name: "Theme: system" })).toBeInTheDocument();
  });

  it("cycles light, dark, then system on each click", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole("button", { name: "Theme: system" }));
    expect(screen.getByRole("button", { name: "Theme: light" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Theme: light" }));
    expect(screen.getByRole("button", { name: "Theme: dark" })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "Theme: dark" }));
    expect(screen.getByRole("button", { name: "Theme: system" })).toBeInTheDocument();
  });

  it("is reached with Tab and switches on Enter", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.tab();
    expect(screen.getByRole("button", { name: "Theme: system" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Theme: light" })).toHaveFocus();
  });
});
