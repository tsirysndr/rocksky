import { useAtomValue } from "jotai";
import { useState } from "react";
import { profileAtom } from "../../atoms/profile";
import { OnboardingModal, WelcomeBanner } from "../../components/Onboarding";
import { useProfileStatsByDidQuery } from "../../hooks/useProfile";
import Main from "../../layouts/Main";
import Feed from "./feed";
import Stories from "./stories";

const Home = () => {
  const jwt = localStorage.getItem("token");
  const loggedInProfile = useAtomValue(profileAtom);
  const ownerDid = loggedInProfile?.did || localStorage.getItem("did") || "";
  const stats = useProfileStatsByDidQuery(ownerDid);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => !!ownerDid && !!localStorage.getItem(`rocksky:home-welcome:${ownerDid}`),
  );

  const isNewUser =
    !!jwt &&
    !!ownerDid &&
    stats.data !== undefined &&
    (stats.data?.scrobbles ?? 0) === 0;

  const onDismiss = () => {
    setDismissed(true);
    if (ownerDid) {
      localStorage.setItem(`rocksky:home-welcome:${ownerDid}`, "1");
    }
  };

  return (
    <Main>
      <div className="mt-[50px]">
        {isNewUser && !dismissed && (
          <WelcomeBanner
            displayName={loggedInProfile?.displayName}
            onShowSteps={() => setIsOnboardingOpen(true)}
            onDismiss={onDismiss}
          />
        )}
        {jwt && <Stories />}
        <Feed />
      </div>
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        displayName={loggedInProfile?.displayName}
      />
    </Main>
  );
};

export default Home;
