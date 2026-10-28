# Squeek Race design system

All styles live in one `<style>` block in `index.html`. Tokens are CSS custom properties on `:root` (`index.html:19-58`).
Components are plain class names; there is no framework or component library. `dist/index.html` is a byte copy.

## Overview

Squeek Race is a live dashboard for people who follow Squeekchain: it turns hourly on-chain work into a hamster race.
The brief fixed the visual direction: white background, black text, a brick-red accent, rounded cards with thin borders,
restrained shadow, and a wheel that spins with the measured rpm. The page is dense and calm. The data sits in cards on
white, and red marks only live or leading things: the LIVE light, the progress fill, chart bars, the wheel and rank changes.

Hierarchy, top to bottom: the header (brand, LIVE light, refresh), one plain intro line, two headline stats (block
progress, cumulative work), then the race and leaderboard, then the 24h chart and settlements. On a phone everything is
one column in that order. On desktop the cards pair up in two columns.

## Colors

Notation is hex throughout. Components use only these semantic tokens.

| Token | Value | Job |
| --- | --- | --- |
| `--color-bg` | `#ffffff` | Page background |
| `--color-surface` | `#ffffff` | Card and button fill |
| `--color-surface-muted` | `#f7f4f1` | Race lanes, progress track, chart hover column, default rank badge, button hover |
| `--color-text` | `#111111` | Primary text, headline numbers, finish-line checks |
| `--color-text-secondary` | `#5f5852` | Labels, notes, meta lines, chart axis text |
| `--color-border` | `#e6e0da` | Card borders, row dividers, lane tick lines, chart grid |
| `--color-border-strong` | `#cfc6be` | Refresh button border, LIVE dot when offline or loading |
| `--color-accent` | `#b23a24` | Brick red: LIVE dot and label, progress fill, chart bars, wheel, "上升" rank change, alert border |
| `--color-accent-strong` | `#8f2e1c` | Alert text, latest or selected chart bar |
| `--color-accent-soft` | `#fbefea` | Alert background |
| `--color-focus` | `#b23a24` | `:focus-visible` outline |
| `--color-gold` / `--color-gold-text` | `#f0c75e` / `#3d2a00` | Rank 1 medal |
| `--color-silver` / `--color-silver-text` | `#d3d6da` / `#222222` | Rank 2 medal |
| `--color-bronze` / `--color-bronze-text` | `#dca07a` / `#2b1406` | Rank 3 medal |

Runner fur colours (`RUNNERS` in the script, `index.html:375-381`) are illustration colours, not UI tokens.
Contrast ratios computed from the declared pairs are in `artifacts/validation.md`. The taste@1 probe also measured the rendered text and found no failures.

## Typography

- Family: `--font-sans` = `system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", Roboto, sans-serif`. No web fonts are loaded; the page stays one file with zero dependencies.
- Weights: 400 (body), 600 (labels, names, buttons), 700 (headings, numbers).
- Scale (six sizes, `index.html:39-44`):

| Token | Size | Use |
| --- | --- | --- |
| `--text-caption` | 12px | Rank change, chart hint, chart axis labels (canvas) |
| `--text-small` | 14px | Labels, notes, table, meta, footer, button |
| `--text-body` | 16px | Intro line, alert, settlement titles |
| `--text-title` | 20px | Brand `h1`, card `h2`, SQK and round facts |
| `--text-stat` | 28px | Block number; cumulative work below 72rem |
| `--text-display` | 40px | Cumulative work at 72rem and up |

- Line height: 1.5 for body, 1.1 for headings and stat numbers. Headings use `text-wrap: balance`, the intro uses `pretty` and is capped at `60ch`.
- Numbers: every changing value has class `.num` (`font-variant-numeric: tabular-nums`). Integers use `Intl.NumberFormat("en-US")` thousands separators. Big integers stay `BigInt` end to end.
- Letter-spacing: -0.02em on stat numbers, -0.01em on the brand. No uppercase transforms. The only all-caps text is the brief's literal "LIVE" label in the header.

## Layout

- Container: `.wrap`, max `1200px`, inline padding `16px`.
- Spacing scale: `--space-1..6` = 4, 8, 12, 16, 24, 32px. Within a card, items are 8–12px apart. Cards are 12px apart in the stats row and 16px apart in the main grid.
- Phone (default): one column. `.stats` stacks the block card and the work card. `.grid` stacks race, leaderboard, chart, settlements.
- `min-width: 52rem` (`index.html:216`): `.stats` becomes two equal columns. `.grid` becomes `1.75fr / 1fr` with areas `"race board" "chart settle"`. Lanes grow from 44px to 52px, runners from 36px to 40px, and the chart from 200px to 240px.
- `min-width: 72rem` (`index.html:228`): cumulative work grows to 40px.
- The header is one wrapping flex row: the brand sits at the leading edge, the LIVE badge and refresh button at the trailing edge.
- Overflow: every grid column is `minmax(0, …)`. Stat numbers use `overflow-wrap: anywhere` only as a last resort; at 28px the 15-character work value fits at 320px. The probe and the smoke test found no horizontal scroll at 320, 390 or 1440.

## Elevation & Depth

The interface is flat. Cards separate by a 1px `--color-border` border, not by shadow. The brief's "restrained shadow" is a
single drop shadow on the runner illustrations (`.runner svg`, `drop-shadow(0 1px 1.5px rgb(17 17 17 / 0.25))`), which lifts the hamsters off the lane.
No surface has both a border and a shadow.

## Shapes

- `--radius-card` 14px: cards.
- `--radius-inner` 8px: lanes, alert, chart canvas, skip link.
- `--radius-pill` 999px: refresh button, progress bar.
- Circles: LIVE dot (10px), rank badges (28px).
- Lanes end in an 8px checkered finish strip (`repeating-conic-gradient`) and carry tick lines every 10%.

## Components

| Component | Source | Notes |
| --- | --- | --- |
| Card `.card` | `index.html:114` | White surface, 1px border, 14px radius, 16px padding. Header row `.card-head` holds an `h2` plus a `.card-note` on the trailing side |
| LIVE badge `.live` | `index.html:91-95` | `data-state="loading"\|"live"\|"offline"`. The dot is red and pulses only when live, under `prefers-reduced-motion: no-preference`. The label text changes too (`连接中` / `LIVE` / `离线`), so colour is not the only cue |
| Refresh button `.refresh` | `index.html:96-104` | Native `<button>`, 44px tall pill. Hover fill is gated by `(hover: hover)`, press scales to 0.96, and while a request runs it shows `aria-busy="true"` and the label `刷新中` |
| Alert `.alert` | `index.html:107` | Stable `role="alert"` element, hidden when empty. Shows exactly `数据拉取失败，10 秒后重试` when a request or required-field validation fails; keeps that endpoint's last valid data |
| Progress `.progress` | `index.html:127-128`, `renderStatus` `index.html:657` | Visible percentage and `aria-valuenow` use the floored integer percentage, matching the reference homepage. The fill retains the precise `scaleX(ratio)` with a 600ms ease-out transition |
| Wheel `.wheel` | `index.html:134-140` | SVG. `data-spinning` toggles a linear `spin` animation; `--spin-duration` = 60 / rpm seconds, clamped to 0.4–20s |
| Race lane `.lane` / `.runner` | `index.html:154-171` | Grid of name plus track. The runner moves by `transform: translateX(var(--x))` with a 1200ms `cubic-bezier(0.2, 0, 0, 1)` transition and hops only while the core is SPINNING and motion is allowed. Each lane carries an `aria-label` with work and share |
| Leaderboard `.board-table` | `index.html:175-187` | Native table: 名次 / 跑者 / work / 增速. `.rank-1..3` are medal badges. A rank change shows as text (`上升 n 名` / `下降 n 名`) |
| Chart | `index.html:191-194`, `drawChart` `index.html:803` | Hand-drawn DPR-aware canvas: three grid lines, 24 bars, the latest bar in `--color-accent-strong`, and hour labels every 6 hours clamped inside the canvas. Hours come from `buckets[].startAt`. Pointer hover or Left/Right/Home/End selects an hour; `#chart-caption` (`aria-live="polite"`) states its values. Valid empty data clears the old caption and geometry; failed data preserves the chart |
| Settlement row `.settle-list li` | `index.html:198-203`, `renderSettlements` `index.html:758` | Two-column grid: round and relative time on the first line, work and completed blocks (including zero) on the second. Prefers real `recentSettlements` records, newest first, up to six rows; hourly aggregates are only a fallback when records are absent |
| Facts `.facts` | `index.html:205-207` | `dl` with two columns: minted SQK and processed round |
| Empty states `.empty` | `renderMissing` `index.html:939` | When an endpoint has never returned valid data, the `…` placeholders turn into `-` or `暂无数据`, and lists say what will appear once data arrives. An invalid response is distinct from a valid zero-activity response |

## Motion

All endless motion (wheel spin, LIVE pulse, runner hop) is declared only inside `@media (prefers-reduced-motion: no-preference)`.
Transitions name their properties: `transform` on runners and the progress fill, `background-color, scale` on the button. Nothing uses `transition: all`.

## Do's and Don'ts

- Do start a new section as a `.card` with a `.card-head` (`h2` + `.card-note`) inside `.grid`, and give it a grid area at the 52rem breakpoint.
- Do use `--color-accent` only for live, leading or data-mark roles. Static labels stay `--color-text-secondary`.
- Do put `.num` on every number that updates, and format with `fmtInt` / `fmtDec` / `fmtSqk` so separators stay consistent.
- Do write times with `ago()` ("x 分钟前").
- Do comment the endpoint and JSON path next to every new field in its `parse*` function.
- Don't add a shadow to a bordered card, a seventh font size, a web font or a chart library.
- Don't animate outside the reduced-motion media query.
- Recipe for another panel: add `<section class="card my-panel" aria-labelledby="…">` with a `.card-head`, render it from a `renderX()` called in `refresh()`, and handle the missing-data case in `renderMissing()`.
