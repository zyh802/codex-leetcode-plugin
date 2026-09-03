export function StatusView({ message, tone = "neutral" }: { message: string; tone?: "neutral" | "working" | "success" | "error" }): React.JSX.Element | null {
  return message ? <p className="status-view" data-tone={tone} role="status">{message}</p> : null;
}
