"use client";

import { FormEvent, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Address as EthAddress, Hash, erc20Abi, formatUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWalletClient } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
} from "~~/hooks/scaffold-eth";
import { EscrowEvent, useEscrowIndex } from "~~/hooks/useEscrowIndex";
import { STATUS, orderInput, sameAddress } from "~~/utils/escrow";

const EVENT_LABEL: Record<string, string> = {
  OrderCreated: "创建订单",
  OrderPaid: "付款入托管",
  OrderCompleted: "确认收货",
  OrderRefunded: "超期退款",
  OrderDisputed: "发起争议",
  OrderResolved: "仲裁完成",
};
type TxRecord = { operation: string; hash: Hash; account: EthAddress; chainId: number };

export default function EscrowPage() {
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: wallet } = useWalletClient();
  const index = useEscrowIndex();
  const { contract, targetNetwork } = index;
  const client = usePublicClient({ chainId: targetNetwork.id });
  const cache = useQueryClient();
  const { data: token } = useDeployedContractInfo({ contractName: "YRHToken" });
  const { data: arbiter } = useScaffoldReadContract({ contractName: "Escrow", functionName: "arbiter" });
  const { data: orderCount } = useScaffoldReadContract({ contractName: "Escrow", functionName: "orderCount" });
  const { data: decimals } = useReadContract({
    address: token?.address,
    abi: erc20Abi,
    functionName: "decimals",
    chainId: targetNetwork.id,
  });
  const { data: symbol } = useReadContract({
    address: token?.address,
    abi: erc20Abi,
    functionName: "symbol",
    chainId: targetNetwork.id,
  });
  const { data: balance } = useReadContract({
    address: token?.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: targetNetwork.id,
    query: { enabled: !!address && !!token, refetchInterval: 12000 },
  });
  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "Escrow" });
  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("30");
  const [minutes, setMinutes] = useState("30");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [transactions, setTransactions] = useState<TxRecord[]>([]);
  const lock = useRef(false);
  const connected = !!address && chainId === targetNetwork.id;
  const created = index.events.filter(event => event.name === "OrderCreated");
  const buying = created.filter(event => sameAddress(event.buyer, address)).length;
  const selling = created.filter(event => sameAddress(event.seller, address)).length;
  const roles = [
    sameAddress(arbiter, address) ? "仲裁人" : "",
    buying ? `买家（${buying} 单）` : "",
    selling ? `卖家（${selling} 单）` : "",
  ].filter(Boolean);
  const listed = created
    .filter(event => filter === "all" || sameAddress(event.buyer, address) || sameAddress(event.seller, address))
    .slice()
    .reverse();
  const explorer = targetNetwork.blockExplorers?.default.url;

  function record(operation: string, hash: Hash, account: EthAddress) {
    setTransactions(previous => [...previous, { operation, hash, account, chainId: targetNetwork.id }]);
  }
  async function run(label: string, task: () => Promise<void>) {
    if (lock.current) return;
    if (!connected || !address || !client) {
      setError("请连接钱包并切换到目标网络");
      return;
    }
    lock.current = true;
    setPending(label);
    setError("");
    setMessage("");
    try {
      await task();
      setMessage(`${label}成功，链上状态正在同步。`);
      await cache.invalidateQueries({ predicate: query => query.queryKey[0] !== "escrow-index" });
      await index.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "交易失败或已取消");
    } finally {
      lock.current = false;
      setPending("");
    }
  }
  async function escrowWrite(
    operation: string,
    variables: Parameters<typeof writeContractAsync>[0],
    account = address,
  ) {
    if (!account) throw new Error("钱包未连接");
    const hash = await writeContractAsync(variables);
    if (!hash) throw new Error("交易未提交，请检查钱包、网络和合约地址");
    record(operation, hash, account);
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    await run("创建订单", async () => {
      if (!token || decimals === undefined || !client || !address) throw new Error("代币信息尚未加载");
      const input = orderInput(seller.trim(), address, amount.trim(), minutes.trim(), description, decimals);
      const block = await client.getBlock();
      await escrowWrite("createOrder", {
        functionName: "createOrder",
        args: [input.seller, token.address, input.amount, block.timestamp + input.duration, input.description],
      });
      setDescription("");
    });
  }
  async function action(
    id: bigint,
    operation: "deposit" | "confirm" | "dispute" | "refund" | "resolve",
    sellerWins?: boolean,
  ) {
    const signer = address;
    await run(`${operation} 订单 ${id}`, async () => {
      if (!contract || !client || !signer || !wallet) throw new Error("钱包或合约尚未就绪");
      if (operation === "deposit") {
        const order = await client.readContract({
          address: contract.address,
          abi: contract.abi,
          functionName: "getOrder",
          args: [id],
        });
        if (!sameAddress(order.buyer, signer) || order.status !== 0) throw new Error("只有待付款订单的买家可以付款");
        const available = await client.readContract({
          address: order.token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [signer],
        });
        if (available < order.amount) throw new Error("代币余额不足，请先让代币 owner 向买家增发或转账");
        setPending(`订单 ${id}：1/2 授权，请在钱包确认`);
        const hash = await wallet.writeContract({
          address: order.token,
          abi: erc20Abi,
          functionName: "approve",
          args: [contract.address, order.amount],
          account: signer,
          chain: targetNetwork,
        });
        record(`approve 订单 ${id}`, hash, signer);
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("授权交易失败，付款未发送");
        const [liveSigner] = await wallet.getAddresses();
        if (!sameAddress(liveSigner, signer) || (await wallet.getChainId()) !== targetNetwork.id)
          throw new Error("钱包账户或网络已切换，请切回原账户后重新付款");
        setPending(`订单 ${id}：2/2 付款，请再次在钱包确认`);
      }
      await escrowWrite(
        `${operation} 订单 ${id}`,
        operation === "resolve"
          ? { functionName: "resolve", args: [id, !!sellerWins] }
          : { functionName: operation, args: [id] },
        signer,
      );
    });
  }
  function exportRecords() {
    const rows = [
      "操作,交易哈希,区块浏览器链接,发起账户,chainId",
      ...transactions.map(
        tx => `${tx.operation},${tx.hash},${explorer ? `${explorer}/tx/${tx.hash}` : ""},${tx.account},${tx.chainId}`,
      ),
    ];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "交易记录.csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
      <section className="rounded-3xl bg-base-100 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="m-0 text-sm opacity-60">区块链技术与应用 · 路线 B</p>
            <h1 className="my-2 text-3xl font-bold">链上托管交易</h1>
          </div>
          <span className="badge badge-primary">{targetNetwork.name}</span>
        </div>
        <p>买家付款由合约托管；确认收货后支付卖家，发生争议由仲裁人处理。</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            当前账户
            <Address address={address} />
          </div>
          <div>
            仲裁人
            <Address address={arbiter} />
          </div>
          <div>
            你的角色：{!address ? "未连接钱包" : roles.join(" / ") || "旁观者"}
            <br />
            代币余额：{balance === undefined || decimals === undefined ? "—" : formatUnits(balance, decimals)} {symbol}
          </div>
        </div>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer">合约信息</summary>
          <div className="mt-2">
            Escrow <Address address={contract?.address} />
            代币 <Address address={token?.address} />
          </div>
        </details>
      </section>
      {!address && <div className="alert">请使用右上角连接 MetaMask。连接后可创建和操作订单。</div>}
      {address && !connected && (
        <div className="alert alert-warning">
          钱包网络不正确。
          <button className="btn btn-sm" onClick={() => switchChain({ chainId: targetNetwork.id })}>
            切换到 {targetNetwork.name}
          </button>
        </div>
      )}
      {!contract && (
        <div className="alert alert-warning">
          正在检查合约。长时间未加载请检查 RPC、网络和 deployedContracts.ts 中的地址。
        </div>
      )}
      <section className="rounded-3xl bg-base-100 p-6 shadow-sm">
        <h2 className="mt-0 text-xl font-bold">创建订单</h2>
        <form onSubmit={create} className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-2">
            卖家地址
            <input
              className="input w-full"
              required
              value={seller}
              onChange={e => setSeller(e.target.value)}
              placeholder="0x…"
            />
          </label>
          <label className="flex flex-col gap-2">
            金额（个 {symbol ?? "代币"}）
            <input
              className="input w-full"
              required
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            期限（分钟）
            <input
              className="input w-full"
              type="number"
              min="1"
              max="525600"
              step="1"
              required
              value={minutes}
              onChange={e => setMinutes(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2 md:col-span-2">
            描述
            <input
              className="input w-full"
              maxLength={500}
              required
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="例如：课程教材一本"
            />
          </label>
          <button
            className="btn btn-primary self-end"
            disabled={!connected || !contract || !token || decimals === undefined || !!pending}
          >
            创建订单
          </button>
        </form>
        <p className="mb-0 text-sm opacity-60">金额按链上 decimals 转换为最小单位；期限根据最新区块时间换算。</p>
      </section>
      <div aria-live="polite">
        {pending && (
          <div className="alert">
            <span className="loading loading-spinner loading-sm" />
            {pending}
          </div>
        )}
        {message && <div className="alert alert-success">{message}</div>}
        {error && (
          <div role="alert" className="alert alert-error break-all">
            {error}
          </div>
        )}
      </div>
      <section className="rounded-3xl bg-base-100 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">
            订单列表{" "}
            <span className="text-sm font-normal">
              事件索引 {created.length} / 链上 {orderCount?.toString() ?? "—"}
            </span>
          </h2>
          <div className="flex gap-2">
            <select
              aria-label="订单筛选"
              className="select select-sm"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            >
              <option value="all">全部订单</option>
              <option value="mine">我参与的订单</option>
            </select>
            <button className="btn btn-sm" disabled={index.isFetching} onClick={() => void cache.invalidateQueries()}>
              刷新
            </button>
          </div>
        </div>
        {index.isFetching && <p className="text-sm">正在同步链上事件：{index.progress || "连接中"}</p>}
        {index.error && (
          <p role="alert" className="text-error break-all">
            事件加载失败：{index.error.message}。可点击刷新重试。
          </p>
        )}
        {!index.isFetching && !index.error && created.length === 0 && <p>当前合约还没有订单。</p>}
        {orderCount !== undefined && BigInt(created.length) < orderCount && (
          <p className="text-warning">列表尚未同步完整，请等待扫描完成；若持续不符，请核对合约部署区块。</p>
        )}
        <div className="space-y-4">
          {listed.map(event => (
            <OrderCard
              key={event.id.toString()}
              event={event}
              events={index.events.filter(item => item.id === event.id)}
              arbiter={arbiter}
              busy={!!pending || !connected}
              action={action}
              explorer={explorer}
            />
          ))}
        </div>
      </section>
      <section className="rounded-3xl bg-base-100 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">本次会话交易记录</h2>
          <button className="btn btn-sm" disabled={!transactions.length} onClick={exportRecords}>
            导出 CSV
          </button>
        </div>
        <p className="text-sm opacity-60">
          刷新页面会清空本次会话记录，请及时导出。链上已确认的订单事件保留在时间线中。
        </p>
        <ul className="space-y-2 text-sm">
          {transactions.map(tx => (
            <li key={tx.hash} className="break-all">
              {tx.operation} ·{" "}
              {explorer ? (
                <a className="link" target="_blank" rel="noreferrer" href={`${explorer}/tx/${tx.hash}`}>
                  {tx.hash}
                </a>
              ) : (
                tx.hash
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function OrderCard({
  event,
  events,
  arbiter,
  busy,
  action,
  explorer,
}: {
  event: EscrowEvent;
  events: EscrowEvent[];
  arbiter?: EthAddress;
  busy: boolean;
  action: (
    id: bigint,
    operation: "deposit" | "confirm" | "dispute" | "refund" | "resolve",
    sellerWins?: boolean,
  ) => Promise<void>;
  explorer?: string;
}) {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const {
    data: order,
    error,
    refetch,
  } = useScaffoldReadContract({ contractName: "Escrow", functionName: "getOrder", args: [event.id] });
  const { data: decimals } = useReadContract({
    address: order?.token,
    abi: erc20Abi,
    chainId: targetNetwork.id,
    functionName: "decimals",
  });
  const { data: symbol } = useReadContract({
    address: order?.token,
    abi: erc20Abi,
    chainId: targetNetwork.id,
    functionName: "symbol",
  });
  const isBuyer = sameAddress(order?.buyer, address);
  const isSeller = sameAddress(order?.seller, address);
  const isArbiter = sameAddress(arbiter, address);
  if (error)
    return (
      <div className="alert alert-error">
        订单 {event.id.toString()} 读取失败
        <button className="btn btn-sm" onClick={() => void refetch()}>
          重试
        </button>
      </div>
    );
  if (!order) return <div className="skeleton h-28 w-full" aria-label={`正在读取订单 ${event.id}`} />;
  return (
    <article className="rounded-2xl border border-base-300 p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="my-0 text-lg font-bold">订单 #{event.id.toString()}</h3>
        <span
          className={`badge ${order.status === 2 ? "badge-success" : order.status === 4 ? "badge-error" : order.status === 3 ? "badge-warning" : "badge-info"}`}
        >
          {STATUS[order.status]}
        </span>
      </div>
      <p className="break-words">{order.description}</p>
      <div className="grid gap-3 text-sm md:grid-cols-4">
        <div>
          买家
          <Address address={order.buyer} />
        </div>
        <div>
          卖家
          <Address address={order.seller} />
        </div>
        <div>
          金额
          <br />
          <strong>
            {decimals === undefined ? `${order.amount} 最小单位` : formatUnits(order.amount, decimals)} {symbol}
          </strong>
        </div>
        <div>
          截止（本地时间）
          <br />
          {new Date(Number(order.deadline) * 1000).toLocaleString()}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {isBuyer && order.status === 0 && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void action(event.id, "deposit")}>
            付款（授权 → 托管）
          </button>
        )}
        {isBuyer && order.status === 1 && (
          <button className="btn btn-success btn-sm" disabled={busy} onClick={() => void action(event.id, "confirm")}>
            确认收货
          </button>
        )}
        {(isBuyer || isSeller) && order.status === 1 && (
          <button className="btn btn-warning btn-sm" disabled={busy} onClick={() => void action(event.id, "dispute")}>
            发起争议
          </button>
        )}
        {isBuyer && order.status === 1 && (
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => void action(event.id, "refund")}>
            超期退款（链上校验期限）
          </button>
        )}
        {isArbiter && order.status === 4 && (
          <>
            <button
              className="btn btn-success btn-sm"
              disabled={busy}
              onClick={() => void action(event.id, "resolve", true)}
            >
              判给卖家
            </button>
            <button
              className="btn btn-error btn-sm"
              disabled={busy}
              onClick={() => void action(event.id, "resolve", false)}
            >
              退给买家
            </button>
          </>
        )}
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer">订单时间线 · {events.length} 条链上事件</summary>
        <ol className="mt-3 space-y-3 border-l-2 border-primary pl-4">
          {events.map(item => (
            <li key={`${item.hash}-${item.logIndex}`}>
              <strong>
                {EVENT_LABEL[item.name] ?? item.name}
                {item.name === "OrderResolved" ? (item.sellerWins ? "：判给卖家" : "：退给买家") : ""}
              </strong>
              <span className="ml-2 opacity-60">
                区块 {item.blockNumber.toString()} · 日志 {item.logIndex}
              </span>
              <br />
              {explorer ? (
                <a className="link break-all" href={`${explorer}/tx/${item.hash}`} target="_blank" rel="noreferrer">
                  {item.hash}
                </a>
              ) : (
                <span className="break-all">{item.hash}</span>
              )}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
