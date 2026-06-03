import { useState, useEffect } from "react";
import "reactflow/dist/style.css";
import SearchView from "./components/SearchView.jsx";
import DossierView from "./components/DossierView.jsx";
import AppBar from "./components/AppBar.jsx";
import Tour from "./components/Tour.jsx";

// Deep-linkable dossiers via the URL hash (#/d/:id) so a dossier can be
// refreshed or shared. No router needed.
function readHash() {
  const m = window.location.hash.match(/^#\/d\/(.+)$/);
  return m ? m[1] : null;
}

const TOUR_KEY = "kyb-tour-seen";

export default function App() {
  const [dossierId, setDossierId] = useState(readHash);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setDossierId(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Auto-run the tour once, on the search screen, for first-time visitors.
  useEffect(() => {
    if (dossierId) return;
    let seen = false;
    try {
      seen = !!localStorage.getItem(TOUR_KEY);
    } catch {
      seen = true;
    }
    if (seen) return;
    const t = setTimeout(() => setTourOpen(true), 500);
    return () => clearTimeout(t);
  }, [dossierId]);

  const open = (id) => {
    window.location.hash = `#/d/${id}`;
    setDossierId(id);
  };
  const back = () => {
    window.location.hash = "";
    setDossierId(null);
  };
  const closeTour = () => {
    setTourOpen(false);
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <AppBar onHome={back} showTour={!dossierId} onTour={() => setTourOpen(true)} />
      {dossierId ? (
        <DossierView dossierId={dossierId} onBack={back} />
      ) : (
        <SearchView onCreateDossier={open} />
      )}
      {!dossierId && <Tour open={tourOpen} onClose={closeTour} />}
    </>
  );
}
