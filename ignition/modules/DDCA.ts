import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

// quote currency
const USDR_ADDRESS = '0xb8038E962fB3C52F817c46d2E0B22aB58a1Bd370';

// base
const SLOTH_TOKEN_ADDRESS = '0x86D233D2Bb48A1017b597EC03Ed2115018E65FD1';

export default buildModule('DDCAModule', (m) => {
  // const tokenAddress = m.getParameter("_token", SEPOLIA_ETH_ADDRESS);

  const ddca = m.contract('DDCA', [SLOTH_TOKEN_ADDRESS, USDR_ADDRESS]);

  return { ddca };
});
