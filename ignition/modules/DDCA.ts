import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

import { ROUTER_ADDRESS, TOKEN_ADDRESS } from '../../constants/addesses';

// TEST Tokens
const USDT = '0xBf8c88822671E86333d9220724432Ae651fB1140';
const WBTC = '0xaE2Fbb70fD10422EF07E53Ec5083e2b1F6152205';
// const WXTZ = '0x8A2d00F814Bc19653E7F9AEA8572C1F2d1Db633e';
const WXTZ = '0x340Fa96ACF0b8D36828e1D8963CdF3E95c58ed06'; //  Tachyswap's wxtz token address
const ETH = '0x8cfF9C622b5382858686aa3094D52e368914863E';

export default buildModule('DDCA_WXTZ_USDT_V2', (m) => {
  const ddca = m.contract('DDCA', [WXTZ, USDT, ROUTER_ADDRESS.TESTNET]);

  return { ddca };
});

// !IMPORTANT LATEST DEPLOYMENT
// DDCA_WBTC_USDT_V1 = 0x9366499316b160D06b12D06F59931265078762CA
// DDCA_ETH_USDT_V1 = 0x2f073de3dd14d77F7e113A8aCf124EF0B5f69b36
// DDCA_WXTZ_USDT_V2 = 0xa23827830a191fd19727d0075BB65502cb4f3da7
