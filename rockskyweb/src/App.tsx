import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AlbumPage from "./pages/album";
import ApiKeys from "./pages/apikeys";
import ArtistPage from "./pages/artist";
import Dropbox from "./pages/dropbox";
import DropboxWithId from "./pages/dropbox/DropboxWithId";
import GoogleDrive from "./pages/googledrive";
import GoogleDriveWithId from "./pages/googledrive/GoogleDriveWithId";
import HomePage from "./pages/home";
import Loading from "./pages/loading";
import PlaylistPage from "./pages/playlist";
import ProfilePage from "./pages/profile";
import SongPage from "./pages/song";

function App() {
  useEffect(() => {
    const root = document.getElementById("root");
    root!.classList.add("dark");
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/:did/app.rocksky.scrobble/:rkey"
          element={<SongPage key={window.location.pathname} />}
        />
        <Route
          path="/:did/app.rocksky.song/:rkey"
          element={<SongPage key={window.location.pathname} />}
        />
        <Route
          path="/:did/app.rocksky.artist/:rkey"
          element={<ArtistPage key={window.location.pathname} />}
        />
        <Route
          path="/:did/app.rocksky.album/:rkey"
          element={<AlbumPage key={window.location.pathname} />}
        />
        <Route
          path="/:did/app.rocksky.playlist/:rkey"
          element={<PlaylistPage />}
        />
        <Route
          path="/profile/:did"
          element={<ProfilePage key={window.location.pathname} />}
        />
        <Route path="/dropbox" element={<Dropbox />} />
        <Route path="/googledrive" element={<GoogleDrive />} />
        <Route
          path="/dropbox/:id"
          element={<DropboxWithId key={window.location.pathname} />}
        />
        <Route
          path="/googledrive/:id"
          element={<GoogleDriveWithId key={window.location.pathname} />}
        />
        <Route path="/apikeys" element={<ApiKeys />} />
        <Route path="/loading" element={<Loading />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
