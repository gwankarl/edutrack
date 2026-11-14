import {
  BadgeCheck,
  CircleAlert,
  Mail,
  Shield,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { CurrentUserResponse } from "@edutrack/contracts";

interface ProfileDetailsProps {
  user: CurrentUserResponse;
}

function formatLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function ProfileDetails({ user }: ProfileDetailsProps) {
  return (
    <section
      aria-labelledby="profile-details-heading"
      className="space-y-5 rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-6"
    >
      <h2
        className="text-xl font-semibold text-foreground"
        id="profile-details-heading"
      >
        Account details
      </h2>

      <dl className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserRound aria-hidden="true" className="size-4" />
            Display name
          </dt>
          <dd className="wrap-break-word font-medium text-foreground">
            {user.displayName}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail aria-hidden="true" className="size-4" />
            Email
          </dt>
          <dd className="wrap-break-word font-medium text-foreground">
            {user.email}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield aria-hidden="true" className="size-4" />
            Account status
          </dt>
          <dd>
            <span className="inline-flex rounded-full bg-info-surface px-3 py-1 text-sm font-medium text-info">
              {formatLabel(user.accountStatus)}
            </span>
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            {user.emailVerified ? (
              <BadgeCheck aria-hidden="true" className="size-4" />
            ) : (
              <CircleAlert aria-hidden="true" className="size-4" />
            )}
            Email verification
          </dt>
          <dd>
            <span
              className={
                user.emailVerified
                  ? "inline-flex rounded-full bg-success-surface px-3 py-1 text-sm font-medium text-success"
                  : "inline-flex rounded-full bg-warning-surface px-3 py-1 text-sm font-medium text-warning"
              }
            >
              {user.emailVerified ? "Verified" : "Not verified"}
            </span>
          </dd>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <UsersRound aria-hidden="true" className="size-4" />
            Assigned roles
          </dt>
          <dd>
            {user.roles.length > 0 ? (
              <ul aria-label="Assigned roles" className="flex flex-wrap gap-2">
                {user.roles.map((role) => (
                  <li
                    className="rounded-full border border-border bg-background px-3 py-1 text-sm font-medium text-foreground"
                    key={role}
                  >
                    {formatLabel(role)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No roles assigned</p>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
