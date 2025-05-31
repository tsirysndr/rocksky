import Main from "../../layouts/Main";
import Feed from "./feed";
import NowPlayings from "./nowplayings";

const Home = () => {
  const jwt = localStorage.getItem("token");
  return (
    <Main>
      <div className="mt-[50px]">
        {jwt && <NowPlayings />}
        <Feed />
      </div>
    </Main>
  );
};

export default Home;
