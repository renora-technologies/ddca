// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

library MathUtils {
    function toPower(uint256 a, uint256 b) internal pure returns (uint256) {
        return a ** b;
    }

    function exponent(uint256 a) internal pure returns (uint256) {
        return toPower(10, a);
    }
}
