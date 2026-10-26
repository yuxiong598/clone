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

// Browser storage is optional; private browsing or a full quota must not stop syncing.
function readIndex(key: string): Index | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!value || !/^\d+$/.test(value.scannedTo) || !Array.isArray(value.events)) return;
    const events: EscrowEvent[] = value.events.map((event: Record<string, unknown>) => {
      if (
        typeof event.name !== "string" ||
        typeof event.id !== "string" ||
        !/^\d+$/.test(event.id) ||
        typeof event.blockNumber !== "string" ||
        !/^\d+$/.test(event.blockNumber) ||
        typeof event.logIndex !== "number" ||
        !Number.isSafeInteger(event.logIndex) ||
        typeof event.hash !== "string" ||
        !/^0x[0-9a-fA-F]{64}$/.test(event.hash) ||
        [event.buyer, event.seller].some(
          (address) => address !== undefined && (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)),
        ) ||
        (event.sellerWins !== undefined && typeof event.sellerWins !== "boolean")
      )
        throw new Error("Invalid event cache");
      return { ...event, id: BigInt(event.id), blockNumber: BigInt(event.blockNumber) } as EscrowEvent;
    });
    return { events, scannedTo: BigInt(value.scannedTo) };
  } catch {
    return;
  }
}

function saveIndex(key: string, index: Index) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(index, (_, value) => (typeof value === "bigint" ? value.toString() : value)),
    );
  } catch {
    // Continue with the in-memory query cache.
  }
}

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
      const storageKey = `escrow-index:v1:${targetNetwork.id}:${contract.address.toLowerCase()}:${start}`;
      const previous = cache.getQueryData<Index>(queryKey) ?? readIndex(storageKey);
      // Rescan a short tail to repair shallow chain reorganizations.
      let cursor = previous ? previous.scannedTo - 9n : start;
      if (cursor < start || head < (previous?.scannedTo ?? start)) cursor = start;
      let events = previous?.events.filter((event) => event.blockNumber >= start && event.blockNumber < cursor) ?? [];
      const eventAbis = contract.abi.filter((item) => item.type === "event") as AbiEvent[];
      let concurrency = 4;
      let savedAt = Date.now();
      while (cursor <= head) {
        signal.throwIfAborted();
        const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
        for (let i = 0; i < concurrency && cursor + BigInt(i * 10) <= head; i++) {
          const fromBlock = cursor + BigInt(i * 10);
          ranges.push({ fromBlock, toBlock: fromBlock + 9n < head ? fromBlock + 9n : head });
        }
        // Commit only a complete, contiguous wave: a failed request never skips blocks.
        let batches;
        try {
          batches = await Promise.all(
            ranges.map((range) =>
              client.getLogs({
                address: contract.address,
                events: eventAbis,
                ...range,
              }),
            ),
          );
        } catch (error) {
          signal.throwIfAborted();
          if (concurrency === 1) throw error;
          concurrency = 1;
          continue;
        }
        signal.throwIfAborted();
        const end = ranges[ranges.length - 1].toBlock;
        for (const log of batches.flat()) {
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
        if (Date.now() - savedAt >= 2000 || end === head) {
          saveIndex(storageKey, { events, scannedTo: end });
          savedAt = Date.now();
        }
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
