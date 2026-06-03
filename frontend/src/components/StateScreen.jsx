// Reusable centered state for errors, not-found, and other full-panel messages.
// `tone="bad"` tints the icon for errors; `actions` is optional button(s).
export default function StateScreen({ icon = "•", tone, title, body, actions }) {
  return (
    <div className="state-screen" role={tone === "bad" ? "alert" : "status"}>
      <div className={`state-icon ${tone === "bad" ? "state-icon-bad" : ""}`} aria-hidden="true">
        {icon}
      </div>
      <h2 className="state-title">{title}</h2>
      {body && <p className="state-body">{body}</p>}
      {actions && <div className="state-actions">{actions}</div>}
    </div>
  );
}
