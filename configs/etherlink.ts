import { vars } from 'hardhat/config';

import { ETHERLINK as etherlink } from '../constants/networks';

const METAMASK_PRIVATE_KEY = vars.get('METAMASK_PRIVATE_KEY');

export const TESTNET_CHAIN_ID = 128_123;
export const MAINNET_CHAIN_ID = 42_793;

export const EHTERLINK = {
  TESTNET: {
    ID: etherlink.TESTNET,
    NAME: 'Etherlink Testnet',
    CONFIG: {
      url: 'https://node.ghostnet.etherlink.com',
      accounts: [METAMASK_PRIVATE_KEY],
      chainId: TESTNET_CHAIN_ID,
    },
    EXPLORER: {
      network: etherlink.TESTNET,
      chainId: TESTNET_CHAIN_ID,
      urls: {
        apiURL: 'https://testnet.explorer.etherlink.com/api',
        browserURL: 'https://testnet.explorer.etherlink.com',
      },
    },
  },
  MAINNET: {
    ID: 'etherlink.mainnet',
    NAME: 'Etherlink Mainnet',
    CONFIG: {
      url: 'https://node.mainnet.etherlink.com',
      accounts: [METAMASK_PRIVATE_KEY],
      chainId: MAINNET_CHAIN_ID,
    },
    EXPLORER: {
      network: 'etherlink.mainnet',
      chainId: MAINNET_CHAIN_ID,
      urls: {
        apiURL: 'https://explorer.etherlink.com/api',
        browserURL: 'https://explorer.etherlink.com',
      },
    },
  },
};
