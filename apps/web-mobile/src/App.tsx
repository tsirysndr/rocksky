import { BrowserRouter, Route, Routes } from "react-router-dom";
import MiniPlayer from "./components/MiniPlayer";
import AlbumPage from "./pages/album";
import ApiKeysPage from "./pages/apikeys";
import StoragePage from "./pages/storage";
import ArtistPage from "./pages/artist";
import Charts from "./pages/charts";
import HomePage from "./pages/home";
import LibraryPage from "./pages/library";
import LibraryAlbumPage from "./pages/library/album";
import LibraryArtistPage from "./pages/library/artist";
import UploadPage from "./pages/library/upload";
import Me from "./pages/me";
import ProfilePage from "./pages/profile";
import Recommendations from "./pages/recommendations";
import Search from "./pages/search";
import SongPage from "./pages/song";
import ShoutEditor from "./pages/shout-editor";
import WrappedPage from "./pages/wrapped";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/charts" element={<Charts />} />
        <Route path="/recommendations" element={<Recommendations />} />
        <Route path="/wrapped" element={<WrappedPage />} />
        <Route path="/search" element={<Search />} />
        <Route path="/me" element={<Me />} />
        <Route path="/apikeys" element={<ApiKeysPage />} />
        <Route path="/storage" element={<StoragePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/upload" element={<UploadPage />} />
        <Route path="/library/:did/album/:rkey" element={<LibraryAlbumPage />} />
        <Route path="/library/:did/artist/:rkey" element={<LibraryArtistPage />} />
        <Route path="/:did/scrobble/:rkey" element={<SongPage />} />
        <Route path="/:did/song/:rkey" element={<SongPage />} />
        <Route path="/:did/artist/:rkey" element={<ArtistPage />} />
        <Route path="/:did/album/:rkey" element={<AlbumPage />} />
        <Route path="/profile/:did" element={<ProfilePage />} />
        <Route path="/shout-editor" element={<ShoutEditor />} />
      </Routes>
      <MiniPlayer />
    </BrowserRouter>
  );
}

export default App;
