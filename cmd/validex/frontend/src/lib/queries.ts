import { useMutation, useQuery } from "@tanstack/react-query";
import { backend } from "./backend";
import type { RequestInput } from "./types";

export function useBootstrap() {
  return useQuery({
    queryKey: ["bootstrap"],
    queryFn: backend.bootstrap,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useSendRequest() {
  return useMutation({
    mutationKey: ["send-request"],
    mutationFn: (input: RequestInput) => backend.sendRequest(input),
  });
}

export function useImportOpenAPI() {
  return useMutation({
    mutationKey: ["import-openapi"],
    mutationFn: backend.importOpenAPI,
  });
}

export function useCancelRequest() {
  return useMutation({
    mutationKey: ["cancel-request"],
    mutationFn: (requestID: string) => backend.cancelRequest(requestID),
  });
}
