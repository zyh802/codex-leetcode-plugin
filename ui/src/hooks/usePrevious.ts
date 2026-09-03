import { useEffect, useRef } from "react";
export function usePrevious<T>(value: T): T | undefined {
  const reference = useRef<T | undefined>(undefined);
  useEffect(() => { reference.current = value; }, [value]);
  return reference.current;
}
