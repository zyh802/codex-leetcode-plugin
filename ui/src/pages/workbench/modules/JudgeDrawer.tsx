import { judgeService, useJudgeStore } from "@/services/judge/JudgeService.js";
import styles from "../Workbench.module.css";

export function JudgeDrawer({ input, onInputChange, samples, selectedSample, onSampleChange }: {
  input: string;
  onInputChange: (value: string) => void;
  samples: Array<{ ordinal: number; input: string }>;
  selectedSample: string;
  onSampleChange: (value: string) => void;
}): React.JSX.Element {
  const state = useJudgeStore();
  const result = state.result;
  return (
    <section className={styles.judgeDrawer} data-open={state.drawerOpen}>
      <button className={styles.judgeSummary} type="button" aria-expanded={state.drawerOpen} onClick={() => judgeService.setDrawerOpen(!state.drawerOpen)}>
        <span>{state.drawerOpen ? "⌄" : "›"} 远程判题</span>
        <small>{state.currentJobId ? `${state.operation === "submit" ? "提交" : "运行"}任务 #${state.currentJobId}` : ""}</small>
      </button>
      {state.drawerOpen ? <div className={styles.judgeBody}>
        <p>“运行”使用下方输入；“提交”每次都要求确认，网络不确定时不会自动重发。</p>
        <label className={styles.sampleSelect}><span>测试输入</span><select value={selectedSample} onChange={(event) => onSampleChange(event.target.value)}><option value="custom">自定义输入</option>{samples.map((sample) => <option key={sample.ordinal} value={String(sample.ordinal)}>样例 {sample.ordinal}</option>)}</select></label>
        <textarea value={input} onChange={(event) => onInputChange(event.target.value)} aria-label="自定义测试输入" spellCheck={false} placeholder="自定义输入；留空时发送空输入" />
        <section className={`${styles.resultCard} ${styles[result.tone]}`} role="status" aria-live="polite">
          <div className={styles.resultHeader}><span className={styles.resultIcon}>{result.tone === "success" ? "✓" : result.tone === "failure" ? "!" : result.tone === "working" ? "…" : "›"}</span><div><small>{result.eyebrow}</small><h3>{result.title}</h3><p>{result.message}</p></div></div>
          {result.metrics.length ? <dl className={styles.metrics}>{result.metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl> : null}
          {result.details.length ? <div className={styles.resultDetails}>{result.details.map((detail) => <section key={detail.label}><h4>{detail.label}</h4><pre>{detail.value}</pre></section>)}</div> : null}
        </section>
      </div> : null}
    </section>
  );
}
