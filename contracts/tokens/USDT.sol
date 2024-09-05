// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title USDRT (stable) token is a basic ERC20 Token
 */
contract USDT is ERC20 {
    uint256 private _totalSupply = 1000000000000000000000000;

    constructor() ERC20("USDT Renora", "USDT") {
        _mint(msg.sender, 1000000000000000000 * 10 ** uint256(decimals()));
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
