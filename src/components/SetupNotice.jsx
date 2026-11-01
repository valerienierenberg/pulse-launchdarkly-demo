// Shown when VITE_LD_CLIENT_SIDE_ID is missing, so a new user knows what to do.
export default function SetupNotice() {
  return (
    <div className="setup">
      <h1>Almost there 👋</h1>
      <p>
        This demo needs a LaunchDarkly <b>client-side ID</b>. Set <code>VITE_LD_CLIENT_SIDE_ID</code> in your{' '}
        <code>.env</code> file (or run <code>npm run ld:setup</code>, which fills it in), then restart{' '}
        <code>npm run dev</code>.
      </p>
      <p>See README.md → “Quick start”.</p>
    </div>
  );
}
