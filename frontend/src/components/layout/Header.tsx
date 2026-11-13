import { Link, NavLink } from "react-router";

export default function Header() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 lg:px-8">
        <Link
          aria-label="EduTrack home"
          className="w-fit rounded-sm text-lg font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
          to="/"
        >
          EduTrack
        </Link>

        <nav aria-label="Primary navigation">
          <NavLink
            className={({ isActive }) =>
              [
                "inline-flex min-h-11 items-center rounded-sm px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                isActive
                  ? "text-primary"
                  : "text-foreground hover:text-primary",
              ].join(" ")
            }
            end
            to="/"
          >
            Home
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
