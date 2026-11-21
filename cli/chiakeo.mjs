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

const HELP = `chiakeo: command line for Chia Kèo

  up [--url URL] [--name NAME]   sign in with a code (like tailscale up)
  down                           delete the token on this computer
  whoami                         show who is signed in
  games                          list the open games
  game <game>                    details, balances and who pays whom
  new <name> [--people N]        create a game
  add-person <game> <name...>    add people
  add-expense <game> <title> <amount> --payer NAME [--split A,B] [--note NOTE]
  pay <game> <from> <to> <amount>
  api <METHOD> <path> [json]     call the REST API directly

<game> is the game code, id or name. Amount: 50000, 50k, 1.5m.
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
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliError(`Missing value for ${arg}`);
    }
    flags[arg.slice(2)] = value;
    index += 1;
  }
  return { positional, flags };
}

function parseAmount(raw) {
  const match = AMOUNT_PATTERN.exec(String(raw ?? "").trim());
  if (!match) throw new CliError(`Bad amount: ${raw}`);
  const unit = AMOUNT_UNITS[(match[2] || "").toLowerCase()] ?? 1;
  const amount = Math.round(Number(match[1].replace(",", ".")) * unit);
  if (amount <= 0) throw new CliError(`Amount must be more than 0: ${raw}`);
  return amount;
}

const money = (value) => `${value.toLocaleString("vi-VN")} ₫`;

async function readConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch {
    throw new CliError("You are not signed in. Run: chiakeo up");
  }
}

async function request(baseUrl, method, path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new CliError(`${response.status} ${data.error || "unknown error"}`);
  }
  return data;
}

async function authed(method, path, body) {
  const { url, token } = await readConfig();
  return request(url, method, path, body, token);
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

async function whoami() {
  const { user } = await authed("GET", "/api/session");
  if (!user)
    throw new CliError("The token is no longer valid. Run: chiakeo up");
  console.log(user.name);
}

async function findGame(ref) {
  // A settled game closes by itself and leaves the open list, so search closed games too.
  const [active, closed] = await Promise.all([
    authed("GET", "/api/games"),
    authed("GET", "/api/games/closed"),
  ]);
  const key = ref.toLowerCase();
  const matches = [...active, ...closed].filter(
    (game) =>
      game.id === ref ||
      game.code.toLowerCase() === key ||
      game.name.toLowerCase() === key,
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
  const { id } = await findGame(ref);
  return authed("GET", `/api/games/${id}`);
}

function findPerson(game, name) {
  const person = game.participants.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );
  if (!person) {
    const names = game.participants.map((item) => item.name).join(", ");
    throw new CliError(`No person "${name}" in this game. People: ${names}`);
  }
  return person;
}

async function games() {
  const list = await authed("GET", "/api/games");
  for (const game of list) {
    console.log(
      `${game.code}  ${game.name}  (${game.participantCount} people, ${game.expenseCount} expenses)`,
    );
  }
  if (list.length === 0) console.log("No open games.");
}

async function game({ positional }) {
  const detail = await loadGame(requireArg(positional[1], "<game>"));
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
  const created = await authed("POST", "/api/games", {
    name: requireArg(positional[1], "<name>"),
    participantCount: Number(flags.people || 0),
  });
  console.log(`Created game ${created.name} (${created.code})`);
}

async function addPerson({ positional }) {
  const target = await findGame(requireArg(positional[1], "<game>"));
  const names = positional.slice(2);
  if (names.length === 0) throw new CliError("Missing <name...>");
  for (const name of names) {
    await authed("POST", `/api/games/${target.id}/participants`, { name });
  }
  console.log(`Added ${names.join(", ")} to ${target.name}`);
}

async function addExpense({ positional, flags }) {
  const detail = await loadGame(requireArg(positional[1], "<game>"));
  const payer = findPerson(detail, requireArg(flags.payer, "--payer"));
  const split = flags.split
    ? flags.split.split(",").map((name) => findPerson(detail, name.trim()))
    : detail.participants;
  await authed("POST", `/api/games/${detail.id}/expenses`, {
    title: requireArg(positional[2], "<title>"),
    amount: parseAmount(positional[3]),
    note: flags.note || "",
    payerParticipantId: payer.id,
    splitMode: "equal",
    splitParticipantIds: split.map((person) => person.id),
  });
  console.log(`Added expense ${positional[2]} to ${detail.name}`);
}

async function pay({ positional }) {
  const detail = await loadGame(requireArg(positional[1], "<game>"));
  const from = findPerson(detail, requireArg(positional[2], "<from>"));
  const to = findPerson(detail, requireArg(positional[3], "<to>"));
  await authed("POST", `/api/games/${detail.id}/transfers`, {
    fromParticipantId: from.id,
    toParticipantId: to.id,
    amount: parseAmount(positional[4]),
  });
  console.log(`Recorded: ${from.name} paid ${to.name}`);
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

function requireArg(value, label) {
  if (value === undefined) throw new CliError(`Missing ${label}`);
  return value;
}

const COMMANDS = {
  up,
  login: up,
  down,
  whoami,
  games,
  game,
  new: newGame,
  "add-person": addPerson,
  "add-expense": addExpense,
  pay,
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
