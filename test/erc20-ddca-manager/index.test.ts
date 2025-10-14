import { parseUnits, toBigInt } from 'ethers';
import { expect } from 'chai';

import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';

import {
  createMockDDCAStrategies,
  Node,
  getAmountOut,
  getNode,
  getNodeFromDDCANode,
  deployContracts,
  airDrop,
  createDDCA,
  toggleDDCANodestatus,
  topUpDDCA,
} from './helpers';

describe('ERC20DDCAManager', function () {
  describe('Initial states of the contract', function () {
    /**
     *
     */
    it('Initial token balances should be (0,0) ', async function () {
      const { ddcaManager }: any = await loadFixture(deployContracts);

      const [base, quote] = await ddcaManager.getBalance();

      expect(Number(base)).to.be.equal(0);
      expect(Number(quote)).to.be.equal(0);
    });
  });

  describe('Non-existant client account', function () {
    /**
     *
     */
    it('Reverts if we try to get client balance without an account', async function () {
      const { ddcaManager, owner }: any = await loadFixture(deployContracts);

      await expect(
        ddcaManager.getClientBalance(owner.address),
      ).to.be.revertedWith('User does not have any account.');
    });
  });

  describe('Create DDCA', function () {
    /**
     *
     */
    it('Failed to create a DDCA strategy with deposit amount below allowed min', async function () {
      const { ddcaManager, usdt, owner }: any =
        await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('9', 6);
      const _lotSize = parseUnits('100', 6);

      await expect(createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize))
        .to.be.revertedWithCustomError(ddcaManager, 'ValidationError')
        .withArgs('Deposit amount is too low.');
    });

    /**
     *
     */
    it('Failed to create a DDCA strategy with lotsize below allowed min', async function () {
      const { ddcaManager, usdt, owner }: any =
        await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('10', 6);
      const _lotSize = parseUnits('4', 6);

      await expect(createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize))
        .to.be.revertedWithCustomError(ddcaManager, 'ValidationError')
        .withArgs('Lot size is too low.');
    });

    /**
     *
     */
    it('Failed to create a DDCA strategy with lotsize > deposit amount', async function () {
      const { ddcaManager, usdt, owner }: any =
        await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('100', 6);
      const _lotSize = parseUnits('500', 6);

      await expect(createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize))
        .to.be.revertedWithCustomError(ddcaManager, 'ValidationError')
        .withArgs('Given amount is lower than lot size.');
    });

    /**
     *
     */
    it('Creates a DDCA strategy with valid inputs', async function () {
      const { ddcaManager, usdt, owner }: any =
        await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('100', 6);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize);

      const node = await getNode(ddcaManager);

      expect(node.account).to.be.equal(owner.address);
      expect(node.quoteTokenAmount).to.be.equal(_quoteTokenAmount);
      expect(node.baseTokenAmount).to.be.equal(0);
      expect(node.lotSize).to.be.equal(_lotSize);
      expect(node.nextLotSize).to.be.equal(_lotSize);
      expect(node.status).to.be.equal(true);
    });
  });

  describe('Toggle Status', function () {
    /**
     *
     */
    it('Pause active strategy', async function () {
      const { ddcaManager, usdt }: any = await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('100', 6);

      const node = await createDDCA(
        ddcaManager,
        usdt,
        _quoteTokenAmount,
        _lotSize,
      );

      expect(node.status).to.be.equal(true);

      const pausedNode = await toggleDDCANodestatus(ddcaManager);

      expect(pausedNode.status).to.be.equal(false);
    });

    /**
     *
     */
    it('Failed to pause strategy status for other clients', async function () {
      const { ddcaManager, usdt, accounts }: any =
        await loadFixture(deployContracts);
      const client = accounts[0];

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('5000', 6);

      await airDrop(usdt, _quoteTokenAmount, client);
      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize, client);

      await expect(
        toggleDDCANodestatus(ddcaManager, accounts[1]),
      ).to.be.revertedWith('You are not the owner.');
    });

    /**
     *
     */
    it('Failed to un-pause inactive strategy with 0 quote token amount', async function () {
      const { ddcaManager, usdt, usdtAddress, accounts }: any =
        await loadFixture(deployContracts);
      const client = accounts[0];
      const feesPercent = toBigInt(await ddcaManager.feesPercent());

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('5000', 6);

      await airDrop(usdt, _quoteTokenAmount, client);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize, client);
      const toleratedSlippagePrice = parseUnits('20000', 6);
      const amountIn =
        _quoteTokenAmount -
        (_quoteTokenAmount * feesPercent) / toBigInt(1000000);
      const amountOut = getAmountOut(amountIn, toleratedSlippagePrice);

      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);

      const pausedNode = await toggleDDCANodestatus(ddcaManager, client);
      expect(pausedNode.status).to.be.equal(false);

      await ddcaManager
        .connect(client)
        .withdraw(usdtAddress, pausedNode.quoteTokenAmount);

      await expect(
        toggleDDCANodestatus(ddcaManager, client),
      ).to.be.revertedWith('Not enough funds to activate strategy.');
    });

    /**
     *
     */
    it('Un-pause inactive strategy with "quote token amount >= lotsize"', async function () {
      const { ddcaManager, usdt, accounts }: any =
        await loadFixture(deployContracts);
      const client = accounts[0];
      const feesPercent = toBigInt(await ddcaManager.feesPercent());

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('5000', 6);

      await airDrop(usdt, _quoteTokenAmount, client);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize, client);
      const toleratedSlippagePrice = parseUnits('20000', 6);
      const amountIn =
        _quoteTokenAmount -
        (_quoteTokenAmount * feesPercent) / toBigInt(1000000);
      const amountOut = getAmountOut(amountIn, toleratedSlippagePrice);

      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);

      const pausedNode = await toggleDDCANodestatus(ddcaManager, client);
      expect(pausedNode.status).to.be.equal(false);

      const unpausedNode = await toggleDDCANodestatus(ddcaManager, client);

      expect(unpausedNode.status).to.be.equal(true);
      expect(unpausedNode.nextLotSize).to.be.equal(_lotSize);
    });

    /**
     *
     */
    it('Un-pause inactive strategy with "0 > quote token amount < lotsize"', async function () {
      const { ddcaManager, usdt, accounts }: any =
        await loadFixture(deployContracts);
      const client = accounts[0];
      const feesPercent = toBigInt(await ddcaManager.feesPercent());

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('7500', 6);
      const toleratedSlippagePrice = parseUnits('20000', 6);
      const amountIn =
        _quoteTokenAmount -
        (_quoteTokenAmount * feesPercent) / toBigInt(1000000);
      const amountOut = getAmountOut(amountIn, toleratedSlippagePrice);

      await airDrop(usdt, _quoteTokenAmount, client);
      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize, client);

      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);

      const pausedNode = await toggleDDCANodestatus(ddcaManager, client);

      expect(pausedNode.status).to.be.equal(false);

      const unpausedNode = await toggleDDCANodestatus(ddcaManager, client);

      expect(unpausedNode.status).to.be.equal(true);
      expect(unpausedNode.quoteTokenAmount).to.be.equal(
        _quoteTokenAmount - _lotSize,
      );
      expect(unpausedNode.nextLotSize).to.be.equal(
        unpausedNode.quoteTokenAmount,
      );
    });
  });

  /**
   *
   */
  describe('Withdraw', function () {
    it('Only clients can call "withdraw" function', async function () {
      const { ddcaManager, ddcaOwner, wbtcAddress, usdtAddress, nodes } =
        await createMockDDCAStrategies();

      await expect(
        ddcaManager.withdraw(wbtcAddress, nodes[0].baseTokenAmount),
      ).to.be.revertedWith('You are not the owner.');

      await expect(
        ddcaManager.withdraw(usdtAddress, nodes[0].quoteTokenAmount),
      ).to.be.revertedWith('You are not the owner.');
    });

    it('Failed to withdraw for "amount <= 0"', async function () {
      const { ddcaManager, wbtcAddress, clients } =
        await createMockDDCAStrategies();

      const client = clients[0];

      await expect(
        ddcaManager.connect(client).withdraw(wbtcAddress, toBigInt(0)),
      ).to.be.revertedWith('Amount must be greater than 0.');
    });

    it('Failed to withdraw for a invalid token address', async function () {
      const { ddcaManager, clients, feesPercent, totalLotSize } =
        await createMockDDCAStrategies();

      const inValidTokenAddress = '0x715262B3Ff8727cFB87d8DaAafc88ECB0f8e53dB';
      const client = clients[0];

      const toleratedSlippagePrice = parseUnits('20000', 6);
      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountOut = getAmountOut(amountIn, toleratedSlippagePrice);

      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);

      await expect(
        ddcaManager.connect(client).withdraw(inValidTokenAddress, amountOut),
      )
        .to.be.revertedWithCustomError(ddcaManager, 'ValidationError')
        .withArgs('Invalid token address');
    });

    it('Failed to withdraw base token if "amount > available balance"', async function () {
      const { ddcaManager, wbtcAddress, clients, feesPercent, totalLotSize } =
        await createMockDDCAStrategies();

      const client = clients[0];

      const toleratedSlippagePrice = parseUnits('20000', 6);
      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountOut = getAmountOut(amountIn, toleratedSlippagePrice);

      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);

      const node = await getNode(ddcaManager, client);

      await expect(ddcaManager.connect(client).withdraw(wbtcAddress, amountOut))
        .to.be.revertedWithCustomError(ddcaManager, 'InsufficientBalance')
        .withArgs('WBTC', node.baseTokenAmount, amountOut);
    });

    it('Withdraw base token successfully', async function () {
      const {
        ddcaManager,
        ddcaAddress,
        wbtc,
        wbtcAddress,
        clients,
        feesPercent,
        totalLotSize,
      } = await createMockDDCAStrategies();

      const client = clients[0];

      const tokenDecimal = await wbtc.decimals();
      const toleratedSlippagePrice = parseUnits('20000', 6);
      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountOut = getAmountOut(
        amountIn,
        toleratedSlippagePrice,
        tokenDecimal,
      );

      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);
      await airDrop(wbtc, amountOut, ddcaAddress);
      const node = await getNode(ddcaManager, client);

      await expect(
        ddcaManager.connect(client).withdraw(wbtcAddress, node.baseTokenAmount),
      )
        .to.be.emit(ddcaManager, 'Withdraw')
        .withArgs(true, wbtcAddress, node.baseTokenAmount, client.address);

      const nodeAfterWithdrawal = await getNode(ddcaManager, client);
      expect(nodeAfterWithdrawal.baseTokenAmount).to.be.equals(0);

      const wbtcBalance = await wbtc.balanceOf(client.address);
      expect(wbtcBalance).to.be.equals(node.baseTokenAmount);
    });

    it('Failed to withdraw quote token if "amount > available balance"', async function () {
      const { ddcaManager, usdtAddress, clients, feesPercent, totalLotSize } =
        await createMockDDCAStrategies();

      const client = clients[0];

      const toleratedSlippagePrice = parseUnits('20000', 6);
      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountOut = getAmountOut(amountIn, toleratedSlippagePrice);

      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);

      const node = await getNode(ddcaManager, client);

      await expect(
        ddcaManager.connect(client).withdraw(usdtAddress, totalLotSize),
      )
        .to.be.revertedWithCustomError(ddcaManager, 'InsufficientBalance')
        .withArgs('USDT', node.quoteTokenAmount, totalLotSize);
    });

    it('Withdraw quote token successfully', async function () {
      const {
        ddcaManager,
        usdt,
        usdtAddress,
        clients,
        feesPercent,
        totalLotSize,
      } = await createMockDDCAStrategies();

      const client = clients[0];

      const toleratedSlippagePrice = parseUnits('20000', 6);
      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountOut = getAmountOut(amountIn, toleratedSlippagePrice);

      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);
      const node = await getNode(ddcaManager, client);

      await expect(
        ddcaManager
          .connect(client)
          .withdraw(usdtAddress, node.quoteTokenAmount),
      )
        .to.be.emit(ddcaManager, 'Withdraw')
        .withArgs(true, usdtAddress, node.quoteTokenAmount, client.address);

      const nodeAfterWithdrawal = await getNode(ddcaManager, client);
      expect(nodeAfterWithdrawal.quoteTokenAmount).to.be.equals(0);
      expect(nodeAfterWithdrawal.status).to.be.equals(false);
      expect(nodeAfterWithdrawal.nextLotSize).to.be.equals(0);

      const usdtBalance = await usdt.balanceOf(client.address);
      expect(usdtBalance).to.be.equals(node.quoteTokenAmount);
    });

    it('Withdraw quote token successfully, when updated "quote token balance <= 1 USD"', async function () {
      const {
        ddcaManager,
        usdt,
        usdtAddress,
        clients,
        feesPercent,
        totalLotSize,
      } = await createMockDDCAStrategies();

      const client = clients[0];

      const toleratedSlippagePrice = parseUnits('20000', 6);
      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountOut = getAmountOut(amountIn, toleratedSlippagePrice);

      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);
      const node = await getNode(ddcaManager, client);

      const amountRequested = node.quoteTokenAmount - parseUnits('1', 6);

      await expect(
        ddcaManager.connect(client).withdraw(usdtAddress, amountRequested),
      )
        .to.be.emit(ddcaManager, 'Withdraw')
        .withArgs(true, usdtAddress, node.quoteTokenAmount, client.address);

      const nodeAfterWithdrawal = await getNode(ddcaManager, client);
      expect(nodeAfterWithdrawal.quoteTokenAmount).to.be.equals(0);
      expect(nodeAfterWithdrawal.status).to.be.equals(false);
      expect(nodeAfterWithdrawal.nextLotSize).to.be.equals(0);

      const usdtBalance = await usdt.balanceOf(client.address);
      expect(usdtBalance).to.be.equals(node.quoteTokenAmount);
    });

    it('Withdraw quote token successfully and "0 > balance < lotsize"', async function () {
      const {
        ddcaManager,
        usdt,
        usdtAddress,
        clients,
        feesPercent,
        totalLotSize,
      } = await createMockDDCAStrategies();

      const client = clients[0];

      const toleratedSlippagePrice = parseUnits('20000', 6);
      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountOut = getAmountOut(amountIn, toleratedSlippagePrice);

      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);
      const node = await getNode(ddcaManager, client);

      const amountToWithDraw = node.quoteTokenAmount - toBigInt(100000000);

      await expect(
        ddcaManager.connect(client).withdraw(usdtAddress, amountToWithDraw),
      )
        .to.be.emit(ddcaManager, 'Withdraw')
        .withArgs(true, usdtAddress, amountToWithDraw, client.address);

      const nodeAfterWithdrawal = await getNode(ddcaManager, client);
      expect(nodeAfterWithdrawal.quoteTokenAmount).to.be.equals(
        toBigInt(100000000),
      );
      expect(nodeAfterWithdrawal.nextLotSize).to.be.equals(toBigInt(100000000));
      expect(nodeAfterWithdrawal.nextLotSize).to.be.not.equals(
        nodeAfterWithdrawal.lotSize,
      );

      const usdtBalance = await usdt.balanceOf(client.address);
      expect(usdtBalance).to.be.equals(amountToWithDraw);
    });

    it('Remove node if both quote and base token amount is zero', async function () {
      const { ddcaManager, usdtAddress, clients } =
        await createMockDDCAStrategies();

      const client = clients[0];

      const node = await getNode(ddcaManager, client);

      await expect(
        ddcaManager
          .connect(client)
          .withdraw(usdtAddress, node.quoteTokenAmount),
      )
        .to.be.emit(ddcaManager, 'Withdraw')
        .withArgs(true, usdtAddress, node.quoteTokenAmount, client.address);

      await expect(getNode(ddcaManager, client)).to.be.revertedWith(
        'User does not have any account.',
      );
    });
  });

  describe('Lot size', function () {
    /**
     * Edit lot size of an active strategy
     */
    it('Only client can update lotsize', async function () {
      const { ddcaManager, usdt, accounts }: any =
        await loadFixture(deployContracts);
      const client = accounts[1];
      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);
      const _updatedLotSize = parseUnits('500', 6);

      await airDrop(usdt, _quoteTokenAmount, client);
      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize, client);

      await expect(
        ddcaManager.updateLotSize(_updatedLotSize),
      ).to.be.revertedWith('You are not the owner.');
    });

    /**
     * Edit lot size of an active strategy
     */
    it('Failed to update lotsize to below min. allowed lot size', async function () {
      const { ddcaManager, usdt, accounts }: any =
        await loadFixture(deployContracts);
      const client = accounts[1];
      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);
      const _updatedLotSize = parseUnits('4', 6);

      await airDrop(usdt, _quoteTokenAmount, client);
      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize, client);

      await expect(ddcaManager.connect(client).updateLotSize(_updatedLotSize))
        .to.be.revertedWithCustomError(ddcaManager, 'ValidationError')
        .withArgs('Lot size is too low.');
    });

    /**
     * Edit lot size of an active strategy
     */
    it('Failed to update lotsize to above quote token balance', async function () {
      const { ddcaManager, usdt, accounts }: any =
        await loadFixture(deployContracts);
      const client = accounts[1];
      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);
      const _updatedLotSize = parseUnits('40000', 6);

      await airDrop(usdt, _quoteTokenAmount, client);
      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize, client);

      await expect(
        ddcaManager.connect(client).updateLotSize(_updatedLotSize, client),
      )
        .to.be.revertedWithCustomError(ddcaManager, 'ValidationError')
        .withArgs('New lot size is greater than quote token amount.');
    });

    /**
     * Edit lot size of an inactive strategy
     */
    it('Edit lot size of an inactive strategy', async function () {
      const { ddcaManager, usdt, accounts }: any =
        await loadFixture(deployContracts);
      const client = accounts[1];
      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);
      const _updatedLotSize = parseUnits('500', 6);

      await airDrop(usdt, _quoteTokenAmount, client);
      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize, client);

      const pausedNode = await toggleDDCANodestatus(ddcaManager, client);

      expect(pausedNode.status).to.be.equals(false);
      expect(pausedNode.lotSize).to.be.equals(_lotSize);
      expect(pausedNode.nextLotSize).to.be.equals(_lotSize);

      await ddcaManager.connect(client).updateLotSize(_updatedLotSize, client);

      const activeNode = await getNode(ddcaManager, client);

      expect(activeNode.status).to.be.equals(true);
      expect(activeNode.lotSize).to.be.equals(_updatedLotSize);
      expect(activeNode.nextLotSize).to.be.equals(_updatedLotSize);
    });

    /**
     * Edit lot size of an inactive strategy
     */
    it('Edit lot size of an active strategy', async function () {
      const { ddcaManager, usdt, accounts }: any =
        await loadFixture(deployContracts);
      const client = accounts[1];
      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);
      const _updatedLotSize = parseUnits('500', 6);

      await airDrop(usdt, _quoteTokenAmount, client);
      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize, client);

      const node = await getNode(ddcaManager, client);

      expect(node.lotSize).to.be.equals(_lotSize);
      expect(node.nextLotSize).to.be.equals(_lotSize);

      await ddcaManager.connect(client).updateLotSize(_updatedLotSize, client);

      const updatedNode = await getNode(ddcaManager, client);

      expect(updatedNode.lotSize).to.be.equals(_updatedLotSize);
      expect(updatedNode.nextLotSize).to.be.equals(_updatedLotSize);
    });

    /**
     * Checking the total order size of each swap
     */
    it('Total lot size equals to the sum of all the active strategy lot sizes', async function () {
      const {
        ddcaManager,
        usdt,
        usdtAddress,
        clients,
        feesPercent,
        totalLotSize,
        nodes,
      } = await createMockDDCAStrategies();

      const client = clients[0];
      const node = await getNode(ddcaManager, client);

      const expectedTotalLotSize = nodes.reduce(
        (prev: bigint, curr: Node) => prev + curr.nextLotSize,
        toBigInt(0),
      );
      expect(totalLotSize).to.be.equals(expectedTotalLotSize);

      await toggleDDCANodestatus(ddcaManager, client);

      const newTotalLotSize = await ddcaManager.getTotalLotSize();

      expect(newTotalLotSize).to.be.equals(totalLotSize - node.nextLotSize);
    });
  });

  describe('Top-up', function () {
    /**
     * Top up current strategy with quote token
     */
    it('Only clients can call "topUp" function', async function () {
      const { ddcaManager } = await createMockDDCAStrategies();

      const topUpAmount = parseUnits('9', 6);

      await expect(ddcaManager.topUp(topUpAmount)).to.be.revertedWith(
        'You are not the owner.',
      );
    });

    /**
     * Top up current strategy with quote token
     */
    it('Failed to top-up an active strategy with "amount < min. allowed"', async function () {
      const { ddcaManager, clients } = await createMockDDCAStrategies();

      const client = clients[0];
      const node = await getNode(ddcaManager, client);

      const topUpAmount = parseUnits('9', 6);

      await expect(ddcaManager.connect(client).topUp(topUpAmount))
        .to.be.revertedWithCustomError(ddcaManager, 'ValidationError')
        .withArgs('Deposit amount is too low.');
    });

    /**
     * Top up current strategy with quote token
     */
    it('Top-up of an active strategy', async function () {
      const { ddcaManager, clients, usdt, usdtAddress } =
        await createMockDDCAStrategies();

      const client = clients[0];
      const node = await getNode(ddcaManager, client);

      const topUpAmount = parseUnits('100', 6);
      await airDrop(usdt, topUpAmount, client);

      const toppedUpNode = await topUpDDCA(
        ddcaManager,
        usdt,
        topUpAmount,
        client,
      );

      expect(toppedUpNode.quoteTokenAmount).to.be.equals(
        node.quoteTokenAmount + topUpAmount,
      );
    });

    /**
     * Top up current strategy with quote token
     */
    it('Top-up of an inactive strategy and "quote token amount >= lotsize"', async function () {
      const { ddcaManager, clients, usdt, usdtAddress } =
        await createMockDDCAStrategies();

      const client = clients[0];

      ddcaManager.connect(client).withdraw(usdtAddress, parseUnits('9500', 6));

      const pausedNode = await toggleDDCANodestatus(ddcaManager, client);

      expect(pausedNode.status).to.be.equals(false);

      const topUpAmount = parseUnits('5000', 6);
      await airDrop(usdt, topUpAmount, client);

      const toppedUpNode = await topUpDDCA(
        ddcaManager,
        usdt,
        topUpAmount,
        client,
      );

      expect(toppedUpNode.quoteTokenAmount).to.be.greaterThanOrEqual(
        toppedUpNode.lotSize,
      );
      expect(toppedUpNode.nextLotSize).to.be.equals(toppedUpNode.lotSize);
      expect(toppedUpNode.status).to.be.equals(true);
      expect(toppedUpNode.quoteTokenAmount).to.be.equals(
        pausedNode.quoteTokenAmount + topUpAmount,
      );
    });

    /**
     * Top up current strategy with quote token
     */
    it('Top-up of an inactive strategy and "quote token amount < lotsize"', async function () {
      const { ddcaManager, clients, usdt, usdtAddress } =
        await createMockDDCAStrategies();

      const client = clients[0];

      ddcaManager.connect(client).withdraw(usdtAddress, parseUnits('9500', 6));

      const pausedNode = await toggleDDCANodestatus(ddcaManager, client);

      expect(pausedNode.status).to.be.equals(false);

      const topUpAmount = parseUnits('500', 6);
      await airDrop(usdt, topUpAmount, client);

      const toppedUpNode = await topUpDDCA(
        ddcaManager,
        usdt,
        topUpAmount,
        client,
      );

      expect(toppedUpNode.quoteTokenAmount).to.be.lessThan(
        toppedUpNode.lotSize,
      );
      expect(toppedUpNode.nextLotSize).to.be.equals(
        toppedUpNode.quoteTokenAmount,
      );
      expect(toppedUpNode.status).to.be.equals(true);
      expect(toppedUpNode.quoteTokenAmount).to.be.equals(
        pausedNode.quoteTokenAmount + topUpAmount,
      );
    });
  });

  describe('Reward distribution', function () {
    /**
     *
     */
    it('Only active strategies receives rewards', async function () {
      const { ddcaManager, nodes, clients, feesPercent } =
        await createMockDDCAStrategies();

      const intialLotSize = nodes.reduce(
        (prev: bigint, curr: Node) => prev + curr.nextLotSize,
        toBigInt(0),
      );

      const pausedNode = await toggleDDCANodestatus(ddcaManager, clients[0]);

      const totalLotSize = await ddcaManager.getTotalLotSize();

      expect(pausedNode.status).to.be.equals(false);
      expect(totalLotSize).to.be.equals(intialLotSize - pausedNode.nextLotSize);

      const toleratedSlippagePrice = parseUnits('20000', 6);
      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);

      const amountOut = getAmountOut(amountIn, toleratedSlippagePrice);

      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);

      const allNodes = await ddcaManager.getAllNodes();

      allNodes.forEach((ddcaNode: any) => {
        const node = getNodeFromDDCANode(ddcaNode);

        const rewardReceived = node.baseTokenAmount;
        const status = node.status;

        const lotSize = node.nextLotSize;
        const contribution =
          lotSize - (lotSize * feesPercent) / toBigInt(1000000);
        const share = status ? (contribution * amountOut) / amountIn : 0;

        expect(share).to.be.equals(rewardReceived);
      });
    });

    /**
     * ! We need to change the function to public, for testing
     */
    it('Node is disabled if "quote token balance = 0"', async function () {
      const { ddcaManager, nodes, feesPercent } =
        await createMockDDCAStrategies();

      const totalLotSize = await ddcaManager.getTotalLotSize();

      const expectedTotalLotSize = nodes.reduce(
        (prev: bigint, curr: Node) => prev + curr.nextLotSize,
        toBigInt(0),
      );

      expect(totalLotSize).to.be.equals(expectedTotalLotSize);

      const toleratedSlippagePrice = parseUnits('20000', 6);
      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountOut = getAmountOut(amountIn, toleratedSlippagePrice);

      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);
      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);

      const allNodes = await ddcaManager.getAllNodes();

      allNodes.forEach((ddcaNode: any) => {
        const node = getNodeFromDDCANode(ddcaNode);

        const rewardReceived = node.baseTokenAmount;

        const lotSize = node.lotSize;
        const contribution =
          lotSize - (lotSize * feesPercent) / toBigInt(1000000);
        const share = toBigInt(2) * ((contribution * amountOut) / amountIn);

        expect(share).to.be.equals(rewardReceived);

        expect(node.status).to.be.equals(
          node.quoteTokenAmount == toBigInt(0) ? false : true,
        );
        expect(node.nextLotSize).to.be.equals(
          node.quoteTokenAmount == toBigInt(0) ? toBigInt(0) : node.lotSize,
        );
      });
    });

    /**
     * ! We need to change the function to public, for testing
     */
    it('Next lotsize is adjusted if " 0 < quote token balance < lotsize"', async function () {
      const { ddcaManager, nodes, feesPercent } =
        await createMockDDCAStrategies();

      const totalLotSize = await ddcaManager.getTotalLotSize();

      const expectedTotalLotSize = nodes.reduce(
        (prev: bigint, curr: Node) => prev + curr.nextLotSize,
        toBigInt(0),
      );

      expect(totalLotSize).to.be.equals(expectedTotalLotSize);

      const toleratedSlippagePrice = parseUnits('20000', 6);
      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountOut = getAmountOut(amountIn, toleratedSlippagePrice);

      [1, 2, 3].forEach(async () => {
        await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);

        const allNodes = await ddcaManager.getAllNodes();

        allNodes.forEach((ddcaNode: any) => {
          const node = getNodeFromDDCANode(ddcaNode);

          if (node.status) {
            const rewardReceived = node.baseTokenAmount;

            const lotSize = node.lotSize;
            const contribution =
              lotSize - (lotSize * feesPercent) / toBigInt(1000000);
            const share = (contribution * amountOut) / amountIn;

            expect(share).to.be.equals(rewardReceived);

            expect(node.status).to.be.equals(
              node.quoteTokenAmount == toBigInt(0) ? false : true,
            );

            if (node.quoteTokenAmount > 0) {
              expect(node.nextLotSize).to.be.equals(
                node.quoteTokenAmount < node.lotSize
                  ? node.quoteTokenAmount
                  : node.lotSize,
              );
            } else {
              expect(node.nextLotSize).to.be.equals(
                node.quoteTokenAmount == toBigInt(0)
                  ? toBigInt(0)
                  : node.lotSize,
              );
            }
          }
        });
      });
    });
  });

  describe('Renora fees', function () {
    it('Fees getting accumulated after Dips Purchasing', async function () {
      const { ddcaManager, usdt, feesPercent, totalLotSize, ddcaOwner } =
        await createMockDDCAStrategies();

      const toleratedSlippagePrice = parseUnits('20000', 6);
      const swapFeeAmount = (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountIn = totalLotSize - swapFeeAmount;

      const amountOut = getAmountOut(amountIn, toleratedSlippagePrice);

      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);
      await ddcaManager.purchaseDips(toleratedSlippagePrice, amountOut);

      const totalFeesCollected = await ddcaManager.getTotalFeesCollected();

      expect(totalFeesCollected).to.be.equals(swapFeeAmount * toBigInt(2));

      const preBal = await usdt.balanceOf(ddcaOwner);

      await ddcaManager.withdrawFees(ddcaOwner, totalFeesCollected);

      const postBal = await usdt.balanceOf(ddcaOwner);
      expect(postBal).to.be.equals(preBal + totalFeesCollected);
    });

    it('Update fees percent by owner only', async function () {
      const { ddcaManager, accounts }: any = await loadFixture(deployContracts);

      const feesPercent = await ddcaManager.feesPercent();

      expect(feesPercent).to.be.equals(toBigInt(2500));

      const updatedFeesPercent = toBigInt(1000);

      await ddcaManager.updateFeesPercent(updatedFeesPercent);

      const newFeesPercent = await ddcaManager.feesPercent();

      expect(newFeesPercent).to.be.equals(updatedFeesPercent);

      await expect(
        ddcaManager.connect(accounts[0]).updateFeesPercent(feesPercent),
      ).to.be.revertedWithCustomError(
        ddcaManager,
        'OwnableUnauthorizedAccount',
      );
    });

    it('Fees should be only collected by owner', async function () {
      const { ddcaManager, accounts }: any = await loadFixture(deployContracts);

      await expect(
        ddcaManager.withdrawFees(accounts[0], toBigInt(100)),
      ).to.be.revertedWithCustomError(ddcaManager, 'InsufficientBalance');

      await expect(
        ddcaManager.connect(accounts[0]).withdrawFees(accounts[0], toBigInt(0)),
      ).to.be.revertedWithCustomError(
        ddcaManager,
        'OwnableUnauthorizedAccount',
      );
    });
  });

  describe('Fund Security', function () {
    it('Owners cannot withdraw clients fund', async function () {
      const { ddcaManager, accounts, usdt, owner, ddcaAddress }: any =
        await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('100000', 6);
      const _lotSize = parseUnits('1000', 6);

      const clientAccount = accounts[0];
      const evilAccount = accounts[1];

      await airDrop(usdt, _quoteTokenAmount, clientAccount);

      const clientNode = await createDDCA(
        ddcaManager,
        usdt,
        _quoteTokenAmount,
        _lotSize,
        clientAccount,
      );

      const initialBalance = await usdt.balanceOf(ddcaAddress);

      expect(clientNode.quoteTokenAmount).to.be.equals(_quoteTokenAmount);

      await expect(
        usdt.approve(evilAccount.address, _quoteTokenAmount),
      ).to.emit(usdt, 'Approval');

      const allowance = await usdt.allowance(ddcaAddress, evilAccount.address);

      expect(allowance).to.be.equals(0);

      await expect(
        usdt.transferFrom(ddcaAddress, owner.address, _quoteTokenAmount),
      ).to.be.revertedWithCustomError(usdt, 'ERC20InsufficientAllowance');

      const finalBalance = await usdt.balanceOf(ddcaAddress);

      expect(finalBalance).to.be.equal(initialBalance);
    });
  });
});
