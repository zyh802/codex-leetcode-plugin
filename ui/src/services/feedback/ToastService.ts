import { create } from "zustand";

interface ToastState {
  id: number;
  message: string;
  tone: "success" | "error" | "neutral";
}

export const useToastStore = create<ToastState>(() => ({ id: 0, message: "", tone: "neutral" }));

class ToastService {
  private timer: number | undefined;
  show(message: string, tone: ToastState["tone"] = "neutral"): void {
    window.clearTimeout(this.timer);
    useToastStore.setState((state) => ({ id: state.id + 1, message, tone }));
    this.timer = window.setTimeout(() => useToastStore.setState({ message: "" }), 3_200);
  }
}

export const toastService = new ToastService();
