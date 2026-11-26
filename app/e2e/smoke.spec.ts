import { expect, test } from "@playwright/test";

test("the home page shows the shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("banner")).toContainText("Synapse");
  await expect(page.getByRole("main")).toContainText("Synapse is not running");
});

test("the theme toggle switches to dark from the keyboard", async ({ page }) => {
  await page.goto("/");

  // The toggle is the page's only focusable element, so the first Tab reaches it.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Theme: system" })).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Theme: light" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/\blight\b/);

  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Theme: dark" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
});

test("GET /api/health answers ok", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});
