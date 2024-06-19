import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const WBTC = buildModule('WBTCModule', (m) => {
  const wbtc = m.contract('WBTC');

  return { wbtc };
});

export default WBTC;
