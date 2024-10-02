import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task, subtask } from 'hardhat/config';

import { ARBITRRUM, ETHERLINK } from '../constants/addesses';

interface DDCAArgs {
  base: string;
  quote: string;
  verify?: boolean;
}

const ON_CHAIN_ADDRESS_MAP = {
  ...ARBITRRUM,
  ...ETHERLINK,
};

const getContractArguments = ({ base, quote, network }: any) => {
  const onCahinAddresses: Record<string, string> =
    ON_CHAIN_ADDRESS_MAP[network];

  const baseToken = String(base).toUpperCase();
  const quoteToken = String(quote).toUpperCase();

  return {
    [baseToken]: onCahinAddresses[baseToken],
    [quoteToken]: onCahinAddresses[quoteToken],
    SWAP_ROUTER: onCahinAddresses.SWAP_ROUTER,
  };
};

const CONTRACT_NAMES: Record<string, string> = {
  ['etherlink.testnet']: 'DDCAEtherlink',
  ['arbitrum.mainnet']: 'DDCAAribitrum',
};

task('deploy', 'Deploys contract on chain')
  .addParam('base', 'The base currency of the contract')
  .addParam('quote', 'The quote currency of the contract')
  .addFlag('verify', 'Contract verification is required or not')
  .setAction(async (taskArgs: DDCAArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;

    const { base, quote, verify } = taskArgs;

    if (!base || !quote) {
      throw new Error(
        `Invalid trading pair ${String(base).toUpperCase()}/${String(quote).toUpperCase()}`,
      );
    }

    const contractName = CONTRACT_NAMES[network.name];

    const DDCAContract = await ethers.getContractFactory(contractName);

    const [deployer] = await ethers.getSigners();

    console.log(`Deploying contracts with the account ${deployer.address}`);

    const contractArguments = getContractArguments({
      base,
      quote,
      network: network.name,
    });

    console.log(
      `Deploying ${contractName} contract with args ${JSON.stringify(contractArguments)}`,
    );

    const deployedContract = await DDCAContract.deploy(
      ...Object.values(contractArguments),
    );

    const contratAddress = await deployedContract.getAddress();

    console.log(`Contract depployed at ${contratAddress}`);

    if (verify) {
      await hre.run('verifyContract', {
        address: contratAddress,
        constructorArguments: Object.values(contractArguments),
      });
    }
  });

subtask('verifyContract', 'Verify and publish the contract')
  .addParam('address', 'The contract address')
  .addVariadicPositionalParam(
    'constructorArguments',
    'The contract constructor arguments',
  )
  .setAction(async (taskArgs, hre) => {
    const { address, constructorArguments } = taskArgs;
    const { run } = hre;

    console.log(`Verifying contract at ${address} ....`);

    try {
      await run('verify:verify', {
        address,
        constructorArguments,
      });

      console.log(`Verification successful!!!`);
    } catch (e: any) {
      if (e.message.toLowerCase().includes('already verified')) {
        console.log(`Contract at ${address} is already verified!`);
      } else {
        console.log(e);
      }
    }
  });
