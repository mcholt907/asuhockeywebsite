import React from 'react';

const POSITIONS = [
  { value: 'all', label: 'All' },
  { value: 'g',   label: 'Goaltenders' },
  { value: 'd',   label: 'Defensemen' },
  { value: 'f',   label: 'Forwards' },
];

function PositionFilter({ value, onChange }) {
  return (
    <div className="roster-controls">
      <div className="position-filter">
        {POSITIONS.map(p => (
          <button
            key={p.value}
            className={value === p.value ? 'active' : ''}
            onClick={() => onChange(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default PositionFilter;
