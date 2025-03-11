import {
  parseUnits,
  toBigInt,
  ContractTransactionResponse,
  AddressLike,
} from 'ethers';
import { expect } from 'chai';
import hre from 'hardhat';

import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { ERC20DDCAManager, ERC20, USDT, WBTC } from 'typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

interface IContext {
  ddcaManager: ERC20DDCAManager & {
    deploymentTransaction(): ContractTransactionResponse;
  };
  ddcaAddress: AddressLike;
  usdt: USDT & {
    deploymentTransaction(): ContractTransactionResponse;
  };
  usdtAddress: AddressLike;
  wbtc: WBTC & {
    deploymentTransaction(): ContractTransactionResponse;
  };
  wbtcAddress: AddressLike;
  owner: HardhatEthersSigner;
  accounts: HardhatEthersSigner[];
}

describe('ERC20DDCAManager', function () {
  /**
   *
   * @returns
   */
  const deployContracts = async (): Promise<IContext> => {
    const [owner, ...accounts] = await hre.ethers.getSigners();

    const WBTC = await hre.ethers.getContractFactory('WBTC');
    const USDT = await hre.ethers.getContractFactory('USDT');
    const DDCAManager = await hre.ethers.getContractFactory('ERC20DDCAManager');

    const usdt = await USDT.deploy();
    const usdtAddress = await usdt.getAddress();

    const wbtc = await WBTC.deploy();
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
  const approveAllowance = async (
    token: ERC20,
    address: string,
    amount: bigint,
    account?: HardhatEthersSigner,
  ) => {
    const approve = account ? token.connect(account).approve : token.approve;

    return await approve(address, amount);
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
  const createDDCA = async (
    ddcaManager: ERC20DDCAManager,
    quoteToken: ERC20,
    amount: bigint,
    lotSize: bigint,
    account?: HardhatEthersSigner,
  ) => {
    const ddcaAddress = await ddcaManager.getAddress();

    await approveAllowance(quoteToken, ddcaAddress, amount, account);

    const createDDCA = account
      ? ddcaManager.connect(account).createDDCA
      : ddcaManager.createDDCA;
    const getNode = account
      ? ddcaManager.connect(account).getNode
      : ddcaManager.getNode;

    await createDDCA(amount, lotSize);

    const node = await getNode();

    return node;
  };

  /**
   *
   * @param ddcaManager
   * @param quoteToken
   * @param amount
   * @returns
   */
  const topUpDDCA = async (
    ddcaManager: ERC20DDCAManager,
    quoteToken: ERC20,
    amount: bigint,
    account?: HardhatEthersSigner,
  ) => {
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

    return updatedNode;
  };

  const toggleDDCANodestatus = async (
    ddcaManager: ERC20DDCAManager,
    account?: HardhatEthersSigner,
  ) => {
    const toggleDipsPurchasing = account
      ? ddcaManager.connect(account).toggleDipsPurchasing
      : ddcaManager.toggleDipsPurchasing;

    const getNode = account
      ? ddcaManager.connect(account).getNode
      : ddcaManager.getNode;

    await toggleDipsPurchasing();

    const node = await getNode();

    return node;
  };

  const airDrop = async (
    token: ERC20,
    amount: bigint,
    toAccount: HardhatEthersSigner,
  ) => {
    // token.approve(toAccount, amount);

    const status = token.transfer(toAccount, amount);

    return status;
  };

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

  describe('Create', function () {
    /**
     *
     */
    it('Creates a DDCA strategy for user', async function () {
      const { ddcaManager, usdt, owner }: any =
        await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('100', 6);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize);

      const node = await ddcaManager.getNode();

      expect(node[0]).to.be.equal(owner.address);
      expect(node[2]).to.be.equal(_quoteTokenAmount);
      expect(node[1]).to.be.equal(0);
      expect(node[7]).to.be.equal(_lotSize);
      expect(node[8]).to.be.equal(true);
    });
  });

  describe('Toggle Status', function () {
    /**
     *
     */
    it('Pause Dips Purchasing', async function () {
      const { ddcaManager, usdt }: any = await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('100', 6);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize);

      const activeNode = await ddcaManager.getNode();
      const totalLotSize = await ddcaManager.getTotalLotSize();

      expect(activeNode[8]).to.be.equal(true);
      expect(totalLotSize).to.be.equal(_lotSize);

      const pausedNode = await toggleDDCANodestatus(ddcaManager);
      const totalLotSizeAfterPause = await ddcaManager.getTotalLotSize();

      expect(pausedNode[8]).to.be.equal(false);
      expect(totalLotSizeAfterPause).to.be.equal(0);
    });

    /**
     *
     */
    it('Unpause Dips Purchasing', async function () {
      const { ddcaManager, usdt }: any = await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('100', 6);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize);
      const pausedNode = await toggleDDCANodestatus(ddcaManager);

      const totalLotSizeAfterPause = await ddcaManager.getTotalLotSize();

      expect(pausedNode[8]).to.be.equal(false);
      expect(totalLotSizeAfterPause).to.be.equal(0);

      const unpausedNode = await toggleDDCANodestatus(ddcaManager);

      const totalLotSizeAfterUnpause = await ddcaManager.getTotalLotSize();

      expect(unpausedNode[8]).to.be.equal(true);
      expect(totalLotSizeAfterUnpause).to.be.equal(_lotSize);
    });
  });

  /**
   *
   */
  describe('Withdraw', function () {
    it('Withdraw quote token from the contract', async function () {
      const { ddcaManager, usdt, owner, usdtAddress }: any =
        await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);

      const initialBalance = await usdt.balanceOf(owner.address);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize);

      const balanceAfterDDCA = await usdt.balanceOf(owner.address);

      const [, quote0] = await ddcaManager.getClientBalance(owner.address);

      expect(quote0).to.be.equals(_quoteTokenAmount);

      await ddcaManager.withdraw(usdtAddress, _quoteTokenAmount);

      expect(balanceAfterDDCA + _quoteTokenAmount).to.be.equals(initialBalance);
    });

    it('Withdraw base token from the contract', async function () {
      const { ddcaManager, usdt, wbtcAddress, wbtc }: any =
        await loadFixture(deployContracts);

      const ddcaAddress = await ddcaManager.getAddress();

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize);

      const totalLotSize = await ddcaManager.getTotalLotSize();
      const feesPercent = toBigInt(await ddcaManager.feesPercent());

      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountOut = parseUnits('0.5', 18);

      await airDrop(wbtc, amountOut, ddcaAddress);
      await ddcaManager._distributeReward(amountIn, amountOut);

      const node = await ddcaManager.getNode();

      await ddcaManager.withdraw(wbtcAddress, node[1]);

      const nodeAfterWithdrawal = await ddcaManager.getNode();

      expect(nodeAfterWithdrawal[1]).to.be.equals(0);
    });

    it('Withdrawal can only be done by client', async function () {
      const {
        ddcaManager,
        usdt,
        wbtcAddress,
        wbtc,
        usdtAddress,
        accounts,
        ddcaAddress,
      }: any = await loadFixture(deployContracts);

      const clientAccount = accounts[0];

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);

      await airDrop(usdt, _quoteTokenAmount, clientAccount);

      await createDDCA(
        ddcaManager,
        usdt,
        _quoteTokenAmount,
        _lotSize,
        clientAccount,
      );

      const totalLotSize = await ddcaManager.getTotalLotSize();
      const feesPercent = toBigInt(await ddcaManager.feesPercent());

      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountOut = parseUnits('0.5', 18);

      await airDrop(wbtc, amountOut, ddcaAddress);

      await ddcaManager._distributeReward(amountIn, amountOut);

      const node = await ddcaManager.connect(clientAccount).getNode();

      await expect(ddcaManager.withdraw(wbtcAddress, node[1]))
        .to.be.revertedWithCustomError(ddcaManager, 'InsufficientBalance')
        .withArgs('WBTC', 0, node[1]);

      await expect(ddcaManager.withdraw(usdtAddress, node[2]))
        .to.be.revertedWithCustomError(ddcaManager, 'InsufficientBalance')
        .withArgs('USDT', 0, node[2]);
    });
  });

  describe('Lot size', function () {
    /**
     * Edit lot size of an active strategy
     */
    it('Edit lot size of an active strategy', async function () {
      const { ddcaManager, usdt }: any = await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);
      const _updatedLotSize = parseUnits('500', 6);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize);

      const initialNode = await ddcaManager.getNode();

      await ddcaManager.updateLotSize(_updatedLotSize);

      const updatedNode = await ddcaManager.getNode();

      expect(initialNode[7]).to.be.equal(_lotSize);
      expect(updatedNode[7]).to.be.equal(_updatedLotSize);
    });

    /**
     * Edit lot size of an inactive strategy
     */
    it('Edit lot size of an inactive strategy', async function () {
      const { ddcaManager, usdt }: any = await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);
      const _updatedLotSize = parseUnits('500', 6);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize);

      const activeNode = await ddcaManager.getNode();

      expect(activeNode[8]).to.be.equal(true);
      expect(activeNode[7]).to.be.equal(_lotSize);

      await toggleDDCANodestatus(ddcaManager);

      await ddcaManager.updateLotSize(_updatedLotSize);

      const updatedNode = await ddcaManager.getNode();

      expect(updatedNode[7]).to.be.equal(_updatedLotSize);
      expect(updatedNode[8]).to.be.equal(true);
    });

    /**
     *
     */
    it('Edit lot size of an active strategy reverting with ValidationError', async function () {
      const { ddcaManager, usdt }: any = await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);
      const _updatedLotSize = parseUnits('50000', 6);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize);

      await expect(ddcaManager.updateLotSize(_updatedLotSize))
        .to.be.revertedWithCustomError(ddcaManager, 'ValidationError')
        .withArgs('New lot size is greater than quote token amount.');
    });

    /**
     * Checking the total order size of each swap
     */
    it('Total lot size equals to the sum of all the active strategy lot sizes', async function () {
      const { ddcaManager, usdt, accounts }: any =
        await loadFixture(deployContracts);

      const client1 = accounts[0];
      const client2 = accounts[1];

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);

      await airDrop(usdt, _quoteTokenAmount, client1);
      await airDrop(usdt, _quoteTokenAmount, client2);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize);
      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize, client1);
      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize, client2);

      const totalLotSize = await ddcaManager.getTotalLotSize();

      expect(totalLotSize).to.be.equals(_lotSize + _lotSize + _lotSize);

      await toggleDDCANodestatus(ddcaManager, client1);

      const newTotalLotSize = await ddcaManager.getTotalLotSize();

      expect(newTotalLotSize).to.be.equals(_lotSize + _lotSize);
    });
  });

  describe('Top-up', function () {
    /**
     * Top up current strategy with quote token
     */
    it('Top-up of an active strategy', async function () {
      const { ddcaManager, usdt }: any = await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);
      const _topUpAmount = parseUnits('10000', 6);

      const initialNode = await createDDCA(
        ddcaManager,
        usdt,
        _quoteTokenAmount,
        _lotSize,
      );

      const updatedNode = await topUpDDCA(ddcaManager, usdt, _topUpAmount);

      expect(initialNode[2]).to.be.equals(_quoteTokenAmount);
      expect(updatedNode[2]).to.be.equals(_quoteTokenAmount + _topUpAmount);
    });

    /**
     * Top up current strategy with quote token
     */
    it('Top-up of an inactive strategy', async function () {
      const { ddcaManager, usdt }: any = await loadFixture(deployContracts);

      const _quoteTokenAmount = parseUnits('10000', 6);
      const _lotSize = parseUnits('1000', 6);
      const _topUpAmount = parseUnits('10000', 6);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize);

      const pausedNode = await toggleDDCANodestatus(ddcaManager);

      expect(pausedNode[2]).to.be.equals(_quoteTokenAmount);
      expect(pausedNode[8]).to.be.equals(false);

      const updatedNode = await topUpDDCA(ddcaManager, usdt, _topUpAmount);

      expect(updatedNode[2]).to.be.equals(_quoteTokenAmount + _topUpAmount);
      expect(updatedNode[8]).to.be.equals(true);
    });
  });

  describe('Reward distribution', function () {
    /**
     * ! We need to change the function to public, for testing
     */
    it('Validate reward distribution between active strategies', async function () {
      const { ddcaManager, usdt, accounts }: any =
        await loadFixture(deployContracts);

      const feesPercent = toBigInt(await ddcaManager.feesPercent());

      const client1 = accounts[0];
      const client2 = accounts[1];

      const _quoteTokenAmount = parseUnits('10000', 6);

      const _lotSize1 = parseUnits('250', 6);
      const _lotSize2 = parseUnits('150', 6);
      const _lotSize3 = parseUnits('300', 6);

      await airDrop(usdt, _quoteTokenAmount, client1);
      await airDrop(usdt, _quoteTokenAmount, client2);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize1);
      await createDDCA(
        ddcaManager,
        usdt,
        _quoteTokenAmount,
        _lotSize2,
        client1,
      );
      await createDDCA(
        ddcaManager,
        usdt,
        _quoteTokenAmount,
        _lotSize3,
        client2,
      );

      const totalLotSize = await ddcaManager.getTotalLotSize();

      const expectedTotalLotSize = _lotSize1 + _lotSize2 + _lotSize3;

      expect(totalLotSize).to.be.equals(expectedTotalLotSize);

      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountOut = parseUnits('0.5', 18);

      await ddcaManager._distributeReward(amountIn, amountOut);

      const allNodes = await ddcaManager.getAllNodes();

      allNodes.forEach((node: any) => {
        expect(node[8]).to.be.equals(true);
        const rewardReceived = node[1];

        const lotSize = node[7];
        const contribution =
          lotSize - (lotSize * feesPercent) / toBigInt(1000000);
        const share = (contribution * amountOut) / amountIn;

        expect(share).to.be.equals(rewardReceived);
      });
    });

    /**
     * ! We need to change the function to public, for testing
     */
    it('Validate reward distribution does not includes inactive strategies', async function () {
      const { ddcaManager, usdt, accounts }: any =
        await loadFixture(deployContracts);

      const feesPercent = toBigInt(await ddcaManager.feesPercent());

      const client1 = accounts[0];
      const client2 = accounts[1];

      const _quoteTokenAmount = parseUnits('10000', 6);

      const _lotSize1 = parseUnits('250', 6);
      const _lotSize2 = parseUnits('150', 6);
      const _lotSize3 = parseUnits('300', 6);

      await airDrop(usdt, _quoteTokenAmount, client1);
      await airDrop(usdt, _quoteTokenAmount, client2);

      await createDDCA(ddcaManager, usdt, _quoteTokenAmount, _lotSize1);
      await createDDCA(
        ddcaManager,
        usdt,
        _quoteTokenAmount,
        _lotSize2,
        client1,
      );
      await createDDCA(
        ddcaManager,
        usdt,
        _quoteTokenAmount,
        _lotSize3,
        client2,
      );

      const pausedNode = await toggleDDCANodestatus(ddcaManager, client1);

      const totalLotSize = await ddcaManager.getTotalLotSize();

      const intialLotSize = _lotSize1 + _lotSize2 + _lotSize3;
      expect(pausedNode[8]).to.be.equals(false);
      expect(totalLotSize).to.be.equals(intialLotSize - pausedNode[7]);

      const amountIn =
        totalLotSize - (totalLotSize * feesPercent) / toBigInt(1000000);
      const amountOut = parseUnits('0.5', 18);

      await ddcaManager._distributeReward(amountIn, amountOut);

      const allNodes = await ddcaManager.getAllNodes();

      allNodes.forEach((node: any) => {
        const rewardReceived = node[1];

        if (node[8]) {
          expect(node[8]).to.be.equals(true);

          const lotSize = node[7];
          const contribution =
            lotSize - (lotSize * feesPercent) / toBigInt(1000000);
          const share = (contribution * amountOut) / amountIn;

          expect(share).to.be.equals(rewardReceived);
        } else {
          expect(0).to.be.equals(rewardReceived);
        }
      });
    });
  });

  describe('Renora fees', function () {
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

      expect(clientNode[2]).to.be.equals(_quoteTokenAmount);

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
