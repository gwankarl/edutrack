import { expect, test } from "@playwright/test";

test("Home renders the shared shell and backend availability", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "EduTrack", exact: true }),
  ).toBeVisible();

  await expect(page.getByRole("banner")).toBeVisible();

  const navigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });

  await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const footer = page.getByRole("contentinfo");
  await expect(footer).toBeVisible();
  await expect(footer).toContainText(
    "Self-paced learning for secondary students.",
  );

  await expect(page.getByRole("status")).toHaveText(
    "The backend is available.",
  );
});

test("an unknown route displays the Not Found page", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");

  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();

  await expect(
    page.getByRole("link", { name: "Return to the home page" }),
  ).toBeVisible();

  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("GET /api/v1/health works through the Vite proxy", async ({ request }) => {
  const response = await request.get("/api/v1/health");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("Home handles backend unavailability without crashing", async ({
  page,
}) => {
  await page.route("**/api/v1/health", (route) => route.abort());

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "EduTrack", exact: true }),
  ).toBeVisible();

  await expect(page.getByRole("status")).toHaveText(
    "The backend is unavailable. Please try again later.",
  );
});
