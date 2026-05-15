import { BrowserRouter, Route, Routes } from "react-router-dom";
import AlbumPage from "./pages/album";
import ArtistPage from "./pages/artist";
import Charts from "./pages/charts";
import HomePage from "./pages/home";
import Me from "./pages/me";
import ProfilePage from "./pages/profile";
import Search from "./pages/search";
import SongPage from "./pages/song";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/charts" element={<Charts />} />
        <Route path="/search" element={<Search />} />
        <Route path="/me" element={<Me />} />
        <Route path="/:did/scrobble/:rkey" element={<SongPage />} />
        <Route path="/:did/song/:rkey" element={<SongPage />} />
        <Route path="/:did/artist/:rkey" element={<ArtistPage />} />
        <Route path="/:did/album/:rkey" element={<AlbumPage />} />
        <Route path="/profile/:did" element={<ProfilePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
