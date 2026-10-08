import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useAtomValue } from "jotai";
import { Alert, StyleSheet, TouchableOpacity, View } from "react-native";
import { authTokenAtom } from "../atoms/auth";
import { rsvpRequiresSignIn } from "../api/events";
import { useEventRsvp } from "../hooks/useEventRsvp";
import type { RootStackParamList } from "../Navigation";
import { storage } from "../storage";
import { colors } from "../theme";
import type { ArtistEvent, RsvpStatus } from "../types/event";
import { Text } from "./Text";

export default function EventRsvpButton({ event }: { event: ArtistEvent }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const token = useAtomValue(authTokenAtom);
  const mutation = useEventRsvp(event.uri);
  const selected = token ? event.viewerRsvp : undefined;
  const choose = (status: RsvpStatus) => {
    if (!storage.getToken()) {
      navigation.navigate("SignIn");
      return;
    }
    mutation.mutate(
      selected === status ? "community.lexicon.calendar.rsvp#notgoing" : status,
      {
        onError: (error) => {
          if (rsvpRequiresSignIn(error)) navigation.navigate("SignIn");
          else Alert.alert("Couldn’t save RSVP", "Please try again.");
        },
      },
    );
  };
  return (
    <View style={styles.controls}>
      {(["going", "interested"] as const).map((choice) => {
        const status: RsvpStatus = `community.lexicon.calendar.rsvp#${choice}`;
        const active = selected === status;
        return (
          <TouchableOpacity
            key={choice}
            accessibilityRole="button"
            accessibilityLabel={`${choice === "going" ? "Going to" : "Interested in"} ${event.name}`}
            accessibilityHint={active ? "Tap to clear your RSVP" : undefined}
            accessibilityState={{
              selected: active,
              disabled: mutation.isPending,
            }}
            disabled={mutation.isPending}
            onPress={() => choose(status)}
            style={[
              styles.button,
              active && styles.selected,
              mutation.isPending && { opacity: 0.5 },
            ]}
          >
            <Text style={[styles.label, active && { color: colors.primary }]}>
              {active ? "✓ " : ""}
              {choice === "going" ? "Going" : "Interested"}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  controls: { width: 84, gap: 6 },
  button: {
    minHeight: 44,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.textMuted,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.surface2 },
  label: { color: colors.text, fontSize: 11, fontWeight: "600" },
});
