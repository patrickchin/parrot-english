import { expect, test } from "@playwright/test";

function guardianPath(path: string) {
  return `${path}${path.includes("?") ? "&" : "?"}parrotE2eGuardian=guardian`;
}

test("Guardian mode no longer exposes story settings", async ({ page }) => {
  await page.goto(guardianPath("/guardian"));

  await expect(
    page.getByRole("heading", { exact: true, name: "Guardian dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { exact: true, name: "Story settings" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { exact: true, name: "Open story settings" }),
  ).toHaveCount(0);

  await page.goto(guardianPath("/guardian/stories"));
  await expect(page).toHaveURL(/\/guardian(?:\?.*)?$/);
  await expect(
    page.getByRole("heading", { exact: true, name: "Guardian dashboard" }),
  ).toBeVisible();
});

test("stories always render catalog artwork without loading personalized art", async ({
  page,
}) => {
  let personalizedArtRequests = 0;
  await page.route(
    /\/api\/stories\/[^/]+\/personalized-art(?:\/asset)?(?:\?.*)?$/,
    async (route) => {
      personalizedArtRequests += 1;
      await route.fulfill({
        contentType: "application/json",
        json: {
          enabled: true,
          guardianConsentVersion: "retired-test",
          hasStoredArt: true,
          stories: {
            "the-red-ball": {
              pages: {
                "my-red-ball": {
                  alt: "You holding a bright red ball",
                  src: "/api/stories/the-red-ball/personalized-art/asset?v=1",
                },
              },
            },
          },
          updatedAt: "2026-08-09T12:00:00.000Z",
        },
        status: 200,
      });
    },
  );

  await page.goto("/stories/the-red-ball/pages/1");

  const reader = page.getByRole("region", { name: "Story reader" });
  await expect(
    reader.getByRole("img", { name: "A child holding one bright red ball" }),
  ).toBeVisible();
  await expect(
    reader.getByRole("img", { name: "You holding a bright red ball" }),
  ).toHaveCount(0);
  expect(personalizedArtRequests).toBe(0);
});
