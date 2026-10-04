import { useNavigation } from "@react-navigation/native";
import { useSetAtom } from "jotai";
import { authTokenAtom } from "@/src/atoms/auth";
import { storage } from "@/src/storage";
import SignIn from "./SignIn";

// Modal route wrapper: browsing is public, this screen is pushed on demand
// (actions and the profile/alerts tabs require a session).
export default function SignInScreen() {
  const navigation = useNavigation();
  const setAuthToken = useSetAtom(authTokenAtom);

  return (
    <SignIn
      onCancel={() => navigation.goBack()}
      onSuccess={() => {
        setAuthToken(storage.getToken());
        if (navigation.canGoBack()) navigation.goBack();
      }}
    />
  );
}

export { default as SignIn } from "./SignIn";
