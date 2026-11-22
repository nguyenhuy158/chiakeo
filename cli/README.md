# chiakeo

Command line for [Chia Kèo](https://chiakeo.huyab.cfd).

```bash
pnpm add -g chiakeo
chiakeo up
```

`chiakeo up` prints a link and a code. Open the link, sign in, and approve. The token is saved in `~/.config/chiakeo/config.json` (mode 600). Run `chiakeo down` to delete it.

Run `chiakeo` with no arguments to see all commands. Needs Node 22 or newer.

## What you can do

Everything you can do on the website, except uploading photos and reading a receipt from a photo:

- **Games:** list, show, create, rename, close, reopen, archive, duplicate, trash, restore, delete for good, history and undo, CSV report, email the summary.
- **People and contacts:** add, edit, remove, with bank details.
- **Expenses:** add, edit, remove, exclude, split equally, by shares or by amounts, income, payments between people, ask the AI to read an expense from text.
- **Sharing:** public link (on, off, new), editors by email.
- **Photos and QR:** list, save, caption and delete photos, save a payment QR image.
- **Shuttlecocks, stats and options:** stock, fun stats, balances across games, your name and options.

Example:

```bash
chiakeo new "Friday game" --people 3
chiakeo add-person "Friday game" Lan
chiakeo add-expense "Friday game" Court 300k --payer Lan --shares Lan=1,Nam=2
chiakeo game "Friday game"
```

`chiakeo api <METHOD> <path> [json]` calls any other REST endpoint.
