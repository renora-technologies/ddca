// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Executor.sol";
import "../interfaces/ITachySwapRouter02.sol";
import "../interfaces/IERC20.sol";
import "../libraries/MathUtils.sol";

/**
 * @title DDCA
 * @notice Dollar-Cost Averaging contract for automated trading
 */
contract DDCAManager is Executor {
    event Log(string message);
    event LogAddress(address add);
    event LogAmount(uint256 amount);

    event Deposit(bool status, uint256 amount, address client);
    event Withdraw(bool status, uint256 amount, address client);

    event SwapInit(uint256 price, uint256 lotSize, uint256 timestamp);
    event SwapFailure(uint256 price, string message);
    event SwapSuccess(uint256 amountIn, uint256 amountOut);

    // event Swapped(uint[] amounts);

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

    mapping(address => Node) public nodes;
    address[] public clients;

    uint256 internal _totalLotSize = 0;
    uint256 internal _totalFeesCollected = 0;
    uint256 internal _feesPercent = 1; // default 1%

    bool internal _isLocked = false;
    bool internal _swapInProgress = false;

    ITachySwapRouter02 public immutable _router;

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
    constructor(
        address _baseToken,
        address _quoteToken
    )
        // address _routerAddress
        Executor(msg.sender)
    {
        baseToken = IERC20(_baseToken);
        quoteToken = IERC20(_quoteToken);

        // _router = ITachySwapRouter02(_routerAddress);
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

    function getTokenAddress() public view returns (address, address) {
        return (address(baseToken), address(quoteToken));
    }

    function getTotalLotSize() public view returns (uint256) {
        return _totalLotSize;
    }

    function getTotalFeesCollected() public view returns (uint256) {
        return _totalFeesCollected;
    }

    function getFeesPercent() public view returns (uint256) {
        return _feesPercent;
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
    function _deposit(
        uint256 _amount
    ) internal noSwapInProgress returns (bool) {
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

    function createDDCA(
        uint256 _amount,
        uint256 _lotSize
    ) public noSwapInProgress {
        Node memory _node = nodes[msg.sender];

        require(_node.account != msg.sender, "Account already exists.");
        require(_amount >= _lotSize, "Given amount is lower than lot size.");

        bool _status = _deposit(_amount);

        if (_status == true) {
            _node = _addNode(_amount, _lotSize);

            clients.push(msg.sender);
        }
    }

    function _getSwapPath() internal view returns (address[] memory) {
        address[] memory _path = new address[](2);

        _path[0] = address(quoteToken);
        _path[1] = address(baseToken);

        return _path;
    }

    function _getMinAmountOut(
        uint256 _amountIn
    ) internal view returns (uint256) {
        uint256[] memory _amountsOut = _router.getAmountsOut(
            _amountIn,
            _getSwapPath()
        );

        return _amountsOut[1];
    }

    function _distributeReward(
        uint256[] memory _amounts,
        uint256 _swapTotalLotSize,
        uint256 swapAmount
    ) internal {
        uint256 _amountOut = _amounts[1];
        uint256 totalReward = 0;

        emit Log("Distributing rewards");
        emit LogAmount(_amountOut);

        for (uint i = 0; i < clients.length; i++) {
            address _client = clients[i];
            Node storage _clientNode = nodes[_client];

            emit LogAddress(_client);
            emit LogAmount(_clientNode.quoteTokenAmount);

            if (_clientNode.quoteTokenAmount >= _clientNode.lotSize) {
                /**
                 * @dev calculating reward for the swap
                 */
                uint256 reward = (_clientNode.lotSize * _amountOut) /
                    _swapTotalLotSize;

                emit LogAmount(reward);

                /**
                 * @dev calculating fees charged for client
                 */
                uint256 clientFee = (_clientNode.lotSize * _feesPercent) / 100;

                /**
                 * @dev updating total fees charged for client
                 */
                _clientNode.totalFees += clientFee;

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
                _clientNode.totalCostPrice += _clientNode.lotSize - clientFee;

                /**
                 * @dev average bought price is total cost / total amt bought
                 */
                _clientNode.avgBoughtPrice = ((_clientNode.totalCostPrice *
                    MathUtils.exponent(baseToken.decimals())) /
                    _clientNode.totalAmountBought);

                totalReward += reward;
                emit LogAmount(totalReward);

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
            totalReward <= _amountOut,
            "Total reward exceeds swapped amount"
        );
    }

    /**
     * @notice Function to withdraw the base token
     *
     * @param _amount The amount to be withdrawn
     */
    function withdrawBaseToken(
        uint256 _amount
    ) public noSwapInProgress returns (bool) {
        Node storage clientNode = nodes[msg.sender];

        uint256 tokenBalance = clientNode.baseTokenAmount;

        require(_amount <= tokenBalance, "Insufficient funds to withdraw");
        bool _status = baseToken.transfer(msg.sender, _amount);

        if (_status == true) {
            clientNode.baseTokenAmount -= _amount;
            nodes[msg.sender] = clientNode;
            _removeClientIfZeroBalance(msg.sender);
        }

        emit Withdraw(_status, _amount, msg.sender);
        return _status;
    }

    /**
     * @notice Function to withdraw the quote token
     *
     * @param _amount The amount to be withdrawn
     */
    function withdrawQuoteToken(
        uint256 _amount
    ) public noSwapInProgress returns (bool) {
        Node storage clientNode = nodes[msg.sender];

        uint256 tokenBalance = clientNode.quoteTokenAmount;

        require(_amount <= tokenBalance, "Insufficient funds to withdraw");

        bool _status = quoteToken.transfer(msg.sender, _amount);

        if (_status == true) {
            clientNode.quoteTokenAmount -= _amount;

            if (clientNode.quoteTokenAmount < clientNode.lotSize) {
                _totalLotSize -= clientNode.lotSize;
            }

            nodes[msg.sender] = clientNode;
            _removeClientIfZeroBalance(msg.sender);
        }

        emit Withdraw(_status, _amount, msg.sender);
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

    /**
     * @notice Function to update the lot size of a client's node
     *
     * @param _newLotSize The new lot size
     */
    function updateLotSize(uint256 _newLotSize) public noSwapInProgress {
        Node storage clientNode = nodes[msg.sender];
        require(clientNode.account == msg.sender, "Account does not exist.");
        require(
            clientNode.quoteTokenAmount >= _newLotSize,
            "New lot size is greater than quote token amount."
        );

        _totalLotSize = _totalLotSize - clientNode.lotSize + _newLotSize;
        clientNode.lotSize = _newLotSize;
    }

    /**
     * @notice Function to top up the quote token amount in an existing DDCA
     *
     * @param _amount The amount to top up
     */
    function topUp(uint256 _amount) public noSwapInProgress {
        Node storage clientNode = nodes[msg.sender];
        require(clientNode.account == msg.sender, "Account does not exist.");

        bool _status = _deposit(_amount);

        if (_status == true) {
            clientNode.quoteTokenAmount += _amount;
        }
    }

    /**
     * @notice Function to update the fees percent
     *
     * @param newFeesPercent The new fees percent
     */
    function updateFeesPercent(uint256 newFeesPercent) public onlyExecutor {
        require(newFeesPercent <= 100, "Fees percent cannot exceed 100");
        _feesPercent = newFeesPercent;
    }

    /**
     * @notice Function to withdraw the collected fees
     *
     * @param amount The amount of fees to withdraw
     */
    function withdrawFees(uint256 amount) public onlyExecutor {
        require(amount <= _totalFeesCollected, "Insufficient fees to withdraw");

        bool _status = quoteToken.transfer(msg.sender, amount);
        require(_status, "Withdrawal failed");

        _totalFeesCollected -= amount;
    }

    function getAllClientNodes()
        public
        view
        onlyExecutor
        returns (Node[] memory)
    {
        Node[] memory clientsData = new Node[](clients.length);

        for (uint i = 0; i < clients.length; i++) {
            clientsData[i] = nodes[clients[i]];
        }

        return clientsData;
    }
}
