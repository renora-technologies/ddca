// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import {ERC20DDCAManager} from "../../../core/contracts/ERC20DDCAManager.sol";
import {MathUtils} from "../../../core/libraries/MathUtils.sol";

import {TransferHelper} from "../libraries/TransferHelper.sol";
import {ITachySwapRouter02} from "../interfaces/ITachySwapRouter02.sol";

/**
 * @title DDCA
 * @notice Dollar-Cost Averaging contract for automated trading
 */
contract DDCAEtherlink is ERC20DDCAManager {
    ITachySwapRouter02 private immutable _router;

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
        _router = ITachySwapRouter02(_routerAddress);
    }

    function _getSwapPath() private view returns (address[] memory) {
        address[] memory _path = new address[](2);

        _path[0] = address(quoteToken);
        _path[1] = address(baseToken);

        return _path;
    }

    function _getMinAmountOut(
        uint256 _amountIn
    ) private view returns (uint256) {
        uint256[] memory _amountsOut = _router.getAmountsOut(
            _amountIn,
            _getSwapPath()
        );

        return _amountsOut[1];
    }

    function purchaseDips(
        uint256 toleratedSlippagePrice
    ) public onlyOwner whenNotPaused {
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

        TransferHelper.safeApprove(
            address(quoteToken),
            address(_router),
            swapAmount
        );

        uint256 minAmountOutFromRouter = _getMinAmountOut(swapAmount);

        if (minAmountOutFromRouter < _minAmountOutExpected) {
            revert InsufficientLiquidity({
                amountIn: swapAmount,
                minAmountOut: minAmountOutFromRouter,
                minAmountOutExpected: _minAmountOutExpected,
                toleratedSlippagePrice: toleratedSlippagePrice
            });
        }

        try
            _router.swapExactTokensForTokens(
                swapAmount,
                minAmountOutFromRouter,
                _getSwapPath(),
                address(this),
                block.timestamp
            )
        returns (uint[] memory _amounts) {
            _distributeReward(_amounts);

            _totalFeesCollected += feeAmount;

            emit PurchaseDipOk(
                _amounts[0],
                _amounts[1],
                _minAmountOutExpected,
                toleratedSlippagePrice
            );
        } catch Error(string memory reason) {
            revert DexError({message: reason});
        }

        _swapInProgress = false;
    }
}
