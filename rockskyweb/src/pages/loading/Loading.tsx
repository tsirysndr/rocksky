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
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        backgroundColor: "#fff",
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
      }}
    >
      <Spinner $color="rgb(255, 40, 118)" />
    </div>
  );
}

export default Loading;
