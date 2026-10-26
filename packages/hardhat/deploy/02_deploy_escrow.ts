//02_deploy_escrow.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
const deployEscrow: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const ARBITER =
    process.env.ARBITER_ADDRESS ||
    (hre.network.name === "localhost" || hre.network.name === "hardhat" ? deployer : undefined);
  if (!ARBITER) throw new Error("请设置 ARBITER_ADDRESS；路线 B 复用已有合约时无需重新部署");
  await hre.deployments.deploy("Escrow", { from: deployer, args: [ARBITER], log: true, autoMine: true });
};
export default deployEscrow;
deployEscrow.tags = ["Escrow", "EscrowYRH202430552808"];
