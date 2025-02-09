import { BrowserRouter, Route, Routes } from "react-router-dom";
import HomePage from "./pages/home";
import ProfilePage from "./pages/profile";
import SongPage from "./pages/song";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/:did/app.rocksky.scrobble/:rkey" element={<SongPage />} />
        <Route path="/profile/:did" element={<ProfilePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
