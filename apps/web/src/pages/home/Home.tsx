import Main from "../../layouts/Main";
import Feed from "./feed";
import Stories from "./stories";

const Home = () => {
  const jwt = localStorage.getItem("token");
  return (
    <Main>
      <div className="mt-[50px]">
        {jwt && <Stories />}
        <Feed />
      </div>
    </Main>
  );
};

export default Home;
