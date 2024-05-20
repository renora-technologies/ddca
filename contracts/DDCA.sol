// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./Executor.sol";
import "../interfaces/ITachySwapRouter02.sol";

// XTokenV2Module#XTokenV2 - 0x6B4f550d3a92068b9A72a90c57A43f3ae2Ed1973
// USDRTokenModule#USDRToken - 0xb8038E962fB3C52F817c46d2E0B22aB58a1Bd370
// SlothTokenModule#SlothToken - 0x86D233D2Bb48A1017b597EC03Ed2115018E65FD1

/**
 * @title
 * @author
 * @notice
 */
contract DDCA is Executor {
    event Log(string message);

    event Deposit(bool status, uint256 amount, address client);
    event Withdraw(bool status, uint256 amount, address client);

    event Swapped(uint[] amounts);

    struct Node {
        address account;
        uint256 baseTokenAmount;
        uint256 quoteTokenAmount;
        uint256 lotSize;
    }

    mapping(address => Node) public nodes;
    address[] public clients;

    uint256 private _totalLotSize = 0;
    bool private _isLocked = false;

    ITachySwapRouter02 public immutable _router =
        ITachySwapRouter02(0x789298Cf1C48fC6bb02DA71bBDc3A59d1A07b4c6);

    /**
     * @notice The token which the user will receive
     */
    IERC20 public immutable baseToken;

    /**
     * @notice The token which the user will deposit
     */
    IERC20 public immutable quoteToken;

    /**
     * @dev setting the base and the quote curency (trading pair) of the contract
     * @param _baseToken the base currency
     * @param _quoteToken the quote currency
     */
    constructor(address _baseToken, address _quoteToken) Executor(msg.sender) {
        baseToken = IERC20(_baseToken);
        quoteToken = IERC20(_quoteToken);
    }

    modifier lock() {
        // first runs this check
        require(!_isLocked);
        _isLocked = true;
        // runs the rest of the code which has this modifier
        _;

        _isLocked = false;
    }

    function _addNode(
        uint256 _amount,
        uint256 _lotSize
    ) internal returns (Node memory) {
        Node memory _node;

        _node.account = address(msg.sender);
        _node.baseTokenAmount = 0;
        _node.quoteTokenAmount = _amount;
        _node.lotSize = _lotSize;

        nodes[msg.sender] = _node;

        _totalLotSize += _lotSize;

        return _node;
    }

    function getTokenAddress() public view returns (address, address) {
        return (address(baseToken), address(quoteToken));
    }

    function getTotalLotSize() public view returns (uint256) {
        return _totalLotSize;
    }

    function _getClientNode(
        address clientAddress
    ) private view returns (Node memory) {
        Node memory clientNode = nodes[clientAddress];

        require(
            clientNode.account == clientAddress,
            "User does not have any account."
        );

        return clientNode;
    }

    function getClientNode() public view returns (Node memory) {
        return _getClientNode(msg.sender);
    }

    /**
     * @notice Function to return the total token balance locked in the contract.
     *
     * @return _baseTokenBalance
     * @return _quoteTokenBalance
     */
    function getBalance() public view returns (uint256, uint256) {
        return (
            baseToken.balanceOf(address(this)),
            quoteToken.balanceOf(address(this))
        );
    }

    /**
     * @notice Function to return the clients token balances locked in the contract.
     *
     * @param _clientAddress The clients wallet address
     *
     * @return _baseTokenBalance the balance of the token received from swap
     * @return _quoteTokenBalance the balance of the token deposited
     */
    function getClientBalance(
        address _clientAddress
    ) public view returns (uint256, uint256) {
        Node memory clientNode = _getClientNode(_clientAddress);

        return (clientNode.baseTokenAmount, clientNode.quoteTokenAmount);
    }

    /**
     * @notice Function to deposit quote token in the contract
     *
     * @param _amount The amount to be deposited
     */
    function _deposit(uint256 _amount) internal returns (bool) {
        bool _status;

        require(
            quoteToken.allowance(msg.sender, address(this)) >= _amount,
            "Token allowance too low"
        );

        /**
         * @dev We need to use transferFrom to deposit from client
         * wallet to the DDCA smart contract. Before the transfer
         * the clients wallet needs to approve the spending.
         */
        _status = quoteToken.transferFrom(msg.sender, address(this), _amount);

        if (_status == true) {
            emit Deposit(_status, _amount, msg.sender);
        }

        return _status;
    }

    function createDDCA(uint256 _amount, uint256 _lotSize) public {
        Node memory _node = nodes[msg.sender];

        require(_node.account != msg.sender, "Account already exists.");
        require(_amount >= _lotSize, "Given amount is lower than lot size.");

        bool _status = _deposit(_amount);

        if (_status == true) {
            _node = _addNode(_amount, _lotSize);

            clients.push(msg.sender);
        }
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

    function _distributeReward(uint256[] memory _amounts) private {
        uint256 _amountOut = _amounts[1];

        for (uint i = 0; i < clients.length; i++) {
            address _client = clients[i];

            Node memory _clientNode = nodes[_client];

            if (_clientNode.quoteTokenAmount >= _clientNode.lotSize) {
                /**
                 * @dev calculating reward for the swap
                 */
                uint256 reward = (_clientNode.lotSize / _totalLotSize) *
                    _amountOut;

                /**
                 * @dev updating base token amount
                 */
                _clientNode.baseTokenAmount += reward;
                /**
                 * @dev updating quote token amount
                 */
                _clientNode.quoteTokenAmount -= _clientNode.lotSize;

                /**
                 * @dev removing the clients lotSize from the totalLotSize
                 */
                if (_clientNode.quoteTokenAmount == 0) {
                    _totalLotSize -= _clientNode.lotSize;
                }

                /**
                 * @dev updating clients node
                 */
                nodes[_client] = _clientNode;
            }
        }
    }

    function swap() public onlyExecutor lock {
        require(
            quoteToken.approve(address(_router), _totalLotSize),
            "Failed to approve router."
        );

        try
            _router.swapExactTokensForTokens(
                _totalLotSize,
                _getMinAmountOut(_totalLotSize),
                _getSwapPath(),
                address(this),
                block.timestamp
            )
        returns (uint[] memory _amounts) {
            _distributeReward(_amounts);

            emit Swapped(_amounts);
        } catch Error(string memory reason) {
            emit Log(reason);
        }
    }

    /**
     * @notice Function to withdraw the base token
     *
     * @param _amount The amount to be withdrawn
     */
    function withdrawBaseToken(uint256 _amount) public returns (bool) {
        Node memory clientNode = _getClientNode(msg.sender);

        uint256 tokenBalance = clientNode.baseTokenAmount;

        require(_amount <= tokenBalance, "Insufficient funds to withdraw");

        bool _status = baseToken.transfer(msg.sender, _amount);

        if (_status == true) {
            clientNode.baseTokenAmount -= _amount;
            nodes[msg.sender] = clientNode;
        }

        return _status;
    }

    /**
     * @notice Function to withdraw the quote token
     *
     * @param _amount The amount to be withdrawn
     */
    function withdrawQuoteToken(uint256 _amount) public returns (bool) {
        Node memory clientNode = _getClientNode(msg.sender);

        uint256 tokenBalance = clientNode.quoteTokenAmount;

        require(_amount <= tokenBalance, "Insufficient funds to withdraw");

        bool _status = quoteToken.transfer(msg.sender, _amount);

        if (_status == true) {
            clientNode.quoteTokenAmount -= _amount;

            if (clientNode.quoteTokenAmount <= clientNode.lotSize) {
                _totalLotSize -= clientNode.lotSize;
            }

            nodes[msg.sender] = clientNode;
        }

        return _status;
    }
}
