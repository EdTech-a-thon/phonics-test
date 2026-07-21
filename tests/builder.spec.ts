import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    indexedDB.deleteDatabase("formflow");
  });
  await page.reload();
});

test("correct answer selection keeps the choice input focused", async ({ page }) => {
  await page.locator('button[data-correct="1"]').click();
  const choice = page.locator('input[data-choice="1"]');
  await choice.click();
  await choice.fill("Edited answer");

  await expect(choice).toBeFocused();
  await expect(choice).toHaveValue("Edited answer");
  await expect(page.locator('.choice-row.correct input[data-choice="1"]')).toBeVisible();
});

test("text answers persist with lenient and exact grading options", async ({ page }) => {
  await page.getByRole("button", { name: "Text answer" }).click();
  const answer = page.getByPlaceholder("Enter the answer students should give");
  await answer.fill("New York");
  await expect(answer).toBeFocused();
  await page.getByLabel(/Exact match/).check();
  await page.reload();

  await expect(page.getByRole("button", { name: "Text answer", exact: true })).toHaveClass(/active/);
  await expect(page.getByPlaceholder("Enter the answer students should give")).toHaveValue("New York");
  await expect(page.getByLabel(/Exact match/)).toBeChecked();
});

test("image title opens the file chooser directly and accepts a file", async ({ page }) => {
  await page.getByRole("button", { name: /Picture/ }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose or drop an image/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "sample.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="#789"/></svg>') });

  await expect(page.getByRole("button", { name: /Selected question image/ })).toBeVisible();
  await expect(page.locator("dialog")).toHaveCount(0);
});

test("projects can be created and remain after reload", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.accept("Spelling check"));
  await page.getByRole("button", { name: /New project/ }).click();
  await expect(page.locator("#projectSelect")).toHaveValue(/.+/);
  await expect(page.locator("#projectSelect option:checked")).toHaveText("Spelling check");
  await page.reload();
  await expect(page.locator("#projectSelect option:checked")).toHaveText("Spelling check");
});

test("downloaded test grades lenient written answers", async ({ page, context }) => {
  page.once("dialog", (dialog) => dialog.accept("Written response test"));
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByPlaceholder("Add instructions or a question").fill("Name the capital of France");
  await page.getByRole("button", { name: "Text answer", exact: true }).click();
  await page.getByPlaceholder("Enter the answer students should give").fill("Paris");
  await page.getByLabel(/Lenient/).check();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download test HTML/ }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();

  const studentPage = await context.newPage();
  await studentPage.setContent(await readFile(path!, "utf8"), { waitUntil: "domcontentloaded" });
  await studentPage.getByPlaceholder("Type your answer").fill("  PARIS  ");
  await studentPage.getByRole("button", { name: "Grade my test" }).click();
  await expect(studentPage.locator("#score")).toHaveText("1 / 1");
  await expect(studentPage.getByText("Correct", { exact: true })).toBeVisible();
  await studentPage.screenshot({ path: "/tmp/opencode/student-test-results.png", fullPage: true });
});

test("downloaded test enforces exact written answers", async ({ page, context }) => {
  page.once("dialog", (dialog) => dialog.accept("Exact response test"));
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByPlaceholder("Add instructions or a question").fill("Type the code exactly");
  await page.getByRole("button", { name: "Text answer", exact: true }).click();
  await page.getByPlaceholder("Enter the answer students should give").fill("ABC 123");
  await page.getByLabel(/Exact match/).check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download test HTML/ }).click();
  const path = await (await downloadPromise).path();
  const studentPage = await context.newPage();
  await studentPage.setContent(await readFile(path!, "utf8"), { waitUntil: "domcontentloaded" });
  await studentPage.getByPlaceholder("Type your answer").fill("abc 123");
  await studentPage.getByRole("button", { name: "Grade my test" }).click();
  await expect(studentPage.locator("#score")).toHaveText("0 / 1");
  await expect(studentPage.getByText("Correct answer: ABC 123")).toBeVisible();
});

test("builder fits desktop and mobile without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".workspace")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/opencode/test-builder-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/opencode/test-builder-mobile.png", fullPage: true });
});

test("builder respects the system dark mode preference", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("body")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator(".editor-panel")).toHaveCSS("background-color", "rgb(41, 44, 46)");
  await page.screenshot({ path: "/tmp/opencode/test-builder-dark.png", fullPage: true });
});

test("incomplete answer keys cannot be downloaded", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.accept("Incomplete test"));
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByPlaceholder("Add instructions or a question").fill("An unfinished question");
  const download = page.waitForEvent("download", { timeout: 800 }).then(() => true).catch(() => false);
  await page.getByRole("button", { name: /Download test HTML/ }).click();
  expect(await download).toBe(false);
  await expect(page.getByRole("status")).toContainText("Complete the question and answer key");
});
