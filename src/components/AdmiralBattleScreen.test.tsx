import { fireEvent, render, screen } from "@testing-library/react";
import BattleshipGame from "./BattleshipGame";

describe("Admiral mode UI", () => {
  it("starts an Admiral battle with the ability bar after selecting the mode", () => {
    render(<BattleshipGame />);

    fireEvent.click(screen.getByRole("button", { name: /admiral/i }));
    fireEvent.click(screen.getByRole("button", { name: /random fleet/i }));
    fireEvent.click(screen.getByRole("button", { name: /commence battle/i }));

    expect(screen.getByText(/recon flight/i)).toBeInTheDocument();
    expect(screen.getByText(/main-gun barrage/i)).toBeInTheDocument();
    expect(screen.getByText(/active sonar/i)).toBeInTheDocument();
    expect(screen.getByText(/rapid fire/i)).toBeInTheDocument();
    expect(screen.getByText(/silent running/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fire at A1" }),
    ).toBeInTheDocument();
  });

  it("keeps classic mode as the default without an ability bar", () => {
    render(<BattleshipGame />);

    fireEvent.click(screen.getByRole("button", { name: /random fleet/i }));
    fireEvent.click(screen.getByRole("button", { name: /commence battle/i }));

    expect(screen.queryByText(/recon flight/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fire at A1" }),
    ).toBeInTheDocument();
  });
});
