import { expect, test } from "@playwright/test";
import { encryptAssignment } from "../../public/app.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#organizer-status")).toBeAttached();
  await expect(page.getByLabel("Nom de l’événement (obligatoire)")).toBeEnabled();
  await expect(page.locator("#clear-form")).toBeDisabled();
});

test("follows the expected keyboard tab order on an empty form", async ({ page }) => {
  await expect(page.locator("#results-skip-link")).toBeHidden();
  const expectedFocusOrder = [
    "#skip-link-main",
    ".brand",
    "#event-name",
    "#participant-name",
    '#participant-form button[type="submit"]',
    "#generate-button",
    ".page-footer a",
  ];

  for (const selector of expectedFocusOrder) {
    await page.keyboard.press("Tab");
    await expect(page.locator(selector)).toBeFocused();
  }
});

test("announces participant additions without moving focus from the add button", async ({ page }) => {
  const status = page.locator("#organizer-status");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");

  await page.getByLabel("Nom du participant").fill("Camille");
  const addButton = page.getByRole("button", { name: "Ajouter" });
  await addButton.click();

  await expect(addButton).toBeFocused();
  await expect(page.getByLabel("Nom du participant")).toHaveValue("");
  await expect(status).toHaveText("Camille a été ajouté. La liste compte 1 participant.");
  await expect(page.getByRole("listitem")).toHaveCount(1);
});

test("announces generated links through the polite status region", async ({ page }) => {
  const status = page.locator("#organizer-status");
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await page.getByLabel("Nom de l’événement (obligatoire)").fill("Échange entre amis");

  for (const name of ["Camille", "Alex", "Sam"]) {
    await page.getByLabel("Nom du participant").fill(name);
    await page.getByLabel("Nom du participant").press("Enter");
  }

  await page.getByRole("button", { name: "Générer les liens privés" }).click();

  await expect(status).toHaveText("Le tirage est prêt. Envoyez à chacun son lien personnel.");
  await expect(page.getByRole("heading", { name: "Les liens sont générés" })).toBeVisible();
  const resultsSkipLink = page.getByRole("link", { name: "Aller aux liens générés" });
  await expect(resultsSkipLink).toBeVisible();
  await expect(resultsSkipLink).toHaveAttribute("href", "#results");
  for (const name of ["Camille", "Alex", "Sam"]) {
    await expect(page.getByRole("button", { name: `Copier le lien pour ${name}` })).toBeVisible();
  }

  await resultsSkipLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#results$/u);
  await expect(page.locator("#results")).toBeFocused();

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copier le lien pour Camille" }).click();
  await expect(page.getByRole("button", { name: "Lien pour Camille copié" })).toBeVisible();
});

test("flips the playing-card-shaped card to reveal the recipient", async ({ page }) => {
  const token = await encryptAssignment("Test", "Boris", "Hélène");
  await page.goto(`/secret.html?token=${encodeURIComponent(token)}`);

  await expect(page.locator("#secret-eyebrow")).toHaveText("Votre évènement");
  await expect(page.locator("#secret-event")).toHaveText("Test");
  await expect(page.locator("#secret-event-back")).toHaveText("Test");
  for (const face of ["#secret-card-front", "#secret-card-back"]) {
    const cornerMarks = page.locator(`${face} .secret-corner-marks`);
    await expect(cornerMarks).toHaveAttribute("aria-hidden", "true");
    await expect(cornerMarks.locator("svg")).toHaveCount(4);
    await expect(cornerMarks.locator('use[href="icons.svg#gift"]')).toHaveCount(4);
  }
  await expect(page.locator(".secret-greeting")).toHaveText("Bonjour Boris !");
  const card = page.locator("#secret-card");
  const dimensions = await card.boundingBox();
  expect(dimensions.width / dimensions.height).toBeCloseTo(0.63, 2);

  const revealButton = page.getByRole("button", { name: "Découvrir à qui offrir un cadeau" });
  await expect(revealButton.locator("svg use")).toHaveAttribute("href", "icons.svg#wand-sparkles");
  await expect(card).not.toContainText("Hélène");
  await expect(card.locator("#secret-assignment")).toBeEmpty();
  await expect(page.getByRole("link", { name: "← Retour à l’accueil" })).toBeVisible();
  await expect(page.locator(".secret-footer")).toContainText("Version 1.5.0");

  const cardInner = page.locator("#secret-card-inner");
  await expect(cardInner).toHaveCSS("transition-duration", "0.7s");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(async () => Number.parseFloat(await cardInner.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  ))).toBeLessThan(0.001);
  await revealButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".secret-reveal")).toContainText(
    "Boris, tu dois faire un cadeau à",
  );
  await expect(page.locator(".secret-reveal strong")).toHaveText("Hélène");
  await expect(page.locator(".secret-reveal")).toBeFocused();
  await expect(card).toHaveClass(/is-revealed/u);
  await expect(page.locator("#secret-card-front")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#secret-card-front")).toHaveAttribute("inert", "");
  await expect(page.locator("#secret-card-back")).not.toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("button", { name: "Découvrir à qui offrir un cadeau" })).toHaveCount(0);
  await expect(card).not.toContainText("tirage");
});
