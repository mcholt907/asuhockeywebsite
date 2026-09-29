// Tests for the /api/recruits season filter
// Run: npx jest --config jest.server.config.js

const { upcomingRecruitingClasses } = require("../server/services/recruits-service");

describe("upcomingRecruitingClasses", () => {
  const recruiting = {
    "2025-2026": [{ name: "Old Class" }],
    "2026-2027": [{ name: "Enrolled Freshman" }],
    "2027-2028": [{ name: "Next Year" }],
    "2028-2029": [{ name: "Later" }],
  };

  test("drops classes whose season has already started", () => {
    expect(upcomingRecruitingClasses(recruiting, "2026-2027")).toEqual({
      "2027-2028": [{ name: "Next Year" }],
      "2028-2029": [{ name: "Later" }],
    });
  });

  test("returns everything when all classes are in the future", () => {
    expect(
      Object.keys(upcomingRecruitingClasses(recruiting, "2024-2025")),
    ).toEqual(["2025-2026", "2026-2027", "2027-2028", "2028-2029"]);
  });

  test("keeps keys it cannot parse rather than silently hiding them", () => {
    expect(
      upcomingRecruitingClasses({ Unsorted: [{ name: "X" }] }, "2026-2027"),
    ).toEqual({ Unsorted: [{ name: "X" }] });
  });

  test("tolerates a missing recruiting object", () => {
    expect(upcomingRecruitingClasses(undefined, "2026-2027")).toEqual({});
  });
});
