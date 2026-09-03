import { describe, expect, it } from "vitest";
import { presentJudgeResult } from "../ui/src/judge-result.js";

describe("judge result presentation", () => {
  it("turns an accepted submission into a success card", () => {
    expect(presentJudgeResult({
      terminal: true,
      statusMessage: "Accepted",
      accepted: true,
      passedTestcases: 12,
      totalTestcases: 12,
      runtime: "1 ms",
      memory: "10 MB",
    }, "submit")).toEqual({
      tone: "success",
      eyebrow: "提交结果",
      title: "提交成功",
      message: "代码已通过全部测试用例。",
      metrics: [
        { label: "测试用例", value: "12 / 12" },
        { label: "运行时间", value: "1 ms" },
        { label: "内存占用", value: "10 MB" },
      ],
      details: [],
    });
  });

  it("labels failure details without exposing backend field names", () => {
    const presentation = presentJudgeResult({
      terminal: true,
      statusMessage: "Compile Error",
      accepted: false,
      passedTestcases: 0,
      totalTestcases: 1,
      compileError: "Line 3: missing semicolon",
      lastTestcase: "[1, 2]",
    }, "submit");

    expect(presentation).toMatchObject({
      tone: "failure",
      title: "编译失败",
      details: [
        { label: "编译信息", value: "Line 3: missing semicolon" },
        { label: "失败用例", value: "[1, 2]" },
      ],
    });
    expect(JSON.stringify(presentation)).not.toContain("compileError");
    expect(JSON.stringify(presentation)).not.toContain("lastTestcase");
  });

  it("hides pending ticket fields behind a friendly waiting state", () => {
    const presentation = presentJudgeResult({
      jobId: 42,
      remoteId: "secret-ticket",
      terminal: false,
      state: "PENDING",
    }, "run");

    expect(presentation).toMatchObject({ tone: "working", title: "正在判题" });
    expect(JSON.stringify(presentation)).not.toContain("secret-ticket");
    expect(JSON.stringify(presentation)).not.toContain("PENDING");
  });
});
