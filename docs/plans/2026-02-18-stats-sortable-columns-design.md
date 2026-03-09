# Stats Page Sortable Columns — Design Doc

**Date:** 2026-02-18
**Feature:** Clickable column headers that sort the stats tables

## Problem

The Stats page tables (Skaters and Goalies) are currently read-only — rows appear in the order returned by the API. Users have no way to rank players by a specific stat.

## Approach

Extract the existing `renderTable()` function into a dedicated `SortableTable` React component that owns its own sort state. Each tab (Skaters, Goalies) gets an independent component instance, so their sort states are naturally isolated.

## Component Design

### `src/components/SortableTable.jsx`

**Props:**
| Prop | Type | Description |
|---|---|---|
| `data` | `Array<Object>` | Rows to display |
| `headers` | `Array<string>` | Column keys/labels (same as current) |
| `defaultSortKey` | `string` | Column to sort by on mount |
| `defaultSortDir` | `'asc' \| 'desc'` | Initial sort direction |

**Internal state:** `{ key: string, dir: 'asc' | 'desc' }`

### Sort Logic
- Click a header → sort that column descending; click the same header again → toggle direction
- **Numeric detection:** `parseFloat` the first non-null value in the column — if valid, sort numerically; otherwise sort alphabetically (case-insensitive)
- Sorted data is computed inline (no memoization needed at this scale)

### Visual Indicators
- Active sorted column: header text + `▲` (asc) or `▼` (desc)
- Inactive columns: `⇅` appears on hover to signal clickability
- Active column header gets a subtle CSS highlight

## Integration in Stats.jsx

Replace `renderTable(stats.skaters, skaterHeaders)` and `renderTable(stats.goalies, goalieHeaders)` with:

```jsx
<SortableTable
  data={stats.skaters}
  headers={skaterHeaders}
  defaultSortKey="Pts."
  defaultSortDir="desc"
/>

<SortableTable
  data={stats.goalies}
  headers={goalieHeaders}
  defaultSortKey="GP"
  defaultSortDir="desc"
/>
```

## Files Changed

| File | Change |
|---|---|
| `src/components/SortableTable.jsx` | New component |
| `src/pages/Stats.jsx` | Replace `renderTable` calls, import `SortableTable` |
| `src/pages/Stats.css` | Add sort indicator + hover styles |
