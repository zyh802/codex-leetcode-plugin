import { confirmService, useConfirmStore } from "./ConfirmService.js";
import styles from "./ConfirmDialog.module.css";

export function ConfirmDialogHost(): React.JSX.Element | null {
  const request = useConfirmStore((state) => state.request);
  if (request === null) return null;
  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={() => confirmService.answer(false)}>
      <section className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="confirm-title">{request.title}</h2>
        <p>{request.message}</p>
        <div className={styles.actions}>
          <button className="button quiet" type="button" onClick={() => confirmService.answer(false)}>取消</button>
          <button className={`button ${request.tone === "danger" ? "danger" : "primary"}`} type="button" autoFocus onClick={() => confirmService.answer(true)}>
            {request.confirmLabel ?? "确认"}
          </button>
        </div>
      </section>
    </div>
  );
}
