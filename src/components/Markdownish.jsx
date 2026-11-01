// Very small, safe renderer for **bold**, _italic_, `code` and "- " lists in
// LLM output. No HTML is injected; everything is rendered as React text nodes.
function inline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|(?<!\w)_[^_\n]+_(?!\w))/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>;
    if (p.startsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.startsWith('_') && p.endsWith('_') && p.length > 2) return <i key={i}>{p.slice(1, -1)}</i>;
    return p;
  });
}

export default function Markdownish({ text = '' }) {
  const blocks = [];
  let list = null;
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/^#+\s*/, '').trimEnd();
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      list ??= [];
      list.push(<li key={i}>{inline(line.replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>);
      return;
    }
    if (list) {
      blocks.push(<ul key={`l${i}`}>{list}</ul>);
      list = null;
    }
    if (line.trim()) blocks.push(<p key={i}>{inline(line)}</p>);
  });
  if (list) blocks.push(<ul key="last">{list}</ul>);
  return <div className="md">{blocks}</div>;
}
