import SignupForm from "./_components/SignupForm";

export default function Home() {
  return (
    <main className="page">
      <h1>Get the playlist</h1>
      <p>
        Every 45 days you&rsquo;ll get a new shared playlist by text or email.
        Sign up once, that&rsquo;s it.
      </p>
      <SignupForm />
    </main>
  );
}
