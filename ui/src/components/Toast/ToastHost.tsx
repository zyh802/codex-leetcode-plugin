import { useToastStore } from "@/services/feedback/ToastService.js";
import styles from "./Toast.module.css";

export function ToastHost(): React.JSX.Element | null {
  const toast = useToastStore();
  return toast.message ? <div className={`${styles.toast} ${styles[toast.tone]}`} role="status">{toast.message}</div> : null;
}
