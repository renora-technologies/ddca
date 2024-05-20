import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const Sloth = buildModule("SlothTokenModule", (m) => {
 
  const slothToken = m.contract("SlothToken");

  return { slothToken };
});

export default Sloth;