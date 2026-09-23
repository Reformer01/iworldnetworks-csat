# Admin UI Redesign — Reference Templates & Migration Plan

Goal: replace this app's ad-hoc dashboard UI (hand-rolled chart cards, raw `<table>`
markup, chipped icons, bespoke tab buttons) with the component language of the
three reference dashboards, so **every** admin page is a composition of the same
primitives instead of a one-off.

## Reference sources

| Source | What we take from it |
|---|---|
| `satnaing/shadcn-admin` | App shell (sidebar/header/page structure), the whole **data-table system** (`toolbar`, `faceted-filter`, `column-header`, `pagination`, `view-options`, `bulk-actions`), table/badge/tabs primitives, neutral token set. |
| `abderrahimghazali/shadcn-fintech` | **KPI/stat card** language, chart cards (Card → CardHeader with inline legend → `ChartContainer`), gradient area fills, square-dot markers, invoice/tabular number typography. |
| `shadcnstudio/shadcn-nextjs-admin-template-free` | (URL 404s — repo not public under that name; treated as covered by the two above for KPI/chart/table patterns.) |

Both templates are **Tailwind v4** (`@theme inline`, oklch tokens) and this app is
**Tailwind v3** with HSL CSS variables, so tokens/structure are *translated*, not
pasted. Both use **Lucide** icons — this app already does too.

## Design decisions (locked)

1. **Tokens stay semantic, not cosmetic.** `--primary` remains brand ink (black),
   `--secondary` remains brand green (`#448515`). Pages keep working; the visual
   change comes from component geometry, not from re-mapping colours.
2. **Radii/shadow/typography follow the templates:** `rounded-xl` cards,
   `shadow-xs`/`card-shadow`, 1px `border-border`, 24px card padding, `text-sm`
   body, `text-xs` uppercase-tracking section labels, tabular-nums for metrics.
3. **Icons: Lucide only**, always sized by the parent (`size-4` in controls,
   `size-5` in KPI tiles). No coloured chip/square behind an icon anywhere.
4. **Charts: one wrapper, one config.** All Recharts usage goes through
   `ChartContainer` (`@/components/ui/chart`) with a `ChartConfig`, grid
   `vertical={false}`, dashed `strokeDasharray="3 3"`, hidden axis lines, and
   `ChartTooltipContent`. No bespoke `<Tooltip contentStyle=...>` blocks.
5. **Tables: TanStack Table v8 + ported data-table components.** Sorting, column
   visibility, faceted filters, pagination, row actions, bulk actions, and
   skeleton/empty states come from the shared system.

## Foundation files (new)

```
src/components/ui/stat-card.tsx        KPI tile (label, value, delta, icon, sparkline)
src/components/ui/chart-card.tsx       Card shell for any chart + inline legend/summary
src/components/ui/page-header.tsx      Page title / description / actions row
src/components/ui/empty-state.tsx      Empty + loading states
src/components/data-table/index.tsx    <DataTable> — TanStack v8 wiring + shell
src/components/data-table/toolbar.tsx  search + faceted filters + reset + view options
src/components/data-table/faceted-filter.tsx
src/components/data-table/column-header.tsx
src/components/data-table/pagination.tsx
src/components/data-table/view-options.tsx
src/components/data-table/bulk-actions.tsx
src/components/data-table/row-actions.tsx
src/components/charts/trend-area-chart.tsx
src/components/charts/breakdown-bar-chart.tsx
src/components/charts/donut-chart.tsx
src/components/charts/stacked-bar-chart.tsx
```

## Upgraded in place (API-compatible)

`card.tsx` (+`CardAction`, size-aware padding) · `table.tsx` (sticky header,
compact density, hover, rounded wrapper) · `tabs.tsx` (adds `variant`:
`segmented` (template default) / `line` / `pills`) · `badge.tsx` (adds soft
`success` / `warning` / `info` / `muted` tones) · `button.tsx` (adds `xs` size,
`soft`/`ghost-brand` variants) · `skeleton.tsx`.

## Page migration checklist

Priority 1 (charts + KPIs):
- [x] `admin/dashboard`
- [ ] `admin/intelligence`
- [ ] `admin/support`
- [ ] `admin/stability`
- [ ] `admin/staff`
- [ ] `admin/field-support`
- [ ] `admin/installation`
- [ ] `admin/engagement`
- [ ] `admin/sales`, `admin/sales/monthly-revenue`, `admin/sales/targets`
- [ ] `admin/income-report`, `admin/billing`, `admin/support-revenue`
- [ ] `admin/finance/paystack` (+ `transactions`, `customers`, `reconciliation`, `reports`)

Priority 2 (tables):
- [ ] `admin/crud`, `admin/customers`, `admin/testimonials`, `admin/super`
- [ ] `admin/mailing` (+ `templates`), `admin/campaigns` (+ `new`, `[id]`)
- [ ] `admin/bts/audit`, `admin/bts/customers`, `admin/bts/review`
- [ ] `admin/reports` (+ `monthly-pack`, `risk-register`), `admin/sales/records`, `admin/sales/import`

Rules for every migrated page: use `PageHeader` instead of ad-hoc `<header>`,
`StatCard` for KPI rows, `ChartCard` + `src/components/charts/*` for charts,
`DataTable` for tabular data, `Tabs variant="segmented"` for tab strips, Lucide
icons only, and no coloured background behind icons.
