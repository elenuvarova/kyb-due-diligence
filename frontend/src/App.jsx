import { useState, useEffect } from "react";
import "reactflow/dist/style.css";
import SearchView from "./components/SearchView.jsx";
import DossierView from "./components/DossierView.jsx";

// Deep-linkable dossiers via the URL hash (#/d/:id) so a dossier can be
// refreshed or shared. No router needed.
function readHash() {
  const m = window.location.hash.match(/^#\/d\/(.+)$/);
  return m ? m[1] : null;
}

export default function App() {
  const [dossierId, setDossierId] = useState(readHash);

  useEffect(() => {
    const onHash = () => setDossierId(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const open = (id) => {
    window.location.hash = `#/d/${id}`;
    setDossierId(id);
  };
  const back = () => {
    window.location.hash = "";
    setDossierId(null);
  };

  if (dossierId) {
    return <DossierView dossierId={dossierId} onBack={back} />;
  }
  return <SearchView onCreateDossier={open} />;
}
