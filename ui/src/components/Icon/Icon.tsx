import { FolderOpen, Monitor, RefreshCw, Settings, UserRound } from "lucide-react";
import styles from "./Icon.module.css";

const icons = {
  settings: Settings,
  sync: RefreshCw,
  account: UserRound,
  directory: FolderOpen,
  frontend: Monitor,
} as const;

// Match CatPaw's 20px action / 24px section icon scale.
const sizes = { menu: 20, card: 24 } as const;

interface IconProps {
  name: keyof typeof icons;
  size?: keyof typeof sizes;
}

/** Decorative icons inherit the surrounding label's theme color and accessible name. */
export function Icon({ name, size = "menu" }: IconProps): React.JSX.Element {
  const Glyph = icons[name];
  return <Glyph className={styles.icon} size={sizes[size]} strokeWidth={1.8} aria-hidden="true" focusable="false" />;
}
