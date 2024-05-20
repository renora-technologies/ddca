import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const USDR = buildModule("USDRTokenModule", (m) => {
 
  const usdrToken = m.contract("USDRToken");

  return { usdrToken };
});

export default USDR;