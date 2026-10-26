# 链上托管交易系统 · 区块链课程大作业

基于实验 3 的 Scaffold-ETH 2、Next.js、Wagmi/Viem、Hardhat 项目副本，实现路线 B 的所有前端功能，并加入订单时间线。原 WSL 实验目录未修改。

## 运行（WSL Ubuntu）

```bash
cd /mnt/c/Users/Lenovo/Desktop/区块链大作业/my-first-dapp
yarn install --immutable
yarn start
```

打开 http://localhost:3000/escrow，连接 MetaMask 到 POTOS Testnet（chainId 60600）。默认复用实验 3 合约，无需部署私钥、yarn chain 或重新部署合约。Node >=20.18.3，Yarn 3.2.3。

## 文档

- [大作业详细步骤](docs/大作业详细步骤.md)：环境、账户准备、运行、部署、完整三人验收、截图清单、提交、排错。
- [报告草稿与答辩](docs/报告草稿与答辩.md)：建议分工、架构、原理题、待补实际证据。
- [交易记录模板](docs/交易记录模板.csv)：填入真实交易哈希与发起账户；页面支持导出本次会话记录。
- [验证记录](docs/验证记录.md)：本次实际检查结果与未完成的外部操作。

## 合约（原实验部署）

| 合约 | 地址 | 部署区块 |
| --- | --- | --- |
| Escrow | `0x4e1c5A588C60a5329943C8d7Ef1C3498c67109F1` | 2670948 |
| YRHToken | `0xACB7549d4Fc723a158233fAea8E5177351871674` | 2670943 |

RPC：https://rpc-testnet.potos.hk ；浏览器：https://scan-testnet.potos.hk 。仲裁人以页面读取的 arbiter() 为准。

## 功能

事件恢复订单列表；链上读取状态；创建订单；approve 确认后 deposit；买家确认收货；买卖双方争议；仲裁人判给卖家或退给买家；超期退款；按账户显示角色与操作；事件时间线；会话交易 CSV。所有订单事件查询每次最多十个区块。

## 环境变量与检查

默认测试链前端无需环境变量；可选 `NEXT_PUBLIC_LOCAL_CHAIN=true` 用于本地链练习。只有重新部署测试网合约才需要在 hardhat 环境中设置 `DEPLOYER_PRIVATE_KEY` 和 `ARBITER_ADDRESS`，模板位于 `packages/hardhat/.env.example`。所有真实 .env 必须留在本地，不得提交；前端不得持有私钥。

```bash
yarn next:check-types
yarn test
python3 scripts/check-secrets.py
```

完整说明见详细步骤。订单 id 使用链上真实值；测试链三人交易、哈希、截图、学生信息需要实际补齐，不在报告中虚构。

## 交易记录（完成验收后补填）

| 操作 | 哈希 | 浏览器链接 | 发起账户 |
| --- | --- | --- | --- |
| 实验 3 Escrow 部署 | 见部署记录，待整理 | 待填 | 待填 |
| createOrder 订单 N | 待实际执行 | 待填 | A |
| approve 订单 N | 待实际执行 | 待填 | A |
| deposit 订单 N | 待实际执行 | 待填 | A |
| dispute 订单 N+1 | 待实际执行 | 待填 | B |
| resolve 订单 N+1 | 待实际执行 | 待填 | C |
| confirm 订单 N | 待实际执行 | 待填 | A |

## 来源

原代码使用 Scaffold-ETH 2（MIT 许可），保留 LICENCE 与既有组件。课程要求来自上级目录的《大作业步骤.pdf》。本次工作基于原实验副本；给出的 GitHub 地址在未登录读取时返回 404，未进行远程推送。
