import { BrowserRouter, Route, Routes } from "react-router-dom";
import AlbumPage from "./pages/album";
import ArtistPage from "./pages/artist";
import HomePage from "./pages/home";
import PlaylistPage from "./pages/playlist";
import ProfilePage from "./pages/profile";
import SongPage from "./pages/song";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/:did/app.rocksky.scrobble/:rkey" element={<SongPage />} />
        <Route path="/:did/app.rocksky.song/:rkey" element={<SongPage />} />
        <Route path="/:did/app.rocksky.artist/:rkey" element={<ArtistPage />} />
        <Route path="/:did/app.rocksky.album/:rkey" element={<AlbumPage />} />
        <Route
          path="/:did/app.rocksky.playlist/:rkey"
          element={<PlaylistPage />}
        />
        <Route path="/profile/:did" element={<ProfilePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
