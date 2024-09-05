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

    struct TachySwapInput {
        uint256 swapAmount;
        uint256 minAmountOutFromRouter;
        uint256 feeAmount;
    }

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
            address(_router),
            purchaseDipInputs.swapAmount
        );

        uint256 minAmountOutFromRouter = _getMinAmountOut(
            purchaseDipInputs.swapAmount
        );

        if (minAmountOutFromRouter < purchaseDipInputs.minAmountOutExpected) {
            revert InsufficientLiquidity({
                amountIn: purchaseDipInputs.swapAmount,
                minAmountOut: minAmountOutFromRouter,
                minAmountOutExpected: purchaseDipInputs.minAmountOutExpected,
                toleratedSlippagePrice: toleratedSlippagePrice
            });
        }

        TachySwapInput memory params = TachySwapInput({
            swapAmount: purchaseDipInputs.swapAmount,
            minAmountOutFromRouter: minAmountOutFromRouter,
            feeAmount: purchaseDipInputs.feeAmount
        });

        if (address(baseToken) == _router.WETH()) {
            _swapWXTZ(params);
        } else {
            _swapERC20Token(params);
        }

        _swapInProgress = false;
    }

    function _swapERC20Token(TachySwapInput memory _params) private {
        try
            _router.swapExactTokensForTokens(
                _params.swapAmount,
                _params.minAmountOutFromRouter,
                _getSwapPath(),
                address(this),
                block.timestamp
            )
        returns (uint[] memory _amounts) {
            _onPurchaseDip(
                _amounts[0],
                _amounts[1],
                _params.minAmountOutFromRouter,
                _params.feeAmount
            );
        } catch (bytes memory reason) {
            emit DexError(reason);
        }
    }

    function _swapWXTZ(TachySwapInput memory _params) private {
        /**
         * @dev In TachySwap router, calling the WETH() function
         * will return the address of WXTZ.
         */
        try
            _router.swapExactTokensForETH(
                _params.swapAmount,
                _params.minAmountOutFromRouter,
                _getSwapPath(),
                address(this),
                block.timestamp
            )
        returns (uint[] memory _amounts) {
            _onPurchaseDip(
                _amounts[0],
                _amounts[1],
                _params.minAmountOutFromRouter,
                _params.feeAmount
            );
        } catch (bytes memory reason) {
            emit DexError(reason);
        }
    }
}
