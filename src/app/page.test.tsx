import { fireEvent, render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home", () => {
  it("renders the splash screen with the logo lockup and Deploy Fleet CTA", () => {
    render(<Home />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /dutch navy.*devin ai/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /deploy fleet/i }),
    ).toBeInTheDocument();
  });

  it("enters the placement screen after clicking Deploy Fleet", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /deploy fleet/i }));
    expect(
      screen.getByRole("button", { name: /random fleet/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /deploy fleet/i }),
    ).not.toBeInTheDocument();
  });
});
