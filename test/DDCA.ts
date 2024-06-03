import { parseUnits } from 'ethers';
import { expect } from 'chai';
import hre from 'hardhat';

import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';

describe('DDCA', function () {
  const deployContracts = async () => {
    const [owner, client1, client2] = await hre.ethers.getSigners();

    const USDR = await hre.ethers.getContractFactory('USDRToken');
    const SlothToken = await hre.ethers.getContractFactory('SlothToken');
    const DDCA = await hre.ethers.getContractFactory('DDCA');
    const MockRouter = await hre.ethers.getContractFactory('MockRouter');

    const usdr = await USDR.deploy();
    const usdrtAddress = await usdr.getAddress();

    const slothToken = await SlothToken.deploy();
    const slothTokenAddress = await slothToken.getAddress();

    // const mockRouter = await MockRouter.deploy();
    // const mockRouterAddress = await mockRouter.getAddress()


    const ddca = await DDCA.deploy(slothTokenAddress, usdrtAddress);

    return { ddca, usdr, usdrtAddress, slothToken, slothTokenAddress, owner, client1, client2 };
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

    // const [, quote] = await ddca.getClientBalance(owner.address);
    const totalLotSize = await ddca.getTotalLotSize();
    // const balance1 = await usdr.balanceOf(owner.address);

    // expect(Number(balance1)).to.be.equals(_quoteTokenAmount-parseUnits('1000', 8));

    expect(Number(quote0)).to.be.equal(_quoteTokenAmount);
    // expect(Number(quote)).to.be.equal(0);
    expect(Number(totalLotSize)).to.be.equal(0);
  });

  it('Transfer USDR tokens to client1 and client2', async function () {
    const { usdr, owner, client1, client2 }: any = await loadFixture(deployContracts);
  
    const transferAmount = parseUnits('50000', 8);
  
    // Transfer USDR tokens to client1
    await usdr.transfer(client1.address, transferAmount);
  
    // Transfer USDR tokens to client2
    await usdr.transfer(client2.address, transferAmount);
  
    const client1Balance = await usdr.balanceOf(client1.address);
    const client2Balance = await usdr.balanceOf(client2.address);
  
    expect(Number(client1Balance)).to.be.equal(transferAmount);
    expect(Number(client2Balance)).to.be.equal(transferAmount);
  });
  
  it('Approve USDR tokens for DDCA from client1 and client2', async function () {
    const { ddca, usdr, owner, client1, client2 }: any = await loadFixture(deployContracts);
  
    const approveAmount = parseUnits('50000', 8);
    const ddcaAddress = await ddca.getAddress();
  
    // Approve USDR tokens for DDCA from client1
    await usdr.connect(client1).approve(ddcaAddress, approveAmount);
  
    // Approve USDR tokens for DDCA from client2
    await usdr.connect(client2).approve(ddcaAddress, approveAmount);
  
    const client1Allowance = await usdr.allowance(client1.address, ddcaAddress);
    const client2Allowance = await usdr.allowance(client2.address, ddcaAddress);
    expect(Number(client1Allowance)).to.be.equal(approveAmount);
    expect(Number(client2Allowance)).to.be.equal(approveAmount);
  });
  
  it('Creates a DDCA for client1 and client2 and Withdraw', async function () {
    const { ddca, usdr, owner, client1, client2 }: any = await loadFixture(deployContracts);
  
    const _quoteTokenAmount = parseUnits('5000', 8);
    const _lotSize = parseUnits('1000', 8);
    const ddcaAddress = await ddca.getAddress();
    const transferAmount = parseUnits('50000', 8);
  
    // Transfer USDR tokens to client1
    await usdr.transfer(client1.address, transferAmount);
  
    // Transfer USDR tokens to client2
    await usdr.transfer(client2.address, transferAmount);


    await usdr.connect(client1).approve(ddcaAddress, _quoteTokenAmount);
    await usdr.connect(client2).approve(ddcaAddress, _quoteTokenAmount);
    
    // Create DDCA for client1
    await ddca.connect(client1).createDDCA(_quoteTokenAmount, _lotSize);

    // Create DDCA for client2
    const client2Allowance = await usdr.allowance(client2.address, ddcaAddress);
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
    const { ddca, usdr, owner, client1, client2 }: any = await loadFixture(deployContracts);

    const _quoteTokenAmount = parseUnits('5000', 8);
    const _additionalQuoteTokenAmount = parseUnits('5000', 8);

    // Transfer USDR tokens to client1 and client2
    await usdr.transfer(client1.address, _quoteTokenAmount);
    await usdr.transfer(client2.address, _quoteTokenAmount);

    const ddcaAddress = await ddca.getAddress();

    // Approve USDR tokens for DDCA from client1 and client2
    await usdr.connect(client1).approve(ddcaAddress, _quoteTokenAmount);
    await usdr.connect(client2).approve(ddcaAddress, _quoteTokenAmount);

    // Create DDCA for client1 and client2
    await ddca.connect(client1).createDDCA(_quoteTokenAmount, _quoteTokenAmount);
    await ddca.connect(client2).createDDCA(_quoteTokenAmount, _quoteTokenAmount);

    // Transfer USDR tokens to client1 and client2
    await usdr.transfer(client1.address, _additionalQuoteTokenAmount);
    await usdr.transfer(client2.address, _additionalQuoteTokenAmount);

    // Top-up DDCA for client1
    await usdr.connect(client1).approve(ddcaAddress, _additionalQuoteTokenAmount);
    await ddca.connect(client1).topUp(_additionalQuoteTokenAmount);

    // Top-up DDCA for client2
    await usdr.connect(client2).approve(ddcaAddress, _additionalQuoteTokenAmount);
    await ddca.connect(client2).topUp(_additionalQuoteTokenAmount);

    const [client1Base, client1Quote] = await ddca.getClientBalance(client1.address);
    const [client2Base, client2Quote] = await ddca.getClientBalance(client2.address);

    expect(Number(client1Quote)).to.be.equal(_quoteTokenAmount+_additionalQuoteTokenAmount);
    expect(Number(client2Quote)).to.be.equal(_quoteTokenAmount+_additionalQuoteTokenAmount);
    expect(Number(client1Base)).to.be.equal(0);
    expect(Number(client2Base)).to.be.equal(0);

    await ddca.connect(client1).withdrawQuoteToken(_quoteTokenAmount);
    
    await ddca.connect(client2).withdrawQuoteToken(_quoteTokenAmount);

    const [, client1Quote0] = await ddca.getClientBalance(client1.address);
    const [, client2Quote0] = await ddca.getClientBalance(client2.address);


    expect(Number(client1Quote0)).to.be.equal(_additionalQuoteTokenAmount)
    expect(Number(client2Quote0)).to.be.equal(_additionalQuoteTokenAmount)
  });
  
});
