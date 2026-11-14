export function SetupScreen() {
  return (
    <div className="app">
      <main className="main">
        <section className="card setup">
          <h1>Almost there: connect Firebase</h1>
          <p>Plainly needs a Firebase project to run AI. It takes about 10 minutes:</p>
          <ol>
            <li>Create a Firebase project and add a Web app.</li>
            <li>
              In <strong>AI Logic</strong>, click <em>Get started</em> and choose the <strong>Gemini Developer API</strong>.
            </li>
            <li>
              Turn on <strong>App Check</strong> with reCAPTCHA Enterprise (or a debug token for local testing).
            </li>
            <li>
              Turn on <strong>Anonymous</strong> sign-in in Authentication, and create a <strong>Firestore</strong> database.
            </li>
            <li>
              Copy <code>.env.example</code> to <code>.env.local</code>, paste your config, and restart <code>npm run dev</code>.
            </li>
          </ol>
          <p className="muted">
            To try the interface without Firebase, set <code>VITE_MOCK_AI=true</code> in <code>.env.local</code>. See README.md for details.
          </p>
        </section>
      </main>
    </div>
  );
}
