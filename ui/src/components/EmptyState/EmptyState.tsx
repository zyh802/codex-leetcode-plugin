import styles from "./EmptyState.module.css";

export function EmptyState({ title, description, glyph = "{ }" }: { title: string; description: string; glyph?: string }): React.JSX.Element {
  return <div className={styles.empty}><span aria-hidden="true">{glyph}</span><strong>{title}</strong><p>{description}</p></div>;
}
