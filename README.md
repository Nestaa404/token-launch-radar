# Token Launch Radar

Entry for make.fun bounty `token-radar-01` — build the best token launch radar.

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot,
ranks pre-token protocols by implied launch value, and writes a static web
dashboard (`dashboard/`) with a ranked board, per-protocol detail, and farm
steps. The ranked board is in `out/board.json` (240 rows, full watchlist
coverage) and the judge dossier in `out/dossier.json`.

- Bounty: https://make.fun/bounty/token-radar-01
- Built by Brio and sub-agents for @anesta-s-kurniawansyah
