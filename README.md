# Token Radar

[![make.fun: token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/golden-tapir-28/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/golden-tapir-28/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A radar for pre-token protocols: every protocol on the make.fun watchlist, ranked by the
implied value its token might carry, with a farm plan for each one. Built for
[make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01).

## The model

One function scores every protocol from the snapshot's own figures. No protocol name is
special-cased, and no row is hand-picked.

```
implied = round( tvl_usd × category multiple × (1 + clamp(change_7d, -50, 150) / 100 × 0.6)
                 × (0.55 + min(age_days, 1460) / 1460 × 0.45) )
```

- **Category multiple** — the median market-cap / TVL of the live-token protocols in that
  category (at least 3 of them), otherwise the whole market median of 0.2138, clamped to
  [0.05, 1]. The multiples are computed from the snapshot at run time.
- **Growth** — the 7-day TVL change, clamped to [-50, 150]%, weighted 0.6.
- **Maturity** — the age since the protocol was first listed, the best record of how long it
  has run with no token; an unlisted age uses 365 days.

The board covers the 40 watchlist slugs (TVL ≥ $50M, no token on record) plus every other
pre-token protocol the watchlist's own rule would keep: no token, and not a wrapped, staked
or bridged product, an exchange, or a versioned pool. 198 rows in all.

## The dashboard

`dashboard/` is a static page that runs with no network: it loads the board from `data.js`
and recomputes every implied value with the same function, so the number on screen and the
number in `board.json` always agree. Sort by rank, TVL, growth, age or implied value;
filter by category, token status, the watchlist, or the protocols growing fastest; open a
row for its model breakdown and its farm plan.

## The farm plan

Every row carries 8 steps: a fresh wallet, a first deposit sized to the protocol's TVL tier,
a second complementary action, a weekly qualifying action, a conditional step for fast
growers and young protocols, a hold period, a claim step that names the protocol's own
points page, and a farm log. Each step states its cost and its time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

That writes `out/board.json`, `out/data.js`, copies `dashboard/` and `screenshots/` into
`out/`, and writes `out/dossier.json`.

## License

MIT. See [LICENSE](LICENSE).
