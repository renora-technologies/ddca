// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

/**
 * @title  Executor
 * @author //
 * @notice //
 */
contract Executor {
    address private immutable executor;

    constructor(address _executor) {
        executor = _executor;
    }

    modifier onlyExecutor() {
        // first runs this check
        require(msg.sender == executor, "You are not the executor");

        // runs the rest of the code which has this modifier
        _;
    }
}
