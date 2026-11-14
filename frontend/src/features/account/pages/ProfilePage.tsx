import { CircleAlert, LoaderCircle } from "lucide-react";

import { useCurrentUser } from "../../auth/hooks/useCurrentUser.js";
import ProfileDetails from "../components/ProfileDetails.js";

export default function ProfilePage() {
  const currentUser = useCurrentUser();

  let content;

  if (currentUser.status === "loading") {
    content = (
      <p
        aria-live="polite"
        className="flex items-center gap-2 text-muted-foreground"
        role="status"
      >
        <LoaderCircle
          aria-hidden="true"
          className="size-5 animate-spin text-primary"
        />
        Loading your profile...
      </p>
    );
  } else if (currentUser.status === "unauthenticated") {
    content = (
      <p
        aria-live="polite"
        className="flex items-start gap-2 rounded-md bg-info-surface p-4 text-info"
        role="status"
      >
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        You are not signed in. Sign in to view your profile.
      </p>
    );
  } else if (currentUser.status === "error") {
    content = (
      <p
        className="flex items-start gap-2 rounded-md bg-danger-surface p-4 text-danger"
        role="alert"
      >
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        We couldn’t load your profile right now. Please try again later.
      </p>
    );
  } else {
    content = <ProfileDetails user={currentUser.user} />;
  }

  return (
    <section
      aria-labelledby="profile-page-heading"
      className="mx-auto max-w-3xl space-y-6"
    >
      <header className="space-y-2">
        <h1
          className="text-2xl font-bold text-foreground sm:text-3xl"
          id="profile-page-heading"
        >
          My profile
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          View your account information and assigned roles.
        </p>
      </header>

      {content}
    </section>
  );
}
