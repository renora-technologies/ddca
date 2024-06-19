import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

import { ROUTER_ADDRESS, TOKEN_ADDRESS } from '../../constants/addesses';

// // quote currency
// const USDR_ADDRESS = '0xb8038E962fB3C52F817c46d2E0B22aB58a1Bd370';

// // base
// const SLOTH_TOKEN_ADDRESS = '0x71fdCe8EaAB54f1C690FC23eE89Cf98b8650Fec4';

const USDT = '0x152A760ab2fcD0e9A76C76213e8D0Be0Be5dc12A';
const WBTC = '0xCb8c6115eE442e6498736EAF33cCE0BDc7A1432C';

export default buildModule('DDCAModule', (m) => {
  const ddca = m.contract('DDCA', [WBTC, USDT, ROUTER_ADDRESS.TESTNET]);

  return { ddca };
});
