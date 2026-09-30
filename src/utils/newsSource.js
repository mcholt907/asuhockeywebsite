// Display label for a news article's source, shared by the News page and the
// Home page's Trending News so both name sources the same way.
export function getSourceLabel(source = "") {
  if (source.includes("TheSunDevils")) return "Official";
  if (source.includes("CollegeHockeyNews")) return "CHN";
  if (source.includes("USCHO")) return "USCHO";
  return source; // manual/other articles show their actual source name
}
