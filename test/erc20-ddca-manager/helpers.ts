import {
  parseUnits,
  toBigInt,
  formatUnits,
  ContractTransactionResponse,
  AddressLike,
  Numeric,
} from 'ethers';
// import { expect } from 'chai';
import hre from 'hardhat';

import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { ERC20DDCAManager, ERC20, MockDDCA, HHERC20 } from 'typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

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

export interface IContext {
  ddcaManager: MockDDCA & {
    deploymentTransaction(): ContractTransactionResponse;
  };
  ddcaAddress: AddressLike;
  usdt: HHERC20 & {
    deploymentTransaction(): ContractTransactionResponse;
  };
  usdtAddress: AddressLike;
  wbtc: HHERC20 & {
    deploymentTransaction(): ContractTransactionResponse;
  };
  wbtcAddress: AddressLike;
  owner: HardhatEthersSigner;
  accounts: HardhatEthersSigner[];
}

/**
 *
 * @returns
 */
export const deployContracts = async (): Promise<IContext> => {
  const [owner, ...accounts] = await hre.ethers.getSigners();

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

  const HHERC20 = await hre.ethers.getContractFactory('HHERC20');
  // const USDT = await hre.ethers.getContractFactory('HHERC20');
  const DDCAManager = await hre.ethers.getContractFactory('MockDDCA');

  const usdt = await HHERC20.deploy(
    quoteTokenParams.name,
    quoteTokenParams.symbol,
    quoteTokenParams.decimal,
    quoteTokenParams.totalSuppy,
  );
  const usdtAddress = await usdt.getAddress();

  const wbtc = await HHERC20.deploy(
    baseTokenParams.name,
    baseTokenParams.symbol,
    baseTokenParams.decimal,
    baseTokenParams.totalSuppy,
  );
  const wbtcAddress = await wbtc.getAddress();

  const ddcaManager = await DDCAManager.deploy(wbtcAddress, usdtAddress);
  const ddcaAddress = await ddcaManager.getAddress();

  return {
    ddcaManager,
    ddcaAddress,
    usdt,
    usdtAddress,
    wbtc,
    wbtcAddress,
    owner,
    accounts,
  };
};

/**
 *
 * @param token
 * @param address
 * @param amount
 */
export const approveAllowance = async (
  token: ERC20,
  address: string,
  amount: bigint,
  account?: HardhatEthersSigner,
) => {
  const approve = account ? token.connect(account).approve : token.approve;

  return await approve(address, amount);
};

export const getNode = async (
  ddcaManager: MockDDCA,
  account?: HardhatEthersSigner,
): Promise<Node> => {
  const getNodeFunc = account
    ? ddcaManager.connect(account).getNode
    : ddcaManager.getNode;

  const ddcaNode = await getNodeFunc();

  return getNodeFromDDCANode(ddcaNode);
};

/**
 *
 * @param ddcaManager
 * @param quoteToken
 * @param amount
 * @param lotSize
 * @param account
 * @returns
 */
export const createDDCA = async (
  ddcaManager: MockDDCA,
  quoteToken: ERC20,
  amount: bigint,
  lotSize: bigint,
  account?: HardhatEthersSigner,
): Promise<Node> => {
  const ddcaAddress = await ddcaManager.getAddress();

  await approveAllowance(quoteToken, ddcaAddress, amount, account);

  const createDDCA = account
    ? ddcaManager.connect(account).createDDCA
    : ddcaManager.createDDCA;
  // const getNode = account
  //   ? ddcaManager.connect(account).getNode
  //   : ddcaManager.getNode;

  await createDDCA(amount, lotSize);

  return await getNode(ddcaManager, account);
};

/**
 *
 * @param ddcaManager
 * @param quoteToken
 * @param amount
 * @returns
 */
export const topUpDDCA = async (
  ddcaManager: ERC20DDCAManager,
  quoteToken: ERC20,
  amount: bigint,
  account?: HardhatEthersSigner,
): Promise<Node> => {
  const ddcaAddress = await ddcaManager.getAddress();

  const topUp = account
    ? ddcaManager.connect(account).topUp
    : ddcaManager.topUp;
  const getNode = account
    ? ddcaManager.connect(account).getNode
    : ddcaManager.getNode;

  await approveAllowance(quoteToken, ddcaAddress, amount, account);

  await topUp(amount);

  const updatedNode = await getNode();

  return getNodeFromDDCANode(updatedNode);
};

export const toggleDDCANodestatus = async (
  ddcaManager: ERC20DDCAManager,
  account?: HardhatEthersSigner,
): Promise<Node> => {
  const toggleDipsPurchasing = account
    ? ddcaManager.connect(account).toggleDipsPurchasing
    : ddcaManager.toggleDipsPurchasing;

  const getNode = account
    ? ddcaManager.connect(account).getNode
    : ddcaManager.getNode;

  await toggleDipsPurchasing();

  const node = await getNode();

  return getNodeFromDDCANode(node);
};

export const airDrop = async (
  token: ERC20,
  amount: bigint,
  toAccount: HardhatEthersSigner,
) => {
  // token.approve(toAccount, amount);

  const status = token.transfer(toAccount, amount);

  return status;
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

  return parseUnits(amountOut, tokenDecimal);
};

export const createMockDDCAStrategies = async () => {
  const {
    ddcaManager,
    ddcaAddress,
    usdt,
    usdtAddress,
    wbtc,
    wbtcAddress,
    accounts,
  }: any = await loadFixture(deployContracts);

  const ddcaOwner = await ddcaManager.owner();

  const feesPercent = toBigInt(await ddcaManager.feesPercent());

  const client1 = accounts[0];
  const client2 = accounts[1];
  const client3 = accounts[2];

  const _quoteTokenAmount = parseUnits('10000', 6);

  //   const _lotSize1 = parseUnits('5000', 6);
  //   const _lotSize2 = parseUnits('2000', 6);
  //   const _lotSize3 = parseUnits('3000', 6);

  await airDrop(usdt, _quoteTokenAmount, client1);
  await airDrop(usdt, _quoteTokenAmount, client2);
  await airDrop(usdt, _quoteTokenAmount, client3);

  const node1 = await createDDCA(
    ddcaManager,
    usdt,
    _quoteTokenAmount,
    parseUnits('5000', 6),
    client1,
  );
  const node2 = await createDDCA(
    ddcaManager,
    usdt,
    _quoteTokenAmount,
    parseUnits('2000', 6),
    client2,
  );
  const node3 = await createDDCA(
    ddcaManager,
    usdt,
    _quoteTokenAmount,
    parseUnits('3000', 6),
    client3,
  );
  const totalLotSize = await ddcaManager.getTotalLotSize();

  return {
    ddcaOwner,
    ddcaManager,
    ddcaAddress,
    accounts,
    clients: [client1, client2, client3],
    usdt,
    usdtAddress,
    wbtc,
    wbtcAddress,
    nodes: [node1, node2, node3],
    feesPercent,
    totalLotSize,
    depositAmount: _quoteTokenAmount,
  };
};
