import styles from "./Skeleton.module.css";
export function Skeleton({ lines = 5 }: { lines?: number }): React.JSX.Element {
  return <div className={styles.skeleton} aria-label="正在加载">{Array.from({ length: lines }, (_, index) => <span key={index} />)}</div>;
}
