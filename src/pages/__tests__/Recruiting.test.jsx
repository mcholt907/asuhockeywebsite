import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import Recruiting from "../Recruiting";
import { renderWithQueryClient } from "../../test-utils/renderWithQueryClient";

jest.mock("../../services/api", () => ({
  getRecruits: jest.fn(),
  getTransfers: jest.fn(),
}));

import { getRecruits, getTransfers } from "../../services/api";

const renderRecruiting = () =>
  renderWithQueryClient(
    <HelmetProvider>
      <Recruiting />
    </HelmetProvider>,
  );

describe("Recruiting page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRecruits.mockResolvedValue({
      "2027-2028": [
        {
          name: "Marko Bilic",
          position: "G",
          birth_year: 2007,
          height: "6'2\"",
          weight: "185 lbs",
          birthplace: "Zagreb, Croatia",
          current_team: "Omaha Lancers",
          player_link: "https://example.com/bilic",
        },
        {
          name: "Jimmy Egan",
          position: "F",
          birth_year: 2007,
          height: "6'0\"",
          weight: "180 lbs",
          birthplace: "New York, New York",
          current_team: "USA Hockey NTDP",
          player_link: "https://example.com/egan",
        },
      ],
      "2028-2029": [
        {
          name: "Rian Marquardt",
          position: "D",
          birth_year: 2008,
          height: "6'1\"",
          weight: "190 lbs",
          birthplace: "Berlin, Germany",
          current_team: "Chicago Mission",
          player_link: "https://example.com/marquardt",
        },
      ],
    });
    getTransfers.mockResolvedValue({ incoming: [], outgoing: [] });
  });

  it("defaults projections to the 2027-2028 team", async () => {
    renderRecruiting();

    const defaultTeam = await screen.findByRole("button", {
      name: "2027-2028 Team",
    });

    expect(
      screen.getByRole("heading", { name: "Projected Future Teams" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Class$/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "2026-2027 Team" }),
    ).not.toBeInTheDocument();
    expect(defaultTeam).toHaveClass("active");
    expect(screen.getByText("Marko Bilic")).toBeInTheDocument();
    expect(screen.getByText("Jimmy Egan")).toBeInTheDocument();
    expect(screen.queryByText("Chase Hamm")).not.toBeInTheDocument();
    expect(screen.queryByText("Rian Marquardt")).not.toBeInTheDocument();
  });

  it("shows only the selected 2028-2029 team roster", async () => {
    renderRecruiting();

    await screen.findByText("Marko Bilic");

    fireEvent.click(screen.getByRole("button", { name: "2028-2029 Team" }));

    expect(screen.getByText("Rian Marquardt")).toBeInTheDocument();
    expect(screen.queryByText("Marko Bilic")).not.toBeInTheDocument();
    expect(screen.queryByText("Jimmy Egan")).not.toBeInTheDocument();
  });

  it("uses team language when the default projected roster is empty", async () => {
    getRecruits.mockResolvedValue({
      "2027-2028": [],
      "2028-2029": [
        {
          name: "Rian Marquardt",
          position: "D",
          birth_year: 2008,
          height: "6'1\"",
          weight: "190 lbs",
          birthplace: "Berlin, Germany",
          current_team: "Chicago Mission",
          player_link: "https://example.com/marquardt",
        },
      ],
    });

    renderRecruiting();

    expect(
      await screen.findByText("No players listed for the 2027-2028 team yet."),
    ).toBeInTheDocument();
  });
});
