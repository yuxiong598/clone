# 链上托管交易系统

区块链课程大作业，采用路线 B：基于 Scaffold-ETH 2、Next.js、Wagmi/Viem 与 Hardhat，由用户通过 MetaMask 签名调用链上合约。仓库地址：https://github.com/yuxiong598/clone 。

## 运行方法

环境要求：Node.js >= 20.18.3、Yarn 3.2.3、Git。推荐在 WSL Ubuntu 的 Linux 文件系统中运行。

```bash
mkdir -p ~/projects
cd ~/projects
git clone https://github.com/yuxiong598/clone.git
cd clone

# 如果没有 yarn 命令，且已安装 Corepack，先执行：
corepack enable

yarn install --immutable
yarn start
```

终端出现 `Ready` 后，手动打开 http://localhost:3000/escrow 。保持终端运行，按 Ctrl+C 停止；若端口被占用，以终端实际输出的端口为准。

默认复用实验三已经部署的 POTOS 测试网合约，启动前端不需要部署私钥，不需要运行 `yarn chain` 或 `yarn deploy`。之后依赖未变更时，在项目根目录执行 `yarn start` 即可再次启动。

## 测试网络与合约

| 项目 | 值 |
| --- | --- |
| 网络 | POTOS Testnet |
| Chain ID | `60600` |
| 原生 gas 币 | `POT` |
| RPC | https://rpc-testnet.potos.hk |
| 区块浏览器 | https://scan-testnet.potos.hk |
| Escrow 合约 | `0x4e1c5A588C60a5329943C8d7Ef1C3498c67109F1` |
| YRHToken 合约 | `0xACB7549d4Fc723a158233fAea8E5177351871674` |
| 仲裁人 | `0xfdc6E5b9367449B4369003fb5B16ea0789013a26`（以合约 `arbiter()` 返回值为准） |

合约地址、ABI 与部署区块配置位于 `packages/nextjs/contracts/deployedContracts.ts`，网络配置位于 `packages/nextjs/scaffold.config.ts`。

在浏览器安装 MetaMask，添加上述网络并连接页面。买家需要测试 POT 和足够的 YRHToken；卖家及仲裁人需要测试 POT 支付 gas。仲裁操作必须由合约指定的仲裁人账户签名。

## 环境变量

**默认运行前端不必创建环境文件，也不必提供任何私钥。** 可选配置如下：

| 变量 | 本地文件 | 用途 |
| --- | --- | --- |
| `NEXT_PUBLIC_LOCAL_CHAIN` | `packages/nextjs/.env.local` | 默认不设置或为 `false`，使用 POTOS；只有本地链练习才设为 `true` |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | `packages/nextjs/.env.local` | 可选的 WalletConnect 项目 ID；使用自己的项目时配置 |
| `NEXT_PUBLIC_ALCHEMY_API_KEY` | `packages/nextjs/.env.local` | 可选的 Alchemy 配置；默认 POTOS RPC 无需此项 |
| `DEPLOYER_PRIVATE_KEY` | `packages/hardhat/.env` | 仅重新部署合约时需要的部署账户私钥 |
| `ARBITER_ADDRESS` | `packages/hardhat/.env` | 仅重新部署 Escrow 时指定仲裁人地址 |

环境模板位于 `packages/hardhat/.env.example`、`packages/nextjs/.env.example` 和 `packages/nextjs/.env.local.example`。仅在需要时复制为对应的本地环境文件并填写。真实 `.env*` 已被 Git 忽略，仓库只保留空值模板。私钥不得放入前端或使用公开前端变量传递；日常业务交易由 MetaMask 签名。

## 功能与操作流程

- 创建订单，校验卖家地址、金额、期限与描述。
- 付款依次执行 Token `approve` 和 Escrow `deposit`，分别签名，等待授权成功后再付款。
- 买家确认收货；买卖双方发起争议；指定仲裁人裁决；符合条件的超期订单退款。
- 从合约事件恢复订单列表，通过 `getOrder` 读取当前状态，按角色显示操作按钮。
- 展示订单事件时间线与交易链接，支持导出本次会话交易 CSV。
- 每次事件查询最多覆盖 10 个区块，最多 4 个请求并行；保存浏览器扫描进度，失败时回退串行查询。

验收流程：A 创建并支付两笔订单；B 对其中一笔发起争议；C 对争议订单仲裁退款；A 对另一笔确认收货。订单 ID 以链上实际返回值为准。首次事件同步可能较慢，请等待扫描完成。

## 交易记录

下表按实验提供的交易记录整理。部署行为复用实验三记录；订单编号沿用提交的记录表，具体调用参数和结果可通过对应交易详情及 Logs 核对。

| 操作 | 交易哈希 | 区块浏览器链接 | 发起账户 |
| --- | --- | --- | --- |
| 部署 Escrow（实验三） | [0x02d3a57f8082973a9974b659359dee3105342995887eac7543fde53d2ba0b449](https://scan-testnet.potos.hk/tx/0x02d3a57f8082973a9974b659359dee3105342995887eac7543fde53d2ba0b449) | [交易详情](https://scan-testnet.potos.hk/tx/0x02d3a57f8082973a9974b659359dee3105342995887eac7543fde53d2ba0b449) | `0x3Bce461A8928B0D8c993477BE2fE449FaB04b45e` |
| createOrder 订单 0 | [0x0a231545864d49746b75fb63f930e9acceff24067e3e4ee8e30896c0016e3041](https://scan-testnet.potos.hk/tx/0x0a231545864d49746b75fb63f930e9acceff24067e3e4ee8e30896c0016e3041) | [交易详情](https://scan-testnet.potos.hk/tx/0x0a231545864d49746b75fb63f930e9acceff24067e3e4ee8e30896c0016e3041) | `0x3Bce461A8928B0D8c993477BE2fE449FaB04b45e` |
| approve | [0xa6bac03d8c9b7f3adb2fe3cedca16698493305508e4e6a3b525b2f5e51b5494e](https://scan-testnet.potos.hk/tx/0xa6bac03d8c9b7f3adb2fe3cedca16698493305508e4e6a3b525b2f5e51b5494e) | [交易详情](https://scan-testnet.potos.hk/tx/0xa6bac03d8c9b7f3adb2fe3cedca16698493305508e4e6a3b525b2f5e51b5494e) | `0x3Bce461A8928B0D8c993477BE2fE449FaB04b45e` |
| deposit 订单 0 | [0x9b198b58757283b005ba1d904981f91bef35fc9c8e4949f8ad2aa7248bfd67e5](https://scan-testnet.potos.hk/tx/0x9b198b58757283b005ba1d904981f91bef35fc9c8e4949f8ad2aa7248bfd67e5) | [交易详情](https://scan-testnet.potos.hk/tx/0x9b198b58757283b005ba1d904981f91bef35fc9c8e4949f8ad2aa7248bfd67e5) | `0x3Bce461A8928B0D8c993477BE2fE449FaB04b45e` |
| dispute 订单 1 | [0xe6b719d507182f80aa91d8a783c8784454be2c5727198960fba2a05a4a178bd2](https://scan-testnet.potos.hk/tx/0xe6b719d507182f80aa91d8a783c8784454be2c5727198960fba2a05a4a178bd2) | [交易详情](https://scan-testnet.potos.hk/tx/0xe6b719d507182f80aa91d8a783c8784454be2c5727198960fba2a05a4a178bd2) | `0x224E3508eAa2Ed4e478151D76bCcee94716dE525` |
| resolve 订单 1 | [0x7c447b374100a2c0a67d05c8ea4e7c0f88900138b287f59ed2c9202ebfe02fe5](https://scan-testnet.potos.hk/tx/0x7c447b374100a2c0a67d05c8ea4e7c0f88900138b287f59ed2c9202ebfe02fe5) | [交易详情](https://scan-testnet.potos.hk/tx/0x7c447b374100a2c0a67d05c8ea4e7c0f88900138b287f59ed2c9202ebfe02fe5) | `0xfdc6E5b9367449B4369003fb5B16ea0789013a26` |
| confirm 订单 0 | [0xa2749ceeaa635636b34f633733ad34c2c1cfe0ddd9734fa6e71a62a08ff483e5](https://scan-testnet.potos.hk/tx/0xa2749ceeaa635636b34f633733ad34c2c1cfe0ddd9734fa6e71a62a08ff483e5) | [交易详情](https://scan-testnet.potos.hk/tx/0xa2749ceeaa635636b34f633733ad34c2c1cfe0ddd9734fa6e71a62a08ff483e5) | `0x3Bce461A8928B0D8c993477BE2fE449FaB04b45e` |

路线 B 的仲裁交易由仲裁人本人通过钱包签名。浏览器 Details 中的 From 为发起账户，Logs 中可查看 `OrderResolved` 和代币 `Transfer` 事件。

## 代码检查与测试

在项目根目录运行：

```bash
yarn next:check-types
yarn test
node scripts/check-secrets.cjs --staged --history
```

重入挑战的演示合约位于 `packages/hardhat/contracts/reentrancy/`，包括漏洞金库、攻击合约与修复金库；测试位于 `packages/hardhat/test/Reentrancy.ts`，可单独运行：

```bash
yarn workspace @se-2/hardhat test test/Reentrancy.ts
```

以上测试运行在本地 Hardhat 网络，不是挑战合约已部署测试网的证明。测试网部署地址、交易及截图应以实际执行结果为准。

## 许可

项目基于 Scaffold-ETH 2，保留原项目 MIT 许可证，见 `LICENCE`。
