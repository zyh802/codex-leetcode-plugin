import { create } from "zustand";

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
}

interface ConfirmState {
  request: ConfirmRequest | null;
}

export const useConfirmStore = create<ConfirmState>(() => ({ request: null }));

class ConfirmService {
  private resolve: ((value: boolean) => void) | undefined;

  confirm(request: ConfirmRequest): Promise<boolean> {
    this.resolve?.(false);
    useConfirmStore.setState({ request });
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  answer(value: boolean): void {
    const resolve = this.resolve;
    this.resolve = undefined;
    useConfirmStore.setState({ request: null });
    resolve?.(value);
  }
}

export const confirmService = new ConfirmService();
