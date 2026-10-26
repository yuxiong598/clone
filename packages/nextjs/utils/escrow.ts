import { Address, isAddress, parseUnits } from "viem";

export const STATUS = ["Created 待付款", "Paid 已托管", "Completed 已完成", "Refunded 已退款", "Disputed 争议中"];
export const sameAddress = (left?: string, right?: string) =>
  !!left && !!right && left.toLowerCase() === right.toLowerCase();

export function orderInput(
  seller: string,
  buyer: string,
  amount: string,
  minutes: string,
  description: string,
  decimals: number,
) {
  if (!isAddress(seller) || /^0x0{40}$/i.test(seller)) throw new Error("请输入有效的非零卖家地址");
  if (sameAddress(seller, buyer)) throw new Error("卖家不能是当前买家");
  if (!/^\d+(\.\d+)?$/.test(amount) || (amount.split(".")[1]?.length ?? 0) > decimals)
    throw new Error(`金额必须是正数，最多 ${decimals} 位小数`);
  const units = parseUnits(amount, decimals);
  if (units <= 0n) throw new Error("金额必须大于 0");
  if (
    !/^\d+$/.test(minutes) ||
    !Number.isSafeInteger(Number(minutes)) ||
    Number(minutes) < 1 ||
    Number(minutes) > 525600
  )
    throw new Error("期限请输入 1 至 525600 的整数分钟");
  if (!description.trim()) throw new Error("请填写订单描述");
  if (description.length > 500) throw new Error("描述最多 500 个字符");
  return { seller: seller as Address, amount: units, duration: BigInt(minutes) * 60n, description: description.trim() };
}
