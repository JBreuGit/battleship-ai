import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CAMPAIGN_STORAGE_KEY } from "@/game/campaign";
import { createFakeServer } from "@/test/fakeGameServer";
import BattleshipGame from "./BattleshipGame";

const client = vi.hoisted(() => ({
  startGame: vi.fn(),
  sendAction: vi.fn(),
  campaignRequest: vi.fn(),
}));

vi.mock("@/game/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/game/client")>()),
  ...client,
}));

beforeEach(() => {
  const server = createFakeServer();
  client.startGame.mockImplementation(server.startGame);
  client.sendAction.mockImplementation(server.sendAction);
  client.campaignRequest.mockImplementation(server.campaignRequest);
  window.localStorage.clear();
});

afterEach(() => {
  client.startGame.mockReset();
  client.sendAction.mockReset();
  client.campaignRequest.mockReset();
});

describe("Admiral mode UI", () => {
  it("starts an Admiral battle with the ability bar after selecting the mode", async () => {
    render(<BattleshipGame />);

    fireEvent.click(screen.getByRole("button", { name: /deploy fleet/i }));
    fireEvent.click(screen.getByRole("button", { name: /admiral/i }));
    fireEvent.click(screen.getByRole("button", { name: /random fleet/i }));
    fireEvent.click(screen.getByRole("button", { name: /commence battle/i }));

    await waitFor(() =>
      expect(screen.getByText(/recon flight/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/main-gun barrage/i)).toBeInTheDocument();
    expect(screen.getByText(/active sonar/i)).toBeInTheDocument();
    expect(screen.getByText(/rapid fire/i)).toBeInTheDocument();
    expect(screen.getByText(/silent running/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fire at A1" }),
    ).toBeInTheDocument();
    expect(client.startGame).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "admiral", difficulty: "medium" }),
    );
  });

  it("keeps classic mode as the default without an ability bar", async () => {
    render(<BattleshipGame />);

    fireEvent.click(screen.getByRole("button", { name: /deploy fleet/i }));
    fireEvent.click(screen.getByRole("button", { name: /random fleet/i }));
    fireEvent.click(screen.getByRole("button", { name: /commence battle/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Fire at A1" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/recon flight/i)).not.toBeInTheDocument();
    expect(client.startGame).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "classic" }),
    );
  });

  it("shows a notice and stays on placement when fleet command rejects the start", async () => {
    client.startGame.mockRejectedValue(new TypeError("fetch failed"));
    render(<BattleshipGame />);

    fireEvent.click(screen.getByRole("button", { name: /deploy fleet/i }));
    fireEvent.click(screen.getByRole("button", { name: /random fleet/i }));
    fireEvent.click(screen.getByRole("button", { name: /commence battle/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /fleet command did not respond/i,
      ),
    );
    expect(
      screen.getByRole("button", { name: /commence battle/i }),
    ).toBeInTheDocument();
  });
});

describe("Battle Commander campaign", () => {
  it("loads the campaign from the server and stores only the sealed token", async () => {
    render(<BattleshipGame />);

    fireEvent.click(screen.getByRole("button", { name: /deploy fleet/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /start campaign|continue campaign/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /start engagement 1/i }),
      ).toBeInTheDocument(),
    );
    expect(client.campaignRequest).toHaveBeenCalledWith({
      op: "load",
      token: null,
    });
    const saved = JSON.parse(
      window.localStorage.getItem(CAMPAIGN_STORAGE_KEY) ?? "null",
    ) as { token: string; state: { level: number } } | null;
    expect(saved?.token).toMatch(/^campaign:/);
    expect(saved?.state.level).toBe(1);
  });

  it("resumes with the stored token and starts the level through the server", async () => {
    const server = createFakeServer();
    const seeded = await server.campaignRequest({ op: "load", token: null });
    window.localStorage.setItem(
      CAMPAIGN_STORAGE_KEY,
      JSON.stringify({
        token: seeded.token,
        state: { ...seeded.state, level: 5 }, // display copy is not trusted
      }),
    );
    client.campaignRequest.mockImplementation(server.campaignRequest);
    client.startGame.mockImplementation(server.startGame);

    render(<BattleshipGame />);
    fireEvent.click(screen.getByRole("button", { name: /deploy fleet/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /start campaign|continue campaign/i }),
    );
    await waitFor(() =>
      expect(client.campaignRequest).toHaveBeenCalledWith({
        op: "load",
        token: seeded.token,
      }),
    );
    // The server's answer (level 1) wins over the edited display copy.
    fireEvent.click(
      await screen.findByRole("button", { name: /start engagement 1/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /random fleet/i }));
    fireEvent.click(screen.getByRole("button", { name: /commence battle/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Fire at A1" }),
      ).toBeInTheDocument(),
    );
    expect(client.startGame).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "campaign",
        campaignToken: seeded.token,
      }),
    );
  });

  it("falls back to a fresh campaign when the stored token is rejected", async () => {
    window.localStorage.setItem(
      CAMPAIGN_STORAGE_KEY,
      JSON.stringify({ token: "forged", state: { level: 20 } }),
    );
    render(<BattleshipGame />);

    fireEvent.click(screen.getByRole("button", { name: /deploy fleet/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /start campaign|continue campaign/i }),
    );

    await waitFor(() =>
      expect(client.campaignRequest).toHaveBeenLastCalledWith({
        op: "load",
        token: null,
      }),
    );
    const saved = JSON.parse(
      window.localStorage.getItem(CAMPAIGN_STORAGE_KEY) ?? "null",
    ) as { state: { level: number } } | null;
    expect(saved?.state.level).toBe(1);
  });
});
