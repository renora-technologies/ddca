import { parseUnits, formatUnits } from 'ethers';
import { expect } from 'chai';
import hre from 'hardhat';

import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';

describe('DDCA', function () {
  const deployContracts = async () => {
    const [owner, client1, client2] = await hre.ethers.getSigners();

    const WBTC = await hre.ethers.getContractFactory('ETH');
    const USDT = await hre.ethers.getContractFactory('USDT');
    const DDCA = await hre.ethers.getContractFactory('DDCA');
    // const TachySwapRouter02 = await hre.ethers.getContractFactory('TachySwapRouter02');

    const usdt = await USDT.deploy();
    const usdtAddress = await usdt.getAddress();

    const wbtc = await WBTC.deploy();
    const wbtcAddress = await wbtc.getAddress();

    // const tachySwapRouter02 = await TachySwapRouter02.deploy();
    // const tachySwapRouter02Address = await tachySwapRouter02.getAddress();

    const ddca = await DDCA.deploy(wbtcAddress, usdtAddress);

    return { ddca, usdt, usdtAddress, wbtc, wbtcAddress, owner, client1, client2 };
  };

  it('Initial token balances on contract is', async function () {
    const { ddca }: any = await loadFixture(deployContracts);

    const [base, quote] = await ddca.getBalance();

    expect(Number(base)).to.be.equal(0);
    expect(Number(quote)).to.be.equal(0);
  });

  it('Reverts if we try to get client balance without an account', async function () {
    const { ddca, owner }: any = await loadFixture(deployContracts);

    await expect(ddca.getClientBalance(owner.address)).to.be.revertedWith('User does not have any account.');
  });

  it('Creates a DDCA for WBTC/USDT', async function () {
    const { ddca, usdt, owner }: any = await loadFixture(deployContracts);

    const _quoteTokenAmount = parseUnits('10000', 6);
    const _lotSize = parseUnits('1000', 6);
    const ddcaAddress = await ddca.getAddress();

    await usdt.approve(ddcaAddress, _quoteTokenAmount);

    await ddca.createDDCA(_quoteTokenAmount, _lotSize);

    await ddca.swap(parseUnits('3365.67', 6));

    const node = await ddca.getClientNode();

    // expect(node[0]).to.be.equal(owner.address);
    // expect(node[2]).to.be.equal(_quoteTokenAmount);
    // expect(node[1]).to.be.equal(0);
    // expect(node[7]).to.be.equal(_lotSize);
  });

  it('Check client nodes', async function () {
    const { ddca, usdt, owner }: any = await loadFixture(deployContracts);

    const _quoteTokenAmount = parseUnits('10000', 6);
    const _lotSize = parseUnits('1000', 6);
    const ddcaAddress = await ddca.getAddress();

    await usdt.approve(ddcaAddress, _quoteTokenAmount);

    await ddca.createDDCA(_quoteTokenAmount, _lotSize);

    const node = await ddca.getClientNode();

    expect(Number(node[2])).to.be.equal(_quoteTokenAmount);
    expect(Number(node[7])).to.be.equal(_lotSize);
  });

  it('Returns clients balances', async function () {
    const { ddca, usdt, owner }: any = await loadFixture(deployContracts);

    const _quoteTokenAmount = parseUnits('10000', 6);
    const _lotSize = parseUnits('1000', 6);
    const ddcaAddress = await ddca.getAddress();

    await usdt.approve(ddcaAddress, _quoteTokenAmount);

    await ddca.createDDCA(_quoteTokenAmount, _lotSize);
    const [base, quote] = await ddca.getClientBalance(owner.address);

    expect(Number(quote)).to.be.equal(_quoteTokenAmount);
    expect(Number(base)).to.be.equal(0);
  });

  it('Returns total lot size for swap', async function () {
    const { ddca, usdt, owner }: any = await loadFixture(deployContracts);

    const _quoteTokenAmount = parseUnits('10000', 6);
    const _lotSize = parseUnits('1000', 6);
    const ddcaAddress = await ddca.getAddress();

    await usdt.approve(ddcaAddress, _quoteTokenAmount);

    await ddca.createDDCA(_quoteTokenAmount, _lotSize);
    const totalLotSize = await ddca.getTotalLotSize();

    expect(Number(totalLotSize)).to.be.equal(_lotSize);
  });

  it('Withdraw quote token', async function () {
    const { ddca, usdt, owner }: any = await loadFixture(deployContracts);

    const _quoteTokenAmount = parseUnits('10000', 6);
    const _lotSize = parseUnits('1000', 6);
    const ddcaAddress = await ddca.getAddress();

    const original = await usdt.balanceOf(owner.address);

    await usdt.approve(ddcaAddress, _quoteTokenAmount);

    await ddca.createDDCA(_quoteTokenAmount, _lotSize);

    const oldBalance = await usdt.balanceOf(owner.address);

    const [, quote0] = await ddca.getClientBalance(owner.address);

    expect(quote0).to.be.equals(_quoteTokenAmount);

    await ddca.withdrawQuoteToken(_quoteTokenAmount);

    expect(oldBalance + _quoteTokenAmount).to.be.equals(original);
  });

  it('Transfer USDR tokens to client1 and client2', async function () {
    const { usdt, owner, client1, client2 }: any = await loadFixture(deployContracts);

    const transferAmount = parseUnits('50000', 6);

    // Transfer USDR tokens to client1
    await usdt.transfer(client1.address, transferAmount);

    // Transfer USDR tokens to client2
    await usdt.transfer(client2.address, transferAmount);

    const client1Balance = await usdt.balanceOf(client1.address);
    const client2Balance = await usdt.balanceOf(client2.address);

    expect(Number(client1Balance)).to.be.equal(transferAmount);
    expect(Number(client2Balance)).to.be.equal(transferAmount);
  });

  it('Creates a DDCA for client1 and client2 and Withdraw', async function () {
    const { ddca, usdt, owner, client1, client2 }: any = await loadFixture(deployContracts);

    const _quoteTokenAmount = parseUnits('5000', 6);
    const _lotSize = parseUnits('1000', 6);
    const ddcaAddress = await ddca.getAddress();
    const transferAmount = parseUnits('50000', 6);

    // Transfer USDR tokens to client1
    await usdt.transfer(client1.address, transferAmount);

    // Transfer USDR tokens to client2
    await usdt.transfer(client2.address, transferAmount);

    await usdt.connect(client1).approve(ddcaAddress, _quoteTokenAmount);
    await usdt.connect(client2).approve(ddcaAddress, _quoteTokenAmount);

    // Create DDCA for client1
    await ddca.connect(client1).createDDCA(_quoteTokenAmount, _lotSize);

    // Create DDCA for client2
    const client2Allowance = await usdt.allowance(client2.address, ddcaAddress);
    await ddca.connect(client2).createDDCA(_quoteTokenAmount, _lotSize);

    const [client1Base, client1Quote] = await ddca.getClientBalance(client1.address);
    const [client2Base, client2Quote] = await ddca.getClientBalance(client2.address);
    // console.log(client1Base, client1Quote , "client 1")

    // Withdraw quote token from client1
    const [, client1Quote0] = await ddca.getClientBalance(client1.address);
    await ddca.connect(client1).withdrawQuoteToken(_quoteTokenAmount);

    // Withdraw quote token from client2
    const [, client2Quote0] = await ddca.getClientBalance(client2.address);
    await ddca.connect(client2).withdrawQuoteToken(_quoteTokenAmount);

    expect(Number(client1Quote)).to.be.equal(_quoteTokenAmount);
    expect(Number(client2Quote)).to.be.equal(_quoteTokenAmount);
    expect(Number(client1Base)).to.be.equal(0);
    expect(Number(client2Base)).to.be.equal(0);
    expect(Number(client1Quote0)).to.be.equal(_quoteTokenAmount);
    expect(Number(client2Quote0)).to.be.equal(_quoteTokenAmount);
  });

  it('Top-up DDCA for client1 and client2', async function () {
    const { ddca, usdt, owner, client1, client2 }: any = await loadFixture(deployContracts);

    const _quoteTokenAmount = parseUnits('5000', 6);
    const _additionalQuoteTokenAmount = parseUnits('5000', 6);

    // Transfer USDR tokens to client1 and client2
    await usdt.transfer(client1.address, _quoteTokenAmount);
    await usdt.transfer(client2.address, _quoteTokenAmount);

    const ddcaAddress = await ddca.getAddress();

    // Approve USDR tokens for DDCA from client1 and client2
    await usdt.connect(client1).approve(ddcaAddress, _quoteTokenAmount);
    await usdt.connect(client2).approve(ddcaAddress, _quoteTokenAmount);

    // Create DDCA for client1 and client2
    await ddca.connect(client1).createDDCA(_quoteTokenAmount, _quoteTokenAmount);
    await ddca.connect(client2).createDDCA(_quoteTokenAmount, _quoteTokenAmount);

    // Transfer USDR tokens to client1 and client2
    await usdt.transfer(client1.address, _additionalQuoteTokenAmount);
    await usdt.transfer(client2.address, _additionalQuoteTokenAmount);

    // Top-up DDCA for client1
    await usdt.connect(client1).approve(ddcaAddress, _additionalQuoteTokenAmount);
    await ddca.connect(client1).topUp(_additionalQuoteTokenAmount);

    // Top-up DDCA for client2
    await usdt.connect(client2).approve(ddcaAddress, _additionalQuoteTokenAmount);
    await ddca.connect(client2).topUp(_additionalQuoteTokenAmount);

    const [client1Base, client1Quote] = await ddca.getClientBalance(client1.address);
    const [client2Base, client2Quote] = await ddca.getClientBalance(client2.address);

    expect(Number(client1Quote)).to.be.equal(_quoteTokenAmount + _additionalQuoteTokenAmount);
    expect(Number(client2Quote)).to.be.equal(_quoteTokenAmount + _additionalQuoteTokenAmount);
    expect(Number(client1Base)).to.be.equal(0);
    expect(Number(client2Base)).to.be.equal(0);

    await ddca.connect(client1).withdrawQuoteToken(_quoteTokenAmount);

    await ddca.connect(client2).withdrawQuoteToken(_quoteTokenAmount);

    const [, client1Quote0] = await ddca.getClientBalance(client1.address);
    const [, client2Quote0] = await ddca.getClientBalance(client2.address);

    expect(Number(client1Quote0)).to.be.equal(_additionalQuoteTokenAmount);
    expect(Number(client2Quote0)).to.be.equal(_additionalQuoteTokenAmount);
  });
});
