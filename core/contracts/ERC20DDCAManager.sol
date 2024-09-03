// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import "../interfaces/IERC20.sol";
import "../../libraries/MathUtils.sol";

/**
 * @title DDCA
 * @notice Dollar-Cost Averaging contract for automated trading
 */
contract ERC20DDCAManager is Ownable, Pausable {
    event Deposit(bool status, address token, uint256 amount, address client);
    event Withdraw(bool status, address token, uint256 amount, address client);

    event PurchaseDipAt(
        uint256 price,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 timestamp
    );
    event PurchaseDipOk(
        uint256 amountIn,
        uint256 amountOut,
        uint256 minAmountOutExpected,
        uint256 toleratedSlippagePrice
    );

    error InsufficientLiquidity(
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 minAmountOutExpected,
        uint256 toleratedSlippagePrice
    );
    error InsufficientBalance(string token, uint256 balance, uint256 amount);
    error InsufficientAllowance(
        string token,
        uint256 allowance,
        uint256 amount
    );
    error DexError(string message);
    error ValidationError(string message);
    error InvalidToken(address token);

    struct Node {
        address account;
        uint256 baseTokenAmount;
        uint256 quoteTokenAmount;
        uint256 totalAmountBought;
        uint256 totalCostPrice;
        uint256 avgBoughtPrice;
        uint256 totalFees;
        uint256 lotSize;
    }

    /**
     * @notice The token which the user will receive
     */
    IERC20 public immutable baseToken;

    /**
     * @notice The token which the user will deposit
     */
    IERC20 public immutable quoteToken;

    uint256 internal _totalLotSize = 0;
    uint256 internal _totalFeesCollected = 0;
    /**
     * @dev calculating fees charged for client
     *
     * For e.g fees = 0.1%
     * Fees charged for deploying X amount = X * (0.1 / 100)
     * = X / 1000
     *
     * We are dividing the amount by 1000, because the X amount
     * in solidity is of the order 10^6.
     *
     * Similarly all fees percent needs to be defined as (y/100)
     * 0.05%    -> 500
     * 0.1%     -> 1000
     * 0.3%     -> 3000
     */
    uint256 internal _feesPercent = 1000; // default 0.1%

    bool public _isLocked = false;
    bool internal _swapInProgress = false;

    mapping(address => Node) private nodes;
    address[] private clients;

    /**
     * @dev setting the base and the quote curency (trading pair) of the contract
     * @param _baseToken the base currency
     * @param _quoteToken the quote currency
     */
    constructor(address _baseToken, address _quoteToken) Ownable(msg.sender) {
        baseToken = IERC20(_baseToken);
        quoteToken = IERC20(_quoteToken);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    modifier lock() {
        // first runs this check
        require(!_isLocked, "Function is locked");

        _isLocked = true;

        // runs the rest of the code which has this modifier
        _;

        _isLocked = false;
    }

    modifier noSwapInProgress() {
        require(!_swapInProgress, "Swap in progress, action paused");

        _;
    }

    function getTotalLotSize() public view returns (uint256) {
        return _totalLotSize;
    }

    function _getNode(
        address clientAddress
    ) private view returns (Node memory) {
        Node memory clientNode = nodes[clientAddress];

        require(
            clientNode.account == clientAddress,
            "User does not have any account."
        );

        return clientNode;
    }

    function getNode() public view returns (Node memory) {
        return _getNode(msg.sender);
    }

    function getAllNodes() public view onlyOwner returns (Node[] memory) {
        Node[] memory clientsData = new Node[](clients.length);

        for (uint i = 0; i < clients.length; i++) {
            clientsData[i] = nodes[clients[i]];
        }

        return clientsData;
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
        _node.totalAmountBought = 0;
        _node.totalCostPrice = 0;
        _node.avgBoughtPrice = 0;
        _node.totalFees = 0;

        nodes[msg.sender] = _node;

        _totalLotSize += _lotSize;

        return _node;
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
            "Insufficient token allowance"
        );

        /**
         * @dev We need to use transferFrom to deposit from client
         * wallet to the DDCA smart contract. Before the transfer
         * the clients wallet needs to approve the spending.
         */
        _status = quoteToken.transferFrom(msg.sender, address(this), _amount);

        if (_status == true) {
            emit Deposit(_status, address(baseToken), _amount, msg.sender);
        }

        return _status;
    }

    function createDDCA(
        uint256 _amount,
        uint256 _lotSize
    ) public noSwapInProgress whenNotPaused {
        Node memory _node = nodes[msg.sender];

        require(_node.account != msg.sender, "Account already exists.");

        if (_amount < _lotSize) {
            revert ValidationError({
                message: "Given amount is lower than lot size."
            });
        }

        bool _status = _deposit(_amount);

        if (_status == true) {
            _node = _addNode(_amount, _lotSize);

            clients.push(msg.sender);
        }
    }

    /**
     * @notice Function to top up the quote token amount in an existing DDCA
     *
     * @param _amount The amount to top up
     */
    function topUp(uint256 _amount) public noSwapInProgress whenNotPaused {
        Node storage clientNode = nodes[msg.sender];

        require(clientNode.account == msg.sender, "Account does not exist.");

        bool _status = _deposit(_amount);

        if (_status == true) {
            if (
                clientNode.quoteTokenAmount == 0 ||
                clientNode.quoteTokenAmount < clientNode.lotSize
            ) {
                _totalLotSize += clientNode.lotSize;
            }

            clientNode.quoteTokenAmount += _amount;
        }
    }

    /**
     * @notice Function to update the lot size of a client's node
     *
     * @param _newLotSize The new lot size
     */
    function updateLotSize(
        uint256 _newLotSize
    ) public noSwapInProgress whenNotPaused {
        Node storage clientNode = nodes[msg.sender];

        require(clientNode.account == msg.sender, "Account does not exist.");

        if (_newLotSize > clientNode.quoteTokenAmount) {
            revert ValidationError({
                message: "New lot size is greater than quote token amount."
            });
        }

        if (
            clientNode.quoteTokenAmount == 0 ||
            clientNode.quoteTokenAmount < clientNode.lotSize
        ) {
            _totalLotSize += _newLotSize;
        } else {
            _totalLotSize = _totalLotSize - clientNode.lotSize + _newLotSize;
        }

        clientNode.lotSize = _newLotSize;
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
        Node memory clientNode = _getNode(_clientAddress);

        return (clientNode.baseTokenAmount, clientNode.quoteTokenAmount);
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

    function _distributeReward(uint256[] memory _amounts) internal {
        uint256 totalReward = 0;

        for (uint i = 0; i < clients.length; i++) {
            address _client = clients[i];
            Node storage _clientNode = nodes[_client];

            if (_clientNode.quoteTokenAmount >= _clientNode.lotSize) {
                /**
                 * @dev calculating fees charged for client
                 * We are defining fees as x/100, thats why we
                 * are only dividing the amount by the the fees
                 * percent.
                 */
                uint256 _clientFee = _clientNode.lotSize / _feesPercent;

                /**
                 * @dev calculating reward for the swap
                 * reward = ((lot_size - fee) / (swapped amount/amount in)) * total amount received
                 */
                uint256 reward = ((_clientNode.lotSize - _clientFee) *
                    _amounts[1]) / _amounts[0];

                /**
                 * @dev updating total fees charged for client
                 */
                _clientNode.totalFees += _clientFee;

                /**
                 * @dev updating base token amount
                 */
                _clientNode.baseTokenAmount += reward;

                /**
                 * @dev updating total base token amount bought
                 */
                _clientNode.totalAmountBought += reward;

                /**
                 * @dev updating total cost
                 * total cost = sum of all (lotsize - fees)
                 */
                _clientNode.totalCostPrice += _clientNode.lotSize - _clientFee;

                /**
                 * @dev average bought price is total cost / total amt bought
                 */
                _clientNode.avgBoughtPrice = ((_clientNode.totalCostPrice *
                    MathUtils.exponent(baseToken.decimals())) /
                    _clientNode.totalAmountBought);

                totalReward += reward;

                /**
                 * @dev updating quote token amount
                 */
                _clientNode.quoteTokenAmount -= _clientNode.lotSize;

                /**
                 * @dev removing the clients lotSize from the totalLotSize
                 */
                if (
                    _clientNode.quoteTokenAmount == 0 ||
                    _clientNode.quoteTokenAmount < _clientNode.lotSize
                ) {
                    _totalLotSize -= _clientNode.lotSize;
                }
            }
        }

        // Ensure totalReward does not exceed the amountOut
        require(
            totalReward <= _amounts[1],
            "Total reward exceeds swapped amount out"
        );
    }

    /**
     * @notice Function to withdraw funds from the contract
     *
     * @param _token The token to be withdrawn
     * @param _amount The amount of the token to be withdrawn
     */
    function withdraw(address _token, uint256 _amount) public returns (bool) {
        bool _status = false;

        if (_token == address(baseToken)) {
            _status = _withdrawBaseToken(_amount);
        } else if (_token == address(quoteToken)) {
            _status = _withdrawQuoteToken(_amount);
        } else {
            revert ValidationError({message: "Invalid token address"});
        }

        emit Withdraw(_status, _token, _amount, msg.sender);

        return _status;
    }

    /**
     * @notice Function to withdraw the base token
     *
     * @param _amount The amount to be withdrawn
     */
    function _withdrawBaseToken(
        uint256 _amount
    ) private noSwapInProgress returns (bool) {
        Node storage clientNode = nodes[msg.sender];

        if (_amount > clientNode.baseTokenAmount) {
            revert InsufficientBalance({
                token: baseToken.symbol(),
                balance: clientNode.baseTokenAmount,
                amount: _amount
            });
        }

        bool _status = baseToken.transfer(msg.sender, _amount);

        if (_status == true) {
            clientNode.baseTokenAmount -= _amount;
            nodes[msg.sender] = clientNode;
            _removeClientIfZeroBalance(msg.sender);
        }

        return _status;
    }

    /**
     * @notice Function to withdraw the quote token
     *
     * @param _amount The amount to be withdrawn
     */
    function _withdrawQuoteToken(
        uint256 _amount
    ) private noSwapInProgress returns (bool) {
        Node storage clientNode = nodes[msg.sender];

        if (_amount > clientNode.quoteTokenAmount) {
            revert InsufficientBalance({
                token: quoteToken.symbol(),
                balance: clientNode.quoteTokenAmount,
                amount: _amount
            });
        }

        bool _status = quoteToken.transfer(msg.sender, _amount);

        if (_status == true) {
            clientNode.quoteTokenAmount -= _amount;

            if (clientNode.quoteTokenAmount < clientNode.lotSize) {
                _totalLotSize -= clientNode.lotSize;
            }

            nodes[msg.sender] = clientNode;
            _removeClientIfZeroBalance(msg.sender);
        }

        return _status;
    }

    function _removeClientIfZeroBalance(address _client) internal {
        Node memory clientNode = nodes[_client];
        if (
            clientNode.baseTokenAmount == 0 && clientNode.quoteTokenAmount == 0
        ) {
            // Remove client from the clients array
            for (uint i = 0; i < clients.length; i++) {
                if (clients[i] == _client) {
                    clients[i] = clients[clients.length - 1];
                    clients.pop();
                    break;
                }
            }
            // Remove client from nodes mapping
            delete nodes[_client];
        }
    }

    function getTotalFeesCollected() public view returns (uint256) {
        return _totalFeesCollected;
    }

    function getFeesPercent() public view returns (uint256) {
        return _feesPercent;
    }

    /**
     * @notice Function to update the fees percent
     *
     * @param newFeesPercent The new fees percent
     */
    function updateFeesPercent(uint256 newFeesPercent) public onlyOwner {
        require(newFeesPercent >= 1, "Fees percent cannot exceed 100");

        _feesPercent = newFeesPercent;
    }

    /**
     * @notice Function to withdraw the collected fees
     *
     * @param _amount The amount of fees to withdraw
     */
    function withdrawFees(uint256 _amount) public onlyOwner {
        if (_amount > _totalFeesCollected) {
            revert InsufficientBalance({
                token: quoteToken.symbol(),
                balance: _totalFeesCollected,
                amount: _amount
            });
        }

        bool _status = quoteToken.transfer(msg.sender, _amount);

        require(_status, "Withdrawal failed");

        _totalFeesCollected -= _amount;
    }
}
