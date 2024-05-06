import { parseUnits } from 'ethers';
import { expect } from 'chai';
import hre from 'hardhat';

import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';

describe('DDCA', function () {
  const deployContracts = async () => {
    const [owner, otherAccount] = await hre.ethers.getSigners();

    const USDR = await hre.ethers.getContractFactory('USDRToken');
    const SlothToken = await hre.ethers.getContractFactory('SlothToken');
    const DDCA = await hre.ethers.getContractFactory('DDCA');

    const usdr = await USDR.deploy();
    const usdrtAddress = await usdr.getAddress();

    const slothToken = await SlothToken.deploy();
    const slothTokenAddress = await slothToken.getAddress();

    const ddca = await DDCA.deploy(slothTokenAddress, usdrtAddress);

    return { ddca, usdr, usdrtAddress, slothToken, slothTokenAddress, owner, otherAccount };
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

  it('Creates a DDCA for SLTHX/USDRT', async function () {
    const { ddca, usdr, owner }: any = await loadFixture(deployContracts);

    const _quoteTokenAmount = parseUnits('10000', 8);
    const _lotSize = parseUnits('1000', 8);
    const ddcaAddress = await ddca.getAddress();

    await usdr.approve(ddcaAddress, _quoteTokenAmount);

    await ddca.createDDCA(_quoteTokenAmount, _lotSize);
    const [account, base, quote, lotSize] = await ddca.getClientNode();

    expect(account).to.be.equal(owner.address);
    expect(Number(quote)).to.be.equal(_quoteTokenAmount);
    expect(Number(base)).to.be.equal(0);
    expect(Number(lotSize)).to.be.equal(_lotSize);
  });

  it('Returns clients balances', async function () {
    const { ddca, usdr, owner }: any = await loadFixture(deployContracts);

    const _quoteTokenAmount = parseUnits('10000', 8);
    const _lotSize = parseUnits('1000', 8);
    const ddcaAddress = await ddca.getAddress();

    await usdr.approve(ddcaAddress, _quoteTokenAmount);

    await ddca.createDDCA(_quoteTokenAmount, _lotSize);
    const [base, quote] = await ddca.getClientBalance(owner.address);

    expect(Number(quote)).to.be.equal(_quoteTokenAmount);
    expect(Number(base)).to.be.equal(0);
  });

  it('Returns total lot size for swap', async function () {
    const { ddca, usdr, owner }: any = await loadFixture(deployContracts);

    const _quoteTokenAmount = parseUnits('10000', 8);
    const _lotSize = parseUnits('1000', 8);
    const ddcaAddress = await ddca.getAddress();

    await usdr.approve(ddcaAddress, _quoteTokenAmount);

    await ddca.createDDCA(_quoteTokenAmount, _lotSize);
    const totalLotSize = await ddca.getTotalLotSize();

    expect(Number(totalLotSize)).to.be.equal(_lotSize);
  });

  it('Withdraw quote token', async function () {
    const { ddca, usdr, owner }: any = await loadFixture(deployContracts);

    const _quoteTokenAmount = parseUnits('10000', 8);
    const _lotSize = parseUnits('1000', 8);
    const ddcaAddress = await ddca.getAddress();

    await usdr.approve(ddcaAddress, _quoteTokenAmount);

    await ddca.createDDCA(_quoteTokenAmount, _lotSize);
    const [, quote0] = await ddca.getClientBalance(owner.address);
    const balance = await usdr.balanceOf(owner.address);

    expect(Number(balance)).to.be.equals(parseUnits('1000000', 8) - _quoteTokenAmount);

    await ddca.withdrawQuoteToken(_quoteTokenAmount);

    const [, quote] = await ddca.getClientBalance(owner.address);
    const totalLotSize = await ddca.getTotalLotSize();
    const balance1 = await usdr.balanceOf(owner.address);

    expect(Number(balance1)).to.be.equals(parseUnits('1000000', 8));

    expect(Number(quote0)).to.be.equal(_quoteTokenAmount);
    expect(Number(quote)).to.be.equal(0);
    expect(Number(totalLotSize)).to.be.equal(0);
  });
});
