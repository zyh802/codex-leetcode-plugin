import { create } from "zustand";
import { problemApi } from "@/api/problem/problemApi.js";
import type { ProblemDetailDto } from "@/api/problem/types.js";
import { isAuthError, messageOf } from "@/api/errors.js";
import { eventBus } from "@/services/eventBus.js";

interface ProblemState {
  detail: ProblemDetailDto | null;
  loading: boolean;
  error: string | null;
}

const initialState: ProblemState = { detail: null, loading: false, error: null };
export const useProblemStore = create<ProblemState>(() => initialState);

class ProblemService {
  private generation = 0;
  private controller: AbortController | undefined;

  async load(problemId: number): Promise<void> {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    useProblemStore.setState({ detail: null, loading: true, error: null });
    try {
      const detail = await problemApi.get(problemId, controller.signal);
      if (generation === this.generation) useProblemStore.setState({ detail, loading: false, error: null });
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation) return;
      if (isAuthError(error)) eventBus.emit("auth:required", "登录已失效，请重新登录后再获取题面。");
      useProblemStore.setState({ detail: null, loading: false, error: messageOf(error) });
    }
  }

  shutdown(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.generation += 1;
  }
}

export const problemService = new ProblemService();
