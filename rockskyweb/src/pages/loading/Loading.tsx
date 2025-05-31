import { Spinner } from "baseui/spinner";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { API_URL } from "../../consts";

function Loading() {
  const { search } = useLocation();

  useEffect(() => {
    const query = new URLSearchParams(search);
    const handle = query.get("handle");

    if (handle) {
      window.location.href = `${API_URL}/login?handle=${handle}`;
    }
  }, [search]);

  return (
    <div className="flex justify-center items-center h-screen bg-[#fff] fixed top-0 left-0 w-full">
      <Spinner $color="rgb(255, 40, 118)" />
    </div>
  );
}

export default Loading;
