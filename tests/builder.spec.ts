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

test("images can be added by drag and drop", async ({ page }) => {
  await page.getByRole("button", { name: "Picture", exact: true }).click();
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>'], "drop.svg", { type: "image/svg+xml" }));
    return transfer;
  });
  await page.getByRole("button", { name: /Choose or drop an image/ }).dispatchEvent("drop", { dataTransfer });
  await expect(page.getByRole("button", { name: /Selected question image/ })).toBeVisible();
});

test("audio can be recorded, previewed, and retained after reload", async ({ page }) => {
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.locator(".audio-recorder audio")).toBeVisible();
  await page.reload();
  await expect(page.locator(".audio-recorder audio")).toBeVisible();
});

test("projects can be created and remain after reload", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.accept("Spelling check"));
  await page.getByRole("button", { name: /New project/ }).click();
  await expect(page.locator("#projectSelect")).toHaveValue(/.+/);
  await expect(page.locator("#projectSelect option:checked")).toHaveText("Spelling check");
  await page.reload();
  await expect(page.locator("#projectSelect option:checked")).toHaveText("Spelling check");
});

test("projects can be renamed, switched, and deleted", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.accept("First name"));
  await page.getByRole("button", { name: /New project/ }).click();
  page.once("dialog", (dialog) => dialog.accept("Renamed test"));
  await page.getByRole("button", { name: "Rename project" }).click();
  await expect(page.locator("#projectSelect option:checked")).toHaveText("Renamed test");
  await page.locator("#projectSelect").selectOption("demo");
  await expect(page.locator(".question-row")).toHaveCount(3);
  await page.locator("#projectSelect").selectOption({ label: "Renamed test" });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(page.locator("#projectSelect option")).toHaveCount(1);
  await expect(page.locator("#projectSelect option:checked")).toHaveText("Demo project");
});

test("questions can be added, duplicated, navigated, and deleted", async ({ page }) => {
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByPlaceholder("Add instructions or a question").fill("New question");
  await expect(page.locator(".question-row")).toHaveCount(4);
  await page.getByRole("button", { name: "Duplicate question" }).click();
  await expect(page.locator(".question-row")).toHaveCount(5);
  await expect(page.getByPlaceholder("Add instructions or a question")).toHaveValue("New question (copy)");
  await page.getByRole("button", { name: /Previous/ }).click();
  await expect(page.getByPlaceholder("Add instructions or a question")).toHaveValue("New question");
  await page.getByRole("button", { name: "Delete question" }).click();
  await expect(page.locator(".question-row")).toHaveCount(4);
});

test("multiple choice options can be added and removed", async ({ page }) => {
  await page.getByRole("button", { name: /Add another choice/ }).click();
  await expect(page.locator("input[data-choice]")).toHaveCount(5);
  await page.getByRole("button", { name: "Remove choice" }).last().click();
  await expect(page.locator("input[data-choice]")).toHaveCount(4);
});

test("downloaded test grades lenient written answers", async ({ page, context }) => {
  page.once("dialog", (dialog) => dialog.accept("Written response test"));
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByPlaceholder("Add instructions or a question").fill("Name the capital of France");
  await page.getByRole("button", { name: "Text answer", exact: true }).click();
  await page.getByPlaceholder("Enter the answer students should give").fill("Paris");
  await page.getByLabel(/Lenient/).check();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download test" }).click();
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

test("downloaded multiple choice test grades answers and can retry", async ({ page, context }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download test" }).click();
  const path = await (await downloadPromise).path();
  const studentPage = await context.newPage();
  await studentPage.setContent(await readFile(path!, "utf8"), { waitUntil: "domcontentloaded" });
  const questions = studentPage.locator(".card");
  await questions.nth(0).getByLabel("ship").check();
  await questions.nth(1).getByLabel("Owl").check();
  await questions.nth(2).getByLabel("Three").check();
  await studentPage.getByRole("button", { name: "Grade my test" }).click();
  await expect(studentPage.locator("#score")).toHaveText("3 / 3");
  await studentPage.getByRole("button", { name: "Restart test" }).click();
  await expect(studentPage.locator("#quiz")).toBeVisible();
  await expect(questions.nth(0).getByLabel("ship")).not.toBeChecked();
});

test("student progress and submitted results persist across refreshes", async ({ page, context }) => {
  page.once("dialog", (dialog) => dialog.accept("Progress test"));
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByPlaceholder("Add instructions or a question").fill("Capital of France");
  await page.getByRole("button", { name: "Text answer", exact: true }).click();
  await page.getByPlaceholder("Enter the answer students should give").fill("Paris");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download test" }).click();
  const path = await (await downloadPromise).path();
  const html = await readFile(path!, "utf8");
  const studentPage = await context.newPage();
  await studentPage.route("**/student-progress-test", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await studentPage.goto("http://127.0.0.1:8000/student-progress-test");
  const answer = studentPage.getByPlaceholder("Type your answer");
  await answer.fill("Paris");
  await studentPage.reload();
  await expect(studentPage.getByPlaceholder("Type your answer")).toHaveValue("Paris");
  await studentPage.getByRole("button", { name: "Grade my test" }).click();
  await expect(studentPage.locator("#score")).toHaveText("1 / 1");
  await studentPage.reload();
  await expect(studentPage.locator("#results")).toBeVisible();
  await expect(studentPage.locator("#score")).toHaveText("1 / 1");
  await studentPage.getByRole("button", { name: "Restart test" }).click();
  await expect(studentPage.locator("#quiz")).toBeVisible();
  await expect(studentPage.getByPlaceholder("Type your answer")).toHaveValue("");
  await studentPage.reload();
  await expect(studentPage.locator("#quiz")).toBeVisible();
  await expect(studentPage.getByPlaceholder("Type your answer")).toHaveValue("");
});

test("required and optional questions behave correctly", async ({ page, context }) => {
  page.once("dialog", (dialog) => dialog.accept("Optional test"));
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByPlaceholder("Add instructions or a question").fill("Optional question");
  const choices = page.locator("input[data-choice]");
  await choices.nth(0).fill("Yes");
  await choices.nth(1).fill("No");
  await choices.nth(2).fill("Maybe");
  await choices.nth(3).fill("Unknown");
  await page.getByLabel("Required question").uncheck();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download test" }).click();
  const path = await (await downloadPromise).path();
  const studentPage = await context.newPage();
  await studentPage.setContent(await readFile(path!, "utf8"));
  await studentPage.getByRole("button", { name: "Grade my test" }).click();
  await expect(studentPage.locator("#score")).toHaveText("0 / 1");
  await expect(studentPage.getByText("Your answer: No answer")).toBeVisible();
});

test("downloaded test enforces exact written answers", async ({ page, context }) => {
  page.once("dialog", (dialog) => dialog.accept("Exact response test"));
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByPlaceholder("Add instructions or a question").fill("Type the code exactly");
  await page.getByRole("button", { name: "Text answer", exact: true }).click();
  await page.getByPlaceholder("Enter the answer students should give").fill("ABC 123");
  await page.getByLabel(/Exact match/).check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download test" }).click();
  const path = await (await downloadPromise).path();
  const studentPage = await context.newPage();
  await studentPage.setContent(await readFile(path!, "utf8"), { waitUntil: "domcontentloaded" });
  await studentPage.getByPlaceholder("Type your answer").fill("abc 123");
  await studentPage.getByRole("button", { name: "Grade my test" }).click();
  await expect(studentPage.locator("#score")).toHaveText("0 / 1");
  await expect(studentPage.getByText("Correct answer: ABC 123")).toBeVisible();
});

test("select all questions require the complete answer set", async ({ page, context }) => {
  page.once("dialog", (dialog) => dialog.accept("Multiple answer test"));
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByPlaceholder("Add instructions or a question").fill("Select the vowels");
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  const choices = page.locator("input[data-choice]");
  await choices.nth(0).fill("A");
  await choices.nth(1).fill("B");
  await choices.nth(2).fill("E");
  await choices.nth(3).fill("G");
  await page.locator('button[data-correct="2"]').click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download test" }).click();
  const path = await (await downloadPromise).path();
  const studentPage = await context.newPage();
  await studentPage.setContent(await readFile(path!, "utf8"), { waitUntil: "domcontentloaded" });
  await studentPage.getByLabel("A").check();
  await studentPage.getByLabel("E").check();
  await studentPage.getByRole("button", { name: "Grade my test" }).click();
  await expect(studentPage.locator("#score")).toHaveText("1 / 1");
});

test("select all questions reject missing or extra selections", async ({ page, context }) => {
  page.once("dialog", (dialog) => dialog.accept("Select all grading"));
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByPlaceholder("Add instructions or a question").fill("Select A and C");
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  const choices = page.locator("input[data-choice]");
  await choices.nth(0).fill("A");
  await choices.nth(1).fill("B");
  await choices.nth(2).fill("C");
  await choices.nth(3).fill("D");
  await page.locator('button[data-correct="2"]').click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download test" }).click();
  const path = await (await downloadPromise).path();
  const html = await readFile(path!, "utf8");

  const missingPage = await context.newPage();
  await missingPage.setContent(html);
  await missingPage.getByLabel("A").check();
  await missingPage.getByRole("button", { name: "Grade my test" }).click();
  await expect(missingPage.locator("#score")).toHaveText("0 / 1");

  const extraPage = await context.newPage();
  await extraPage.setContent(html);
  await extraPage.getByLabel("A").check();
  await extraPage.getByLabel("B").check();
  await extraPage.getByLabel("C").check();
  await extraPage.getByRole("button", { name: "Grade my test" }).click();
  await expect(extraPage.locator("#score")).toHaveText("0 / 1");
});

test("downloaded tests can be imported as editable projects", async ({ page }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download test" }).click();
  const path = await (await downloadPromise).path();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import test" }).click();
  await (await chooserPromise).setFiles(path!);
  await expect(page.locator("#projectSelect option:checked")).toContainText("imported");
  await expect(page.locator(".question-row")).toHaveCount(3);
});

test("embedded images survive download and re-import", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.accept("Image round trip"));
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByPlaceholder("Add instructions or a question").fill("Identify this color");
  await page.getByRole("button", { name: "Picture", exact: true }).click();
  const imageChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose or drop an image/ }).click();
  await (await imageChooser).setFiles({ name: "blue.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>') });
  const choices = page.locator("input[data-choice]");
  await choices.nth(0).fill("Blue");
  await choices.nth(1).fill("Red");
  await choices.nth(2).fill("Green");
  await choices.nth(3).fill("Yellow");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download test" }).click();
  const path = await (await downloadPromise).path();
  const importChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import test" }).click();
  await (await importChooser).setFiles(path!);
  await expect(page.getByRole("button", { name: /Selected question image/ })).toBeVisible();
});

test("invalid HTML imports show an error without changing projects", async ({ page }) => {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import test" }).click();
  await (await chooserPromise).setFiles({ name: "invalid.html", mimeType: "text/html", buffer: Buffer.from("<h1>Not a test</h1>") });
  await expect(page.getByRole("status")).toContainText("not created by Test Builder");
  await expect(page.locator("#projectSelect option")).toHaveCount(1);
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

test("downloaded tests respect dark mode", async ({ page, context }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download test" }).click();
  const path = await (await downloadPromise).path();
  const studentPage = await context.newPage();
  await studentPage.emulateMedia({ colorScheme: "dark" });
  await studentPage.setContent(await readFile(path!, "utf8"));
  await expect(studentPage.locator("body")).toHaveCSS("color-scheme", "dark");
  await expect(studentPage.locator(".card").first()).toHaveCSS("background-color", "rgb(41, 44, 46)");
});

test("incomplete answer keys cannot be downloaded", async ({ page }) => {
  page.once("dialog", (dialog) => dialog.accept("Incomplete test"));
  await page.getByRole("button", { name: /New project/ }).click();
  await page.getByPlaceholder("Add instructions or a question").fill("An unfinished question");
  const download = page.waitForEvent("download", { timeout: 800 }).then(() => true).catch(() => false);
  await page.getByRole("button", { name: "Download test" }).click();
  expect(await download).toBe(false);
  await expect(page.getByRole("status")).toContainText("Complete the question and answer key");
});
