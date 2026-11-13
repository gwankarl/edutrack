export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-7xl px-4 py-5 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <p>
          © {new Date().getFullYear()} EduTrack. Self-paced learning for
          secondary students.
        </p>
      </div>
    </footer>
  );
}
