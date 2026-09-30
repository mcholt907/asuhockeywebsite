import React from "react";
import { render, screen } from "@testing-library/react";
import MobileBottomNav from "../MobileBottomNav";

// jsdom has no layout, so stub the strip's measured widths.
function stubStripWidths({ scrollWidth, clientWidth }) {
  const scroll = jest
    .spyOn(HTMLElement.prototype, "scrollWidth", "get")
    .mockImplementation(function () {
      return this.classList.contains("bottom-nav-scroll") ? scrollWidth : 0;
    });
  const client = jest
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockImplementation(function () {
      return this.classList.contains("bottom-nav-scroll") ? clientWidth : 0;
    });
  return () => {
    scroll.mockRestore();
    client.mockRestore();
  };
}

describe("MobileBottomNav", () => {
  test("renders every section, including Alumni", () => {
    const { container } = render(<MobileBottomNav />);
    const labels = [...container.querySelectorAll(".nav-label")].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual([
      "Home",
      "News",
      "Schedule",
      "Roster",
      "Stats",
      "Recruiting",
      "Alumni",
    ]);
  });

  test("hides the scroll hint when every item fits", () => {
    const restore = stubStripWidths({ scrollWidth: 338, clientWidth: 354 });
    const { container } = render(<MobileBottomNav />);
    expect(container.querySelector(".scroll-hint")).toBeNull();
    restore();
  });

  test("shows the scroll hint only when the strip overflows", () => {
    const restore = stubStripWidths({ scrollWidth: 404, clientWidth: 354 });
    const { container } = render(<MobileBottomNav />);
    expect(container.querySelector(".scroll-hint")).not.toBeNull();
    restore();
  });

  test("marks the current route active", () => {
    render(<MobileBottomNav />);
    expect(screen.getByTestId("navlink-/")).toHaveClass("active");
  });
});
