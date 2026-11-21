import { test, expect } from "@playwright/test";
import { closeApp, launchApp, shot } from "../helpers/electron.mjs";

test.describe("Code shell", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  /** @type {import('@playwright/test').Page | undefined} */
  let window;

  test.afterEach(async ({}, testInfo) => {
    await closeApp(app, window, testInfo);
    app = undefined;
    window = undefined;
  });

  test("boots, auto-connects, and lists sessions", async ({}, testInfo) => {
    ({ app, window } = await launchApp(testInfo));

    await expect(window.locator(".shell")).toBeVisible();
    await expect(window.locator(".mode-btn.active")).toHaveText("Code");
    await expect(window.locator("#newSessionBtn")).toBeVisible();
    await expect(window.locator(".files-tab.active")).toHaveText("Files");
    await expect(window.locator("#prompt")).toHaveAttribute(
      "placeholder",
      "Send a message",
    );
    await expect(window.locator(".rail-chrome")).toBeVisible();
    await expect(window.locator("#contextBtn")).toContainText("Context");
    // Identity loads after a session attaches (identity/read).
    await expect(window.locator(".account-space")).toHaveText(
      "Default Workspace",
      { timeout: 45_000 },
    );

    await expect(window.locator("#statusPill")).toHaveAttribute(
      "data-state",
      "connected",
      { timeout: 45_000 },
    );
    await expect(window.locator("#connectBtn")).toHaveCount(0);
    await expect(window.locator("#prompt")).toBeEnabled({ timeout: 45_000 });
    await expect(window.locator("#sessionList")).toBeVisible();
    await expect(window.locator('[data-mock="true"]')).toHaveCount(0);

    await shot(window, testInfo, "shell-autostart");
  });

  test("New Session opens a composer-ready session", async ({}, testInfo) => {
    ({ app, window } = await launchApp(testInfo));

    await expect(window.locator("#statusPill")).toHaveAttribute(
      "data-state",
      "connected",
      { timeout: 45_000 },
    );
    await expect(window.locator("#newSessionBtn")).toBeEnabled({
      timeout: 45_000,
    });

    const before = await window.locator(".session-item").count();
    await window.locator("#newSessionBtn").click();

    await expect(window.locator("#prompt")).toBeEnabled({ timeout: 45_000 });
    await expect(window.locator("#sessionHint")).toContainText("Session");
    await expect(window.locator(".session-item.active")).toBeVisible();

    await expect
      .poll(async () => window.locator(".session-item").count())
      .toBeGreaterThanOrEqual(before);

    await shot(window, testInfo, "shell-new-session");
  });

  test("clicking another session switches the active one", async ({}, testInfo) => {
    ({ app, window } = await launchApp(testInfo));

    await expect(window.locator("#statusPill")).toHaveAttribute(
      "data-state",
      "connected",
      { timeout: 45_000 },
    );
    await expect(window.locator("#newSessionBtn")).toBeEnabled({
      timeout: 45_000,
    });

    // Isolated VIBE_HOME starts empty — create two sessions to switch between.
    await window.locator("#newSessionBtn").click();
    await expect(window.locator(".session-item.active")).toBeVisible({
      timeout: 45_000,
    });
    const firstId = await window
      .locator(".session-item.active")
      .getAttribute("data-session-id");

    await window.locator("#newSessionBtn").click();
    await expect(window.locator(".session-item")).toHaveCount(2, {
      timeout: 45_000,
    });
    const secondId = await window
      .locator(".session-item.active")
      .getAttribute("data-session-id");
    expect(secondId).toBeTruthy();
    expect(secondId).not.toEqual(firstId);

    await window.locator(`[data-session-id="${firstId}"]`).click();
    await expect(
      window.locator(`[data-session-id="${firstId}"]`),
    ).toHaveClass(/active/, { timeout: 45_000 });
    await expect(window.locator("#sessionHint")).toContainText(
      firstId.slice(0, 8),
      { timeout: 45_000 },
    );

    await shot(window, testInfo, "shell-session-switch");
  });

  test("sidebar toggle collapses and restores the rail (offcanvas)", async ({}, testInfo) => {
    ({ app, window } = await launchApp(testInfo));

    await expect(window.locator(".shell")).toHaveAttribute(
      "data-sidebar-state",
      "expanded",
    );
    await expect(window.locator(".rail")).toBeVisible();
    await expect(window.locator("#sidebarToggleBtn")).toBeVisible();

    await window.locator("#sidebarToggleBtn").click();
    await expect(window.locator(".shell")).toHaveAttribute(
      "data-sidebar-state",
      "collapsed",
    );
    await expect(window.locator(".rail")).toBeHidden();
    // Fixed DesktopTitleBar cluster stays available to reopen.
    await expect(window.locator("#sidebarToggleBtn")).toBeVisible();

    await shot(window, testInfo, "shell-sidebar-collapsed");

    await window.locator("#sidebarToggleBtn").click();
    await expect(window.locator(".shell")).toHaveAttribute(
      "data-sidebar-state",
      "expanded",
    );
    await expect(window.locator(".rail")).toBeVisible();
    await expect(window.locator("#newSessionBtn")).toBeVisible();

    await shot(window, testInfo, "shell-sidebar-expanded");
  });

  test("sending a prompt shows a user bubble", async ({}, testInfo) => {
    ({ app, window } = await launchApp(testInfo));

    await expect(window.locator("#prompt")).toBeEnabled({ timeout: 45_000 });
    await window.locator("#newSessionBtn").click();
    await expect(window.locator("#sessionHint")).toContainText("Session", {
      timeout: 45_000,
    });

    const marker = `e2e-ping-${Date.now()}`;
    await window.locator("#prompt").fill(marker);
    await window.locator("#sendBtn").click();

    await expect(
      window.locator(".bubble.user .body").filter({ hasText: marker }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await shot(window, testInfo, "shell-after-send");
  });
});
