import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiShuttleTubes } from "../../../../shared/api-types";
import type {
  ShuttleEntryInput,
  ShuttleTubeInput,
  ShuttleTubeUpdateInput,
} from "../../../../shared/schemas";
import { getGameApi } from "../../core/container";

export const shuttleKeys = { all: ["shuttles"] as const };

export function useShuttleTubes(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: shuttleKeys.all,
    queryFn: () => getGameApi().shuttles.get(),
    enabled: options.enabled,
  });
}

function useShuttleMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<ApiShuttleTubes>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.setQueryData(shuttleKeys.all, data);
    },
  });
}

export function useCreateShuttleTube() {
  return useShuttleMutation((input: ShuttleTubeInput) =>
    getGameApi().shuttles.createTube(input),
  );
}

export function useUpdateShuttleTube() {
  return useShuttleMutation(
    (variables: { tubeId: string; input: ShuttleTubeUpdateInput }) =>
      getGameApi().shuttles.updateTube(variables.tubeId, variables.input),
  );
}

export function useDeleteShuttleTube() {
  return useShuttleMutation((tubeId: string) =>
    getGameApi().shuttles.removeTube(tubeId),
  );
}

export function useCreateShuttleEntry() {
  return useShuttleMutation(
    (variables: { tubeId: string; input: ShuttleEntryInput }) =>
      getGameApi().shuttles.createEntry(variables.tubeId, variables.input),
  );
}

export function useDeleteShuttleEntry() {
  return useShuttleMutation((entryId: string) =>
    getGameApi().shuttles.removeEntry(entryId),
  );
}
