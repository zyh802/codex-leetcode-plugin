export type JudgeOperation = "run" | "submit";
export type JudgeResultTone = "idle" | "working" | "success" | "failure" | "warning";

export interface JudgeResultMetric {
  label: string;
  value: string;
}

export interface JudgeResultDetail {
  label: string;
  value: string;
}

export interface JudgeResultPresentation {
  tone: JudgeResultTone;
  eyebrow: string;
  title: string;
  message: string;
  metrics: JudgeResultMetric[];
  details: JudgeResultDetail[];
}

type UnknownRecord = Record<string, unknown>;

export function presentJudgeResult(
  value: unknown,
  operation: JudgeOperation | null,
): JudgeResultPresentation | null {
  if (!isRecord(value) || typeof value.terminal !== "boolean") return null;
  if (!value.terminal) {
    return {
      tone: "working",
      eyebrow: operationLabel(operation),
      title: "正在判题",
      message: "力扣仍在处理这次请求，可继续等待或稍后查询。",
      metrics: [],
      details: [],
    };
  }

  const metrics = collectMetrics(value);
  if (value.accepted === true) {
    return {
      tone: "success",
      eyebrow: operationLabel(operation),
      title: operation === "submit" ? "提交成功" : "运行通过",
      message: operation === "submit" ? "代码已通过全部测试用例。" : "本次运行结果符合预期。",
      metrics,
      details: [],
    };
  }

  const status = stringValue(value.statusMessage);
  const failure = describeFailure(status);
  return {
    tone: "failure",
    eyebrow: operationLabel(operation),
    title: failure.title,
    message: failure.message,
    metrics,
    details: collectDetails(value),
  };
}

function collectMetrics(value: UnknownRecord): JudgeResultMetric[] {
  const metrics: JudgeResultMetric[] = [];
  const passed = numberValue(value.passedTestcases);
  const total = numberValue(value.totalTestcases);
  if (passed !== null || total !== null) {
    metrics.push({
      label: "测试用例",
      value: passed !== null && total !== null ? `${passed} / ${total}` : String(passed ?? total),
    });
  }
  const runtime = stringValue(value.runtime);
  if (runtime) metrics.push({ label: "运行时间", value: runtime });
  const memory = stringValue(value.memory);
  if (memory) metrics.push({ label: "内存占用", value: memory });
  return metrics;
}

function collectDetails(value: UnknownRecord): JudgeResultDetail[] {
  const details: JudgeResultDetail[] = [];
  pushDetail(details, "编译信息", value.compileError);
  pushDetail(details, "运行错误", value.runtimeError);
  pushDetail(details, "失败用例", value.lastTestcase);
  pushDetail(details, "实际输出", value.codeOutput);
  pushDetail(details, "期望输出", value.expectedOutput);
  pushDetail(details, "标准输出", value.stdOutput);
  return details;
}

function pushDetail(details: JudgeResultDetail[], label: string, value: unknown): void {
  const formatted = formatJudgeValue(value);
  if (formatted) details.push({ label, value: formatted });
}

function formatJudgeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(formatJudgeValue).filter(Boolean).join("\n");
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "无法显示这段输出。";
  }
}

function describeFailure(status: string | null): { title: string; message: string } {
  const normalized = status?.toLowerCase() ?? "";
  if (normalized.includes("wrong answer")) {
    return { title: "答案错误", message: "实际输出与期望结果不一致，请检查失败用例。" };
  }
  if (normalized.includes("compile")) {
    return { title: "编译失败", message: "代码未能通过编译，请根据下方信息修改后重试。" };
  }
  if (normalized.includes("runtime")) {
    return { title: "运行错误", message: "代码执行时发生异常，请检查错误信息和边界条件。" };
  }
  if (normalized.includes("time limit")) {
    return { title: "超出时间限制", message: "程序运行时间过长，请检查算法复杂度。" };
  }
  if (normalized.includes("memory limit")) {
    return { title: "超出内存限制", message: "程序使用了过多内存，请优化数据结构或空间复杂度。" };
  }
  if (normalized.includes("output limit")) {
    return { title: "输出超出限制", message: "程序产生了过多输出，请检查循环和调试日志。" };
  }
  if (normalized.includes("internal") || normalized.includes("system")) {
    return { title: "判题服务异常", message: "本次判题未正常完成，请稍后重试。" };
  }
  return { title: "未通过", message: "本次判题未通过，请检查下方信息后重试。" };
}

function operationLabel(operation: JudgeOperation | null): string {
  if (operation === "submit") return "提交结果";
  if (operation === "run") return "运行结果";
  return "判题结果";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
