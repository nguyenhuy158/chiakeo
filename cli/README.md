# chiakeo

Command line for [Chia Kèo](https://chiakeo.huyab.cfd).

```bash
pnpm add -g chiakeo
chiakeo up
```

`chiakeo up` prints a link and a code. Open the link, sign in, and approve. The token is saved in `~/.config/chiakeo/config.json` (mode 600). Run `chiakeo down` to delete it.

Run `chiakeo` with no arguments to see all commands. Needs Node 22 or newer.

## What you can do

Everything you can do on the website:

- **Games:** list, show, create, rename, close, reopen, archive, duplicate, trash, restore, delete for good, history and undo, CSV report, email the summary.
- **People and contacts:** add, edit, remove, with bank details.
- **Expenses:** add, edit, remove, exclude, split equally, by shares or by amounts, income, payments between people, ask the AI to read an expense from text or from a receipt photo (`receipt`).
- **Sharing:** public link (on, off, new), editors by email.
- **Photos and QR:** add, list, save, caption and delete photos, save a payment QR image. The CLI does not resize: `photo-add` takes a JPEG, PNG or WebP of about 180 KB or less. Resize bigger photos first. `receipt` takes a photo of up to about 6 MB.
- **Shuttlecocks, stats and options:** shuttle tubes (`shuttle-tube`, `shuttle-tube-edit`, `shuttle-tube-rm`) with prices and stock per tube, add, use or count shuttles (`shuttle`), fun stats, balances across games, your name and options. An expense in the shuttle category can use stock from a tube through `api` (`"shuttle": {"tubeId", "quantity"}` in the expense body).

Example:

```bash
chiakeo new "Friday game" --people 3
chiakeo add-person "Friday game" Lan
chiakeo add-expense "Friday game" Court 300k --payer Lan --shares Lan=1,Nam=2
chiakeo game "Friday game"
```

`chiakeo api <METHOD> <path> [json]` calls any other REST endpoint.
