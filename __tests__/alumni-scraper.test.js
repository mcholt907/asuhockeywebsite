jest.mock("../server/lib/request-helper", () => ({
  requestWithRetry: jest.fn(),
}));
const { requestWithRetry } = require("../server/lib/request-helper");
const { scrapeAlumniLive } = require("../server/scrapers/alumni");

function page(name, nextClass = "IwIohq_disabled", href = "?page=2") {
  return `<table><tbody><tr>
    <td>1.</td><td><a href="/player/123/${name}">${name} (C)</a></td>
    <td><a href="/team/10/team">Team</a></td><td><a href="/league/ahl">AHL</a></td>
    <td>5</td><td>1</td><td>2</td><td>3</td><td>0</td>
    </tr></tbody></table><a class="navigationLink ${nextClass}"
    href="/team/18066/arizona-state-univ/where-are-they-now${href}">Next</a>`;
}

beforeEach(() => requestWithRetry.mockReset());

test("stops at disabled Next links that still contain a page URL", async () => {
  requestWithRetry.mockImplementation(async (url) => {
    if (url.includes("page=")) throw new Error("Followed a disabled link");
    return { data: page(url.includes("goalies") ? "Goalie" : "Skater") };
  });
  const result = await scrapeAlumniLive();
  expect(result.skaters.map((p) => p.name)).toEqual(["Skater"]);
  expect(result.goalies.map((p) => p.name)).toEqual(["Goalie"]);
  expect(requestWithRetry).toHaveBeenCalledTimes(2);
});

test("follows enabled Next links to include later alumni pages", async () => {
  requestWithRetry.mockImplementation(async (url) => {
    if (url.includes("goalies")) return { data: page("Goalie") };
    if (url.includes("page=2")) return { data: page("Second") };
    return { data: page("First", "") };
  });
  const result = await scrapeAlumniLive();
  expect(result.skaters.map((p) => p.name)).toEqual(["First", "Second"]);
});
