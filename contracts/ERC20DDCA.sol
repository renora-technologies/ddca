// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../libraries/MathUtils.sol";

import {DDCAManager} from "./DDCAManager.sol";

/**
 * @title DDCA
 * @notice Dollar-Cost Averaging contract for automated trading
 */
contract ERC20DDCA is DDCAManager {
    /**
     * @dev setting the base and the quote curency (trading pair) of the contract
     * @param _baseToken the base currency
     * @param _quoteToken the quote currency
     */
    constructor(
        address _baseToken,
        address _quoteToken
    )
        //address _routerAddress
        DDCAManager(_baseToken, _quoteToken)
    {}

    function buyDips(uint256 toleratedSlippagePrice) public onlyExecutor lock {
        _swapInProgress = true;

        uint256 feeAmount = (_totalLotSize * _feesPercent) / 100;
        uint256 swapAmount = _totalLotSize - feeAmount;

        uint256 _fMinAmountOutExpected = ((swapAmount *
            MathUtils.exponent(baseToken.decimals())) / toleratedSlippagePrice);

        emit SwapInit(toleratedSlippagePrice, _totalLotSize, block.timestamp);

        require(
            quoteToken.approve(address(_router), swapAmount),
            "Failed to approve router."
        );

        uint256 minAmountOutFromRouter = _getMinAmountOut(swapAmount);

        if (minAmountOutFromRouter < _fMinAmountOutExpected) {
            emit SwapFailure(
                toleratedSlippagePrice,
                "Min amount out from router is less than expected"
            );

            revert("Min amount out from router is less than expected");
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
            _distributeReward(_amounts, _totalLotSize, swapAmount);

            _totalFeesCollected += feeAmount;

            emit SwapSuccess(_amounts[0], _amounts[1]);
        } catch Error(string memory reason) {
            emit SwapFailure(toleratedSlippagePrice, reason);
        }

        _swapInProgress = false;
    }
}
