// services/recruits-service.js
// asu_hockey_data.json keeps every recruiting class, including ones that have
// already enrolled — roster-service reads them for freshmen's EP links. The
// recruiting tracker only shows classes whose season hasn't started yet, so
// the page rolls over on its own when CURRENT_SEASON changes.

const startYear = (season) => parseInt(String(season).slice(0, 4), 10);

function upcomingRecruitingClasses(recruiting, currentSeason) {
  const current = startYear(currentSeason);
  return Object.fromEntries(
    Object.entries(recruiting || {}).filter(([season]) => {
      const year = startYear(season);
      return Number.isNaN(year) || year > current;
    }),
  );
}

module.exports = { upcomingRecruitingClasses };
