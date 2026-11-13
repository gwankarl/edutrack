import BackendStatus from "../../features/system/components/BackendStatus.js";

export default function HomePage() {
  return (
    <section>
      <h1>EduTrack</h1>
      <p>Your self-paced learning platform.</p>
      <BackendStatus />
    </section>
  );
}
