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
