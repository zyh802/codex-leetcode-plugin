import { create } from "zustand";
import type { CatalogStatsDto, ProblemListItemDto, ProblemSearchFilters } from "@/api/catalog/types.js";
import { catalogApi } from "@/api/catalog/catalogApi.js";
import { messageOf } from "@/api/errors.js";
import { PAGE_SIZE } from "@/config/constants.js";

export interface CatalogFilters {
  difficulty: "" | "Easy" | "Medium" | "Hard";
  category: "" | "algorithms" | "database" | "shell" | "concurrency";
  paid: "all" | "free" | "paid";
  status: "" | "solved" | "attempted" | "not_started";
  favorite: boolean;
}

interface CatalogState {
  stats: CatalogStatsDto;
  query: string;
  filters: CatalogFilters;
  problems: ProblemListItemDto[];
  selectedProblemId: number | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  sidebarScrollTop: number;
}

const initialFilters: CatalogFilters = { difficulty: "", category: "", paid: "all", status: "", favorite: false };
const initialState: CatalogState = {
  stats: { total: 0, lastUpdatedAt: null, categories: [] },
  query: "",
  filters: initialFilters,
  problems: [],
  selectedProblemId: null,
  loading: false,
  error: null,
  hasMore: false,
  sidebarScrollTop: 0,
};

export const useCatalogStore = create<CatalogState>(() => initialState);

class CatalogService {
  private generation = 0;
  private controller: AbortController | undefined;

  initialize(stats: CatalogStatsDto, query: string, problems: ProblemListItemDto[]): void {
    useCatalogStore.setState({ stats, query, problems, hasMore: problems.length === PAGE_SIZE, loading: false, error: null });
  }

  setQuery(query: string): void {
    useCatalogStore.setState({ query });
  }

  setFilter<K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]): void {
    useCatalogStore.setState((state) => ({ filters: { ...state.filters, [key]: value } }));
  }

  clearFilters(): void {
    useCatalogStore.setState({ filters: { ...initialFilters } });
  }

  clearAccountFilters(): void {
    useCatalogStore.setState((state) => ({ filters: { ...state.filters, status: "", favorite: false } }));
  }

  select(problemId: number): void {
    useCatalogStore.setState({ selectedProblemId: problemId });
  }

  setSidebarScrollTop(sidebarScrollTop: number): void {
    useCatalogStore.setState({ sidebarScrollTop });
  }

  async search(options: { append?: boolean; signedIn?: boolean } = {}): Promise<void> {
    const state = useCatalogStore.getState();
    const append = options.append === true;
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    if (!append) useCatalogStore.setState({ loading: true, error: null, problems: [] });
    try {
      const page = await catalogApi.search({
        query: state.query,
        filters: toApiFilters(state.filters, options.signedIn === true),
        limit: PAGE_SIZE,
        offset: append ? state.problems.length : 0,
      }, controller.signal);
      if (generation !== this.generation) return;
      useCatalogStore.setState((current) => ({
        problems: append ? [...current.problems, ...page] : page,
        hasMore: page.length === PAGE_SIZE,
        loading: false,
        error: null,
      }));
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation) return;
      useCatalogStore.setState({ loading: false, error: messageOf(error) });
    }
  }

  async refreshStats(): Promise<void> {
    try {
      useCatalogStore.setState({ stats: await catalogApi.stats() });
    } catch (error) {
      useCatalogStore.setState({ error: messageOf(error) });
    }
  }

  shutdown(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.generation += 1;
  }

  resetForTests(): void {
    this.shutdown();
    useCatalogStore.setState(initialState, true);
  }
}

function toApiFilters(filters: CatalogFilters, signedIn: boolean): ProblemSearchFilters {
  return {
    ...(filters.difficulty ? { difficulties: [filters.difficulty] } : {}),
    ...(filters.category ? { categories: [filters.category] } : {}),
    paid: filters.paid,
    ...(signedIn && filters.status ? { statuses: [filters.status] } : {}),
    favorite: signedIn && filters.favorite,
  };
}

export const catalogService = new CatalogService();
