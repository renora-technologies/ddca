import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task, subtask } from 'hardhat/config';

import { ARBITRRUM } from '../constants/addesses';
import { parseUnits } from 'ethers';

interface DDCAArgs {
  base: string;
  quote: string;
  verify?: boolean;
}

const ON_CHAIN_ADDRESS_MAP = {
  ...ARBITRRUM,
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  ['arbitrum.mainnet']: 'DDCAAribitrum',
  localhost: 'MockDDCA',
};

task('deplolyOnLocalhost', 'Deploys contract on localhost')
  // .addParam('base', 'The base currency of the contract')
  // .addParam('quote', 'The quote currency of the contract')
  // .addFlag('verify', 'Contract verification is required or not')
  .setAction(async (taskArgs: DDCAArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;

    const baseTokenParams = {
      name: 'Hardhat WETH',
      symbol: 'WETH',
      decimal: 18,
      totalSuppy: parseUnits('10000000000', 18),
    };
    const quoteTokenParams = {
      name: 'Hardhat USDC',
      symbol: 'USDC',
      decimal: 6,
      totalSuppy: parseUnits('1000000000000000000', 6),
    };

    // const baseTokenParams = {
    //   name: 'Hardhat WBTC',
    //   symbol: 'WBTC',
    //   decimal: 8,
    //   totalSuppy: parseUnits('100000000000000000000', 8),
    // };
    // const quoteTokenParams = {
    //   name: 'Hardhat USDT',
    //   symbol: 'USDT',
    //   decimal: 6,
    //   totalSuppy: parseUnits('1000000000000000000', 6),
    // };

    const HHERC20 = await ethers.getContractFactory('HHERC20');

    const [deployer, ...testAccounts] = await ethers.getSigners();

    console.log(`Deploying contracts with the account ${deployer.address}`);

    const baseToken = await HHERC20.deploy(
      baseTokenParams.name,
      baseTokenParams.symbol,
      baseTokenParams.decimal,
      baseTokenParams.totalSuppy,
    );
    await baseToken.waitForDeployment();

    const quoteToken = await HHERC20.deploy(
      quoteTokenParams.name,
      quoteTokenParams.symbol,
      quoteTokenParams.decimal,
      quoteTokenParams.totalSuppy,
    );
    await quoteToken.waitForDeployment();

    const quoteTokenAddress = await quoteToken.getAddress();
    const baseTokenAddress = await baseToken.getAddress();

    console.log(
      `${quoteTokenParams.symbol} contract depployed at ${quoteTokenAddress}`,
    );
    console.log(
      `${baseTokenParams.symbol} contract depployed at ${baseTokenAddress}`,
    );

    // Airdrop tokens to first 10 test accounts
    const airdropAmount = hre.ethers.parseUnits('10000', 6); // 10k USDC tokens each

    for (let i = 0; i < 10; i++) {
      await quoteToken.mint(testAccounts[i].address, airdropAmount);

      console.log(
        `Airdropped ${airdropAmount} ${quoteTokenParams.symbol} --> ${testAccounts[i].address}`,
      );
    }

    const DDCAContract = await ethers.getContractFactory('MockDDCA');

    const deployedContract = await DDCAContract.deploy(
      baseTokenAddress,
      quoteTokenAddress,
    );

    await deployedContract.waitForDeployment();
    const mockDDCAaddress = await deployedContract.getAddress();

    console.log(`MockDDCA contract deployed at ${mockDDCAaddress}`);

    const fs = require('fs');
    const deploymentInfo = {
      network: 'localhost',
      [quoteTokenParams.symbol]: quoteTokenAddress,
      [baseTokenParams.symbol]: baseTokenAddress,
      mockDDCAaddress,
      deployer: deployer.address,
    };

    fs.writeFileSync(
      `./${baseTokenParams.symbol}-${quoteTokenParams.symbol}-DDCA-deployment-local.json`,
      JSON.stringify(deploymentInfo, null, 2),
    );

    try {
      await hre.run('verifyContract', {
        address: baseTokenAddress,
        constructorArguments: [
          baseTokenParams.name,
          baseTokenParams.symbol,
          String(baseTokenParams.decimal),
          String(baseTokenParams.totalSuppy),
        ],
      });
    } catch (e) {
      console.error(`Error verifying base token contract: ${e}`);
    }

    try {
      await hre.run('verifyContract', {
        address: quoteTokenAddress,
        constructorArguments: [
          quoteTokenParams.name,
          quoteTokenParams.symbol,
          String(quoteTokenParams.decimal),
          String(quoteTokenParams.totalSuppy),
        ],
      });
    } catch (e) {
      console.error(`Error verifying quote token contract: ${e}`);
    }

    try {
      await hre.run('verifyContract', {
        address: mockDDCAaddress,
        constructorArguments: [baseTokenAddress, quoteTokenAddress],
      });
    } catch (e) {
      console.error(`Error verifying ddca contract: ${e}`);
    }
  });

task('verifyLocalContracts', 'Verify locally deployed contracts').setAction(
  async (parseArgs, hre: HardhatRuntimeEnvironment) => {
    // Include the fs module
    const fs = require('fs');

    const baseTokenParams = {
      name: 'Hardhat WBTC',
      symbol: 'WBTC',
      decimal: 8,
      totalSuppy: parseUnits('100000000000000000000', 8),
    };
    const quoteTokenParams = {
      name: 'Hardhat USDT',
      symbol: 'USDT',
      decimal: 6,
      totalSuppy: parseUnits('1000000000000000000', 6),
    };

    // Read the file synchronously
    const data = fs.readFileSync(
      `./${baseTokenParams.symbol}-${quoteTokenParams.symbol}-DDCA-deployment-local.json`,
      {
        encoding: 'utf8',
      },
    );

    const deploymentInfo = JSON.parse(data);

    const baseTokenAddress = deploymentInfo[baseTokenParams.symbol];
    const quoteTokenAddress = deploymentInfo[quoteTokenParams.symbol];

    try {
      await hre.run('verifyContract', {
        address: baseTokenAddress,
        constructorArguments: [
          baseTokenParams.name,
          baseTokenParams.symbol,
          String(baseTokenParams.decimal),
          String(baseTokenParams.totalSuppy),
        ],
      });
    } catch (e) {
      console.error(`Error verifying base token contract: ${e}`);
    }

    try {
      await hre.run('verifyContract', {
        address: quoteTokenAddress,
        constructorArguments: [
          quoteTokenParams.name,
          quoteTokenParams.symbol,
          String(quoteTokenParams.decimal),
          String(quoteTokenParams.totalSuppy),
        ],
      });
    } catch (e) {
      console.error(`Error verifying quote token contract: ${e}`);
    }

    try {
      await hre.run('verifyContract', {
        address: deploymentInfo.mockDDCAaddress,
        constructorArguments: [baseTokenAddress, quoteTokenAddress],
      });
    } catch (e) {
      console.error(`Error verifying ddca contract: ${e}`);
    }
  },
);

task('deployOnArbitrum', 'Deploys contract on chain')
  .addParam('base', 'The base currency of the contract')
  .addParam('quote', 'The quote currency of the contract')
  .addFlag('verify', 'Contract verification is required or not')
  .setAction(async (taskArgs: DDCAArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;

    const { base, quote, verify } = taskArgs;
    const tradingPair = `${String(base).toUpperCase()}-${String(quote).toUpperCase()}`;

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
      `Deploying ${contractName} contract with args ${JSON.stringify(contractArguments, null, 2)}`,
    );

    const deployedContract = await DDCAContract.deploy(
      ...Object.values(contractArguments),
    );

    await deployedContract.waitForDeployment();

    const contratAddress = await deployedContract.getAddress();

    const fs = require('fs');
    const deploymentInfo = {
      network: network.name,
      baseToken: String(base).toUpperCase(),
      quoteToken: String(quote).toUpperCase(),
      ddcaAddress: contratAddress,
      owner: deployer.address,
    };

    fs.writeFileSync(
      `./${tradingPair}-ArbitrumOne.json`,
      JSON.stringify(deploymentInfo, null, 2),
    );

    console.log(`Contract depployed at ${contratAddress}`);

    /***
     * A delay is added before verifying, so that the contract bytecode is
     * propagated
     */
    await delay(5000);

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
        // contract: 'contracts/tokens/USDC.sol:USDC',
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
