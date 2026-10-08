import { expect, test } from "@playwright/test";

// A new customer signs up, lands in the app, finds the call and their (empty) coverage file,
// signs out and back in. Advisor-only pages stay closed to them.
test("sign up, use the app, sign out and back in", async ({ page }) => {
  const email = `e2e+${Date.now()}@harbor.test`;
  const password = "a-long-test-password";

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /doctor and your prescriptions be covered/ })).toBeVisible();
  await page.getByRole("link", { name: "Talk with Anna" }).click();

  await page.getByLabel("First name").fill("Bob");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/ZIP code/).fill("60614");
  await page.getByLabel(/Password/).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText(/at least 8 characters/);
  await expect(page.getByLabel("Email")).toHaveValue(email); // a failed submit keeps what was typed

  await page.getByLabel(/Password/).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: /, Bob$/ })).toBeVisible();

  // The camera check comes before any call exists (Tavus bills from creation).
  await page.getByRole("link", { name: /What will my prescriptions cost/ }).click();
  await expect(page.getByRole("heading", { name: "Ready to talk with Anna?" })).toBeVisible();
  await expect(page.getByText("What will my prescriptions cost?")).toBeVisible();
  await page.getByRole("link", { name: "Cancel" }).click();

  await page.getByRole("link", { name: "Your coverage" }).click();
  await expect(page.getByText("Nothing here yet")).toBeVisible();
  await expect(page.getByText("Chicago, IL")).toBeVisible();

  await page.goto("/app/advisor");
  await expect(page.getByText(/could not be found|404/i).first()).toBeVisible();

  await page.goto("/app");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText(/don't match/);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
});
