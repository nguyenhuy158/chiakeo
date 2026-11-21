# chiakeo

Command line for [Chia Kèo](https://chiakeo.huyab.cfd).

```bash
pnpm add -g chiakeo
chiakeo up
```

`chiakeo up` prints a link and a code. Open the link, sign in, and approve. The token is saved in `~/.config/chiakeo/config.json` (mode 600). Run `chiakeo down` to delete it.

Run `chiakeo` with no arguments to see all commands. Needs Node 22 or newer.
