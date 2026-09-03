const messages = {
  appName: "力扣题库",
  workbench: "题库",
  settings: "设置",
  closeCatalog: "关闭前端",
} as const;

export type LocaleMessageKey = keyof typeof messages;
export function t(key: LocaleMessageKey): string { return messages[key]; }
