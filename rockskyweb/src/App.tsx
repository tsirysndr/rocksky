import { BrowserRouter, Route, Routes } from "react-router-dom";
import HomePage from "./pages/home";
import SongPage from "./pages/song";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/songs/:id" element={<SongPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
