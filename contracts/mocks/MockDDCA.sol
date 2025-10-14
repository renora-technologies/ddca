// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

// import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

import {ERC20DDCAManager} from "../../core/contracts/ERC20DDCAManager.sol";
import {MathUtils} from "../../core/libraries/MathUtils.sol";

/**
 * @title DDCA
 * @notice Dollar-Cost Averaging contract for automated trading
 *
 * @dev ERROR CODES FOR UNISWAP V3
 * @dev https://docs.uniswap.org/contracts/v3/reference/error-codes
 */
contract MockDDCA is ERC20DDCAManager {
    // ISwapRouter private immutable _swapRouter;

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
        address _quoteToken
    ) ERC20DDCAManager(_baseToken, _quoteToken) {
        // _swapRouter = ISwapRouter(_routerAddress);
    }

    /**
     * @notice Function to perform a exact single input
     * swap on UniSwapV3.
     *
     * @param _purchaseDipInputs PurchaseDipInputs
     */
    function _swapExactInputSingle(
        PurchaseDipInputs memory _purchaseDipInputs,
        uint256 amountOut
    ) private {
        // we are hardcoding the amount of token recevied
        uint256 _amountOut = amountOut; // 498750000000000000;

        _onPurchaseDip(
            _purchaseDipInputs.swapAmount,
            _amountOut,
            _purchaseDipInputs.minAmountOutExpected,
            _purchaseDipInputs.feeAmount
        );
    }

    function purchaseDips(
        uint256 toleratedSlippagePrice,
        uint256 amountOut
    ) public onlyOwner {
        _swapInProgress = true;
        uint256 totalLotSize = getTotalLotSize();

        if (totalLotSize <= 0) {
            revert ValidationError({message: "Not enough funds to swap"});
        }

        PurchaseDipInputs memory purchaseDipInputs = _getPurchaseDipInputs(
            totalLotSize,
            toleratedSlippagePrice
        );

        // TransferHelper.safeApprove(
        //     address(quoteToken),
        //     address(_swapRouter),
        //     purchaseDipInputs.swapAmount
        // );

        _swapExactInputSingle(purchaseDipInputs, amountOut);

        _swapInProgress = false;
    }
}
