import { expect, test } from "@playwright/test";

test("Home page displays the EduTrack heading", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "EduTrack", exact: true }),
  ).toBeVisible();
});
