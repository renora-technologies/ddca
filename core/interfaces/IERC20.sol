// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import {IERC20 as IERC20Default} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IERC20 is IERC20Default {
    /**
     * @notice Returns the token decimals
     */
    function decimals() external view returns (uint8);

    /**
     * @notice Returns the token symbol
     */
    function symbol() external view returns (string memory);

    /**
     * @notice Returns the token name
     */
    function name() external view returns (string memory);
}
