import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const USDT = buildModule('USDTModule', (m) => {
  const usdt = m.contract('USDT');

  return { usdt };
});

export default USDT;
