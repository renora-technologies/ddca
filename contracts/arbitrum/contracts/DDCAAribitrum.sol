// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import {ERC20DDCAManager} from "../../../core/contracts/ERC20DDCAManager.sol";
import {MathUtils} from "../../../core/libraries/MathUtils.sol";

/**
 * @title DDCA
 * @notice Dollar-Cost Averaging contract for automated trading
 */
contract DDCAAribitrum is ERC20DDCAManager {
    ISwapRouter private immutable _swapRouter;

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
    // uint24 internal _poolFee = 500; // 500, 3000, 10000)

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
        uint256 _minAmountOutExpected,
        uint256 _feeAmount,
        uint24 _poolFee
    ) private {
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: address(quoteToken),
                tokenOut: address(baseToken),
                fee: _poolFee,
                recipient: address(this),
                deadline: block.timestamp + 1,
                amountIn: _amountIn,
                amountOutMinimum: _minAmountOutExpected,
                sqrtPriceLimitX96: 0
            });

        try _swapRouter.exactInputSingle(params) returns (uint256 _amountOut) {
            _onPurchaseDip(
                _amountIn,
                _amountOut,
                _minAmountOutExpected,
                _feeAmount
            );
        } catch (bytes memory reason) {
            emit DexError({message: reason});
        }
    }

    function purchaseDips(
        uint256 toleratedSlippagePrice,
        uint24 poolFee
    ) public onlyOwner lock {
        _swapInProgress = true;

        if (_totalLotSize <= 0) {
            revert ValidationError({message: "Not enough funds to swap"});
        }

        PurchaseDipInputs memory purchaseDipInputs = _getPurchaseDipInputs(
            toleratedSlippagePrice
        );

        TransferHelper.safeApprove(
            address(quoteToken),
            address(_swapRouter),
            purchaseDipInputs.swapAmount
        );

        _swapExactInputSingle(
            purchaseDipInputs.swapAmount,
            purchaseDipInputs.minAmountOutExpected,
            purchaseDipInputs.feeAmount,
            poolFee
        );

        _swapInProgress = false;
    }
}
