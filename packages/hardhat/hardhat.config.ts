import * as dotenv from "dotenv";
dotenv.config();
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@nomicfoundation/hardhat-verify";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import { task } from "hardhat/config";
import generateTsAbis from "./scripts/generateTsAbis";

// Optional provider API key.
// You can get your own at https://dashboard.alchemyapi.io
const providerApiKey = process.env.ALCHEMY_API_KEY || "";
// Testnet deployment credentials are read only from the environment.
// You can generate a random account with `yarn generate` or `yarn account:import` to import your existing PK
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY;
// Optional block explorer API key.
const etherscanApiKey = process.env.ETHERSCAN_V2_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            // https://docs.soliditylang.org/en/latest/using-the-compiler.html#optimizer-options
            runs: 200,
          },
        },
      },
    ],
  },
  defaultNetwork: "localhost",
  namedAccounts: {
    deployer: {
      // By default, it will take the first Hardhat account as the deployer
      default: 0,
    },
  },
  networks: {
    // View the networks that are pre-configured.
    // If the network you are looking for is not here you can add new network settings
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${providerApiKey}`,
        enabled: process.env.MAINNET_FORKING_ENABLED === "true",
      },
    },
    potos_testnet: {
      allowUnlimitedContractSize: true,
      url: `https://rpc-testnet.potos.hk`,
      chainId: 60600,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    mainnet: {
      url: "https://mainnet.rpc.buidlguidl.com",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    arbitrum: {
      url: `https://arb-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    arbitrumSepolia: {
      url: `https://arb-sepolia.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    optimism: {
      url: `https://opt-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    optimismSepolia: {
      url: `https://opt-sepolia.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    polygonAmoy: {
      url: `https://polygon-amoy.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    polygonZkEvm: {
      url: `https://polygonzkevm-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    polygonZkEvmCardona: {
      url: `https://polygonzkevm-cardona.g.alchemy.com/v2/${providerApiKey}`,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    gnosis: {
      url: "https://rpc.gnosischain.com",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    chiado: {
      url: "https://rpc.chiadochain.net",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    base: {
      url: "https://mainnet.base.org",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    baseSepolia: {
      url: "https://sepolia.base.org",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    scrollSepolia: {
      url: "https://sepolia-rpc.scroll.io",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    scroll: {
      url: "https://rpc.scroll.io",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    celo: {
      url: "https://forno.celo.org",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    celoSepolia: {
      url: "https://forno.celo-sepolia.celo-testnet.org/",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
  },
  // Configuration for harhdat-verify plugin
  etherscan: {
    apiKey: etherscanApiKey,
  },
  // Configuration for etherscan-verify from hardhat-deploy plugin
  verify: {
    etherscan: {
      apiKey: etherscanApiKey,
    },
  },
  sourcify: {
    enabled: false,
  },
};

// Extend the deploy task
task("deploy").setAction(async (args, hre, runSuper) => {
  // Run the original deploy task
  await runSuper(args);
  // Force run the generateTsAbis script
  await generateTsAbis(hre);
});

export default config;
