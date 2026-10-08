import { useState } from "react";
import { rsvpRequiresSignIn } from "../api/events";
import { useEventRsvp } from "../hooks/useEventRsvp";
import type { ArtistEvent, RsvpStatus } from "../types/event";
import SignInModal from "./SignInModal";

export default function EventRsvpButton({ event }: { event: ArtistEvent }) {
  const mutation = useEventRsvp(event.uri);
  const [signInOpen, setSignInOpen] = useState(false);
  const [error, setError] = useState(false);
  const selected = localStorage.getItem("token") ? event.viewerRsvp : undefined;
  const choose = (status: RsvpStatus) => {
    setError(false);
    if (!localStorage.getItem("token")) {
      setSignInOpen(true);
      return;
    }
    mutation.mutate(
      selected === status ? "community.lexicon.calendar.rsvp#notgoing" : status,
      {
        onError: (error) => {
          if (rsvpRequiresSignIn(error)) setSignInOpen(true);
          else setError(true);
        },
      },
    );
  };
  return (
    <div
      className="on-tour__rsvp"
      role="group"
      aria-label={`RSVP to ${event.name}`}
    >
      {(["going", "interested"] as const).map((choice) => {
        const status: RsvpStatus = `community.lexicon.calendar.rsvp#${choice}`;
        const active = selected === status;
        return (
          <button
            key={choice}
            type="button"
            aria-pressed={active}
            disabled={mutation.isPending}
            onClick={() => choose(status)}
            title={active ? "Click to clear your RSVP" : undefined}
          >
            {active ? "✓ " : ""}
            {choice === "going" ? "Going" : "Interested"}
          </button>
        );
      })}
      {error && <span role="alert">Couldn’t save RSVP. Try again.</span>}
      <SignInModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
    </div>
  );
}
