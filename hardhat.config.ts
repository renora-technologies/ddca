import { HardhatUserConfig, vars } from 'hardhat/config';

import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-ignition-ethers';
import '@nomicfoundation/hardhat-verify';
import 'solidity-coverage';
import 'hardhat-gas-reporter';

import { ARBITRUM } from './configs';

/**
 * ! This is done to register tasks
 */
require('./tasks/deployAndVerify');
require('./tasks/contractCall');

const ETHERSCAN_API_KEY = vars.get('ETHERSCAN_API_KEY');
const METAMASK_PRIVATE_KEY = vars.get('METAMASK_PRIVATE_KEY');
const COINMARKETCAP_API_KEY = vars.get('COINMARKETCAP_API_KEY');

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {},
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    sepolia: {
      url: `https://rpc2.sepolia.org`,
      accounts: [METAMASK_PRIVATE_KEY],
    },
    [ARBITRUM.SEPOLIA.ID]: ARBITRUM.SEPOLIA.CONFIG,
    [ARBITRUM.MAINNET.ID]: ARBITRUM.MAINNET.CONFIG,
  },

  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
    customChains: [
      {
        network: 'localhost',
        chainId: 31337,
        urls: {
          apiURL: 'http://localhost/api', // Your Blockscout API URL
          browserURL: 'http://localhost', // Your Blockscout frontend URL
        },
      },
      {
        network: ARBITRUM.MAINNET.ID,
        chainId: 42161,
        urls: {
          apiURL: 'https://api.etherscan.io/v2/api?chainid=42161',
          browserURL: 'https://arbiscan.io',
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
