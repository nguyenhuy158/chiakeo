#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_URL = "https://chiakeo.huyab.cfd";
const CONFIG_PATH =
  process.env.CHIAKEO_CONFIG ||
  join(homedir(), ".config", "chiakeo", "config.json");
const TOKEN_BYTES = 32;
const TOKEN_PREFIX_LENGTH = 9;
const DEVICE_NAME_MAX_LENGTH = 60;
const CONFIG_FILE_MODE = 0o600;
const AMOUNT_UNITS = { k: 1_000, m: 1_000_000 };
const AMOUNT_PATTERN = /^(\d+(?:[.,]\d+)?)([km])?$/i;

const HELP = `chiakeo: dòng lệnh cho Chia Kèo

  up [--url URL] [--name TÊN]   đăng nhập bằng mã (như tailscale up)
  down                          xóa token trên máy này
  whoami                        xem đang đăng nhập là ai
  games                         danh sách kèo đang chơi
  game <kèo>                    chi tiết, số dư và ai chuyển cho ai
  new <tên> [--people N]        tạo kèo mới
  add-person <kèo> <tên...>     thêm người
  add-expense <kèo> <nội dung> <số tiền> --payer TÊN [--split A,B] [--note GHI CHÚ]
  pay <kèo> <người trả> <người nhận> <số tiền>
  api <METHOD> <đường dẫn> [json]   gọi thẳng REST API

<kèo> là mã, id hoặc tên kèo. Số tiền: 50000, 50k, 1.5m.
Biến môi trường: CHIAKEO_CONFIG (đường dẫn file cấu hình).`;

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
      throw new CliError(`Thiếu giá trị cho ${arg}`);
    }
    flags[arg.slice(2)] = value;
    index += 1;
  }
  return { positional, flags };
}

function parseAmount(raw) {
  const match = AMOUNT_PATTERN.exec(String(raw ?? "").trim());
  if (!match) throw new CliError(`Số tiền không hợp lệ: ${raw}`);
  const unit = AMOUNT_UNITS[(match[2] || "").toLowerCase()] ?? 1;
  const amount = Math.round(Number(match[1].replace(",", ".")) * unit);
  if (amount <= 0) throw new CliError(`Số tiền phải lớn hơn 0: ${raw}`);
  return amount;
}

const money = (value) => `${value.toLocaleString("vi-VN")} ₫`;

async function readConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch {
    throw new CliError("Chưa đăng nhập. Chạy: chiakeo up");
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
    throw new CliError(`${response.status} ${data.error || "lỗi không rõ"}`);
  }
  return data;
}

async function authed(method, path, body) {
  const { url, token } = await readConfig();
  return request(url, method, path, body, token);
}

async function up({ flags }) {
  const url = (flags.url || DEFAULT_URL).replace(/\/$/, "");
  const secret = `ck_${randomBytes(TOKEN_BYTES).toString("hex")}`;
  const start = await request(url, "POST", "/api/cli-auth/start", {
    tokenHash: createHash("sha256").update(secret).digest("hex"),
    tokenPrefix: secret.slice(0, TOKEN_PREFIX_LENGTH),
    name: (flags.name || hostname()).slice(0, DEVICE_NAME_MAX_LENGTH),
  });

  console.log(`Mở link này trong trình duyệt (đăng nhập nếu được hỏi):
  ${start.verificationUrl}?code=${start.userCode}
Hoặc mở ${start.verificationUrl} và nhập mã: ${start.userCode}
Đang chờ duyệt...`);

  const deadline = Date.now() + start.expiresInSeconds * 1000;
  while (Date.now() < deadline) {
    await sleep(start.intervalSeconds * 1000);
    const { status } = await request(url, "POST", "/api/cli-auth/poll", {
      deviceCode: start.deviceCode,
    });
    if (status === "approved") {
      await mkdir(dirname(CONFIG_PATH), { recursive: true });
      await writeFile(CONFIG_PATH, JSON.stringify({ url, token: secret }), {
        mode: CONFIG_FILE_MODE,
      });
      await chmod(CONFIG_PATH, CONFIG_FILE_MODE);
      console.log("Đã đăng nhập.");
      return;
    }
    if (status === "expired") break;
  }
  throw new CliError("Mã hết hạn. Chạy lại: chiakeo up");
}

async function down() {
  await rm(CONFIG_PATH, { force: true });
  console.log(
    "Đã xóa token trên máy này. Muốn thu hồi hẳn thì vào Cài đặt > Token trên web.",
  );
}

async function whoami() {
  const { user } = await authed("GET", "/api/session");
  if (!user) throw new CliError("Token không còn hiệu lực. Chạy: chiakeo up");
  console.log(user.name);
}

async function findGame(ref) {
  // Kèo tất toán xong tự đóng và rời danh sách đang chơi, nên tìm cả kèo đã đóng.
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
        ? `Không thấy kèo "${ref}" `
        : `Có ${matches.length} kèo khớp "${ref}", dùng mã kèo`,
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
    throw new CliError(`Không thấy "${name}" trong kèo. Có: ${names}`);
  }
  return person;
}

async function games() {
  const list = await authed("GET", "/api/games");
  for (const game of list) {
    console.log(
      `${game.code}  ${game.name}  (${game.participantCount} người, ${game.expenseCount} khoản)`,
    );
  }
  if (list.length === 0) console.log("Chưa có kèo nào đang chơi.");
}

async function game({ positional }) {
  const detail = await loadGame(requireArg(positional[1], "<kèo>"));
  const nameOf = (id) =>
    detail.participants.find((item) => item.id === id)?.name ?? id;
  console.log(`${detail.name} (${detail.code})`);
  console.log(`Tổng chi: ${money(detail.summary.totalExpense)}`);
  for (const row of detail.summary.balances) {
    console.log(
      `  ${nameOf(row.participantId)}: trả ${money(row.paid)}, phải chịu ${money(row.owed)}, số dư ${money(row.balance)}`,
    );
  }
  for (const row of detail.summary.settlements) {
    console.log(
      `${nameOf(row.fromParticipantId)} chuyển ${money(row.amount)} cho ${nameOf(row.toParticipantId)}`,
    );
  }
}

async function newGame({ positional, flags }) {
  const created = await authed("POST", "/api/games", {
    name: requireArg(positional[1], "<tên>"),
    participantCount: Number(flags.people || 0),
  });
  console.log(`Đã tạo kèo ${created.name} (${created.code})`);
}

async function addPerson({ positional }) {
  const target = await findGame(requireArg(positional[1], "<kèo>"));
  const names = positional.slice(2);
  if (names.length === 0) throw new CliError("Thiếu <tên...>");
  for (const name of names) {
    await authed("POST", `/api/games/${target.id}/participants`, { name });
  }
  console.log(`Đã thêm ${names.join(", ")} vào ${target.name}`);
}

async function addExpense({ positional, flags }) {
  const detail = await loadGame(requireArg(positional[1], "<kèo>"));
  const payer = findPerson(detail, requireArg(flags.payer, "--payer"));
  const split = flags.split
    ? flags.split.split(",").map((name) => findPerson(detail, name.trim()))
    : detail.participants;
  await authed("POST", `/api/games/${detail.id}/expenses`, {
    title: requireArg(positional[2], "<nội dung>"),
    amount: parseAmount(positional[3]),
    note: flags.note || "",
    payerParticipantId: payer.id,
    splitMode: "equal",
    splitParticipantIds: split.map((person) => person.id),
  });
  console.log(`Đã thêm khoản chi ${positional[2]} vào ${detail.name}`);
}

async function pay({ positional }) {
  const detail = await loadGame(requireArg(positional[1], "<kèo>"));
  const from = findPerson(detail, requireArg(positional[2], "<người trả>"));
  const to = findPerson(detail, requireArg(positional[3], "<người nhận>"));
  await authed("POST", `/api/games/${detail.id}/transfers`, {
    fromParticipantId: from.id,
    toParticipantId: to.id,
    amount: parseAmount(positional[4]),
  });
  console.log(`Đã ghi nhận ${from.name} trả ${to.name}`);
}

async function api({ positional }) {
  const [, method, path, json] = positional;
  const body = json === undefined ? undefined : JSON.parse(json);
  const data = await authed(
    requireArg(method, "<METHOD>").toUpperCase(),
    requireArg(path, "<đường dẫn>"),
    body,
  );
  console.log(JSON.stringify(data, null, 2));
}

function requireArg(value, label) {
  if (value === undefined) throw new CliError(`Thiếu ${label}`);
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
  const command = COMMANDS[args.positional[0]];
  if (!command) {
    console.log(HELP);
    return;
  }
  await command(args);
}

main().catch((error) => {
  console.error(error instanceof CliError ? error.message : error);
  process.exit(1);
});
