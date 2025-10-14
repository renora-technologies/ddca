import { ARBITRUM as arbitrumOne } from './networks';

export const ARBITRRUM = {
  [arbitrumOne.MAINNET]: {
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    SWAP_ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    QUOTER_V2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  },
};

export const LOCALHOST = {
  ['localhost']: {
    USDT: '',
    USDC: '',
    WBTC: '',
    WETH: '',
    SWAP_ROUTER: '',
    QUOTER_V2: '',
  },
};
