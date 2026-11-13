import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <section>
      <h1>Page not found</h1>
      <p>The page you requested does not exist.</p>
      <Link to="/">Return to the home page</Link>
    </section>
  );
}
