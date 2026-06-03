import ThemeToggle from "./ThemeToggle.jsx";

// Persistent top bar: brand (→ home) on the left, tour + theme controls on the right.
export default function AppBar({ onHome, showTour, onTour }) {
  return (
    <header className="app-bar">
      <button className="brand" type="button" onClick={onHome} title="Back to search">
        <span className="brand-mark" aria-hidden="true">🛡️</span>
        <span>KYB Due Diligence</span>
      </button>
      <div className="app-bar-actions">
        {showTour && (
          <button
            className="icon-btn"
            type="button"
            onClick={onTour}
            aria-label="Take a tour"
            title="Take a tour"
          >
            <QuestionIcon />
          </button>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}

function QuestionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
