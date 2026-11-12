// Pause für alle Spiele im Pausenraum (seit 1.493.0, Wunsch Patrick
// 12. November 2026: „Pausebildschirm-Games soll man auch alle pausieren
// können“). Der Rahmen um das Spiel (Spiele.jsx) hält einen Ref mit
// true/false; jedes Spiel mit eigenem Takt fragt ihn ab und lässt dann
// Zeit und Bewegung stehen. Als Ref statt Zustand, damit die Schleifen
// (requestAnimationFrame, setInterval) nicht neu starten müssen.
import { createContext, useContext } from "react";

export const PauseKontext = createContext({ current: false });
export const usePause = () => useContext(PauseKontext);
