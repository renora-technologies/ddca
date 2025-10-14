// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title HHERC20 Token is a dummy ERC20 Token
 * created to test the contract locally
 */
contract HHERC20 is ERC20 {
    uint256 private _totalSupply;
    uint8 private _decimal;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimal_,
        uint256 totalSupply_
    ) ERC20(name_, symbol_) {
        _totalSupply = totalSupply_;
        _decimal = decimal_;

        _mint(msg.sender, 1000000 * 10 ** uint256(decimal_));
    }

    function decimals() public view override returns (uint8) {
        return _decimal;
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
