import React from "react";
import { screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import Home from "../Home";
import { renderWithQueryClient } from "../../test-utils/renderWithQueryClient";

jest.mock("../../services/api", () => ({
  getSchedule: jest.fn(),
  getNews: jest.fn(),
  getStandings: jest.fn(),
}));

const { getSchedule, getNews, getStandings } = require("../../services/api");

const renderHome = () =>
  renderWithQueryClient(
    <HelmetProvider>
      <Home />
    </HelmetProvider>,
  );

const team = {
  rank: "9",
  team: "Arizona State",
  pts: "22",
  confRecord: "7-16-1",
  overallRecord: "14-21-1",
  isASU: true,
};

describe("Home standings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSchedule.mockResolvedValue({ data: [], team_record: {} });
    getNews.mockResolvedValue({ data: [] });
  });

  test("labels prior-season standings with the returned season", async () => {
    getStandings.mockResolvedValue({
      data: [team],
      season: "2025-2026",
      isPriorSeason: true,
    });

    renderHome();

    expect(
      await screen.findByRole("heading", {
        name: "2025-26 NCHC Standings",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Arizona State")).toBeInTheDocument();
  });

  test("labels current standings with the returned season", async () => {
    getStandings.mockResolvedValue({
      data: [team],
      season: "2026-2027",
      isPriorSeason: false,
    });

    renderHome();

    expect(
      await screen.findByRole("heading", {
        name: "2026-27 NCHC Standings",
      }),
    ).toBeInTheDocument();
  });
});
