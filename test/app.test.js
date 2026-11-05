import assert from "node:assert/strict";
import test from "node:test";
import {
  assignRecipients,
  createDraw,
  createExampleStates,
  decryptAssignment,
  decryptAdminState,
  encryptAdminState,
  IMPOSSIBLE_DRAW_ERROR,
  isExampleState,
  renameDraw,
  validateParticipantName,
} from "../dist/app.js";

const participants = [
  { id: "1", name: "Camille", targetId: "" },
  { id: "2", name: "Alex", targetId: "" },
  { id: "3", name: "Sam", targetId: "" },
  { id: "4", name: "Noé", targetId: "" },
];

function hasValidAssignment(participantList) {
  const recipients = participantList.map(({ id }) => id);
  const assignments = new Map();

  function search(index, usedRecipients) {
    if (index === participantList.length) {
      return participantList.every(({ id }) => assignments.get(assignments.get(id)) !== id);
    }

    const giver = participantList[index];
    const candidates = giver.targetId ? [giver.targetId] : recipients;
    for (const recipientId of candidates) {
      if (
        recipientId === giver.id
        || !recipients.includes(recipientId)
        || usedRecipients.has(recipientId)
      ) {
        continue;
      }

      assignments.set(giver.id, recipientId);
      usedRecipients.add(recipientId);
      if (search(index + 1, usedRecipients)) return true;
      assignments.delete(giver.id);
      usedRecipients.delete(recipientId);
    }

    return false;
  }

  return search(0, new Set());
}

function assertCompleteAssignment(assignment, participantList) {
  const participantIds = new Set(participantList.map(({ id }) => id));
  assert.equal(assignment.size, participantList.length);
  assert.deepEqual(new Set(assignment.keys()), participantIds);
  assert.deepEqual(new Set(assignment.values()), participantIds);
  assert.ok([...assignment].every(([giverId, recipientId]) => (
    giverId !== recipientId
    && assignment.get(recipientId) !== giverId
  )));
  assert.ok(participantList.every(({ id, targetId }) => (
    !targetId || assignment.get(id) === targetId
  )));
}

function validAdminState() {
  return {
    eventName: "Échange entre amis",
    eventDraft: "Échange entre amis",
    participantDraft: "",
    participants: [
      { id: "1", name: "Camille", targetId: "2" },
      { id: "2", name: "Alex", targetId: "" },
      { id: "3", name: "Sam", targetId: "" },
    ],
    participantNameDrafts: { "1": "Camille B." },
    targetDrafts: { "2": "3" },
    generatedLinks: [
      { name: "Camille", url: "https://example.test/secret.html?token=abc_123" },
    ],
  };
}

test("precomputes and recognizes each supported example team", async () => {
  const supportedTeams = [
    ["Exemple — Scooby-Doo", ["Fred", "Daphné", "Véra", "Sammy", "Scooby-Doo"]],
    ["Exemple — Buffy contre les vampires", ["Buffy", "Willow", "Alex", "Giles", "Cordelia"]],
    ["Exemple — Avengers", ["Iron Man", "Captain America", "Thor", "Hulk", "Black Widow", "Hawkeye"]],
    ["Exemple — Friends", ["Rachel", "Monica", "Phoebe", "Joey", "Chandler", "Ross"]],
    ["Exemple — Le Seigneur des anneaux", ["Frodon", "Sam", "Aragorn", "Legolas", "Gimli", "Gandalf"]],
    ["Exemple — Les Tortues Ninja", ["Leonardo", "Michelangelo", "Donatello", "Raphaël", "Splinter"]],
  ];
  const baseUrl = new URL("https://example.test/secret.html");
  const snapshots = await createExampleStates(baseUrl);

  assert.deepEqual(
    snapshots.map(({ eventName, participants: team }) => [
      eventName,
      team.map(({ name }) => name),
    ]),
    supportedTeams,
  );

  for (const state of snapshots) {
    const { eventName } = state;
    assert.equal(isExampleState(state), true);
    assert.equal(isExampleState({ ...state, eventDraft: "Événement modifié" }), false);
    assert.equal(isExampleState({ ...state, participants: participants.slice(0, 3) }), false);
    assert.equal(state.generatedLinks.length, state.participants.length);
    assert.ok(state.generatedLinks.every(({ url }) => new URL(url).origin === baseUrl.origin));

    const assignments = await Promise.all(state.generatedLinks.map(async ({ name, url }) => ({
      name,
      ...await decryptAssignment(new URL(url).searchParams.get("token")),
    })));
    assert.ok(assignments.every(({ eventName: assignmentEvent }) => assignmentEvent === eventName));
    assert.deepEqual(
      new Set(assignments.map(({ giver }) => giver)),
      new Set(state.participants.map(({ name }) => name)),
    );
    assert.deepEqual(
      new Set(assignments.map(({ recipient }) => recipient)),
      new Set(state.participants.map(({ name }) => name)),
    );
    const recipientsByGiver = new Map(assignments.map(({ giver, recipient }) => [giver, recipient]));
    assert.ok(assignments.every(({ giver, recipient }) => (
      giver !== recipient && recipientsByGiver.get(recipient) !== giver
    )));
  }
});

test("satisfies every possible manual-assignment configuration for three and four participants", () => {
  for (const count of [3, 4]) {
    const ids = Array.from({ length: count }, (_, index) => String(index + 1));
    const optionsByGiver = ids.map((id) => ["", ...ids.filter((candidate) => candidate !== id)]);
    const configurationCount = count ** count;

    for (let configuration = 0; configuration < configurationCount; configuration += 1) {
      let choices = configuration;
      const currentParticipants = ids.map((id, index) => {
        const options = optionsByGiver[index];
        const targetId = options[choices % count];
        choices = Math.floor(choices / count);
        return { id, name: `Participant ${id}`, targetId };
      });
      const originalParticipants = currentParticipants.map((participant) => ({ ...participant }));
      const expectedFeasibility = hasValidAssignment(currentParticipants);
      const assignment = assignRecipients(currentParticipants);

      assert.equal(
        Boolean(assignment),
        expectedFeasibility,
        `Feasibility mismatch for ${count} participants, configuration ${configuration}`,
      );
      if (assignment) assertCompleteAssignment(assignment, currentParticipants);
      assert.deepEqual(currentParticipants, originalParticipants);
    }
  }
});

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
  assert.deepEqual(new Set(recipients), new Set(participants.map(({ name }) => name)));
  const recipientByGiver = new Map(assignments.map(({ giver, recipient }) => [giver, recipient]));
  assert.ok(assignments.every(({ giver, recipient }) => (
    giver !== recipient && recipientByGiver.get(recipient) !== giver
  )));
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

test("renames a draw while preserving every giver-recipient assignment", async () => {
  const originalLinks = await createDraw(
    "Échange de Noël",
    participants,
    new URL("https://example.test/secret.html"),
  );
  const originalAssignments = new Map(await Promise.all(originalLinks.map(async ({ url }) => {
    const assignment = await decryptAssignment(new URL(url).searchParams.get("token"));
    return [assignment.giver, assignment.recipient];
  })));
  const originalTokens = originalLinks.map(({ url }) => new URL(url).searchParams.get("token"));
  const renamedLinks = await renameDraw("Échange d’hiver", originalLinks);

  assert.equal(renamedLinks.length, originalLinks.length);
  const renamedAssignments = await Promise.all(renamedLinks.map(async ({ name, url }) => ({
    name,
    ...await decryptAssignment(new URL(url).searchParams.get("token")),
  })));
  assert.deepEqual(
    new Map(renamedAssignments.map(({ giver, recipient }) => [giver, recipient])),
    originalAssignments,
  );
  assert.ok(renamedAssignments.every(({ eventName }) => eventName === "Échange d’hiver"));
  assert.ok(renamedAssignments.every(({ name, giver }) => name === giver));
  assert.deepEqual(
    originalLinks.map(({ url }) => new URL(url).searchParams.get("token")),
    originalTokens,
  );
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

test("rejects manual assignments with self, missing, duplicate or reciprocal targets", () => {
  const invalidCases = [
    participants.map((participant) => (
      participant.id === "1" ? { ...participant, targetId: "1" } : participant
    )),
    participants.map((participant) => (
      participant.id === "1" ? { ...participant, targetId: "missing" } : participant
    )),
    participants.map((participant) => (
      participant.id === "1" || participant.id === "3"
        ? { ...participant, targetId: "2" }
        : participant
    )),
    participants.map((participant) => {
      if (participant.id === "1") return { ...participant, targetId: "2" };
      if (participant.id === "2") return { ...participant, targetId: "1" };
      return participant;
    }),
  ];

  for (const invalidAssignment of invalidCases) {
    assert.equal(assignRecipients(invalidAssignment), null);
  }
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
  const state = validAdminState();
  const token = await encryptAdminState(state);

  assert.match(token, /^[\da-z_-]+$/iu);
  assert.deepEqual(await decryptAdminState(token), state);
  await assert.rejects(decryptAdminState(`${token[0] === "A" ? "B" : "A"}${token.slice(1)}`));
});

test("rejects malformed, truncated and altered administration tokens", async () => {
  await assert.rejects(decryptAdminState("not-a-valid-token"));
  await assert.rejects(decryptAdminState("A"));
  await assert.rejects(decryptAdminState("A".repeat(100)));
});

test("rejects malformed administration state data", async (t) => {
  const invalidCases = [
    ["missing required event name", (state) => { delete state.eventName; }],
    ["non-string participant draft", (state) => { state.participantDraft = null; }],
    ["duplicate participant IDs", (state) => { state.participants[1].id = "1"; }],
    ["participant target to a missing ID", (state) => { state.participants[0].targetId = "missing"; }],
    ["participant target to itself", (state) => { state.participants[0].targetId = "1"; }],
    ["draft for a missing participant", (state) => { state.participantNameDrafts.missing = "Draft"; }],
    ["target draft to a missing participant", (state) => { state.targetDrafts["2"] = "missing"; }],
    ["participant draft over 100 characters", (state) => { state.participantNameDrafts["1"] = "a".repeat(101); }],
    ["generated links with a malformed URL", (state) => { state.generatedLinks[0].url = "not-a-url"; }],
    ["generated links without a token", (state) => { state.generatedLinks[0].url = "https://example.test/secret.html"; }],
  ];

  for (const [description, invalidate] of invalidCases) {
    await t.test(description, async () => {
      const state = structuredClone(validAdminState());
      invalidate(state);

      await assert.rejects(encryptAdminState(state), {
        name: "TypeError",
        message: "État administratif invalide.",
      });
    });
  }
});
