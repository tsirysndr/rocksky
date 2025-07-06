import { useSearch } from "@tanstack/react-router";
import { Spinner } from "baseui/spinner";
import { useEffect } from "react";
import { API_URL } from "../../consts";

function Loading() {
  const { handle } = useSearch({ strict: false });

  useEffect(() => {
    if (handle) {
      window.location.href = `${API_URL}/login?handle=${handle}`;
    }
  }, [handle]);

  return (
    <div className="flex justify-center items-center h-screen bg-[#fff] fixed top-0 left-0 w-full">
      <Spinner $color="rgb(255, 40, 118)" />
    </div>
  );
}

export default Loading;
