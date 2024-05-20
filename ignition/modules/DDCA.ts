import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

// quote currency
const USDR_ADDRESS = '0xF666826b4A98B3b9c9E6B9378aDc327d9EF65D26';

// base
const SLOTH_TOKEN_ADDRESS = '0x71fdCe8EaAB54f1C690FC23eE89Cf98b8650Fec4';

export default buildModule('DDCAModule', (m) => {
  // const tokenAddress = m.getParameter("_token", SEPOLIA_ETH_ADDRESS);

  const ddca = m.contract('DDCA', [SLOTH_TOKEN_ADDRESS, USDR_ADDRESS]);

  return { ddca };
});
