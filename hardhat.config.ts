import { HardhatUserConfig, vars } from 'hardhat/config';

import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-ignition-ethers';
import '@nomicfoundation/hardhat-verify';

const ETHERSCAN_API_KEY = vars.get('ETHERSCAN_API_KEY');
const INFURA_API_KEY = vars.get('INFURA_API_KEY');
const METAMASK_PRIVATE_KEY = vars.get('METAMASK_PRIVATE_KEY');
const COINMARKETCAP_API_KEY = vars.get('COINMARKETCAP_API_KEY');

const config: HardhatUserConfig = {
  defaultNetwork: 'sepolia',
  networks: {
    hardhat: {},
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    sepolia: {
      url: `https://rpc2.sepolia.org`,
      accounts: [METAMASK_PRIVATE_KEY],
    },
    ['etherlink-test']: {
      url: 'https://node.ghostnet.etherlink.com',
      accounts: [METAMASK_PRIVATE_KEY],
      chainId: 128123,
    },
  },
  etherscan: {
    apiKey: {
      sepolia: '', //ETHERSCAN_API_KEY,
      ['etherlink-test']: '',
    },
    customChains: [
      {
        network: 'etherlink-test',
        chainId: 128123,
        urls: {
          apiURL: 'https://testnet-explorer.etherlink.com/api',
          browserURL: 'https://testnet-explorer.etherlink.com',
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  mocha: {
    timeout: 20000, // Increase timeout if necessary
    reporter: 'spec', // Use the "spec" reporter for detailed output
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
    outputFile: './reports/gas-report.txt',
    noColors: true,
    coinmarketcap: COINMARKETCAP_API_KEY,
  },
};

export default config;
