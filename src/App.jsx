import { useEffect, useState } from 'react';
import { useInitializationStatus } from '@launchdarkly/react-sdk';
import Landing from './pages/Landing.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PersonaSwitcher from './components/PersonaSwitcher.jsx';
import LiveFlagPanel from './components/LiveFlagPanel.jsx';
import Assistant from './components/Assistant.jsx';
import Logo from './components/Logo.jsx';

// Tiny router: "/" = public landing page, "/app" = logged-in Pulse dashboard.
function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (to) => {
    window.history.pushState({}, '', to);
    setPath(to);
    window.scrollTo(0, 0);
  };
  return [path, go];
}

export default function App() {
  const [path, go] = usePath();
  const status = useInitializationStatus();
  const onDashboard = path.startsWith('/app');

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); go('/'); }}>
          <Logo /> <span>Pulse</span> <small>by ABC Company</small>
        </a>
        <nav className="tabs" aria-label="Demo sections">
          <button className={!onDashboard ? 'active' : ''} onClick={() => go('/')}>
            Landing page <span className="tag">Part 2 · Experiment</span>
          </button>
          <button className={onDashboard ? 'active' : ''} onClick={() => go('/app')}>
            Pulse app <span className="tag">Part 1 · Observability</span>
          </button>
        </nav>
        <PersonaSwitcher />
      </header>

      {status?.status === 'failed' && (
        <div className="banner warn">
          LaunchDarkly could not connect, so the app is using default flag values. Check VITE_LD_CLIENT_SIDE_ID.
        </div>
      )}

      <main>{onDashboard ? <Dashboard /> : <Landing onOpenApp={() => go('/app')} />}</main>

      <LiveFlagPanel />
      <Assistant />
    </div>
  );
}
