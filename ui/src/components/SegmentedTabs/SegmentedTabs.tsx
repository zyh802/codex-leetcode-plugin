import styles from "./SegmentedTabs.module.css";

export interface TabOption<T extends string> { value: T; label: string; disabled?: boolean }

export function SegmentedTabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<TabOption<T>>;
  onChange: (value: T) => void;
  label: string;
}): React.JSX.Element {
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          disabled={option.disabled}
          className={value === option.value ? styles.active : undefined}
          onClick={() => onChange(option.value)}
        >{option.label}</button>
      ))}
    </div>
  );
}
