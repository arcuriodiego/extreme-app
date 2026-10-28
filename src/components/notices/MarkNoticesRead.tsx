"use client";

import { useEffect } from "react";
import { markNoticesRead } from "./read-actions";
import { NOTICES_READ_EVENT } from "./Bell";

/** Al abrir Avisos: quedan leídos (se siguen viendo como NUEVO en esta visita) y la campanita vuelve a cero. */
export function MarkNoticesRead() {
  useEffect(() => {
    markNoticesRead()
      .then(() => window.dispatchEvent(new Event(NOTICES_READ_EVENT)))
      .catch(() => {});
  }, []);
  return null;
}
