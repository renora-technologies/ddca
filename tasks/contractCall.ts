import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { task, subtask } from 'hardhat/config';

import { ARBITRRUM, LOCALHOST } from '../constants/addesses';
import { formatUnits, Numeric, parseUnits, toBigInt } from 'ethers';

export type Node = {
  account: string;
  baseTokenAmount: bigint;
  quoteTokenAmount: bigint;
  totalAmountBought: bigint;
  totalCost: bigint;
  averagePrice: bigint;
  totalFees: bigint;
  lotSize: bigint;
  nextLotSize: bigint;
  status: boolean;
};

export const getNodeFromDDCANode = (ddcaNode: Array<any>): Node => {
  const node: Node = {
    account: ddcaNode[0],
    baseTokenAmount: ddcaNode[1],
    quoteTokenAmount: ddcaNode[2],
    totalAmountBought: ddcaNode[3],
    totalCost: ddcaNode[4],
    averagePrice: ddcaNode[5],
    totalFees: ddcaNode[6],
    lotSize: ddcaNode[7],
    nextLotSize: ddcaNode[8],
    status: ddcaNode[9],
  };

  return node;
};

export const getAmountOut = (
  amountIn: bigint,
  toleratedSlippagePrice: bigint,
  tokenDecimal: Numeric = 18,
): bigint => {
  let amountOut: any = `${
    Number(formatUnits(amountIn, 6)) /
    Number(formatUnits(toleratedSlippagePrice, 6))
  }`;

  return parseUnits(
    Number(amountOut).toFixed(Number(tokenDecimal)),
    tokenDecimal,
  );
};

const CONTRACT_MAPS: Record<string, string> = {
  WBTC_USDT: '0x4A679253410272dd5232B3Ff7cF5dbB88f295319',
  WBTC: '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82',
  WETH_USDC: '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0',
  WETH: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
};

task('airDrop', 'Airdrop tokens').setAction(
  async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;
    const fs = require('fs');

    const baseTokenSymbol = 'WBTC';
    const quoteTokenSymbol = 'USDT';

    const data = fs.readFileSync(
      `./${baseTokenSymbol}-${quoteTokenSymbol}-DDCA-deployment-local.json`,
      {
        encoding: 'utf8',
      },
    );

    const deploymentInfo = JSON.parse(data);

    const baseTokenAddress = deploymentInfo[baseTokenSymbol];
    const ddcaAddress = deploymentInfo.mockDDCAaddress;

    // const DDCA_ADDRESS = '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0';
    // const BASE_TOKEN = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

    const [deployer] = await ethers.getSigners();

    // const DDCA = await ethers.getContractAt('MockDDCA', DDCA_ADDRESS, deployer);

    const token = await ethers.getContractAt(
      baseTokenSymbol,
      baseTokenAddress,
      deployer,
    );
    const decimals = await token.decimals();

    const airDropAmount = parseUnits('1000', Number(decimals));
    const transferStatus = await token.transfer(ddcaAddress, airDropAmount);

    console.log(
      `Airdropped ${airDropAmount} ${baseTokenSymbol} at ${ddcaAddress} | ${transferStatus}`,
    );
  },
);

task('pingContract', 'Airdrop tokens').setAction(
  async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const { ethers, network } = hre;

    const DDCA_ADDRESS = '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0';
    const BASE_TOKEN = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

    const [deployer] = await ethers.getSigners();

    const DDCA = await ethers.getContractAt('MockDDCA', DDCA_ADDRESS, deployer);

    const totalLotSize = await DDCA.getTotalLotSize();
    const totalFees = await DDCA.getTotalFeesCollected();

    console.log(`Total Lot size: ${formatUnits(String(totalLotSize), 6)} USD`);
    console.log(
      `Total fees collected: ${formatUnits(String(totalFees), 6)} USD`,
    );
  },
);

task('purchaseDips', 'Deploys contract on localhost')
  .addParam('tradingpair', 'The base currency of the contract')
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    const { ethers } = hre;
    const { tradingpair } = taskArgs;

    const fs = require('fs');

    // const baseTokenSymbol = 'WBTC';
    // const quoteTokenSymbol = 'USDT';
    const [baseTokenSymbol, quoteTokenSymbol]: string[] =
      tradingpair.split('_');

    const data = fs.readFileSync(
      `./${baseTokenSymbol}-${quoteTokenSymbol}-DDCA-deployment-local.json`,
      {
        encoding: 'utf8',
      },
    );

    const deploymentInfo = JSON.parse(data);

    // const WBTC_USDT = '0x4A679253410272dd5232B3Ff7cF5dbB88f295319';
    // const WBTC_ = '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82';

    const DDCA_ADDRESS = deploymentInfo.mockDDCAaddress;

    console.log(
      `Calling purchase dips for ${baseTokenSymbol}/${quoteTokenSymbol} at ${DDCA_ADDRESS}`,
    );

    const [deployer] = await ethers.getSigners();

    const DDCA = await ethers.getContractAt('MockDDCA', DDCA_ADDRESS, deployer);

    const totalLotSize = await DDCA.getTotalLotSize();

    const feesPercent = await DDCA.feesPercent();

    const baseTokenAddress = deploymentInfo[baseTokenSymbol];
    const baseToken = await ethers.getContractAt(
      baseTokenSymbol,
      baseTokenAddress,
      deployer,
    );
    const decimals = await baseToken.decimals();

    const toleratedSlippagePrice = parseUnits('20000', 6);
    const amountIn =
      totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);

    const amountOut = getAmountOut(
      amountIn,
      toleratedSlippagePrice,
      Number(decimals),
    );

    // console.log({ totalLotSize, amountIn, amountOut });

    try {
      const transactionResponse = await DDCA.purchaseDips(
        toleratedSlippagePrice,
        amountOut,
      );

      console.log({ transactionResponse });
    } catch (e) {
      console.error({ e });
    }
  });
