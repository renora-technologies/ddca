// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {IERC20} from "../interfaces/IERC20.sol";
import {MathUtils} from "../libraries/MathUtils.sol";

/**
 * @title DDCA
 * @notice Dips  Dollar-Cost Averaging contract for automated trading
 */
contract ERC20DDCAManager is ReentrancyGuard, Ownable, Pausable {
    event Deposit(bool status, address token, uint256 amount, address client);
    event Withdraw(bool status, address token, uint256 amount, address client);

    event PurchaseDipOk(
        uint256 amountIn,
        uint256 amountOut,
        uint256 amountSubmitted
    );
    event DexError(bytes message);

    error InsufficientLiquidity(
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 minAmountOutExpected,
        uint256 toleratedSlippagePrice
    );
    error InsufficientBalance(string token, uint256 balance, uint256 amount);
    error ValidationError(string message);

    struct Node {
        /**
         * @notice the wallet address of the client
         */
        address account;
        /**
         * @notice the base token amount for the client
         */
        uint256 baseTokenAmount;
        /**
         * @notice the quote token amount for the client
         */
        uint256 quoteTokenAmount;
        /**
         * @notice total base token amount bought
         */
        uint256 totalAmountBought;
        /**
         * @notice total cost of the tokens bought
         */
        uint256 totalCostPrice;
        /**
         * @notice average price of the total token bought
         */
        uint256 avgBoughtPrice;
        /**
         * @notice total fees paid
         */
        uint256 totalFees;
        /**
         * @notice the lot size set by the client
         */
        uint256 lotSize;
        /**
         * @notice the lot size of the next swap
         */
        uint256 nextLotSize;
        /**
         * @notice status of the client strategy
         */
        bool isActive;
    }

    struct PurchaseDipInputs {
        uint256 feeAmount;
        uint256 swapAmount;
        uint256 minAmountOutExpected;
    }

    /**
     * @notice The token which the user will receive
     */
    IERC20 public immutable baseToken;

    /**
     * @notice The token which the user will deposit
     */
    IERC20 public immutable quoteToken;

    uint256 internal _totalFeesCollected = 0;
    /**
     * @dev calculating fees charged for client
     *
     * For e.g fees = 0.2% on 100 USDT
     * Fees charged for deploying X amount = 100 * 10^6 * (0.2 * 10^4 / 100 * 10^4)
     * = (100 * 10^6 * 2000/ 10^6) = 200000 = 0.2 USDT = 20 cents
     *
     * Since Solidity deals with integers, you will work with fixed-point arithmetic.
     * To avoid precision issues, use a large integer representation.
     * For example, to work with percentages, we scale up by a factor of 10000.
     *
     * Similarly all fees percent needs to be defined as (y/100)
     * 0.05%     -> 500
     * 0.25%     -> 2500
     * 0.30%     -> 3000
     */
    uint256 public feesPercent = 2500; // default 0.25%

    uint256 public minDepositAmount = 10000000; // 10 USD
    uint256 public minLotSize = 5000000; // 5 USD

    bool internal _swapInProgress = false;

    mapping(address => Node) private nodes;
    address[] private clients;
    uint private totalClients;

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

    modifier noSwapInProgress() {
        require(!_swapInProgress, "Swap in progress, action paused");

        _;
    }

    modifier onlyClient() {
        Node storage clientNode = nodes[msg.sender];

        require(clientNode.account == msg.sender, "You are not the owner.");

        _;
    }

    function _getTotalLotSize() internal view returns (uint256) {
        uint256 _totalLotSize = 0;

        for (uint i = 0; i < totalClients; i++) {
            Node memory _clientNode = nodes[clients[i]];

            if (_clientNode.isActive == true && _clientNode.nextLotSize > 0) {
                _totalLotSize += _clientNode.nextLotSize;
            }
        }

        return _totalLotSize;
    }

    function getTotalLotSize() public view onlyOwner returns (uint256) {
        return _getTotalLotSize();
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
        Node[] memory clientsData = new Node[](totalClients);

        for (uint i = 0; i < totalClients; i++) {
            clientsData[i] = nodes[clients[i]];
        }

        return clientsData;
    }

    function _addNode(
        uint256 _amount,
        uint256 _lotSize
    ) internal returns (Node memory) {
        Node storage _node = nodes[msg.sender];

        _node.account = address(msg.sender);
        _node.quoteTokenAmount = _amount;
        _node.lotSize = _lotSize;
        _node.nextLotSize = _lotSize;
        _node.isActive = true;

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
            emit Deposit(_status, address(quoteToken), _amount, msg.sender);
        }

        return _status;
    }

    function createDDCA(
        uint256 _amount,
        uint256 _lotSize
    ) public noSwapInProgress whenNotPaused {
        Node memory _node = nodes[msg.sender];

        require(_node.account != msg.sender, "Account already exists.");

        if (_amount < minDepositAmount) {
            revert ValidationError({message: "Deposit amount is too low."});
        }

        if (_lotSize < minLotSize) {
            revert ValidationError({message: "Lot size is too low."});
        }

        if (_amount < _lotSize) {
            revert ValidationError({
                message: "Given amount is lower than lot size."
            });
        }

        _node = _addNode(_amount, _lotSize);

        clients.push(msg.sender);
        totalClients = clients.length;

        bool _status = _deposit(_amount);
        // If transfer fails, then we are reverting all state
        // changes
        require(_status, "Transfer failed");
    }

    /**
     * @notice Function to top up the quote token amount in an existing DDCA
     *
     * @param _amount The amount to top up
     */
    function topUp(
        uint256 _amount
    ) public noSwapInProgress whenNotPaused onlyClient {
        Node storage clientNode = nodes[msg.sender];

        if (_amount < minDepositAmount) {
            revert ValidationError({message: "Deposit amount is too low."});
        }

        clientNode.quoteTokenAmount += _amount;

        if (clientNode.quoteTokenAmount >= clientNode.lotSize) {
            clientNode.nextLotSize = clientNode.lotSize;
        } else {
            clientNode.nextLotSize = clientNode.quoteTokenAmount;
        }

        if (clientNode.isActive == false && clientNode.nextLotSize > 0) {
            clientNode.isActive = true;
        }

        bool _status = _deposit(_amount);
        //
        require(_status, "Transfer failed");
    }

    /**
     * @notice Function to update the lot size of a client's node
     *
     * @param _newLotSize The new lot size
     */
    function updateLotSize(
        uint256 _newLotSize
    ) public noSwapInProgress whenNotPaused onlyClient {
        Node storage clientNode = nodes[msg.sender];

        if (_newLotSize < minLotSize) {
            revert ValidationError({message: "Lot size is too low."});
        }

        if (_newLotSize > clientNode.quoteTokenAmount) {
            revert ValidationError({
                message: "New lot size is greater than quote token amount."
            });
        }

        if (clientNode.isActive == false) {
            clientNode.isActive = true;
        }

        clientNode.lotSize = _newLotSize;
        clientNode.nextLotSize = _newLotSize;
    }

    function toggleDipsPurchasing() public noSwapInProgress onlyClient {
        Node storage clientNode = nodes[msg.sender];

        if (!clientNode.isActive) {
            /**
             * @dev If node is in in-active state, we need to
             * check if there is any quote token left or not.
             */
            require(
                clientNode.quoteTokenAmount > 0,
                "Not enough funds to activate strategy."
            );

            /**
             * @dev If the quote token balance is >= lot size
             * set by the user, we update the next lotsize to
             * lotsize. Else, we update the next lotsize to the
             * remaining of the quote token balance
             */
            if (clientNode.quoteTokenAmount >= clientNode.lotSize) {
                clientNode.nextLotSize = clientNode.lotSize;
            } else {
                clientNode.nextLotSize = clientNode.quoteTokenAmount;
            }

            // Then we activate the node
            clientNode.isActive = true;
        } else {
            clientNode.isActive = false;
        }
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

    function _getPurchaseDipInputs(
        uint256 totalLotSize,
        uint256 toleratedSlippagePrice
    ) internal view returns (PurchaseDipInputs memory) {
        uint256 _feeAmount = (totalLotSize * feesPercent) /
            MathUtils.exponent(6);
        uint256 _swapAmount = totalLotSize - _feeAmount;

        uint256 _minAmountOutExpected = ((_swapAmount *
            MathUtils.exponent(baseToken.decimals())) / toleratedSlippagePrice);

        PurchaseDipInputs memory params = PurchaseDipInputs({
            feeAmount: _feeAmount,
            swapAmount: _swapAmount,
            minAmountOutExpected: _minAmountOutExpected
        });

        return params;
    }

    function _onPurchaseDip(
        uint256 _amountIn,
        uint256 _amountOut,
        uint256 _amountSubmitted,
        uint256 _feeAmount
    ) internal {
        _distributeReward(_amountIn, _amountOut);

        _totalFeesCollected += _feeAmount;

        emit PurchaseDipOk(_amountIn, _amountOut, _amountSubmitted);
    }

    /**
     * @notice Function to distribute rewards among clients
     * after completing the batch swap
     *
     * @dev It is an internal function, for testing we need to
     * change it to public. After that we need to change it
     * back.
     *
     * @param _amountIn The total amount sent to the swap
     * @param _amountOut The total amount of token received from the swap
     */
    function _distributeReward(uint256 _amountIn, uint256 _amountOut) internal {
        uint256 totalReward = 0;

        for (uint i = 0; i < totalClients; i++) {
            Node storage _clientNode = nodes[clients[i]];

            if (_clientNode.isActive == true && _clientNode.nextLotSize > 0) {
                /**
                 * @dev calculating fees charged for client
                 * We are defining fees as x/100, thats why we
                 * are only dividing the amount by the the fees
                 * percent.
                 */
                uint256 _clientFee = (_clientNode.nextLotSize * feesPercent) /
                    MathUtils.exponent(6);

                /**
                 * @dev calculating reward for the swap
                 * reward = ((lot_size - fee) / (swapped amount/amount in)) * total amount received
                 */
                uint256 reward = ((_clientNode.nextLotSize - _clientFee) *
                    _amountOut) / _amountIn;

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
                _clientNode.totalCostPrice +=
                    _clientNode.nextLotSize -
                    _clientFee;

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
                _clientNode.quoteTokenAmount -= _clientNode.nextLotSize;

                /**
                 * @dev If there is no quote token left, then we set the
                 * status of the strategy to false, and nextLotSize to 0.
                 * If the quote token amount is > 0 but less that the next
                 * lot size, then we assign the whole amount of quote token
                 * left as the next lot size.
                 */
                if (_clientNode.quoteTokenAmount == 0) {
                    _clientNode.isActive = false;
                    _clientNode.nextLotSize = 0;
                } else if (
                    _clientNode.quoteTokenAmount > 0 &&
                    _clientNode.quoteTokenAmount < _clientNode.lotSize
                ) {
                    _clientNode.nextLotSize = _clientNode.quoteTokenAmount;
                }
            } else if (
                _clientNode.isActive == true && _clientNode.nextLotSize == 0
            ) {
                _clientNode.isActive = false;
            }
        }

        // Ensure totalReward does not exceed the amountOut
        if (totalReward > _amountOut) {
            revert ValidationError({
                message: "Total reward exceeds swapped amount out"
            });
        }
    }

    /**
     * @notice Function to withdraw funds from the contract
     *
     * @dev We are using the nonReentrant to protect against
     * re-entrancy attacks on the public function
     *
     * @param _token The token to be withdrawn
     * @param _amount The amount of the token to be withdrawn
     */
    function withdraw(
        address _token,
        uint256 _amount
    ) external onlyClient nonReentrant {
        require(_amount > 0, "Amount must be greater than 0.");

        if (_token == address(baseToken)) {
            _withdrawBaseToken(_amount);
        } else if (_token == address(quoteToken)) {
            _withdrawQuoteToken(_amount);
        } else {
            revert ValidationError({message: "Invalid token address"});
        }
    }

    /**
     * @notice Function to withdraw the base token
     *
     * @dev We are using the CEI (Checks-Effect-Interaction) pattern
     * to prevent re-entrancy attack on the internal
     * methods
     *
     * @param _amount The amount to be withdrawn
     */
    function _withdrawBaseToken(uint256 _amount) internal noSwapInProgress {
        Node storage clientNode = nodes[msg.sender];

        if (_amount > clientNode.baseTokenAmount) {
            revert InsufficientBalance({
                token: baseToken.symbol(),
                balance: clientNode.baseTokenAmount,
                amount: _amount
            });
        }

        clientNode.baseTokenAmount -= _amount;
        _removeClientIfZeroBalance(msg.sender);

        bool _status = baseToken.transfer(msg.sender, _amount);
        // We are reverting the whole transaction, if the
        // transfer of funds are failing
        require(_status, "Transfer failed");

        emit Withdraw(_status, address(baseToken), _amount, msg.sender);
    }

    /**
     * @notice Function to withdraw the quote token
     *
     * @dev We are using the CEI (Checks-Effect-Interaction) pattern
     * to prevent re-entrancy attack on the internal
     * methods
     *
     * @param _amount The amount to be withdrawn
     */
    function _withdrawQuoteToken(uint256 _amount) internal noSwapInProgress {
        Node storage clientNode = nodes[msg.sender];

        if (_amount > clientNode.quoteTokenAmount) {
            revert InsufficientBalance({
                token: quoteToken.symbol(),
                balance: clientNode.quoteTokenAmount,
                amount: _amount
            });
        }

        /**
         * @dev If the balance quote token amount is <= 1 USD,
         * then the entire quote token balance is transferred
         * out
         */
        uint256 _amountToTransfer = clientNode.quoteTokenAmount - _amount <=
            1 * MathUtils.exponent(6)
            ? clientNode.quoteTokenAmount
            : _amount;

        clientNode.quoteTokenAmount -= _amountToTransfer;
        _removeClientIfZeroBalance(msg.sender);

        if (clientNode.quoteTokenAmount < clientNode.lotSize) {
            if (clientNode.quoteTokenAmount > 0) {
                clientNode.nextLotSize = clientNode.quoteTokenAmount;
            } else {
                clientNode.nextLotSize = 0;
                clientNode.isActive = false;
            }
        }

        bool _status = quoteToken.transfer(msg.sender, _amountToTransfer);
        // We are reverting the whole transaction, if the
        // transfer of funds are failing
        require(_status, "Transfer failed");

        emit Withdraw(
            _status,
            address(quoteToken),
            _amountToTransfer,
            msg.sender
        );
    }

    /**
     * @notice Removes a client node when they run out of
     * quote token or their quote token balance is less than
     * their lot size
     *
     * @param _client The address of the client
     */
    function _removeClientIfZeroBalance(address _client) internal {
        Node storage clientNode = nodes[_client];
        if (
            clientNode.baseTokenAmount == 0 && clientNode.quoteTokenAmount == 0
        ) {
            // Remove client from the clients array
            for (uint i = 0; i < totalClients; i++) {
                if (clients[i] == _client) {
                    clients[i] = clients[totalClients - 1];
                    clients.pop();

                    totalClients = clients.length;
                    break;
                }
            }
            // Remove client from nodes mapping
            delete nodes[_client];
        }
    }

    /**
     * @notice Function to check the total fees collected
     */
    function getTotalFeesCollected() public view onlyOwner returns (uint256) {
        return _totalFeesCollected;
    }

    /**
     * @notice Function to update the fees percent, between 0.1% to 2%
     *
     * @param newFeesPercent The new fees percent
     */
    function updateFeesPercent(
        uint256 newFeesPercent
    ) public onlyOwner noSwapInProgress {
        if (newFeesPercent < 100 || newFeesPercent > 20000) {
            revert ValidationError({
                message: "Fees percent should be between 0.01 and 2"
            });
        }

        feesPercent = newFeesPercent;
    }

    /**
     * @notice Function to withdraw the collected fees
     *
     * @param _amount The amount of fees to withdraw
     */
    function withdrawFees(
        address account,
        uint256 _amount
    ) public onlyOwner noSwapInProgress {
        if (_amount > _totalFeesCollected) {
            revert InsufficientBalance({
                token: quoteToken.symbol(),
                balance: _totalFeesCollected,
                amount: _amount
            });
        }

        _totalFeesCollected -= _amount;

        bool _status = quoteToken.transfer(account, _amount);
        //
        require(_status, "Transfer failed");
    }

    function updateMinDepositAmount(
        uint256 _newMinDepositAmount
    ) public onlyOwner {
        minDepositAmount = _newMinDepositAmount;
    }

    function updateMinLotSize(uint256 _newMinLotSize) public onlyOwner {
        minLotSize = _newMinLotSize;
    }
}
