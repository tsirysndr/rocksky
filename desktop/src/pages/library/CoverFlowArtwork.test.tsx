import { beforeEach, describe, expect, it, vi } from "vitest";
import CoverFlowArtwork from "./CoverFlowArtwork";

const mocks = vi.hoisted(() => ({ details: vi.fn() }));
vi.mock("../../hooks/useNavidrome", () => ({
  useNavidromeAlbumQuery: mocks.details,
}));
vi.mock("../../components/AlbumArt", () => ({ default: "img" }));

beforeEach(() => {
  mocks.details.mockReset();
  mocks.details.mockReturnValue({ data: undefined });
});

describe("Cover Flow search artwork", () => {
  it("resolves a search album with no artwork URL using album details", () => {
    mocks.details.mockReturnValue({
      data: { coverArtUrl: "https://cdn.example/cover.jpg" },
    });
    const view = CoverFlowArtwork({ albumId: "search-album" });
    expect(mocks.details).toHaveBeenCalledWith("search-album");
    for (const image of view.props.children)
      expect(image.props.src).toBe("https://cdn.example/cover.jpg");
  });
  it("keeps supplied artwork without requesting album details", () => {
    const view = CoverFlowArtwork({
      albumId: "album",
      src: "https://cdn.example/list.jpg",
    });
    expect(mocks.details).toHaveBeenCalledWith("");
    expect(view.props.children[0].props.src).toBe(
      "https://cdn.example/list.jpg",
    );
  });
  it("accepts the alternate public URL field in album details", () => {
    mocks.details.mockReturnValue({
      data: { _coverArtUrl: "https://cdn.example/legacy.jpg" },
    });
    const view = CoverFlowArtwork({ albumId: "album" });
    expect(view.props.children[0].props.src).toBe(
      "https://cdn.example/legacy.jpg",
    );
  });
  it("does not request uploaded album details for a local or remote album", () => {
    CoverFlowArtwork({ src: null });
    expect(mocks.details).toHaveBeenCalledWith("");
  });
});
