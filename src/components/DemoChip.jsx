// Marks presenter-only demo tooling, so the audience can tell it apart from
// the Pulse product itself. Anything with this chip is NOT what end users see.
export default function DemoChip({ children = 'Demo' }) {
  return <span className="demo-chip">{children}</span>;
}
