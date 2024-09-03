// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {IQuoterV2} from "@uniswap/v3-periphery/contracts/interfaces/IQuoterV2.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import {ERC20DDCAManager} from "../../../core/contracts/ERC20DDCAManager.sol";
import {MathUtils} from "../../../core/libraries/MathUtils.sol";

/**
 * @title DDCA
 * @notice Dollar-Cost Averaging contract for automated trading
 */
contract DDCAAribitrum is ERC20DDCAManager {
    ISwapRouter private immutable _swapRouter;
    IQuoterV2 private immutable _quoter =
        IQuoterV2(0x61fFE014bA17989E743c5F6cB21bF9697530B21e);

    /**
     * @dev
     *
     * For Stablecoins (Low Volatility):
     *  Use Pool 1 (0.05% fee -> 500) if it has sufficient liquidity.
     * For Common Token Pairs:
     *  Use Pool 2 (0.30% fee -> 3000) if Pool 1 has insufficient liquidity.
     * For Volatile or Less Liquid Tokens:
     *  Use Pool 3 (1.00% fee -> 10000) if the other pools have low liquidity.
     */
    uint24[2] internal poolFees = [500, 3000]; // 500, 3000, 10000)

    /**
     * @dev setting the base and the quote curency (trading pair) of the contract
     * @param _baseToken the base currency
     * @param _quoteToken the quote currency
     */
    constructor(
        address _baseToken,
        address _quoteToken,
        address _routerAddress
    ) ERC20DDCAManager(_baseToken, _quoteToken) {
        _swapRouter = ISwapRouter(_routerAddress);
    }

    /**
     * @notice Function to get the min amount out from
     * the quoter.
     *
     * @dev The pool fee used is 3000, just to make sure
     * that the swap goes through.
     *
     * @param _amountIn The amount of quote token to be sent
     * to the router for swapping.
     */
    function _getMinAmountOutFromQuoter(
        uint256 _amountIn
    ) private returns (uint256) {
        IQuoterV2.QuoteExactInputSingleParams memory params = IQuoterV2
            .QuoteExactInputSingleParams({
                tokenIn: address(quoteToken),
                tokenOut: address(baseToken),
                amountIn: _amountIn,
                fee: poolFees[1],
                sqrtPriceLimitX96: 0
            });

        /**
         *
         * @dev These are all the values returned from the quoter
         * address tokenIn;
         * address tokenOut;
         * uint256 amountIn;
         * uint24 fee;
         * uint160 sqrtPriceLimitX96;
         */
        (uint256 amountOut, , , ) = _quoter.quoteExactInputSingle(params);

        return amountOut;
    }

    /**
     * @notice Function to perform a exact single input
     * swap on UniSwapV3.
     *
     * @param _amountIn The amount of quote token to be sent
     * to the router for swapping.
     * @param _minAmountOutExpected The min amount of quote token
     * expected to receive from the swapping.
     */
    function _swapExactInputSingle(
        uint256 _amountIn,
        uint256 _minAmountOutExpected
    ) private returns (uint256) {
        TransferHelper.safeApprove(
            address(quoteToken),
            address(_swapRouter),
            _amountIn
        );

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: address(quoteToken),
                tokenOut: address(baseToken),
                fee: poolFees[1],
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: _amountIn,
                amountOutMinimum: _minAmountOutExpected,
                sqrtPriceLimitX96: 0
            });

        try _swapRouter.exactInputSingle(params) returns (uint256 _amountOut) {
            return _amountOut;
        } catch Error(string memory reason) {
            revert DexError({message: reason});
        }
    }

    function purchaseDips(
        uint256 toleratedSlippagePrice
    ) public onlyOwner lock {
        _swapInProgress = true;

        uint256 feeAmount = (_totalLotSize * _feesPercent) / 100;
        uint256 swapAmount = _totalLotSize - feeAmount;

        uint256 _minAmountOutExpected = ((swapAmount *
            MathUtils.exponent(baseToken.decimals())) / toleratedSlippagePrice);

        emit PurchaseDipAt(
            toleratedSlippagePrice,
            _totalLotSize,
            _minAmountOutExpected,
            block.timestamp
        );

        uint256 minAmountOutFromQuoter = _getMinAmountOutFromQuoter(swapAmount);

        if (minAmountOutFromQuoter < _minAmountOutExpected) {
            revert InsufficientLiquidity({
                amountIn: swapAmount,
                minAmountOut: minAmountOutFromQuoter,
                minAmountOutExpected: _minAmountOutExpected,
                toleratedSlippagePrice: toleratedSlippagePrice
            });
        }

        uint256 amountOut = _swapExactInputSingle(
            swapAmount,
            _minAmountOutExpected
        );

        uint256[] memory amounts = new uint256[](2);

        _distributeReward(amounts);

        _totalFeesCollected += feeAmount;

        emit PurchaseDipOk(
            swapAmount,
            amountOut,
            _minAmountOutExpected,
            toleratedSlippagePrice
        );

        _swapInProgress = false;
    }
}
