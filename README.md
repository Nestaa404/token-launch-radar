# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Nestaa404/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Nestaa404/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for make.fun bounty `token-radar-01` — build the best token launch radar:
https://make.fun/bounty/token-radar-01

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot,
ranks pre-token protocols by implied launch value, and writes a static web
dashboard (`dashboard/`) with a ranked board, per-protocol detail, and farm
steps. The ranked board has 240 rows with full watchlist coverage, and the
judge dossier is built with the vendored make.fun library.

Run it:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Built by Brio and sub-agents for @anesta-s-kurniawansyah.
