# Stats Sortable Columns Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add clickable column-header sorting to the Skaters and Goalies tables on the Stats page, with per-tab independent sort state and a default sort of Points descending for skaters and GP descending for goalies.

**Architecture:** Extract the existing `renderTable()` function in `Stats.jsx` into a standalone `SortableTable` React component. The component owns its own `{ key, dir }` sort state, sorts a copy of its `data` prop before rendering, and applies visual indicators to the active column header. Two independent instances (one per tab) naturally give per-tab sort state.

**Tech Stack:** React (useState), plain CSS (extending existing Stats.css variables/classes), no new dependencies.

---

## Task 1: Create `SortableTable` component

**Files:**
- Create: `src/components/SortableTable.jsx`

**Step 1: Create the file with props and sort state**

```jsx
// src/components/SortableTable.jsx
import React, { useState } from 'react';

/**
 * Reusable sortable data table.
 * Props:
 *   data            - Array of row objects
 *   headers         - Array of string keys (same order as columns)
 *   defaultSortKey  - Column key to sort by on mount (must exist in headers)
 *   defaultSortDir  - 'asc' | 'desc' (default: 'desc')
 */
function SortableTable({ data, headers, defaultSortKey, defaultSortDir = 'desc' }) {
  const [sortKey, setSortKey] = useState(defaultSortKey || headers[0] || '');
  const [sortDir, setSortDir] = useState(defaultSortDir);

  // Detect if a column should sort numerically
  // Checks the first non-empty value in the column
  const isNumericColumn = (key) => {
    for (const row of data) {
      const val = row[key];
      if (val !== undefined && val !== null && val !== '') {
        return !isNaN(parseFloat(val)) && isFinite(val);
      }
    }
    return false;
  };

  // Sort a copy of data — never mutate props
  const sortedData = [...data].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];

    // Treat missing/empty as lowest value
    if (aVal === undefined || aVal === null || aVal === '') return 1;
    if (bVal === undefined || bVal === null || bVal === '') return -1;

    let comparison;
    if (isNumericColumn(sortKey)) {
      comparison = parseFloat(aVal) - parseFloat(bVal);
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }

    return sortDir === 'desc' ? -comparison : comparison;
  });

  const handleHeaderClick = (header) => {
    if (header === sortKey) {
      // Toggle direction on same column
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      // New column: default to descending for numeric, ascending for text
      setSortKey(header);
      setSortDir(isNumericColumn(header) ? 'desc' : 'asc');
    }
  };

  const getSortIndicator = (header) => {
    if (header !== sortKey) return <span className="sort-hint">⇅</span>;
    return <span className="sort-active">{sortDir === 'desc' ? '▼' : '▲'}</span>;
  };

  return (
    <div className="stat-lab-table-container custom-scrollbar">
      <table className="stat-lab-table">
        <thead>
          <tr>
            {headers.map(h => (
              <th
                key={h}
                onClick={() => handleHeaderClick(h)}
                className={`sortable-th${h === sortKey ? ' sort-active-col' : ''}`}
              >
                {h} {getSortIndicator(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, idx) => (
            <tr key={idx}>
              {headers.map(h => <td key={`${h}-${idx}`}>{row[h]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SortableTable;
```

**Step 2: Verify the file was created with no syntax errors**

```bash
node -e "require('./src/components/SortableTable.jsx')" 2>&1 || echo "(JSX won't parse in Node — that's OK, just check the file exists)"
ls src/components/SortableTable.jsx
```

Expected: file exists.

**Step 3: Commit**

```bash
git add src/components/SortableTable.jsx
git commit -m "feat(stats): add SortableTable component with per-column sort"
```

---

## Task 2: Add sort indicator styles to Stats.css

**Files:**
- Modify: `src/pages/Stats.css`

**Step 1: Append these styles at the end of `src/pages/Stats.css`**

```css
/* Sortable table column headers */
.sortable-th {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.sortable-th:hover {
  background: linear-gradient(135deg, #6b1a2a 0%, #4a1020 100%);
}

.sort-active-col {
  background: linear-gradient(135deg, #8b1a2a 0%, #5a1020 100%) !important;
  box-shadow: inset 0 -3px 0 var(--asu-gold);
}

.sort-hint {
  opacity: 0;
  margin-left: 6px;
  font-size: 0.75rem;
  transition: opacity 0.15s;
}

.sortable-th:hover .sort-hint {
  opacity: 0.6;
}

.sort-active {
  margin-left: 6px;
  font-size: 0.75rem;
  color: var(--asu-gold);
}
```

**Step 2: Commit**

```bash
git add src/pages/Stats.css
git commit -m "feat(stats): add sort indicator styles to Stats.css"
```

---

## Task 3: Wire SortableTable into Stats.jsx

**Files:**
- Modify: `src/pages/Stats.jsx`

**Step 1: Add the import at the top of Stats.jsx (after the existing imports)**

Replace the existing import block top section:
```jsx
import React, { useEffect, useState } from 'react';
import './Stats.css';
```
with:
```jsx
import React, { useEffect, useState } from 'react';
import SortableTable from '../components/SortableTable';
import './Stats.css';
```

**Step 2: Delete the `renderTable` function (lines 90–107)**

Remove this entire block:
```jsx
  const renderTable = (data, headers) => (
    <div className="stat-lab-table-container custom-scrollbar">
      <table className="stat-lab-table">
        <thead>
          <tr>
            {headers.map(h => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx}>
              {headers.map(h => <td key={`${h}-${idx}`}>{row[h]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
```

**Step 3: Replace the two `renderTable` calls in the JSX**

Find:
```jsx
      <div className="stats-data-view fade-in">
        {activeTab === 'skaters' && renderTable(stats.skaters, skaterHeaders)}
        {activeTab === 'goalies' && renderTable(stats.goalies, goalieHeaders)}
      </div>
```

Replace with:
```jsx
      <div className="stats-data-view fade-in">
        {activeTab === 'skaters' && (
          <SortableTable
            data={stats.skaters}
            headers={skaterHeaders}
            defaultSortKey="Pts."
            defaultSortDir="desc"
          />
        )}
        {activeTab === 'goalies' && (
          <SortableTable
            data={stats.goalies}
            headers={goalieHeaders}
            defaultSortKey="GP"
            defaultSortDir="desc"
          />
        )}
      </div>
```

**Step 4: Verify the page renders (dev server)**

```bash
# In one terminal:
node server.js
# In another:
npm start
# Open http://localhost:3000/stats
# - Table should load sorted by Pts. descending for Skaters
# - Clicking any column header should sort that column
# - Clicking the same header again should toggle asc/desc
# - Switching to Goalies tab should show GP desc, with independent sort state
```

**Step 5: Commit**

```bash
git add src/pages/Stats.jsx
git commit -m "feat(stats): wire SortableTable into Stats page, remove renderTable"
```

---

## Task 4: Verify defaultSortKey matches actual data key

The scraper returns column keys exactly as scraped from CHN. If the skaters default key `"Pts."` doesn't match the actual key name, the table will load unsorted.

**Step 1: Check the actual key name**

```bash
node -e "
const { scrapeCHNStats } = require('./scraper');
// Check cache instead of scraping live
const { getFromCache } = require('./src/scripts/caching-system');
const cached = getFromCache('asu_hockey_stats', true);
if (cached && cached.skaters && cached.skaters[0]) {
  console.log('Skater keys:', Object.keys(cached.skaters[0]));
  console.log('Goalie keys:', Object.keys(cached.goalies[0]));
} else {
  console.log('No cache found — start server to populate cache first');
}
"
```

**Step 2: If keys differ from `"Pts."` or `"GP"`, update the defaultSortKey props in Stats.jsx accordingly**

For example, if points key is `"Pts"` not `"Pts."`:
```jsx
defaultSortKey="Pts"
```

**Step 3: Commit if any key name correction was needed**

```bash
git add src/pages/Stats.jsx
git commit -m "fix(stats): correct defaultSortKey to match actual API key names"
```
