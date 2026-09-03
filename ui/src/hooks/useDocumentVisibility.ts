import { useEffect, useState } from "react";
export function useDocumentVisibility(): DocumentVisibilityState {
  const [visibility, setVisibility] = useState(document.visibilityState);
  useEffect(() => {
    const update = (): void => setVisibility(document.visibilityState);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visibility;
}
