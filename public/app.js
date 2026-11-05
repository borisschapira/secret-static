const AES_KEY = "Santa2026SecretKeyForBrowserOnly";
const ADMIN_STATE_KEY = "SecretAdminStateKeyForBrowser26!";
const ADMIN_STATE_PARAM = "state";
const LOCAL_ADMIN_STATE_KEY = "secret-admin-state-v2";
const ADMIN_STATE_VERSION = 2;
const MAX_PARTICIPANT_NAME_LENGTH = 100;
const SEPARATOR = "§";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DUPLICATE_NAME_ERROR = "Ce nom est déjà utilisé. Veuillez ajouter une initiale ou utiliser un pseudonyme.";
export const IMPOSSIBLE_DRAW_ERROR = "Tirage impossible. Vérifiez les attributions manuelles et évitez les échanges réciproques.";

const EXAMPLE_TEAMS = [
  {
    name: "Scooby-Doo",
    participants: ["Fred", "Daphné", "Véra", "Sammy", "Scooby-Doo"],
  },
  {
    name: "Buffy contre les vampires",
    participants: ["Buffy", "Willow", "Alex", "Giles", "Cordelia"],
  },
  {
    name: "Avengers",
    participants: ["Iron Man", "Captain America", "Thor", "Hulk", "Black Widow", "Hawkeye"],
  },
  {
    name: "Friends",
    participants: ["Rachel", "Monica", "Phoebe", "Joey", "Chandler", "Ross"],
  },
  {
    name: "Le Seigneur des anneaux",
    participants: ["Frodon", "Sam", "Aragorn", "Legolas", "Gimli", "Gandalf"],
  },
  {
    name: "Les Tortues Ninja",
    participants: ["Leonardo", "Michelangelo", "Donatello", "Raphaël", "Splinter"],
  },
];

// Tire un entier au hasard sans biais, pour que chaque valeur ait sa chance.
function randomIndex(max) {
  const range = 0x1_0000_0000;
  const limit = range - (range % max);
  const value = new Uint32Array(1);

  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);

  return value[0] % max;
}

export function isExampleState(state) {
  if (
    !state
    || typeof state.eventName !== "string"
    || state.eventDraft !== state.eventName
    || !Array.isArray(state.participants)
  ) {
    return false;
  }

  return EXAMPLE_TEAMS.some((team) => (
    state.eventName === `Exemple — ${team.name}`
    && state.participants.length === team.participants.length
    && state.participants.every(({ name }, index) => name === team.participants[index])
  ));
}

// Mélange une copie de la liste : les données de départ restent intactes.
function shuffle(items) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = randomIndex(index + 1);
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }

  return shuffled;
}

// Préserve les attributions fixées sans auto-cadeau ni échange réciproque.
export function assignRecipients(participants) {
  const assignments = new Map();
  const reservedRecipients = new Set();

  for (const participant of participants) {
    if (!participant.targetId) continue;

    if (
      participant.targetId === participant.id
      || !participants.some((candidate) => candidate.id === participant.targetId)
      || reservedRecipients.has(participant.targetId)
    ) {
      return null;
    }

    assignments.set(participant.id, participant.targetId);
    reservedRecipients.add(participant.targetId);
  }

  for (const [giverId, recipientId] of assignments) {
    if (assignments.get(recipientId) === giverId) return null;
  }

  const remainingRecipients = shuffle(
    participants
      .map((participant) => participant.id)
      .filter((id) => !reservedRecipients.has(id)),
  );
  const remainingGivers = shuffle(
    participants.filter((participant) => !assignments.has(participant.id)),
  );

  // Cherche un couplage complet, puis interdit les arêtes d'un échange réciproque trouvé.
  function findAssignment(forbiddenEdges) {
    const giverByRecipient = new Map();

    function match(giver, visitedRecipients) {
      const candidates = shuffle(remainingRecipients.filter((id) => (
        id !== giver.id
        && !forbiddenEdges.get(giver.id)?.has(id)
      )));

      for (const recipientId of candidates) {
        if (visitedRecipients.has(recipientId)) continue;
        visitedRecipients.add(recipientId);

        const currentGiver = giverByRecipient.get(recipientId);
        if (!currentGiver || match(currentGiver, visitedRecipients)) {
          giverByRecipient.set(recipientId, giver);
          return true;
        }
      }

      return false;
    }

    for (const giver of remainingGivers) {
      if (!match(giver, new Set())) return null;
    }

    const result = new Map(assignments);
    for (const [recipientId, giver] of giverByRecipient) {
      result.set(giver.id, recipientId);
    }

    for (const [giverId, recipientId] of result) {
      if (result.get(recipientId) !== giverId) continue;

      const alternatives = [];
      if (!assignments.has(giverId)) alternatives.push([giverId, recipientId]);
      if (!assignments.has(recipientId)) alternatives.push([recipientId, giverId]);
      for (const [blockedGiverId, blockedRecipientId] of alternatives) {
        const nextForbiddenEdges = new Map(
          [...forbiddenEdges].map(([id, recipients]) => [id, new Set(recipients)]),
        );
        const blockedRecipients = nextForbiddenEdges.get(blockedGiverId) ?? new Set();
        blockedRecipients.add(blockedRecipientId);
        nextForbiddenEdges.set(blockedGiverId, blockedRecipients);

        const alternative = findAssignment(nextForbiddenEdges);
        if (alternative) return alternative;
      }

      return null;
    }

    return result;
  }

  const result = findAssignment(new Map());
  return result?.size === participants.length ? result : null;
}

// Encode les octets au format Base64URL, pratique à transporter dans une adresse.
function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

// Vérifie le format Base64URL avant de convertir le jeton en octets.
function base64UrlDecode(token) {
  if (!/^[\da-z_-]+$/iu.test(token)) {
    throw new Error("Format de lien invalide.");
  }

  const base64 = token.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptText(plaintext, rawKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", encoder.encode(rawKey), "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  ));
  const payload = new Uint8Array(iv.length + encrypted.length);
  payload.set(iv);
  payload.set(encrypted, iv.length);

  return base64UrlEncode(payload);
}

async function decryptText(token, rawKey, incompleteMessage) {
  const payload = base64UrlDecode(token);
  if (payload.length < 29) throw new Error(incompleteMessage);

  const iv = payload.slice(0, 12);
  const ciphertext = payload.slice(12);
  const key = await crypto.subtle.importKey("raw", encoder.encode(rawKey), "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return decoder.decode(plaintext);
}

// Chiffre l'état complet du formulaire pour l'enregistrer dans l'URL.
export async function encryptAdminState(state) {
  if (!isValidAdminState(state)) throw new TypeError("État administratif invalide.");

  return encryptText(JSON.stringify({ version: ADMIN_STATE_VERSION, state }), ADMIN_STATE_KEY);
}

// Déchiffre un état de formulaire et vérifie sa version ainsi que sa structure.
export async function decryptAdminState(token) {
  const parsed = JSON.parse(await decryptText(token, ADMIN_STATE_KEY, "État enregistré incomplet."));
  if (parsed.version !== ADMIN_STATE_VERSION || !isValidAdminState(parsed.state)) {
    throw new Error("État enregistré invalide.");
  }

  return parsed.state;
}

// S'assure que l'état restauré est complet et cohérent avant de l'utiliser.
function isValidAdminState(state) {
  if (
    !state
    || typeof state !== "object"
    || typeof state.eventName !== "string"
    || typeof state.eventDraft !== "string"
    || typeof state.participantDraft !== "string"
    || !Array.isArray(state.participants)
    || !state.participantNameDrafts
    || typeof state.participantNameDrafts !== "object"
    || Array.isArray(state.participantNameDrafts)
    || !state.targetDrafts
    || typeof state.targetDrafts !== "object"
    || Array.isArray(state.targetDrafts)
    || !(state.generatedLinks === null || Array.isArray(state.generatedLinks))
  ) {
    return false;
  }

  const participantIds = new Set();
  for (const participant of state.participants) {
    if (
      !participant
      || typeof participant.id !== "string"
      || participantIds.has(participant.id)
      || typeof participant.name !== "string"
      || participant.name.length > MAX_PARTICIPANT_NAME_LENGTH
      || typeof participant.targetId !== "string"
    ) {
      return false;
    }
    participantIds.add(participant.id);
  }

  for (const participant of state.participants) {
    if (
      participant.targetId
      && (!participantIds.has(participant.targetId) || participant.targetId === participant.id)
    ) {
      return false;
    }
  }

  for (const [id, name] of Object.entries(state.participantNameDrafts)) {
    if (!participantIds.has(id) || typeof name !== "string" || name.length > MAX_PARTICIPANT_NAME_LENGTH) return false;
  }
  for (const [id, targetId] of Object.entries(state.targetDrafts)) {
    if (!participantIds.has(id) || typeof targetId !== "string") return false;
    if (targetId && (!participantIds.has(targetId) || targetId === id)) return false;
  }

  if (state.generatedLinks === null) return true;
  return state.generatedLinks.every((link) => {
    if (
      !link
      || typeof link.name !== "string"
      || link.name.length > MAX_PARTICIPANT_NAME_LENGTH
      || typeof link.url !== "string"
    ) return false;
    try {
      const url = new URL(link.url);
      return url.searchParams.has("token");
    } catch {
      return false;
    }
  });
}

// Crée un jeton qui ne contient que l'attribution d'une personne.
export async function encryptAssignment(eventName, giver, recipient) {
  return encryptText([eventName, giver, recipient].join(SEPARATOR), AES_KEY);
}

// Déchiffre un lien personnel et en extrait l'événement, le donneur et le destinataire.
export async function decryptAssignment(token) {
  const plaintext = await decryptText(token, AES_KEY, "Contenu de lien incomplet.");
  const values = plaintext.split(SEPARATOR);

  if (values.length !== 3 || values.some((value) => !value.trim())) {
    throw new Error("Contenu de lien invalide.");
  }

  return { eventName: values[0], giver: values[1], recipient: values[2] };
}

// Uniformise un nom pour comparer les doublons sans tenir compte des espaces ni de la casse.
export function normalizeName(name) {
  return name.trim().toLocaleLowerCase("fr");
}

// Vérifie qu'un nom est utilisable et qu'il n'est pas déjà attribué à quelqu'un d'autre.
export function validateParticipantName(name, participants, excludedParticipantId = null) {
  const trimmedName = name.trim();

  if (!trimmedName) return "Saisissez le nom d’un participant.";
  if (trimmedName.length > MAX_PARTICIPANT_NAME_LENGTH) {
    return `Le nom du participant ne peut pas dépasser ${MAX_PARTICIPANT_NAME_LENGTH} caractères.`;
  }
  if (trimmedName.includes(SEPARATOR)) return "Le caractère § ne peut pas être utilisé dans un nom.";
  if (participants.some((participant) => (
    participant.id !== excludedParticipantId
    && normalizeName(participant.name) === normalizeName(trimmedName)
  ))) {
    return DUPLICATE_NAME_ERROR;
  }

  return null;
}

// Génère les attributions, puis prépare un lien personnel chiffré pour chaque participant.
export async function createDraw(eventName, participants, baseUrl) {
  const assignments = assignRecipients(participants);
  if (!assignments) return null;

  const recipientsById = new Map(participants.map((participant) => [participant.id, participant]));
  return Promise.all(participants.map(async (giver) => {
    const recipient = recipientsById.get(assignments.get(giver.id));
    const token = await encryptAssignment(eventName, giver.name, recipient.name);
    const url = new URL(baseUrl);
    url.searchParams.set("token", token);
    return { name: giver.name, url: url.href };
  }));
}

export async function renameDraw(eventName, links) {
  return Promise.all(links.map(async ({ url }) => {
    const link = new URL(url);
    const token = link.searchParams.get("token");
    if (!token) throw new Error("Lien de tirage incomplet.");

    const { giver, recipient } = await decryptAssignment(token);
    link.searchParams.set("token", await encryptAssignment(eventName, giver, recipient));
    return { name: giver, url: link.href };
  }));
}

export async function createExampleStates(baseUrl) {
  return Promise.all(EXAMPLE_TEAMS.map(async ({ name, participants: names }) => {
    const eventName = `Exemple — ${name}`;
    const participants = names.map((participantName, index) => ({
      id: String(index + 1),
      name: participantName,
      targetId: "",
    }));
    const generatedLinks = await createDraw(eventName, participants, baseUrl);
    if (!generatedLinks) throw new Error(`Impossible de créer le tirage d’exemple « ${name} ».`);

    const state = {
      eventName,
      eventDraft: eventName,
      participantDraft: "",
      participants,
      participantNameDrafts: {},
      targetDrafts: {},
      generatedLinks,
    };

    return state;
  }));
}

// Branche l'interface d'administration et restaure son éventuel état depuis l'URL.
async function initializeOrganizer() {
  const eventInput = document.querySelector("#event-name");
  const eventError = document.querySelector("#event-error");
  const participantForm = document.querySelector("#participant-form");
  const participantInput = document.querySelector("#participant-name");
  const participantSubmitButton = participantForm.querySelector('button[type="submit"]');
  const participantError = document.querySelector("#participant-error");
  const participantList = document.querySelector("#participant-list");
  const participantCount = document.querySelector("#participant-count");
  const emptyList = document.querySelector("#empty-list");
  const clearFormButton = document.querySelector("#clear-form");
  const generateButton = document.querySelector("#generate-button");
  const generateButtonLabel = document.querySelector("#generate-label");
  const organizerStatus = document.querySelector("#organizer-status");
  const results = document.querySelector("#results");
  const resultList = document.querySelector("#result-list");
  const dialog = document.querySelector("#change-dialog");
  const dialogDescription = document.querySelector("#dialog-description");
  const confirmButton = document.querySelector("#confirm-change");
  const cancelButton = document.querySelector("#cancel-change");
  const restoreDialog = document.querySelector("#restore-dialog");
  const clearFormDialog = document.querySelector("#clear-form-dialog");
  const cancelClearFormButton = document.querySelector("#cancel-clear-form");
  const confirmClearFormButton = document.querySelector("#confirm-clear-form");
  const regenerateDialog = document.querySelector("#regenerate-dialog");
  const regenerateDescription = document.querySelector("#regenerate-description");
  const cancelRegenerateButton = document.querySelector("#cancel-regenerate");
  const confirmRegenerateButton = document.querySelector("#confirm-regenerate");
  const confirmRegenerateLabel = document.querySelector("#confirm-regenerate-label");
  const restoreSavedStateButton = document.querySelector("#restore-saved-state");
  const startFreshButton = document.querySelector("#start-fresh");
  const initialStateToken = new URLSearchParams(window.location.search).get(ADMIN_STATE_PARAM);
  const initialStatePromise = initialStateToken ? decryptAdminState(initialStateToken) : Promise.resolve(null);
  let participants = [];
  let generatedLinks = null;
  let participantNameDrafts = new Map();
  let targetDrafts = new Map();
  let nextId = 1;
  let pendingChange = null;
  let savedStateToRestore = null;
  let savedStateToken = null;
  let historyQueue = Promise.resolve();
  let historyGeneration = 0;
  let organizerReady = false;
  let regenerateExample = false;
  let exampleStatesPromise;

  eventInput.disabled = true;
  participantInput.disabled = true;
  participantSubmitButton.disabled = true;
  clearFormButton.disabled = true;

  // Affiche un retour dans la zone de statut du formulaire.
  function showStatus(message, kind = "info") {
    organizerStatus.textContent = message;
    organizerStatus.dataset.kind = kind;
  }

  // Rassemble les valeurs utiles avant de les chiffrer et de les enregistrer.
  function captureState() {
    return {
      eventName: eventInput.dataset.savedValue || "",
      eventDraft: eventInput.value,
      participantDraft: participantInput.value,
      participants: participants.map((participant) => ({ ...participant })),
      participantNameDrafts: Object.fromEntries(participantNameDrafts),
      targetDrafts: Object.fromEntries(targetDrafts),
      generatedLinks,
    };
  }

  function hasRestorableData(state) {
    return Boolean(
      state.eventName
      || state.eventDraft
      || state.participantDraft
      || state.participants.length
      || Object.keys(state.participantNameDrafts).length
      || Object.keys(state.targetDrafts).length
      || state.generatedLinks?.length,
    );
  }

  // Ne conserve que le jeton chiffré, jamais les noms ou les liens en clair.
  function saveLocalState(token, state) {
    try {
      if (hasRestorableData(state)) {
        window.localStorage.setItem(LOCAL_ADMIN_STATE_KEY, token);
      } else {
        window.localStorage.removeItem(LOCAL_ADMIN_STATE_KEY);
      }
    } catch (error) {
      console.error("Impossible d’enregistrer l’état chiffré dans le stockage local.", error);
      showStatus("L’état reste disponible dans l’URL, mais sa sauvegarde locale a échoué.", "error");
    }
  }

  async function getExampleStates() {
    if (!exampleStatesPromise) {
      const baseUrl = new URL("secret.html", document.baseURI);
      exampleStatesPromise = createExampleStates(baseUrl).catch((error) => {
        exampleStatesPromise = undefined;
        throw error;
      });
    }

    return exampleStatesPromise;
  }

  // Enregistre l'état dans l'historique après chiffrement, sans laisser les écritures se croiser.
  function persistState(replace = false) {
    const state = captureState();
    const generation = historyGeneration;
    const persistence = historyQueue.then(async () => {
      if (generation !== historyGeneration) return false;

      const token = await encryptAdminState(state);
      if (generation !== historyGeneration) return false;

      const url = new URL(window.location.href);
      url.searchParams.set(ADMIN_STATE_PARAM, token);
      window.history[replace ? "replaceState" : "pushState"](
        { secretAdminState: true },
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
      saveLocalState(token, state);
      return true;
    }).catch((error) => {
      console.error("Impossible d’enregistrer l’état chiffré du formulaire dans l’URL.", error);
      showStatus("Impossible d’enregistrer cet état dans l’URL. Vérifiez la longueur des données et réessayez.", "error");
      return false;
    });
    historyQueue = persistence;
    return persistence;
  }

  // Remet l'interface en accord avec l'état déchiffré.
  function restoreState(state) {
    pendingChange = null;
    if (dialog.open) dialog.close("restore");
    eventInput.value = state.eventDraft;
    eventInput.dataset.savedValue = state.eventName;
    participantInput.value = state.participantDraft;
    participants = state.participants.map((participant) => ({ ...participant }));
    participantNameDrafts = new Map(Object.entries(state.participantNameDrafts));
    targetDrafts = new Map(Object.entries(state.targetDrafts));
    generatedLinks = state.generatedLinks;
    nextId = participants.reduce((next, participant) => {
      const id = Number.parseInt(participant.id, 10);
      return Number.isSafeInteger(id) ? Math.max(next, id + 1) : next;
    }, 1);
    eventError.textContent = "";
    eventInput.removeAttribute("aria-invalid");
    participantError.textContent = "";
    participantInput.removeAttribute("aria-invalid");
    showStatus("");
    renderParticipants();
    renderResults();
  }

  // Restaure l'entrée active quand on navigue dans l'historique du navigateur.
  async function restoreFromUrl() {
    const generation = ++historyGeneration;
    const token = new URLSearchParams(window.location.search).get(ADMIN_STATE_PARAM);

    try {
      const state = token ? await decryptAdminState(token) : {
        eventName: "",
        eventDraft: "",
        participantDraft: "",
        participants: [],
        participantNameDrafts: {},
        targetDrafts: {},
        generatedLinks: null,
      };
      if (generation !== historyGeneration) return;
      restoreState(state);
      saveLocalState(token, state);
    } catch (error) {
      if (generation !== historyGeneration) return;
      console.error("Impossible de déchiffrer l’état du formulaire depuis l’URL.", error);
      showStatus("L’état de cette URL est invalide ou corrompu. Les saisies n’ont pas pu être restaurées.", "error");
    }
  }

  // Le tirage n'est lançable qu'à partir de trois participants.
  function updateGenerateButton() {
    const isFormEmpty = participants.length === 0
      && !eventInput.value.trim()
      && !participantInput.value.trim();
    const isCurrentExample = isExampleState({
      eventName: eventInput.value.trim(),
      eventDraft: eventInput.value.trim(),
      participants,
    });
    generateButtonLabel.textContent = isFormEmpty
      ? "Visualiser un exemple"
      : isCurrentExample
        ? "Visualiser un autre exemple"
        : "Générer les liens privés";
    generateButton.disabled = !organizerReady || (!isFormEmpty && participants.length < 3);
  }

  // Reconstruit les champs des participants et leurs choix d'attribution.
  function renderParticipants() {
    participantCount.textContent = String(participants.length);
    emptyList.hidden = participants.length > 0;
    participantList.replaceChildren();

    for (const participant of participants) {
      const item = document.createElement("li");
      item.className = "participant-row";
      item.dataset.id = participant.id;

      const nameLabel = document.createElement("label");
      nameLabel.htmlFor = `participant-${participant.id}`;
      nameLabel.textContent = `Nom de ${participant.name}`;

      const nameField = document.createElement("div");
      nameField.className = "participant-field";
      const nameInput = document.createElement("input");
      nameInput.id = `participant-${participant.id}`;
      nameInput.name = `participant-${participant.id}`;
      nameInput.type = "text";
      nameInput.maxLength = MAX_PARTICIPANT_NAME_LENGTH;
      nameInput.required = true;
      nameInput.value = participantNameDrafts.get(participant.id) ?? participant.name;
      nameInput.dataset.action = "rename";
      nameInput.autocomplete = "off";
      nameField.append(nameLabel, nameInput);

      const targetField = document.createElement("div");
      targetField.className = "participant-field";
      const targetLabel = document.createElement("label");
      targetLabel.htmlFor = `target-${participant.id}`;
      targetLabel.textContent = `Attribution de ${participant.name}`;
      const targetSelect = document.createElement("select");
      targetSelect.id = `target-${participant.id}`;
      targetSelect.name = `target-${participant.id}`;
      targetSelect.dataset.action = "target";

      const randomOption = document.createElement("option");
      randomOption.value = "";
      randomOption.textContent = "Tirer au sort";
      targetSelect.append(randomOption);

      for (const candidate of participants) {
        if (candidate.id === participant.id) continue;
        const option = document.createElement("option");
        option.value = candidate.id;
        option.textContent = candidate.name;
        targetSelect.append(option);
      }

      targetSelect.value = targetDrafts.get(participant.id) ?? participant.targetId;
      targetField.append(targetLabel, targetSelect);

      const removeButton = document.createElement("button");
      removeButton.className = "button button-secondary participant-remove";
      removeButton.type = "button";
      removeButton.dataset.action = "remove";
      removeButton.setAttribute("aria-label", `Supprimer ${participant.name}`);
      const removeIcon = createIconReference("delete", "lucide lucide-delete preview-icon");
      const removeLabel = document.createElement("span");
      removeLabel.textContent = "Supprimer";
      removeButton.append(removeIcon, removeLabel);

      item.append(nameField, targetField, removeButton);
      participantList.append(item);
    }

    updateGenerateButton();
  }

  // Affiche les liens personnels et l'URL qui permet de reprendre l'administration.
  function renderResults() {
    results.hidden = !generatedLinks;
    resultList.replaceChildren();
    if (!generatedLinks) return;
    updateAdminLink();

    for (const result of generatedLinks) {
      const item = document.createElement("li");
      item.className = "result-row";
      const name = document.createElement("span");
      name.className = "result-name";
      name.textContent = result.name;
      const copyButton = document.createElement("button");
      copyButton.className = "copy-button";
      copyButton.type = "button";
      copyButton.dataset.url = result.url;
      copyButton.dataset.copyLabel = "Copier le lien";
      copyButton.append(createClipboardIcon());
      const copyLabel = document.createElement("span");
      copyLabel.className = "copy-button-label";
      copyLabel.textContent = "Copier le lien";
      copyButton.append(copyLabel);
      item.append(name, copyButton);
      resultList.append(item);
    }
  }

  function createIconReference(name, className) {
    const namespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(namespace, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("class", className);
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    const use = document.createElementNS(namespace, "use");
    use.setAttribute("href", `icons.svg#${name}`);
    icon.append(use);
    return icon;
  }

  function createClipboardIcon() {
    return createIconReference("clipboard", "lucide lucide-clipboard preview-icon");
  }

  function setCopyButtonState(button, copied) {
    button.querySelector(".copy-button-label").textContent = copied ? "Lien copié" : button.dataset.copyLabel;
    button.querySelector("svg use").setAttribute("href", `icons.svg#${copied ? "check" : "clipboard"}`);
  }

  function updateAdminLink(url = window.location.href) {
    document.querySelector("#admin-link").value = url;
  }

  // Applique une modification et invalide les liens créés précédemment.
  function applyChange(change) {
    generatedLinks = null;
    showStatus("");
    change();
    renderParticipants();
    renderResults();
    persistState();
  }

  async function clearForm() {
    clearFormButton.disabled = true;
    try {
      if (!await persistState()) return;

      eventInput.value = "";
      eventInput.dataset.savedValue = "";
      participantInput.value = "";
      participants = [];
      participantNameDrafts.clear();
      targetDrafts.clear();
      generatedLinks = null;
      nextId = 1;
      eventError.textContent = "";
      eventInput.removeAttribute("aria-invalid");
      participantError.textContent = "";
      participantInput.removeAttribute("aria-invalid");
      showStatus("");
      renderParticipants();
      renderResults();
      await persistState(true);
    } finally {
      clearFormButton.disabled = false;
    }
  }

  clearFormButton.addEventListener("click", () => {
    if (generatedLinks) {
      clearFormDialog.showModal();
      return;
    }

    void clearForm();
  });

  cancelClearFormButton.addEventListener("click", () => clearFormDialog.close("cancel"));
  confirmClearFormButton.addEventListener("click", () => {
    clearFormDialog.close("confirm");
    void clearForm();
  });

  // Demande confirmation seulement si le changement effacerait un tirage existant.
  function confirmChange(change, apply = applyChange, description) {
    if (!generatedLinks) {
      apply(change);
      return;
    }

    dialogDescription.textContent = description
      || "Attention, modifier la liste effacera le tirage et les liens précédemment générés. Voulez-vous continuer ?";
    pendingChange = () => apply(change);
    dialog.showModal();
  }

  // Valide le changement demandé puis ferme la modale.
  confirmButton.addEventListener("click", () => {
    const change = pendingChange;
    pendingChange = null;
    dialog.close("confirm");
    if (change) change();
  });

  // Annule la modification en attente et remet les champs à leur dernière valeur validée.
  function cancelPendingChange() {
    pendingChange = null;
    if (dialog.open) dialog.close("cancel");
    eventInput.value = eventInput.dataset.savedValue || "";
    participantNameDrafts.clear();
    targetDrafts.clear();
    renderParticipants();
    renderResults();
    persistState();
  }

  async function renameEvent(nextName) {
    const previousLinks = generatedLinks;
    const previousName = eventInput.dataset.savedValue || "";
    if (!previousLinks) {
      applyChange(() => {
        eventInput.dataset.savedValue = nextName;
        eventInput.value = nextName;
      });
      return;
    }

    eventInput.disabled = true;
    participantInput.disabled = true;
    participantSubmitButton.disabled = true;
    clearFormButton.disabled = true;
    generateButton.disabled = true;
    generateButton.setAttribute("aria-busy", "true");
    participantList.querySelectorAll("input, select, button").forEach((control) => {
      control.disabled = true;
    });
    showStatus("Mise à jour des liens avec le nouveau nom…");

    try {
      const renamedLinks = await renameDraw(nextName, previousLinks);
      eventInput.dataset.savedValue = nextName;
      eventInput.value = nextName;
      generatedLinks = renamedLinks;
      showStatus("Le nom de l’événement a changé. Les attributions précédentes sont conservées.");
      if (!await persistState()) {
        eventInput.dataset.savedValue = previousName;
        eventInput.value = previousName;
        generatedLinks = previousLinks;
        renderResults();
        return;
      }
      renderResults();
    } catch (error) {
      console.error("Impossible de mettre à jour les liens après le changement du nom.", error);
      eventInput.value = eventInput.dataset.savedValue || "";
      showStatus("Impossible de mettre à jour les liens avec le nouveau nom. Le tirage précédent est conservé.", "error");
    } finally {
      eventInput.disabled = false;
      participantInput.disabled = false;
      participantSubmitButton.disabled = false;
      clearFormButton.disabled = false;
      participantList.querySelectorAll("input, select, button").forEach((control) => {
        control.disabled = false;
      });
      generateButton.removeAttribute("aria-busy");
      updateGenerateButton();
    }
  }

  cancelButton.addEventListener("click", cancelPendingChange);

  restoreSavedStateButton.addEventListener("click", () => {
    const state = savedStateToRestore;
    savedStateToRestore = null;
    restoreDialog.close("restore");
    if (!state) return;
    restoreState(state);
    void persistState(true).then((saved) => {
      if (saved) renderResults();
    });
  });

  function dismissRestorePrompt() {
    savedStateToRestore = null;
    if (restoreDialog.open) restoreDialog.close("fresh");
  }

  startFreshButton.addEventListener("click", () => {
    dismissRestorePrompt();
    if (!savedStateToken) return;

    const url = new URL(window.location.href);
    url.searchParams.set(ADMIN_STATE_PARAM, savedStateToken);
    try {
      window.history.pushState(
        { secretAdminState: true },
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    } catch (error) {
      console.error("Impossible d’ajouter le dernier événement à l’historique du navigateur.", error);
      showStatus("Impossible de conserver le dernier événement dans l’historique du navigateur.", "error");
      return;
    }

    savedStateToken = null;
    try {
      window.localStorage.removeItem(LOCAL_ADMIN_STATE_KEY);
    } catch (error) {
      console.error("Impossible de supprimer l’état sauvegardé dans le stockage local.", error);
      showStatus("Le dernier événement est conservé dans l’historique, mais sa sauvegarde locale n’a pas pu être supprimée.", "error");
    }
  });
  restoreDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dismissRestorePrompt();
  });

  // Traite Escape comme une annulation, en restaurant les valeurs précédentes.
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    cancelPendingChange();
  });

  // Valide le nom de l'événement à la sortie du champ et confirme les changements importants.
  eventInput.addEventListener("change", () => {
    const nextName = eventInput.value.trim();
    if (nextName.includes(SEPARATOR)) {
      eventError.textContent = "Le caractère § ne peut pas être utilisé dans le nom de l’événement.";
      eventInput.setAttribute("aria-invalid", "true");
      eventInput.value = eventInput.dataset.savedValue || "";
      persistState();
      return;
    }
    eventError.textContent = "";
    eventInput.removeAttribute("aria-invalid");

    if (nextName === eventInput.dataset.savedValue) {
      eventInput.value = nextName;
      persistState();
      return;
    }
    if (!nextName) {
      if (eventInput.dataset.savedValue) {
        eventError.textContent = "Le nom de l’événement est obligatoire.";
        eventInput.setAttribute("aria-invalid", "true");
        eventInput.value = eventInput.dataset.savedValue;
      } else {
        eventInput.value = "";
      }
      persistState();
      return;
    }

    confirmChange(
      () => {
        eventInput.dataset.savedValue = nextName;
        eventInput.value = nextName;
      },
      () => { void renameEvent(nextName); },
      "Le nom de l’événement va changer. Les attributions resteront identiques, mais les liens des participants seront renouvelés. Voulez-vous continuer ?",
    );
  });

  // Efface aussitôt l'erreur dès que la personne corrige sa saisie.
  eventInput.addEventListener("input", () => {
    eventError.textContent = "";
    eventInput.removeAttribute("aria-invalid");
    updateGenerateButton();
  });

  // Vérifie le nom, puis ajoute le participant si la saisie est valide.
  participantForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = participantInput.value.trim();
    const nameError = validateParticipantName(name, participants);
    if (nameError) {
      participantError.textContent = nameError;
      participantInput.setAttribute("aria-invalid", "true");
      participantInput.focus();
      persistState();
      return;
    }

    confirmChange(() => {
      participants.push({ id: String(nextId++), name, targetId: "" });
      participantInput.value = "";
      participantError.textContent = "";
      participantInput.removeAttribute("aria-invalid");
    });
  });

  // Réinitialise l'erreur de nom dès qu'une nouvelle saisie commence.
  participantInput.addEventListener("input", () => {
    participantError.textContent = "";
    participantInput.removeAttribute("aria-invalid");
    updateGenerateButton();
  });

  // Garde le brouillon de participant, sauf si l'ajout est en cours.
  participantInput.addEventListener("blur", (event) => {
    if (event.relatedTarget === participantSubmitButton) return;
    persistState();
  });

  // Enregistre une attribution manuelle quand on quitte son sélecteur.
  participantList.addEventListener("focusout", (event) => {
    if (dialog.open || event.target.dataset.action !== "target") return;
    persistState();
  });

  // Valide les changements de nom et d'attribution dans la liste.
  participantList.addEventListener("change", (event) => {
    const control = event.target;
    const item = control.closest(".participant-row");
    const participant = participants.find((candidate) => candidate.id === item?.dataset.id);
    if (!participant) return;

    if (control.dataset.action === "rename") {
      const name = control.value.trim();
      const nameError = validateParticipantName(name, participants, participant.id);
      if (nameError) {
        showStatus(nameError, "error");
        participantNameDrafts.delete(participant.id);
        renderParticipants();
        persistState();
        return;
      }
      if (name === participant.name) {
        participantNameDrafts.delete(participant.id);
        renderParticipants();
        persistState();
        return;
      }

      confirmChange(() => {
        participant.name = name;
        participantNameDrafts.delete(participant.id);
        showStatus("");
      });
    } else if (control.dataset.action === "target") {
      const targetId = control.value;
      if (targetId === participant.targetId) {
        targetDrafts.delete(participant.id);
        return;
      }
      targetDrafts.set(participant.id, targetId);
      if (generatedLinks) {
        confirmChange(() => {
          participant.targetId = targetId;
          targetDrafts.delete(participant.id);
        });
      } else {
        participant.targetId = targetId;
        targetDrafts.delete(participant.id);
      }
    }
  });

  // Supprime le participant choisi et libère les attributions qui le visaient.
  participantList.addEventListener("click", (event) => {
    const button = event.target.closest('button[data-action="remove"]');
    if (!button) return;
    const item = button.closest(".participant-row");
    const participantId = item.dataset.id;
    confirmChange(() => {
      participants = participants.filter((participant) => participant.id !== participantId);
      participantNameDrafts.delete(participantId);
      targetDrafts.delete(participantId);
      for (const participant of participants) {
        if (participant.targetId === participantId) participant.targetId = "";
        if (targetDrafts.get(participant.id) === participantId) targetDrafts.delete(participant.id);
      }
    });
  });

  // Vérifie les entrées, génère les liens, puis sauvegarde l'état complet du tirage.
  async function generateDraw() {
    eventInput.value = eventInput.value.trim();
    if (!eventInput.value) {
      eventError.textContent = "Saisissez le nom de l’événement avant de générer les liens.";
      eventInput.setAttribute("aria-invalid", "true");
      eventInput.focus();
      return;
    }
    if (eventInput.value.includes(SEPARATOR)) {
      eventError.textContent = "Le caractère § ne peut pas être utilisé dans le nom de l’événement.";
      eventInput.setAttribute("aria-invalid", "true");
      eventInput.focus();
      return;
    }
    if (participants.length < 3) return;

    eventInput.disabled = true;
    participantInput.disabled = true;
    participantForm.querySelector('button[type="submit"]').disabled = true;
    participantList.querySelectorAll("input, select, button").forEach((control) => {
      control.disabled = true;
    });
    generateButton.disabled = true;
    generateButton.setAttribute("aria-busy", "true");
    showStatus("Génération des liens privés…");

    try {
      const links = await createDraw(
        eventInput.value,
        participants,
        new URL("secret.html", document.baseURI),
      );
      if (!links) {
        showStatus(IMPOSSIBLE_DRAW_ERROR, "error");
        return;
      }

      generatedLinks = links;
      eventInput.dataset.savedValue = eventInput.value;
      if (!await persistState()) return;
      renderResults();
      showStatus("Le tirage est prêt. Envoyez à chacun son lien personnel.");
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error("Impossible de chiffrer les liens du tirage.", error);
      showStatus("Impossible de chiffrer les liens. Vérifiez que votre navigateur prend en charge Web Crypto et réessayez.", "error");
    } finally {
      eventInput.disabled = false;
      participantInput.disabled = false;
      participantSubmitButton.disabled = false;
      participantList.querySelectorAll("input, select, button").forEach((control) => {
        control.disabled = false;
      });
      generateButton.removeAttribute("aria-busy");
      updateGenerateButton();
    }
  }

  async function loadExample(excludedEventName = "") {
    eventInput.disabled = true;
    participantInput.disabled = true;
    participantSubmitButton.disabled = true;
    participantList.querySelectorAll("input, select, button").forEach((control) => {
      control.disabled = true;
    });
    clearFormButton.disabled = true;
    generateButton.disabled = true;
    generateButton.setAttribute("aria-busy", "true");

    try {
      const states = await getExampleStates();
      const candidates = EXAMPLE_TEAMS.filter(({ name }) => `Exemple — ${name}` !== excludedEventName);
      const team = candidates[randomIndex(candidates.length)];
      const eventName = `Exemple — ${team.name}`;
      const state = states.find(({ eventName: stateEventName }) => stateEventName === eventName);
      if (!state) throw new Error(`État d’exemple introuvable pour « ${eventName} ».`);
      const token = await encryptAdminState(state);
      restoreState(state);
      participantList.querySelectorAll("input, select, button").forEach((control) => {
        control.disabled = true;
      });

      const generation = ++historyGeneration;
      const persistence = historyQueue.then(() => {
        if (generation !== historyGeneration) return false;
        const url = new URL(window.location.href);
        url.searchParams.set(ADMIN_STATE_PARAM, token);
        window.history.pushState(
          { secretAdminState: true },
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
        updateAdminLink(url.href);
        saveLocalState(token, state);
        return true;
      }).catch((error) => {
        console.error("Impossible d’enregistrer l’état d’exemple dans l’URL.", error);
        showStatus("L’exemple est prêt, mais son état n’a pas pu être enregistré dans l’URL.", "error");
        return false;
      });
      historyQueue = persistence;
      if (!await persistence) return;

      renderResults();
      showStatus("Le tirage d’exemple est prêt. Envoyez à chacun son lien personnel.");
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error("Impossible de charger le tirage d’exemple.", error);
      showStatus("Impossible de charger cet exemple. Réessayez.", "error");
    } finally {
      eventInput.disabled = false;
      participantInput.disabled = false;
      participantSubmitButton.disabled = false;
      participantList.querySelectorAll("input, select, button").forEach((control) => {
        control.disabled = false;
      });
      clearFormButton.disabled = false;
      generateButton.removeAttribute("aria-busy");
      updateGenerateButton();
    }
  }

  function openRegenerateDialog(forExample) {
    regenerateExample = forExample;
    regenerateDescription.textContent = forExample
      ? "Un autre exemple choisi au hasard remplacera le tirage actuel et ses liens. Voulez-vous continuer ?"
      : "Un nouveau tirage va modifier le tirage actuel et remplacer les liens générés. Voulez-vous continuer ?";
    confirmRegenerateLabel.textContent = forExample
      ? "Visualiser un autre exemple"
      : "Générer un nouveau tirage";
    regenerateDialog.showModal();
  }

  generateButton.addEventListener("click", () => {
    const currentExample = isExampleState({
      eventName: eventInput.value.trim(),
      eventDraft: eventInput.value.trim(),
      participants,
    });
    if (generatedLinks) {
      openRegenerateDialog(currentExample);
      return;
    }

    if (currentExample) {
      void loadExample(eventInput.value.trim());
      return;
    }

    if (
      participants.length === 0
      && !eventInput.value.trim()
      && !participantInput.value.trim()
    ) {
      void loadExample();
      return;
    }

    void generateDraw();
  });

  cancelRegenerateButton.addEventListener("click", () => {
    regenerateExample = false;
    regenerateDialog.close("cancel");
  });
  confirmRegenerateButton.addEventListener("click", () => {
    const shouldLoadExample = regenerateExample;
    const previousEventName = eventInput.value.trim();
    regenerateExample = false;
    regenerateDialog.close("confirm");
    if (shouldLoadExample) {
      void loadExample(previousEventName);
    } else {
      void generateDraw();
    }
  });

  // Copie le lien personnel correspondant au bouton choisi.
  resultList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-url]");
    if (!button) return;

    try {
      await navigator.clipboard.writeText(button.dataset.url);
      setCopyButtonState(button, true);
      showStatus(`Le lien de ${button.previousElementSibling.textContent} a été copié.`);
      window.setTimeout(() => {
        if (button.isConnected) setCopyButtonState(button, false);
      }, 2200);
    } catch (error) {
      console.error("Impossible de copier le lien dans le presse-papiers.", error);
      setCopyButtonState(button, false);
      showStatus("La copie automatique est indisponible. Ouvrez le lien depuis un navigateur sécurisé et réessayez.", "error");
    }
  });

  // Copie le lien de reprise et affiche le retour directement dans son bloc.
  document.querySelector("#copy-admin-link").addEventListener("click", async () => {
    const adminLink = document.querySelector("#admin-link");
    const adminLinkStatus = document.querySelector("#admin-link-status");
    const button = document.querySelector("#copy-admin-link");
    try {
      updateAdminLink();
      await navigator.clipboard.writeText(adminLink.value);
      setCopyButtonState(button, true);
      adminLinkStatus.textContent = "Le lien d’administration a été copié. Conservez-le pour retrouver ce tirage.";
      delete adminLinkStatus.dataset.kind;
      window.setTimeout(() => {
        if (button.isConnected) setCopyButtonState(button, false);
      }, 2200);
    } catch (error) {
      console.error("Impossible de copier le lien d’administration.", error);
      setCopyButtonState(button, false);
      adminLinkStatus.textContent = "La copie automatique est indisponible. Sélectionnez et copiez le lien manuellement.";
      adminLinkStatus.dataset.kind = "error";
      adminLink.focus();
      adminLink.select();
    }
  });

  window.addEventListener("popstate", restoreFromUrl);

  renderParticipants();
  let initialStateRestored = false;
  try {
    const state = await initialStatePromise;
    if (state) {
      restoreState(state);
      initialStateRestored = true;
    }
  } catch (error) {
    console.error("Impossible de déchiffrer l’état initial du formulaire.", error);
    showStatus("L’état de cette URL est invalide ou corrompu. Les saisies n’ont pas pu être restaurées.", "error");
  } finally {
    organizerReady = true;
    eventInput.disabled = false;
    participantInput.disabled = false;
    participantForm.querySelector('button[type="submit"]').disabled = false;
    clearFormButton.disabled = false;
    updateGenerateButton();
  }

  if (initialStateToken && initialStateRestored) {
    saveLocalState(initialStateToken, captureState());
  } else if (!initialStateToken) {
    let savedToken = null;
    try {
      savedToken = window.localStorage.getItem(LOCAL_ADMIN_STATE_KEY);
    } catch (error) {
      console.error("Impossible de lire l’état chiffré dans le stockage local.", error);
      showStatus("Impossible de vérifier la présence d’un état sauvegardé dans ce navigateur.", "error");
    }

    if (savedToken) {
      try {
        savedStateToRestore = await decryptAdminState(savedToken);
        savedStateToken = savedToken;
        restoreDialog.showModal();
      } catch (error) {
        console.error("Impossible de déchiffrer l’état sauvegardé dans le stockage local.", error);
        showStatus("L’état sauvegardé dans ce navigateur est invalide ou corrompu.", "error");
        try {
          window.localStorage.removeItem(LOCAL_ADMIN_STATE_KEY);
        } catch (removeError) {
          console.error("Impossible de supprimer l’état local invalide.", removeError);
        }
        persistState(true);
      }
    } else {
      persistState(true);
    }
  }
}

// Déchiffre le lien reçu par un participant et révèle son attribution.
async function initializeSecret() {
  const eventTitle = document.querySelector("#secret-event");
  const content = document.querySelector("#secret-content");
  const errorMessage = document.querySelector("#secret-error");
  const eyebrow = document.querySelector("#secret-eyebrow");
  const token = new URLSearchParams(window.location.search).get("token");

  try {
    if (!token) throw new Error("Jeton absent.");
    const assignment = await decryptAssignment(token);
    eventTitle.textContent = assignment.eventName;

    const greeting = document.createElement("p");
    greeting.className = "secret-greeting";
    greeting.textContent = `Bonjour ${assignment.giver} !`;
    const reveal = document.createElement("p");
    reveal.className = "secret-reveal";
    reveal.append("Pour ce tirage, tu dois faire un cadeau à :");
    const recipient = document.createElement("strong");
    recipient.textContent = assignment.recipient;
    reveal.append(recipient);
    content.replaceChildren(greeting, reveal);
  } catch (error) {
    console.warn("Le lien de tirage fourni est invalide.", error);
    eventTitle.textContent = "Une surprise est introuvable";
    eyebrow.textContent = "Lien non reconnu";
    content.replaceChildren();
    errorMessage.hidden = false;
  }
}

if (typeof document !== "undefined") {
  if (document.body.dataset.page === "organizer") {
    initializeOrganizer();
  } else if (document.body.dataset.page === "secret") {
    initializeSecret();
  }
}
