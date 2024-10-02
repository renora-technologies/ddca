import { vars } from 'hardhat/config';

import { ARBITRUM as arbitrumOne } from '../constants/networks';

const METAMASK_PRIVATE_KEY = vars.get('METAMASK_PRIVATE_KEY');

export const ARBITRUM_SEPOLIA_CHAIN_ID = 421_614;
export const ARBITRUM_CHAIN_ID = 42_161;

export const ARBITRUM = {
  SEPOLIA: {
    ID: 'arbitrum.sepolia',
    NAME: 'Arbitrum Sepolia',
    CONFIG: {
      url: 'https://sepolia-rollup.arbitrum.io/rpc',
      accounts: [METAMASK_PRIVATE_KEY],
      chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
    },
    EXPLORER: {
      network: 'arbitrum.sepolia',
      chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
      urls: {
        name: 'Arbiscan',
        apiURL: 'https://api-sepolia.arbiscan.io/api',
        browserURL: 'https://sepolia.arbiscan.io',
      },
    },
  },
  MAINNET: {
    ID: arbitrumOne.MAINNET,
    NAME: 'Arbitrum One',
    CONFIG: {
      url: 'https://arb1.arbitrum.io/rpc',
      accounts: [METAMASK_PRIVATE_KEY],
      chainId: ARBITRUM_CHAIN_ID,
    },
    EXPLORER: {
      network: arbitrumOne.MAINNET,
      chainId: ARBITRUM_CHAIN_ID,
      urls: {
        name: 'Arbiscan',
        apiURL: 'https://api.arbiscan.io/api',
        browserURL: 'https://arbiscan.io',
      },
    },
  },
};
