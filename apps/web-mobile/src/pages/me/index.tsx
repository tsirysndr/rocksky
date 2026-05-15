import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { profileAtom } from "../../atoms/profile";
import Main from "../../layouts/Main";

export default function Me() {
  const profile = useAtomValue(profileAtom);
  const navigate = useNavigate();

  useEffect(() => {
    if (profile?.handle) {
      navigate(`/profile/${profile.handle}`, { replace: true });
    }
  }, [profile, navigate]);

  return (
    <Main>
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        {!profile && (
          <>
            <span className="text-6xl opacity-20">👤</span>
            <p className="text-sm text-center px-8" style={{ color: "var(--color-text-muted)" }}>
              Sign in to view your profile
            </p>
          </>
        )}
      </div>
    </Main>
  );
}
