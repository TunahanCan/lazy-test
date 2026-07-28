export type StoreListener<T> = (state: T, previous: T) => void;
export type StoreUpdater<T> =
  | Partial<T>
  | T
  | ((state: T) => Partial<T> | T);
export type StoreSetter<T> = (
  updater: StoreUpdater<T>,
  replace?: boolean,
) => void;
export type StoreGetter<T> = () => T;
export type StoreCreator<T> = (set: StoreSetter<T>, get: StoreGetter<T>) => T;

export interface Store<T> {
  getState(): T;
  getInitialState(): T;
  setState(updater: StoreUpdater<T>, replace?: boolean): void;
  subscribe(listener: StoreListener<T>): () => void;
}

export interface StateStorage {
  getItem(name: string): string | null | Promise<string | null>;
  setItem(name: string, value: string): void | Promise<void>;
  removeItem?(name: string): void | Promise<void>;
}

export interface PersistOptions<T, P = Partial<T>> {
  name: string;
  version?: number;
  storage: StateStorage;
  partialize?: (state: T) => P;
  migrate?: (persistedState: unknown, persistedVersion: number) => P | Promise<P>;
  merge?: (persistedState: P, currentState: T) => T;
  onRehydrateStorage?: (state: T) => ((state?: T, error?: unknown) => void) | void;
}

export interface PersistedStore<T> extends Store<T> {
  readonly hydrated: Promise<void>;
  persist: {
    clearStorage(): Promise<void>;
    rehydrate(): Promise<void>;
  };
}

function resolvedValue<T>(value: T | Promise<T>): Promise<T> {
  return Promise.resolve(value);
}

export function createStore<T>(creator: StoreCreator<T>): Store<T> {
  const listeners = new Set<StoreListener<T>>();
  let state: T;

  const getState = () => state;
  const setState: StoreSetter<T> = (updater, replace = false) => {
    const previous = state;
    const patch =
      typeof updater === "function"
        ? (updater as (current: T) => Partial<T> | T)(state)
        : updater;
    if (Object.is(patch, state)) return;
    state = replace ? (patch as T) : Object.assign({}, state, patch);
    for (const listener of listeners) listener(state, previous);
  };

  state = creator(setState, getState);
  const initialState = state;

  return {
    getState,
    getInitialState: () => initialState,
    setState,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createPersistedStore<T, P = Partial<T>>(
  creator: StoreCreator<T>,
  options: PersistOptions<T, P>,
): PersistedStore<T> {
  const base = createStore(creator);
  let hydrationPromise = Promise.resolve();
  let hydrating = false;
  let hydrated = false;

  const persistState = (state: T): void => {
    if (hydrating || !hydrated) return;
    const document = JSON.stringify({
      state: options.partialize
        ? options.partialize(state)
        : (state as unknown as P),
      version: options.version ?? 0,
    });
    try {
      void resolvedValue(
        options.storage.setItem(options.name, document),
      ).catch((error) => {
        console.error("Could not persist store", options.name, error);
      });
    } catch (error) {
      console.error("Could not persist store", options.name, error);
    }
  };

  const store: PersistedStore<T> = {
    ...base,
    get hydrated() {
      return hydrationPromise;
    },
    setState(updater, replace) {
      base.setState(updater, replace);
    },
    subscribe: base.subscribe,
    persist: {
      async clearStorage() {
        if (options.storage.removeItem) {
          await options.storage.removeItem(options.name);
        }
      },
      async rehydrate() {
        if (hydrating) return hydrationPromise;
        hydrating = true;
        const afterHydration = options.onRehydrateStorage?.(base.getState());
        hydrationPromise = (async () => {
          try {
            const raw = await options.storage.getItem(options.name);
            if (raw) {
              const document = JSON.parse(raw) as {
                state?: unknown;
                version?: number;
              };
              let persisted = document.state;
              const version = Number.isInteger(document.version)
                ? Number(document.version)
                : 0;
              if (options.migrate) {
                persisted = await options.migrate(persisted, version);
              }
              const next = options.merge
                ? options.merge(persisted as P, base.getState())
                : Object.assign({}, base.getState(), persisted);
              base.setState(next as T, true);
            }
            hydrated = true;
            afterHydration?.(base.getState());
          } catch (error) {
            hydrated = true;
            afterHydration?.(undefined, error);
          } finally {
            hydrating = false;
          }
        })();
        return hydrationPromise;
      },
    },
  };

  // Actions close over the setter passed to the creator. Route those writes
  // through persistence without wrapping every action by scheduling a snapshot
  // after store notifications.
  base.subscribe((state) => persistState(state));
  void store.persist.rehydrate();
  return store;
}

export function localStorageStateStorage(): StateStorage {
  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => localStorage.setItem(name, value),
    removeItem: (name) => localStorage.removeItem(name),
  };
}
