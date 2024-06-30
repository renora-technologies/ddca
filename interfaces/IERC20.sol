// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import {IERC20 as IERC20Default} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IERC20 is IERC20Default {
    function decimals() external view returns (uint8);
}
