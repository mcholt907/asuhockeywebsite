import { useLocation } from 'react-router-dom';
import { useDataStatus } from '../hooks/queries/useDataStatus';
import './DataStatusBanner.css';

const pageDatasets = {
  '/': ['news', 'schedule', 'standings'],
  '/news': ['news'],
  '/schedule': ['schedule'],
  '/roster': ['roster'],
  '/stats': ['stats'],
  '/alumni': ['alumni'],
  '/recruiting': ['recruiting', 'transfers'],
};
const labels = {
  news: 'News', schedule: 'Schedule', standings: 'Standings', roster: 'Roster',
  stats: 'Statistics', alumni: 'Alumni', recruiting: 'Recruiting', transfers: 'Transfers',
};

function DataFreshnessBanner() {
  const { pathname } = useLocation();
  const relevant = pageDatasets[pathname.replace(/\/$/, '') || '/'] || [];
  const { data, isError } = useDataStatus(relevant.length > 0);
  const affected = data ? relevant.filter(name =>
    data.datasets.find(dataset => dataset.name === name)?.status !== 'ok') : [];

  if (!relevant.length || (!isError && !affected.length)) return null;

  return (
    <div className="container">
      <div className="data-status-banner cache" role="status">
        <svg className="warning-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
        <span>
          <strong>{isError ? 'Data freshness could not be verified.' : 'Some information may be out of date.'}</strong>
          {affected.map(name => {
            const timestamp = data.datasets.find(dataset => dataset.name === name)?.timestamp;
            const date = timestamp ? new Date(timestamp) : null;
            const validDate = date && Number.isFinite(date.getTime()) && date.getTime() <= Date.now();
            return (
              <span key={name}>
                <br />
                <small>
                  {labels[name]} — {validDate ? <>last checked <time dateTime={timestamp}>{date.toLocaleString()}</time>.</> : 'last checked time unavailable.'}
                </small>
              </span>
            );
          })}
        </span>
      </div>
    </div>
  );
}

export default DataFreshnessBanner;
