import { useCallback, useEffect, useRef, useState } from "react";
import { backend } from "./backend";
import type {
  BootstrapData,
  ImportSpecResult,
  RequestInput,
  SendResult,
} from "./types";

interface AsyncResult<T> {
  data: T | undefined;
  error: unknown;
  isPending: boolean;
  isError: boolean;
  refetch: () => Promise<T | undefined>;
}

interface MutationResult<TInput, TResult> {
  error: unknown;
  isPending: boolean;
  isError: boolean;
  mutateAsync: (input: TInput) => Promise<TResult>;
}

let bootstrapInFlight: Promise<BootstrapData> | undefined;

async function bootstrapWithRetry(): Promise<BootstrapData> {
  try {
    return await backend.bootstrap();
  } catch {
    return backend.bootstrap();
  }
}

function sharedBootstrapRequest(): Promise<BootstrapData> {
  if (!bootstrapInFlight) {
    bootstrapInFlight = bootstrapWithRetry().finally(() => {
      bootstrapInFlight = undefined;
    });
  }
  return bootstrapInFlight;
}

function useMountedRef() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

export function useBootstrap(): AsyncResult<BootstrapData> {
  const mounted = useMountedRef();
  const requestVersion = useRef(0);
  const [data, setData] = useState<BootstrapData>();
  const [error, setError] = useState<unknown>();
  const [isPending, setIsPending] = useState(true);

  const refetch = useCallback(async () => {
    const version = ++requestVersion.current;
    setIsPending(true);
    setError(undefined);
    try {
      const nextData = await sharedBootstrapRequest();
      if (mounted.current && requestVersion.current === version) {
        setData(nextData);
        setIsPending(false);
      }
      return nextData;
    } catch (nextError) {
      if (mounted.current && requestVersion.current === version) {
        setData(undefined);
        setError(nextError);
        setIsPending(false);
      }
      return undefined;
    }
  }, [mounted]);

  useEffect(() => {
    void refetch();
    return () => {
      requestVersion.current += 1;
    };
  }, [refetch]);

  return {
    data,
    error,
    isPending,
    isError: error !== undefined,
    refetch,
  };
}

function useMutation<TInput, TResult>(
  mutation: (input: TInput) => Promise<TResult>,
): MutationResult<TInput, TResult> {
  const mounted = useMountedRef();
  const pendingCount = useRef(0);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>();

  const mutateAsync = useCallback(
    async (input: TInput) => {
      pendingCount.current += 1;
      if (mounted.current) {
        setIsPending(true);
        setError(undefined);
      }
      try {
        return await mutation(input);
      } catch (nextError) {
        if (mounted.current) setError(nextError);
        throw nextError;
      } finally {
        pendingCount.current -= 1;
        if (mounted.current && pendingCount.current === 0) {
          setIsPending(false);
        }
      }
    },
    [mounted, mutation],
  );

  return {
    error,
    isPending,
    isError: error !== undefined,
    mutateAsync,
  };
}

export function useSendRequest() {
  return useMutation<RequestInput, SendResult>(backend.sendRequest);
}

export function useImportOpenAPI() {
  return useMutation<void, ImportSpecResult>(backend.importOpenAPI);
}

export function useCancelRequest() {
  return useMutation<string, boolean>(backend.cancelRequest);
}
