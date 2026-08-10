import { expect, test } from "@playwright/test";

const resetToken = "POK334_browser_routing_regression";
const legacyResetURL = `/#reset=${resetToken}`;

async function seedStoredSession(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("tunnelcraft:token", "existing-session-token");
  });
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: 1,
          email: "signed-in@example.com",
          displayName: null,
          emailVerified: true,
          role: "user",
        },
      }),
    });
  });
  await page.route("**/api/progress", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: null, updatedAt: null }),
    });
  });
}

async function expectResetPage(page: import("@playwright/test").Page): Promise<void> {
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);
}

test("legacy reset link opens the reset page while signed out", async ({ page }) => {
  await page.goto(legacyResetURL);
  await expectResetPage(page);
});

test("legacy reset link opens the reset page while a session is stored", async ({ page }) => {
  await seedStoredSession(page);
  await page.goto(legacyResetURL);
  await expectResetPage(page);
});

test("reset links tolerate trailing fragment parameters", async ({ page }) => {
  let submittedToken: unknown;
  await page.route("**/api/auth/reset-password", async (route) => {
    submittedToken = (route.request().postDataJSON() as { token?: unknown }).token;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.goto(`${legacyResetURL}&x=1`);
  await expectResetPage(page);
  await page.locator('input[type="password"]').fill("new browser password");
  await page.getByRole("button", { name: "SET NEW PASSWORD" }).click();
  await expect.poll(() => submittedToken).toBe(resetToken);
});

for (const { label, url } of [
  { label: "missing", url: "/reset-password" },
  { label: "malformed", url: "/reset-password#reset=not+a+base64url+token" },
]) {
  test(`${label} reset tokens do not clear an existing session`, async ({ page }) => {
    await seedStoredSession(page);
    await page.goto(url);
    await expect(page.getByText(/reset link is invalid or expired/i)).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page.getByRole("button", { name: "GO TO SIGN IN" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("button", { name: "SIGNED-IN@EXAMPLE.COM" })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("tunnelcraft:token")))
      .toBe("existing-session-token");
  });
}

test("an expired reset token does not clear an existing session", async ({ page }) => {
  await seedStoredSession(page);
  await page.route("**/api/auth/reset-password", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Reset link is invalid or expired — request a new one" }),
    });
  });

  await page.goto(`/reset-password#reset=${resetToken}`);
  await page.locator('input[type="password"]').fill("new browser password");
  await page.getByRole("button", { name: "SET NEW PASSWORD" }).click();
  await expect(page.getByText(/reset link is invalid or expired/i)).toBeVisible();
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: "SIGNED-IN@EXAMPLE.COM" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("tunnelcraft:token")))
    .toBe("existing-session-token");
});

test("successful reset clears the client session before navigating to sign in", async ({
  page,
}) => {
  await seedStoredSession(page);
  await page.route("**/api/auth/reset-password", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto(`/reset-password#reset=${resetToken}`);
  await expect(page.getByRole("button", { name: "SIGNED-IN@EXAMPLE.COM" })).toBeVisible();
  await page.locator('input[type="password"]').fill("new browser password");
  await page.getByRole("button", { name: "SET NEW PASSWORD" }).click();
  await page.getByRole("button", { name: "GO TO SIGN IN" }).click();

  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("tunnelcraft:token")))
    .toBeNull();
});
