"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AbiEvent, Address, Hash, decodeEventLog } from "viem";
import { usePublicClient } from "wagmi";
import { useDeployedContractInfo, useTargetNetwork } from "~~/hooks/scaffold-eth";

export type EscrowEvent = {
  name: string;
  id: bigint;
  buyer?: Address;
  seller?: Address;
  sellerWins?: boolean;
  blockNumber: bigint;
  logIndex: number;
  hash: Hash;
};
type Index = { events: EscrowEvent[]; scannedTo: bigint };

// One shared index serves the order list and all timelines.
// POTOS allows at most ten inclusive blocks per eth_getLogs request.
export function useEscrowIndex() {
  const { targetNetwork } = useTargetNetwork();
  const { data: contract } = useDeployedContractInfo({ contractName: "Escrow" });
  const client = usePublicClient({ chainId: targetNetwork.id });
  const cache = useQueryClient();
  const [progress, setProgress] = useState("");
  const start = BigInt(contract && "deployedOnBlock" in contract ? (contract.deployedOnBlock ?? 0) : 0);
  const queryKey = ["escrow-index", targetNetwork.id, contract?.address, start.toString()];
  const query = useQuery({
    queryKey,
    enabled: !!client && !!contract,
    refetchInterval: 12000,
    retry: 1,
    queryFn: async ({ signal }): Promise<Index> => {
      if (!client || !contract) throw new Error("合约或 RPC 尚未就绪");
      const head = await client.getBlockNumber({ cacheTime: 0 });
      const previous = cache.getQueryData<Index>(queryKey);
      // Rescan a short tail to repair shallow chain reorganizations.
      let cursor = previous ? previous.scannedTo - 9n : start;
      if (cursor < start || head < (previous?.scannedTo ?? start)) cursor = start;
      let events = previous?.events.filter(event => event.blockNumber < cursor) ?? [];
      const eventAbis = contract.abi.filter(item => item.type === "event") as AbiEvent[];
      while (cursor <= head) {
        signal.throwIfAborted();
        const end = cursor + 9n < head ? cursor + 9n : head;
        const logs = await client.getLogs({
          address: contract.address,
          events: eventAbis,
          fromBlock: cursor,
          toBlock: end,
        });
        signal.throwIfAborted();
        for (const log of logs) {
          if (log.blockNumber === null || log.logIndex === null || !log.transactionHash) continue;
          const decoded = decodeEventLog({ abi: contract.abi, data: log.data, topics: log.topics });
          const args = decoded.args as { id?: bigint; buyer?: Address; seller?: Address; sellerWins?: boolean };
          if (args.id === undefined) continue;
          events.push({
            name: decoded.eventName,
            ...args,
            id: args.id,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
            hash: log.transactionHash,
          });
        }
        // Checkpoint each batch so retries resume after RPC errors.
        cache.setQueryData<Index>(queryKey, { events: [...events], scannedTo: end });
        setProgress(`${end.toString()} / ${head.toString()}`);
        cursor = end + 1n;
      }
      events = events.sort((a, b) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
      );
      return { events, scannedTo: head };
    },
  });
  return { ...query, events: query.data?.events ?? [], progress, contract, targetNetwork };
}
