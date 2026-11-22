// Cuoc cha doc lai no tu cac cuoc con, nen sau khi ghi tra no phai lam moi
// ca cache cua cuoc con (gameKeys) lan so du gop o trang chu.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BundleInput,
  BundleSettleInput,
} from "../../../../shared/schemas";
import { getGameApi } from "../../core/container";
import { crossBalancesKeys } from "./cross-balances-query";
import { gameKeys } from "./queries";

export const bundleKeys = {
  all: ["bundles"] as const,
  detail: (bundleId: string) => ["bundles", bundleId] as const,
};

export function useBundles() {
  return useQuery({
    queryKey: bundleKeys.all,
    queryFn: () => getGameApi().bundles.list(),
  });
}

export function useBundle(bundleId: string) {
  return useQuery({
    queryKey: bundleKeys.detail(bundleId),
    queryFn: () => getGameApi().bundles.detail(bundleId),
  });
}

export function useCreateBundle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BundleInput) => getGameApi().bundles.create(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: bundleKeys.all }),
  });
}

export function useSettleBundle(bundleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BundleSettleInput) =>
      getGameApi().bundles.settle(bundleId, input),
    onSuccess: (data) => {
      queryClient.setQueryData(bundleKeys.detail(bundleId), data);
      queryClient.invalidateQueries({ queryKey: gameKeys.all });
      queryClient.invalidateQueries({ queryKey: crossBalancesKeys.all });
    },
  });
}

export function useDeleteBundle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bundleId: string) => getGameApi().bundles.remove(bundleId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: bundleKeys.all }),
  });
}
