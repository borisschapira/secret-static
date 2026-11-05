import assert from "node:assert/strict";
import test from "node:test";
import {
  createDraw,
  decryptAssignment,
  decryptAdminState,
  encryptAdminState,
  IMPOSSIBLE_DRAW_ERROR,
  validateParticipantName,
} from "../app.js";

const participants = [
  { id: "1", name: "Camille", targetId: "" },
  { id: "2", name: "Alex", targetId: "" },
  { id: "3", name: "Sam", targetId: "" },
  { id: "4", name: "Noé", targetId: "" },
];

test("creates a complete draw with one recipient per participant and no self-gifts", async () => {
  const links = await createDraw(
    "Échange en famille",
    participants,
    new URL("https://example.test/secret.html"),
  );

  assert.equal(links.length, participants.length);
  assert.deepEqual(
    new Set(links.map(({ name }) => name)),
    new Set(participants.map(({ name }) => name)),
  );

  const assignments = await Promise.all(links.map(async ({ name, url }) => {
    const link = new URL(url);
    assert.equal(link.pathname, "/secret.html");
    assert.deepEqual([...link.searchParams.keys()], ["token"]);

    const token = link.searchParams.get("token");
    assert.match(token, /^[\da-z_-]+$/iu);
    assert.ok(!token.includes("="), "Base64URL token must not contain padding");

    return { giver: name, ...await decryptAssignment(token) };
  }));
  const recipients = assignments.map(({ recipient }) => recipient);

  assert.deepEqual(new Set(assignments.map(({ giver }) => giver)), new Set(participants.map(({ name }) => name)));
  assert.ok(assignments.every(({ eventName }) => eventName === "Échange en famille"));
  assert.ok(assignments.every(({ giver, recipient }) => giver !== recipient));
  const recipientsByGiver = new Map(assignments.map(({ giver, recipient }) => [giver, recipient]));
  assert.ok(assignments.every(({ giver, recipient }) => recipientsByGiver.get(recipient) !== giver));
  assert.equal(new Set(recipients).size, participants.length);
  assert.deepEqual(new Set(recipients), new Set(participants.map(({ name }) => name)));
});

test("respects manual assignments when creating a draw", async () => {
  const manuallyAssigned = participants.map((participant) => ({ ...participant }));
  manuallyAssigned[0].targetId = "2";

  const links = await createDraw(
    "Échange de cadeaux",
    manuallyAssigned,
    new URL("https://example.test/secret.html"),
  );
  const camilleLink = links.find(({ name }) => name === "Camille");
  const assignment = await decryptAssignment(new URL(camilleLink.url).searchParams.get("token"));

  assert.equal(assignment.recipient, "Alex");
  const assignments = await Promise.all(links.map(async ({ url }) => (
    decryptAssignment(new URL(url).searchParams.get("token"))
  )));
  const recipientsByGiver = new Map(assignments.map(({ giver, recipient }) => [giver, recipient]));
  assert.ok(assignments.every(({ giver, recipient }) => recipientsByGiver.get(recipient) !== giver));
});

test("returns the impossible-draw error result when constraints cannot be satisfied", async () => {
  const impossibleCases = [
    [
      { id: "1", name: "Camille", targetId: "2" },
      { id: "2", name: "Alex", targetId: "1" },
      { id: "3", name: "Sam", targetId: "1" },
    ],
    [
      { id: "1", name: "Camille", targetId: "2" },
      { id: "2", name: "Alex", targetId: "1" },
      { id: "3", name: "Sam", targetId: "" },
    ],
    [
      { id: "1", name: "Camille", targetId: "2" },
      { id: "2", name: "Alex", targetId: "1" },
      { id: "3", name: "Sam", targetId: "" },
      { id: "4", name: "Noé", targetId: "" },
    ],
  ];

  for (const impossibleParticipants of impossibleCases) {
    const links = await createDraw(
      "Échange en famille",
      impossibleParticipants,
      new URL("https://example.test/secret.html"),
    );
    assert.equal(links, null);
  }
  assert.equal(
    IMPOSSIBLE_DRAW_ERROR,
    "Tirage impossible. Vérifiez les attributions manuelles et évitez les échanges réciproques.",
  );
});

test("rejects duplicate participant names with the expected message", () => {
  const existingParticipants = [
    { id: "1", name: "Camille", targetId: "" },
    { id: "2", name: "Alex", targetId: "" },
  ];

  assert.equal(
    validateParticipantName(" camille ", existingParticipants),
    "Ce nom est déjà utilisé. Veuillez ajouter une initiale ou utiliser un pseudonyme.",
  );
  assert.equal(
    validateParticipantName("Camille B.", existingParticipants),
    null,
  );
  assert.equal(validateParticipantName("Camille", existingParticipants, "1"), null);
  assert.equal(validateParticipantName("  ", existingParticipants), "Saisissez le nom d’un participant.");
  assert.equal(validateParticipantName("Camille §", existingParticipants), "Le caractère § ne peut pas être utilisé dans un nom.");
});

test("limits participant names to 100 characters", () => {
  const maximumLengthName = "a".repeat(100);
  const overlongName = "a".repeat(101);

  assert.equal(validateParticipantName(maximumLengthName, []), null);
  assert.equal(
    validateParticipantName(overlongName, []),
    "Le nom du participant ne peut pas dépasser 100 caractères.",
  );
});

test("rejects corrupted and altered generated links", async () => {
  const links = await createDraw(
    "Échange en famille",
    participants,
    new URL("https://example.test/secret.html"),
  );
  const token = new URL(links[0].url).searchParams.get("token");
  const tamperedToken = `${token[0] === "A" ? "B" : "A"}${token.slice(1)}`;

  await assert.rejects(decryptAssignment("not-a-valid-token"));
  await assert.rejects(decryptAssignment(tamperedToken));
});

test("encrypts and restores the complete administration state", async () => {
  const state = {
    eventName: "Échange entre amis",
    eventDraft: "Échange entre amis, brouillon",
    participantDraft: "Nina",
    participants: [
      { id: "1", name: "Camille", targetId: "2" },
      { id: "2", name: "Alex", targetId: "" },
    ],
    participantNameDrafts: { "1": "Camille, brouillon" },
    targetDrafts: { "1": "2" },
    generatedLinks: [
      { name: "Camille", url: "https://example.test/secret.html?token=abc_123" },
    ],
  };

  const token = await encryptAdminState(state);

  assert.match(token, /^[\da-z_-]+$/iu);
  assert.deepEqual(await decryptAdminState(token), state);
  await assert.rejects(decryptAdminState(`${token[0] === "A" ? "B" : "A"}${token.slice(1)}`));
});

test("rejects administration states with participant names over 100 characters", async () => {
  const state = {
    eventName: "",
    eventDraft: "",
    participantDraft: "",
    participants: [{ id: "1", name: "a".repeat(101), targetId: "" }],
    participantNameDrafts: {},
    targetDrafts: {},
    generatedLinks: null,
  };

  await assert.rejects(encryptAdminState(state), {
    name: "TypeError",
    message: "État administratif invalide.",
  });
});
