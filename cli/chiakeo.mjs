#!/usr/bin/env node
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_URL = "https://chiakeo.huyab.cfd";
const CONFIG_PATH =
  process.env.CHIAKEO_CONFIG ||
  join(homedir(), ".config", "chiakeo", "config.json");
const DEVICE_NAME_MAX_LENGTH = 60;
const CONFIG_FILE_MODE = 0o600;
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const SLOW_DOWN_SECONDS = 5;
const MILLISECONDS_PER_SECOND = 1000;
const AMOUNT_UNITS = { k: 1_000, m: 1_000_000 };
const AMOUNT_PATTERN = /^(\d+(?:[.,]\d+)?)([km])?$/i;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const SETTLEMENT_MODES = ["p2p", "host", "pick", "off"];
const SHUTTLE_KINDS = ["add", "use", "set"];
const PHOTO_DATA_MAX_LENGTH = 1_400_000;
const PHOTO_THUMB_DATA_MAX_LENGTH = 250_000;
const RECEIPT_DATA_MAX_LENGTH = 8_000_000;
const PHOTO_MAX_SIDE = 20_000;
const BASE64_BYTES_PER_GROUP = 3;
const BASE64_CHARS_PER_GROUP = 4;
const base64Length = (bytes) =>
  Math.ceil(bytes / BASE64_BYTES_PER_GROUP) * BASE64_CHARS_PER_GROUP;
const JPEG_NO_SIZE_MARKERS = new Set([0xc4, 0xc8, 0xcc]);
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BOOLEAN_FLAGS = new Set([
  "closed",
  "archived",
  "trash",
  "on",
  "off",
  "new",
  "income",
  "yes",
]);
const LIST_SCOPES = {
  open: "/api/games",
  closed: "/api/games/closed",
  archived: "/api/games/archived",
  trash: "/api/games/trash",
};

const HELP = `chiakeo: command line for Chia Kèo

Account
  up [--url URL] [--name NAME]   sign in with a code (like tailscale up)
  down                           delete the token on this computer
  whoami                         show who is signed in
  profile [--name NAME]          show or change your display name
  prefs [key=true|false ...]     show or change your options

Games
  games [--closed|--archived|--trash]   list games (default: open games)
  game <game>                    people, balances and who pays whom
  new <name> [--people N] [--mode MODE]   create a game
  rename <game> <name>           rename a game
  settle <game> <mode> [--host NAME]   mode: p2p, host, pick, off
  close <game> | reopen <game> | archive <game>
  duplicate <game>               copy a game
  delete <game>                  move a game to the trash
  restore <game>                 take a game out of the trash
  purge <game> --yes             delete a trashed game for good
  history <game>                 change history (ids for undo)
  undo <event-id>                undo a removed expense
  report --month YYYY-MM [--out FILE]   CSV report of closed games
  email <game>                   email the summary to yourself

People
  add-person <game> <name...> [--bank ID] [--account NO] [--account-name NAME]
  edit-person <game> <person> [--name NAME] [--bank ID] [--account NO] [--account-name NAME]
  rm-person <game> <person>
  contacts                       list your contacts
  contact-add <name> [--bank ID] [--account NO] [--account-name NAME]
  contact-edit <contact> [--name NAME] [--bank ID] [--account NO] [--account-name NAME]
  contact-rm <contact>

Expenses
  expenses <game>                list expenses (numbered)
  add-expense <game> <title> <amount> --payer NAME [--income] [--category C]
      [--note NOTE] [--split A,B | --shares A=2,B=1 | --amounts A=10k,B=20k]
  edit-expense <game> <expense> [--title T] [--amount N] [--payer NAME]
      [--category C] [--note NOTE] [--split ... | --shares ... | --amounts ...]
  rm-expense <game> <expense>
  exclude <game> <expense> | include <game> <expense>
  pay <game> <from> <to> <amount> [--note NOTE]
  ai <game> <text...>            ask the AI to read an expense from text
  receipt <game> <file>          ask the AI to read an expense from a receipt photo

Sharing
  share <game> [--on|--off|--new]   show or change the public link
  collaborators <game>           list people who can edit
  invite <game> <email>          let someone edit
  uninvite <game> <email>        remove an editor

Photos and QR
  photos <game>                  list photos
  photo-add <game> <file> [--caption TEXT] [--expense EXPENSE]
      JPEG, PNG or WebP up to about 1 MB (resize big photos first)
  photo-save <photo-id> --out FILE
  photo-edit <photo-id> --caption TEXT
  photo-rm <photo-id>
  qr --bank ID --account NO --out FILE [--amount N] [--name NAME] [--code C]

Shuttlecocks and stats
  shuttles                       tubes with stock, prices and recent changes
  shuttle-tube <name> [--tube-price N] [--shuttle-price N] [--quantity N]
      new tube, stock starts at --quantity (default 12)
  shuttle-tube-edit <tube> [--name TEXT] [--tube-price N] [--shuttle-price N] [--quantity N]
  shuttle-tube-rm <tube>         delete a tube and its history
  shuttle <tube> <add|use|set> <quantity> [--note NOTE]
  shuttle-rm <entry-id>
  stats                          fun stats of all your games
  balances                       who owes whom across your games

Other
  api <METHOD> <path> [json]     call the REST API directly

<game> is the game code, id or name. <expense> is its number (see expenses),
id or title. <person> and <contact> are names. Amount: 50000, 50k, 1.5m.
Environment: CHIAKEO_CONFIG (path of the config file).`;

class CliError extends Error {}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliError(`Missing value for ${arg}`);
    }
    flags[name] = value;
    index += 1;
  }
  return { positional, flags };
}

function requireArg(value, label) {
  if (value === undefined) throw new CliError(`Missing ${label}`);
  return value;
}

function parseAmount(raw) {
  const match = AMOUNT_PATTERN.exec(String(raw ?? "").trim());
  if (!match) throw new CliError(`Bad amount: ${raw}`);
  const unit = AMOUNT_UNITS[(match[2] || "").toLowerCase()] ?? 1;
  const amount = Math.round(Number(match[1].replace(",", ".")) * unit);
  if (amount <= 0) throw new CliError(`Amount must be more than 0: ${raw}`);
  return amount;
}

function parseBoolean(raw, label) {
  if (["true", "on", "yes"].includes(raw)) return true;
  if (["false", "off", "no"].includes(raw)) return false;
  throw new CliError(`${label} must be true or false`);
}

const money = (value) => `${value.toLocaleString("vi-VN")} ₫`;
const lower = (value) => String(value).toLowerCase();

async function readConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch {
    throw new CliError("You are not signed in. Run: chiakeo up");
  }
}

async function fetchApi(baseUrl, method, path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new CliError(`${response.status} ${data.error || "unknown error"}`);
  }
  return response;
}

async function request(baseUrl, method, path, body, token) {
  const response = await fetchApi(baseUrl, method, path, body, token);
  return response.json().catch(() => ({}));
}

async function authed(method, path, body) {
  const { url, token } = await readConfig();
  return request(url, method, path, body, token);
}

async function authedRaw(method, path) {
  const { url, token } = await readConfig();
  return fetchApi(url, method, path, undefined, token);
}

async function pollToken(baseUrl, deviceCode) {
  const response = await fetch(`${baseUrl}/api/login/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_code: deviceCode,
      grant_type: DEVICE_GRANT_TYPE,
    }),
  });
  return { ok: response.ok, data: await response.json().catch(() => ({})) };
}

async function up({ flags }) {
  const url = (flags.url || DEFAULT_URL).replace(/\/$/, "");
  const start = await request(url, "POST", "/api/login/device/code", {
    name: (flags.name || hostname()).slice(0, DEVICE_NAME_MAX_LENGTH),
  });

  console.log(`Open this link in your browser (sign in if asked):
  ${start.verification_uri}
Then type this code: ${start.user_code}
Waiting for approval...`);

  const deadline = Date.now() + start.expires_in * MILLISECONDS_PER_SECOND;
  let intervalSeconds = start.interval;
  while (Date.now() < deadline) {
    await sleep(intervalSeconds * MILLISECONDS_PER_SECOND);
    const { ok, data } = await pollToken(url, start.device_code);
    if (ok) {
      await mkdir(dirname(CONFIG_PATH), { recursive: true });
      await writeFile(
        CONFIG_PATH,
        JSON.stringify({ url, token: data.access_token }),
        { mode: CONFIG_FILE_MODE },
      );
      await chmod(CONFIG_PATH, CONFIG_FILE_MODE);
      console.log("Signed in.");
      return;
    }
    if (data.error === "slow_down") intervalSeconds += SLOW_DOWN_SECONDS;
    else if (data.error === "access_denied") {
      throw new CliError("Sign in was denied in the browser.");
    } else if (data.error !== "authorization_pending") break;
  }
  throw new CliError("The code has expired. Run again: chiakeo up");
}

async function down() {
  await rm(CONFIG_PATH, { force: true });
  console.log(
    "Deleted the token on this computer. To revoke it fully, open Settings > Tokens on the website.",
  );
}

async function currentUser() {
  const { user } = await authed("GET", "/api/session");
  if (!user)
    throw new CliError("The token is no longer valid. Run: chiakeo up");
  return user;
}

async function whoami() {
  console.log((await currentUser()).name);
}

async function profile({ flags }) {
  if (flags.name === undefined) {
    console.log((await currentUser()).name);
    return;
  }
  await authed("PATCH", "/api/profile", { name: flags.name });
  console.log(`Name changed to ${flags.name}`);
}

async function prefs({ positional }) {
  const pairs = positional.slice(1);
  if (pairs.length > 0) {
    const patch = {};
    for (const pair of pairs) {
      const [key, value] = pair.split("=");
      patch[key] = parseBoolean(value, key);
    }
    await authed("PATCH", "/api/preferences", patch);
  }
  const { preferences } = await authed("GET", "/api/preferences");
  for (const [key, value] of Object.entries(preferences)) {
    console.log(`${key}=${value}`);
  }
}

async function listGames(scope) {
  const list = await authed("GET", LIST_SCOPES[scope]);
  return Array.isArray(list) ? list : (list.games ?? []);
}

async function findGame(ref, scopes = ["open", "closed", "archived"]) {
  const lists = await Promise.all(scopes.map(listGames));
  const key = lower(ref);
  const seen = new Set();
  const matches = lists
    .flat()
    .filter((game) => !seen.has(game.id) && seen.add(game.id))
    .filter(
      (game) =>
        game.id === ref || lower(game.code) === key || lower(game.name) === key,
    );
  if (matches.length !== 1) {
    throw new CliError(
      matches.length === 0
        ? `No game found for "${ref}"`
        : `${matches.length} games match "${ref}", use the game code`,
    );
  }
  return matches[0];
}

async function loadGame(ref) {
  const { id } = await findGame(requireArg(ref, "<game>"));
  return authed("GET", `/api/games/${id}`);
}

function findByName(items, name, kind, allNames) {
  const found = items.find((item) => lower(item.name) === lower(name));
  if (!found) {
    const names = items.map((item) => item.name).join(", ");
    throw new CliError(`No ${kind} "${name}" ${allNames}. Found: ${names}`);
  }
  return found;
}

const findPerson = (game, name) =>
  findByName(game.participants, name, "person", "in this game");

function findExpense(game, ref) {
  const byId = game.expenses.find((item) => item.id === ref);
  if (byId) return byId;
  const number = /^#?(\d+)$/.exec(ref);
  const byNumber = number && game.expenses[Number(number[1]) - 1];
  if (byNumber) return byNumber;
  const matches = game.expenses.filter(
    (item) => lower(item.title) === lower(ref),
  );
  if (matches.length !== 1) {
    throw new CliError(
      matches.length === 0
        ? `No expense found for "${ref}"`
        : `${matches.length} expenses match "${ref}", use its number`,
    );
  }
  return matches[0];
}

async function findContact(name) {
  const list = await authed("GET", "/api/contacts");
  const contacts = Array.isArray(list) ? list : (list.contacts ?? []);
  return findByName(contacts, name, "contact", "in your contacts");
}

function bankFields(flags) {
  const fields = {};
  if (flags.bank !== undefined) fields.bankId = flags.bank;
  if (flags.account !== undefined) fields.accountNo = flags.account;
  if (flags["account-name"] !== undefined) {
    fields.accountName = flags["account-name"];
  }
  return fields;
}

function parsePairs(game, raw, parseValue) {
  return raw.split(",").map((pair) => {
    const [name, value] = pair.split("=");
    return {
      participantId: findPerson(game, name.trim()).id,
      value: parseValue(value),
    };
  });
}

function parseShares(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new CliError(`Bad share: ${raw}`);
  }
  return value;
}

function splitFields(game, flags) {
  if (flags.shares !== undefined) {
    return {
      splitMode: "shares",
      splits: parsePairs(game, flags.shares, parseShares),
    };
  }
  if (flags.amounts !== undefined) {
    return {
      splitMode: "amount",
      splits: parsePairs(game, flags.amounts, parseAmount),
    };
  }
  if (flags.split !== undefined) {
    return {
      splitMode: "equal",
      splitParticipantIds: flags.split
        .split(",")
        .map((name) => findPerson(game, name.trim()).id),
    };
  }
  return undefined;
}

function expenseToInput(expense) {
  const byShares = expense.splitMode === "shares";
  return {
    kind: expense.kind,
    category: expense.category,
    title: expense.title,
    amount: expense.amount,
    note: expense.note,
    payerParticipantId: expense.payerParticipantId,
    splitMode: expense.splitMode,
    splitParticipantIds: expense.splitParticipantIds,
    splits: expense.splits.map((split) => ({
      participantId: split.participantId,
      value: byShares ? split.weight : split.amount,
    })),
  };
}

async function games({ flags }) {
  const scope =
    ["closed", "archived", "trash"].find((name) => flags[name]) ?? "open";
  const list = await listGames(scope);
  for (const item of list) {
    console.log(
      `${item.code}  ${item.name}  (${item.participantCount} people, ${item.expenseCount} expenses)`,
    );
  }
  if (list.length === 0) console.log(`No ${scope} games.`);
}

async function game({ positional }) {
  const detail = await loadGame(positional[1]);
  const nameOf = (id) =>
    detail.participants.find((item) => item.id === id)?.name ?? id;
  console.log(`${detail.name} (${detail.code})`);
  console.log(`Total spent: ${money(detail.summary.totalExpense)}`);
  for (const row of detail.summary.balances) {
    console.log(
      `  ${nameOf(row.participantId)}: paid ${money(row.paid)}, owes ${money(row.owed)}, balance ${money(row.balance)}`,
    );
  }
  for (const row of detail.summary.settlements) {
    console.log(
      `${nameOf(row.fromParticipantId)} sends ${money(row.amount)} to ${nameOf(row.toParticipantId)}`,
    );
  }
}

async function newGame({ positional, flags }) {
  const mode = flags.mode;
  if (mode !== undefined && !SETTLEMENT_MODES.includes(mode)) {
    throw new CliError(`Mode must be one of: ${SETTLEMENT_MODES.join(", ")}`);
  }
  const created = await authed("POST", "/api/games", {
    name: requireArg(positional[1], "<name>"),
    participantCount: Number(flags.people || 0),
    ...(mode === undefined ? {} : { settlementMode: mode }),
  });
  console.log(`Created game ${created.name} (${created.code})`);
}

async function rename({ positional }) {
  const target = await findGame(requireArg(positional[1], "<game>"));
  const name = requireArg(positional[2], "<name>");
  await authed("PATCH", `/api/games/${target.id}`, { name });
  console.log(`Renamed ${target.name} to ${name}`);
}

async function settle({ positional, flags }) {
  const target = await loadGame(positional[1]);
  const mode = requireArg(positional[2], "<mode>");
  if (!SETTLEMENT_MODES.includes(mode)) {
    throw new CliError(`Mode must be one of: ${SETTLEMENT_MODES.join(", ")}`);
  }
  const host =
    flags.host === undefined ? "" : findPerson(target, flags.host).id;
  await authed("PATCH", `/api/games/${target.id}`, {
    settlementMode: mode,
    settlementHostId: host,
  });
  console.log(`${target.name}: settlement mode is now ${mode}`);
}

function gameAction(path, done, scopes) {
  return async ({ positional }) => {
    const target = await findGame(requireArg(positional[1], "<game>"), scopes);
    await authed("POST", `/api/games/${target.id}/${path}`);
    console.log(`${done} ${target.name}`);
  };
}

async function duplicate({ positional }) {
  const target = await findGame(requireArg(positional[1], "<game>"));
  const copy = await authed("POST", `/api/games/${target.id}/duplicate`);
  console.log(`Created ${copy.name} (${copy.code}) from ${target.name}`);
}

async function remove({ positional }) {
  const target = await findGame(requireArg(positional[1], "<game>"));
  await authed("DELETE", `/api/games/${target.id}`);
  console.log(`Moved ${target.name} to the trash`);
}

async function purge({ positional, flags }) {
  const target = await findGame(requireArg(positional[1], "<game>"), ["trash"]);
  if (!flags.yes) {
    throw new CliError(
      `This deletes ${target.name} for good. Run again with --yes`,
    );
  }
  await authed("DELETE", `/api/games/${target.id}/purge`);
  console.log(`Deleted ${target.name} for good`);
}

function describeEvent({ payload }) {
  const { kind, ...details } = payload;
  const text = Object.entries(details)
    .map(([key, value]) => `${key}=${[].concat(value).join("|")}`)
    .join(" ");
  return `${kind} ${text}`;
}

async function history({ positional }) {
  const target = await findGame(requireArg(positional[1], "<game>"));
  const { events } = await authed("GET", `/api/games/${target.id}/events`);
  for (const event of events) {
    const undone = event.undoneAt ? " (undone)" : "";
    console.log(
      `${event.id}  ${event.createdAt}  ${describeEvent(event)}${undone}`,
    );
  }
  if (events.length === 0) console.log("No history yet.");
}

async function undo({ positional }) {
  await authed(
    "POST",
    `/api/events/${requireArg(positional[1], "<event-id>")}/undo`,
  );
  console.log("Undone.");
}

async function report({ flags }) {
  const month = requireArg(flags.month, "--month");
  if (!MONTH_PATTERN.test(month))
    throw new CliError("Month looks like 2026-11");
  const response = await authedRaw(
    "GET",
    `/api/games/closed/report?month=${month}`,
  );
  const csv = await response.text();
  if (flags.out === undefined) {
    process.stdout.write(csv);
    return;
  }
  await writeFile(flags.out, csv);
  console.log(`Saved ${flags.out}`);
}

async function email({ positional }) {
  const target = await findGame(requireArg(positional[1], "<game>"));
  await authed("POST", `/api/games/${target.id}/email-summary`, {});
  console.log(`Sent the summary of ${target.name} to your email`);
}

async function addPerson({ positional, flags }) {
  const target = await findGame(requireArg(positional[1], "<game>"));
  const names = positional.slice(2);
  if (names.length === 0) throw new CliError("Missing <name...>");
  for (const name of names) {
    await authed("POST", `/api/games/${target.id}/participants`, {
      name,
      ...bankFields(flags),
    });
  }
  console.log(`Added ${names.join(", ")} to ${target.name}`);
}

async function editPerson({ positional, flags }) {
  const detail = await loadGame(positional[1]);
  const person = findPerson(detail, requireArg(positional[2], "<person>"));
  const { id, ...current } = person;
  await authed("PATCH", `/api/participants/${id}`, {
    ...current,
    ...(flags.name === undefined ? {} : { name: flags.name }),
    ...bankFields(flags),
  });
  console.log(`Updated ${person.name}`);
}

async function rmPerson({ positional }) {
  const detail = await loadGame(positional[1]);
  const person = findPerson(detail, requireArg(positional[2], "<person>"));
  await authed("DELETE", `/api/participants/${person.id}`);
  console.log(`Removed ${person.name} from ${detail.name}`);
}

async function contacts() {
  const list = await authed("GET", "/api/contacts");
  const items = Array.isArray(list) ? list : (list.contacts ?? []);
  for (const item of items) {
    const bank = item.accountNo ? `  ${item.bankId} ${item.accountNo}` : "";
    console.log(`${item.name}${bank}`);
  }
  if (items.length === 0) console.log("No contacts.");
}

async function contactAdd({ positional, flags }) {
  const name = requireArg(positional[1], "<name>");
  await authed("POST", "/api/contacts", { name, ...bankFields(flags) });
  console.log(`Added contact ${name}`);
}

async function contactEdit({ positional, flags }) {
  const contact = await findContact(requireArg(positional[1], "<contact>"));
  const { id, ...current } = contact;
  await authed("PATCH", `/api/contacts/${id}`, {
    ...current,
    ...(flags.name === undefined ? {} : { name: flags.name }),
    ...bankFields(flags),
  });
  console.log(`Updated ${contact.name}`);
}

async function contactRm({ positional }) {
  const contact = await findContact(requireArg(positional[1], "<contact>"));
  await authed("DELETE", `/api/contacts/${contact.id}`);
  console.log(`Removed contact ${contact.name}`);
}

async function expenses({ positional }) {
  const detail = await loadGame(positional[1]);
  const nameOf = (id) =>
    detail.participants.find((item) => item.id === id)?.name ?? id;
  detail.expenses.forEach((item, index) => {
    const marks = `${item.kind === "income" ? " [income]" : ""}${item.excluded ? " [excluded]" : ""}`;
    console.log(
      `#${index + 1}  ${item.title}  ${money(item.amount)}  paid by ${nameOf(item.payerParticipantId)}${marks}`,
    );
  });
  if (detail.expenses.length === 0) console.log("No expenses yet.");
}

async function addExpense({ positional, flags }) {
  const detail = await loadGame(positional[1]);
  const payer = findPerson(detail, requireArg(flags.payer, "--payer"));
  const split = splitFields(detail, flags) ?? {
    splitMode: "equal",
    splitParticipantIds: detail.participants.map((person) => person.id),
  };
  await authed("POST", `/api/games/${detail.id}/expenses`, {
    kind: flags.income ? "income" : "expense",
    category: flags.category || "",
    title: requireArg(positional[2], "<title>"),
    amount: parseAmount(positional[3]),
    note: flags.note || "",
    payerParticipantId: payer.id,
    ...split,
  });
  console.log(`Added expense ${positional[2]} to ${detail.name}`);
}

async function editExpense({ positional, flags }) {
  const detail = await loadGame(positional[1]);
  const current = findExpense(detail, requireArg(positional[2], "<expense>"));
  const input = expenseToInput(current);
  if (flags.title !== undefined) input.title = flags.title;
  if (flags.amount !== undefined) input.amount = parseAmount(flags.amount);
  if (flags.note !== undefined) input.note = flags.note;
  if (flags.category !== undefined) input.category = flags.category;
  if (flags.payer !== undefined) {
    input.payerParticipantId = findPerson(detail, flags.payer).id;
  }
  const split = splitFields(detail, flags);
  if (split)
    Object.assign(input, { splitParticipantIds: [], splits: [] }, split);
  await authed("PATCH", `/api/expenses/${current.id}`, input);
  console.log(`Updated expense ${current.title}`);
}

async function rmExpense({ positional }) {
  const detail = await loadGame(positional[1]);
  const current = findExpense(detail, requireArg(positional[2], "<expense>"));
  await authed("DELETE", `/api/expenses/${current.id}`);
  console.log(
    `Removed expense ${current.title}. Undo it with: chiakeo history`,
  );
}

function setExcluded(excluded) {
  return async ({ positional }) => {
    const detail = await loadGame(positional[1]);
    const current = findExpense(detail, requireArg(positional[2], "<expense>"));
    await authed("PATCH", `/api/expenses/${current.id}/excluded`, { excluded });
    console.log(`${excluded ? "Excluded" : "Included"} ${current.title}`);
  };
}

async function pay({ positional, flags }) {
  const detail = await loadGame(positional[1]);
  const from = findPerson(detail, requireArg(positional[2], "<from>"));
  const to = findPerson(detail, requireArg(positional[3], "<to>"));
  await authed("POST", `/api/games/${detail.id}/transfers`, {
    fromParticipantId: from.id,
    toParticipantId: to.id,
    amount: parseAmount(positional[4]),
    note: flags.note || "",
  });
  console.log(`Recorded: ${from.name} paid ${to.name}`);
}

async function ai({ positional }) {
  const target = await findGame(requireArg(positional[1], "<game>"));
  const text = positional.slice(2).join(" ");
  if (!text) throw new CliError("Missing <text...>");
  const { suggestion } = await authed("POST", "/api/ai/expense", {
    gameId: target.id,
    text,
  });
  console.log(JSON.stringify(suggestion, null, 2));
}

async function share({ positional, flags }) {
  const detail = await loadGame(positional[1]);
  if (flags.new) {
    await authed("POST", `/api/games/${detail.id}/share-links`);
  } else if (flags.on || flags.off) {
    await authed("PATCH", `/api/games/${detail.id}/share-link`, {
      enabled: Boolean(flags.on),
    });
  }
  const { url } = await readConfig();
  const link = (await authed("GET", `/api/games/${detail.id}`)).shareLink;
  if (!link) console.log("No link yet. Run: chiakeo share <game> --new");
  else
    console.log(`${url}/share/${link.token}  (${link.enabled ? "on" : "off"})`);
}

async function collaborators({ positional }) {
  const detail = await loadGame(positional[1]);
  for (const item of detail.collaborators) {
    const status = item.userId ? item.name : "waiting for first sign in";
    console.log(`${item.email}  ${status}`);
  }
  if (detail.collaborators.length === 0) console.log("No editors yet.");
}

async function invite({ positional }) {
  const target = await findGame(requireArg(positional[1], "<game>"));
  const address = requireArg(positional[2], "<email>");
  await authed("POST", `/api/games/${target.id}/collaborators`, {
    email: address,
  });
  console.log(`${address} can now edit ${target.name}`);
}

async function uninvite({ positional }) {
  const detail = await loadGame(positional[1]);
  const address = requireArg(positional[2], "<email>");
  const found = detail.collaborators.find(
    (item) => lower(item.email) === lower(address),
  );
  if (!found) throw new CliError(`${address} is not an editor of this game`);
  const path = found.userId
    ? `/api/games/${detail.id}/collaborators/${found.userId}`
    : `/api/games/${detail.id}/collaborators/pending/${encodeURIComponent(found.email)}`;
  await authed("DELETE", path);
  console.log(`${address} can no longer edit ${detail.name}`);
}

async function photos({ positional }) {
  const target = await findGame(requireArg(positional[1], "<game>"));
  const list = await authed("GET", `/api/games/${target.id}/photos`);
  const items = Array.isArray(list) ? list : (list.photos ?? []);
  for (const item of items) {
    console.log(
      `${item.id}  ${item.width}x${item.height}  ${item.caption || "(no caption)"}`,
    );
  }
  if (items.length === 0) console.log("No photos.");
}

function readImageInfo(bytes) {
  if (bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return {
      mimeType: "image/png",
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        !JPEG_NO_SIZE_MARKERS.has(marker)
      ) {
        return {
          mimeType: "image/jpeg",
          width: bytes.readUInt16BE(offset + 7),
          height: bytes.readUInt16BE(offset + 5),
        };
      }
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    return { mimeType: "image/jpeg", width: 0, height: 0 };
  }
  if (
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 12) === "WEBP"
  ) {
    const chunk = bytes.toString("latin1", 12, 16);
    if (chunk === "VP8 ") {
      return {
        mimeType: "image/webp",
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L") {
      const bits = bytes.readUInt32LE(21);
      return {
        mimeType: "image/webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === "VP8X") {
      return {
        mimeType: "image/webp",
        width: bytes.readUIntLE(24, 3) + 1,
        height: bytes.readUIntLE(27, 3) + 1,
      };
    }
    return { mimeType: "image/webp", width: 0, height: 0 };
  }
  return null;
}

async function readImageFile(path, maxLength) {
  const bytes = await readFile(requireArg(path, "<file>")).catch(() => {
    throw new CliError(`Cannot read file: ${path}`);
  });
  let info;
  try {
    info = readImageInfo(bytes);
  } catch {
    info = null;
  }
  if (!info) throw new CliError("The file must be a JPEG, PNG or WebP image.");
  if (base64Length(bytes.length) > maxLength) {
    throw new CliError("The image is too big. Resize it and try again.");
  }
  return { ...info, data: bytes.toString("base64") };
}

async function photoAdd({ positional, flags }) {
  const detail = await loadGame(positional[1]);
  const image = await readImageFile(positional[2], PHOTO_DATA_MAX_LENGTH);
  const validSize = (side) => side > 0 && side <= PHOTO_MAX_SIDE;
  if (!validSize(image.width) || !validSize(image.height)) {
    throw new CliError("Cannot read the image size from this file.");
  }
  if (image.data.length > PHOTO_THUMB_DATA_MAX_LENGTH) {
    throw new CliError(
      "The image is too big for the thumbnail (about 180 KB). Resize it and try again.",
    );
  }
  const expenseId =
    flags.expense === undefined ? null : findExpense(detail, flags.expense).id;
  await authed("POST", `/api/games/${detail.id}/photos`, {
    ...image,
    thumbData: image.data,
    caption: flags.caption ?? "",
    expenseId,
  });
  console.log(`Photo added to ${detail.name}`);
}

async function receipt({ positional }) {
  const target = await findGame(requireArg(positional[1], "<game>"));
  const { mimeType, data } = await readImageFile(
    positional[2],
    RECEIPT_DATA_MAX_LENGTH,
  );
  const { suggestion } = await authed("POST", "/api/ai/receipt", {
    gameId: target.id,
    image: { mimeType, data },
  });
  console.log(JSON.stringify(suggestion, null, 2));
}

async function photoSave({ positional, flags }) {
  const out = requireArg(flags.out, "--out");
  const photo = await authed(
    "GET",
    `/api/photos/${requireArg(positional[1], "<photo-id>")}`,
  );
  await writeFile(out, Buffer.from(photo.data, "base64"));
  console.log(`Saved ${out}`);
}

async function photoEdit({ positional, flags }) {
  const caption = requireArg(flags.caption, "--caption");
  await authed(
    "PATCH",
    `/api/photos/${requireArg(positional[1], "<photo-id>")}`,
    { caption },
  );
  console.log("Caption changed.");
}

async function photoRm({ positional }) {
  await authed(
    "DELETE",
    `/api/photos/${requireArg(positional[1], "<photo-id>")}`,
  );
  console.log("Photo deleted.");
}

async function qr({ flags }) {
  const out = requireArg(flags.out, "--out");
  const query = new URLSearchParams({
    bank: requireArg(flags.bank, "--bank"),
    account: requireArg(flags.account, "--account"),
  });
  if (flags.amount !== undefined)
    query.set("amount", parseAmount(flags.amount));
  if (flags.name !== undefined) query.set("name", flags.name);
  if (flags.code !== undefined) query.set("code", flags.code);
  const response = await authedRaw("GET", `/api/qr?${query}`);
  await writeFile(out, Buffer.from(await response.arrayBuffer()));
  console.log(`Saved ${out}`);
}

function findTube(tubes, ref) {
  const key = lower(requireArg(ref, "<tube>"));
  const found = tubes.find(
    (tube) => tube.id === ref || lower(tube.name) === key,
  );
  if (!found) {
    const names = tubes.map((tube) => tube.name).join(", ");
    throw new CliError(`No tube "${ref}". Found: ${names}`);
  }
  return found;
}

async function loadTube(ref) {
  const { tubes } = await authed("GET", "/api/shuttles");
  return findTube(tubes, ref);
}

function printTubes({ tubes }) {
  for (const tube of tubes) {
    console.log(
      `${tube.id}  ${tube.name}  stock ${tube.stock}  tube ${money(tube.tubePrice)}  shuttle ${money(tube.shuttlePrice)}`,
    );
    for (const entry of tube.entries) {
      const sign = entry.delta > 0 ? "+" : "";
      console.log(
        `  ${entry.id}  ${sign}${entry.delta}  stock ${entry.stockAfter}  ${entry.note}`,
      );
    }
  }
}

function tubeFields(flags) {
  const fields = {};
  if (flags.name !== undefined) fields.name = flags.name;
  if (flags["tube-price"] !== undefined) {
    fields.tubePrice = parseAmount(flags["tube-price"]);
  }
  if (flags["shuttle-price"] !== undefined) {
    fields.shuttlePrice = parseAmount(flags["shuttle-price"]);
  }
  if (flags.quantity !== undefined) {
    const quantity = Number(flags.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new CliError(`Bad quantity: ${flags.quantity}`);
    }
    fields.initialQuantity = quantity;
  }
  return fields;
}

async function shuttles() {
  printTubes(await authed("GET", "/api/shuttles"));
}

async function shuttleTube({ positional, flags }) {
  const name = requireArg(positional[1], "<name>");
  printTubes(
    await authed("POST", "/api/shuttles/tubes", {
      ...tubeFields(flags),
      name,
    }),
  );
}

async function shuttleTubeEdit({ positional, flags }) {
  const tube = await loadTube(positional[1]);
  printTubes(
    await authed("PATCH", `/api/shuttles/tubes/${tube.id}`, tubeFields(flags)),
  );
}

async function shuttleTubeRm({ positional }) {
  const tube = await loadTube(positional[1]);
  await authed("DELETE", `/api/shuttles/tubes/${tube.id}`);
  console.log(`Tube "${tube.name}" deleted.`);
}

async function shuttle({ positional, flags }) {
  const tube = await loadTube(positional[1]);
  const kind = requireArg(positional[2], "<add|use|set>");
  if (!SHUTTLE_KINDS.includes(kind)) {
    throw new CliError(`Kind must be one of: ${SHUTTLE_KINDS.join(", ")}`);
  }
  const quantity = Number(requireArg(positional[3], "<quantity>"));
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new CliError(`Bad quantity: ${positional[3]}`);
  }
  printTubes(
    await authed("POST", `/api/shuttles/tubes/${tube.id}/entries`, {
      kind,
      quantity,
      note: flags.note || "",
    }),
  );
}

async function shuttleRm({ positional }) {
  await authed(
    "DELETE",
    `/api/shuttles/entries/${requireArg(positional[1], "<entry-id>")}`,
  );
  console.log("Entry deleted.");
}

async function stats() {
  const data = await authed("GET", "/api/fun-stats");
  console.log(
    `Games: ${data.gameCount}, total spent: ${money(data.totalExpense)}`,
  );
  if (data.topPayer) {
    console.log(
      `Top payer: ${data.topPayer.name} (${money(data.topPayer.totalPaid)})`,
    );
  }
  if (data.mostActive) {
    console.log(
      `Most active: ${data.mostActive.name} (${data.mostActive.gameCount} games)`,
    );
  }
  if (data.biggestExpense) {
    console.log(
      `Biggest expense: ${data.biggestExpense.title} ${money(data.biggestExpense.amount)} in ${data.biggestExpense.gameName}`,
    );
  }
  if (data.favoriteWeekday !== null) {
    console.log(`Favorite day: ${WEEKDAYS[data.favoriteWeekday]}`);
  }
}

async function balances() {
  const data = await authed("GET", "/api/cross-balances");
  console.log(
    `${data.games.length} games, total spent: ${money(data.totalExpense)}`,
  );
  for (const person of data.people) {
    console.log(`  ${person.name}: net ${money(person.net)}`);
  }
  for (const row of data.settlements) {
    console.log(`${row.from} sends ${money(row.amount)} to ${row.to}`);
  }
}

async function api({ positional }) {
  const [, method, path, json] = positional;
  const body = json === undefined ? undefined : JSON.parse(json);
  const data = await authed(
    requireArg(method, "<METHOD>").toUpperCase(),
    requireArg(path, "<path>"),
    body,
  );
  console.log(JSON.stringify(data, null, 2));
}

const COMMANDS = {
  up,
  login: up,
  down,
  whoami,
  profile,
  prefs,
  games,
  game,
  new: newGame,
  rename,
  settle,
  close: gameAction("close", "Closed"),
  reopen: gameAction("reopen", "Reopened"),
  archive: gameAction("archive", "Archived"),
  duplicate,
  delete: remove,
  restore: gameAction("restore", "Restored", ["trash"]),
  purge,
  history,
  undo,
  report,
  email,
  "add-person": addPerson,
  "edit-person": editPerson,
  "rm-person": rmPerson,
  contacts,
  "contact-add": contactAdd,
  "contact-edit": contactEdit,
  "contact-rm": contactRm,
  expenses,
  "add-expense": addExpense,
  "edit-expense": editExpense,
  "rm-expense": rmExpense,
  exclude: setExcluded(true),
  include: setExcluded(false),
  pay,
  ai,
  receipt,
  share,
  collaborators,
  invite,
  uninvite,
  photos,
  "photo-add": photoAdd,
  "photo-save": photoSave,
  "photo-edit": photoEdit,
  "photo-rm": photoRm,
  qr,
  shuttles,
  "shuttle-tube": shuttleTube,
  "shuttle-tube-edit": shuttleTubeEdit,
  "shuttle-tube-rm": shuttleTubeRm,
  shuttle,
  "shuttle-rm": shuttleRm,
  stats,
  balances,
  api,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [name] = args.positional;
  if (name === undefined) {
    console.log(HELP);
    return;
  }
  const command = COMMANDS[name];
  if (!command) {
    throw new CliError(`Unknown command: ${name}. Run chiakeo for help.`);
  }
  await command(args);
}

main().catch((error) => {
  console.error(error instanceof CliError ? error.message : error);
  process.exit(1);
});
