import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import Analytics from "../Analytics";

const show = () =>
  render(
    <HelmetProvider>
      <Analytics />
    </HelmetProvider>,
  );

test("labels the historical snapshot and changes team situation without changing the season", () => {
  show();
  expect(
    screen.getByRole("heading", { name: "Advanced Analytics" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/historical snapshot/i)).toBeInTheDocument();
  expect(screen.getByTestId("corsi-value")).toHaveTextContent("46.7%");
  fireEvent.change(screen.getByLabelText("Game situation"), {
    target: { value: "all" },
  });
  expect(screen.getByTestId("corsi-value")).toHaveTextContent("46.2%");
  expect(screen.getByText("2025–26 season")).toBeInTheDocument();
});

test("filters games and updates the selected game when it is removed by the filter", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Games" }));
  expect(screen.getByLabelText("Selected game")).toHaveTextContent("Denver");
  fireEvent.change(screen.getByLabelText("Venue"), {
    target: { value: "Home" },
  });
  expect(screen.getByLabelText("Selected game")).toHaveTextContent("Omaha");
  expect(
    screen.queryByRole("button", { name: /Feb 28/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Feb 7/ }));
  expect(screen.getByLabelText("Selected game")).toHaveTextContent(
    "St. Cloud State",
  );
});

test("filters and sorts the researched player subset and shows no matches", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Players" }));
  fireEvent.change(screen.getByLabelText("Position"), {
    target: { value: "D" },
  });
  const table = screen.getByRole("table", { name: "Player analytics" });
  expect(within(table).queryByText("Cruz Lucius")).not.toBeInTheDocument();
  expect(within(table).getByText("Justin Kipkie")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Sort by goals minus expected" }),
  );
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent(
    "Justin Kipkie",
  );
  fireEvent.change(screen.getByLabelText("Search players"), {
    target: { value: "nobody" },
  });
  expect(
    screen.getByText("No players match these filters."),
  ).toBeInTheDocument();
});

test("explains provider limitations and links the source methodology", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Sources & methods" }));
  expect(
    screen.getByRole("link", { name: "CHN glossary & coverage" }),
  ).toHaveAttribute(
    "href",
    "https://www.collegehockeynews.com/info/?d=stats-glossary",
  );
  expect(screen.getByText(/six shooting zones/i)).toBeInTheDocument();
  expect(screen.getByText(/redistribution/i)).toBeInTheDocument();
});
