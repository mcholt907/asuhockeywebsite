import { getSourceLabel } from "../newsSource";

describe("getSourceLabel", () => {
  test("maps scraped sources to short labels", () => {
    expect(getSourceLabel("TheSunDevils.com")).toBe("Official");
    expect(getSourceLabel("CollegeHockeyNews.com")).toBe("CHN");
    expect(getSourceLabel("USCHO.com")).toBe("USCHO");
  });

  test("keeps the real name for manual and other sources", () => {
    expect(getSourceLabel("The Hockey News")).toBe("The Hockey News");
    expect(getSourceLabel("State Press")).toBe("State Press");
  });

  test("tolerates a missing source", () => {
    expect(getSourceLabel(undefined)).toBe("");
  });
});
