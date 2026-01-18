//SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;

import { Token } from './Token.sol';

/**
 * @title StrategyRouter
 * @author Juan José Expósito González
 * @notice Router contract that manages capital distribution to strategies
 * @dev Acts as intermediary between Vault4626 and individual strategies (MockS1, MockS2, MockS3)
 */
contract StrategyRouter {
    // Constants
    uint256 private constant SCALE = 1e18;
    uint256 private constant MAX_STRATEGIES = 10;

    // Custom Errors
    error StrategyRouter__NotOwner();
    error StrategyRouter__StrategyNotRegistered();
    error StrategyRouter__StrategyPaused();
    error StrategyRouter__StrategyNotActive();
    error StrategyRouter__CapExceeded(uint256 strategyId, uint256 requested, uint256 available);
    error StrategyRouter__InvalidStrategyAddress();
    error StrategyRouter__StrategyAlreadyRegistered();
    error StrategyRouter__InsufficientLiquidity();
    error StrategyRouter__InvalidAmount();
    error StrategyRouter__SlippageExceeded(uint256 expected, uint256 actual, uint256 maxSlippageBps);

    // State Variables
    address public immutable asset; // Token base (USDC)
    address public owner;
    address public configManager;
    
    // Strategy mappings
    mapping(uint256 => address) public strategies; // strategyId -> strategy address
    mapping(address => uint256) public strategyId; // strategy address -> strategyId (0 = not registered)
    
    // Strategy state
    mapping(uint256 => bool) public strategyActive; // strategyId -> active
    mapping(uint256 => bool) public strategyPaused; // Cache of paused state
    uint256 public totalStrategies; // Counter of registered strategies
    
    // Limits and caps
    mapping(uint256 => uint256) public strategyCap; // strategyId -> cap
    mapping(uint256 => uint256) public strategyAllocated; // strategyId -> allocated capital
    
    // User-specific allocations tracking
    mapping(address => mapping(uint256 => uint256)) public userStrategyAllocations; // user -> strategyId -> allocated amount

    // Events
    event StrategyRegistered(uint256 indexed strategyId, address indexed strategy, uint256 cap);
    event StrategyActivated(uint256 indexed strategyId, bool active);
    event CapitalDeposited(uint256 indexed strategyId, uint256 amount, uint256 totalAllocated);
    event CapitalWithdrawn(uint256 indexed strategyId, uint256 amount, uint256 totalAllocated);
    event StrategyCapUpdated(uint256 indexed strategyId, uint256 oldCap, uint256 newCap);

    // Modifiers
    modifier onlyOwner() {
        if (msg.sender != owner) revert StrategyRouter__NotOwner();
        _;
    }

    modifier strategyExists(uint256 _strategyId) {
        if (strategies[_strategyId] == address(0)) revert StrategyRouter__StrategyNotRegistered();
        _;
    }

    modifier strategyActiveMod(uint256 _strategyId) {
        if (!strategyActive[_strategyId]) revert StrategyRouter__StrategyNotActive();
        _;
    }

    modifier strategyNotPaused(uint256 _strategyId) {
        _updateStrategyPausedCache(_strategyId);
        if (strategyPaused[_strategyId]) revert StrategyRouter__StrategyPaused();
        _;
    }

    // Constructor
    constructor(address _asset, address _configManager) {
        if (_asset == address(0)) revert StrategyRouter__InvalidStrategyAddress();
        if (_configManager == address(0)) revert StrategyRouter__InvalidStrategyAddress();
        
        asset = _asset;
        owner = msg.sender;
        configManager = _configManager;
        totalStrategies = 0;
    }

    // View Functions

    /**
     * @notice Get strategy information
     * @param _strategyId Strategy ID
     * @return strategy Strategy address
     * @return active Whether strategy is active
     * @return cap Strategy cap
     * @return allocated Currently allocated capital
     */
    function getStrategy(uint256 _strategyId) 
        external 
        view 
        returns (address strategy, bool active, uint256 cap, uint256 allocated) 
    {
        strategy = strategies[_strategyId];
        active = strategyActive[_strategyId];
        cap = strategyCap[_strategyId];
        allocated = strategyAllocated[_strategyId];
    }

    /**
     * @notice Check if strategy is active
     * @param _strategyId Strategy ID
     * @return Whether strategy is active
     */
    function isStrategyActive(uint256 _strategyId) external view returns (bool) {
        return strategyActive[_strategyId];
    }

    /**
     * @notice Get total number of registered strategies
     * @return Total strategies count
     */
    function getTotalStrategies() external view returns (uint256) {
        return totalStrategies;
    }

    /**
     * @notice Aggregate totalAssets from all active strategies
     * @return Total assets across all active strategies
     */
    function totalAssets() external view returns (uint256) {
        uint256 total = 0;
        
        // Iterate through all possible strategy IDs (1 to MAX_STRATEGIES)
        for (uint256 i = 1; i <= MAX_STRATEGIES; i++) {
            address strategy = strategies[i];
            if (strategy != address(0) && strategyActive[i]) {
                // Check if strategy is paused (call directly, don't use cache in view function)
                (bool pausedSuccess, bytes memory pausedData) = strategy.staticcall(
                    abi.encodeWithSignature("paused()")
                );
                bool isPaused = false;
                if (pausedSuccess) {
                    isPaused = abi.decode(pausedData, (bool));
                }
                
                if (!isPaused) {
                    // Call totalAssets() on the strategy
                    (bool success, bytes memory data) = strategy.staticcall(
                        abi.encodeWithSignature("totalAssets()")
                    );
                    if (success) {
                        uint256 assets = abi.decode(data, (uint256));
                        total += assets;
                    }
                }
            }
        }
        
        return total;
    }

    /**
     * @notice Get available capacity for a strategy
     * @param _strategyId Strategy ID
     * @return Available capacity (cap - allocated)
     */
    function availableCapacity(uint256 _strategyId) external view returns (uint256) {
        return _calculateAvailableCapacity(_strategyId);
    }

    /**
     * @notice Get total allocated capital across all strategies
     * @return Total allocated capital
     */
    function getTotalAllocated() external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 1; i <= MAX_STRATEGIES; i++) {
            if (strategies[i] != address(0)) {
                total += strategyAllocated[i];
            }
        }
        return total;
    }

    /**
     * @notice Get total allocated capital for a specific user across all strategies
     * @param _user User address
     * @return Total allocated capital by user
     */
    function getUserTotalAllocated(address _user) external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 1; i <= MAX_STRATEGIES; i++) {
            if (strategies[i] != address(0)) {
                total += userStrategyAllocations[_user][i];
            }
        }
        return total;
    }

    /**
     * @notice Get allocated capital for a specific user in a specific strategy
     * @param _user User address
     * @param _strategyId Strategy ID
     * @return Allocated capital by user in strategy
     */
    function getUserStrategyAllocation(address _user, uint256 _strategyId) external view returns (uint256) {
        return userStrategyAllocations[_user][_strategyId];
    }

    // External Functions - Registration and Configuration

    /**
     * @notice Register a new strategy
     * @param _strategyId Strategy ID (1, 2, 3 for S1, S2, S3)
     * @param _strategy Strategy contract address
     * @param _cap Initial cap for the strategy
     */
    function registerStrategy(uint256 _strategyId, address _strategy, uint256 _cap) 
        external 
        onlyOwner 
    {
        if (_strategy == address(0)) revert StrategyRouter__InvalidStrategyAddress();
        if (strategies[_strategyId] != address(0)) revert StrategyRouter__StrategyAlreadyRegistered();
        if (strategyId[_strategy] != 0) revert StrategyRouter__StrategyAlreadyRegistered();
        if (_strategyId == 0 || _strategyId > MAX_STRATEGIES) revert StrategyRouter__StrategyNotRegistered();
        
        strategies[_strategyId] = _strategy;
        strategyId[_strategy] = _strategyId;
        strategyCap[_strategyId] = _cap;
        strategyActive[_strategyId] = true;
        strategyAllocated[_strategyId] = 0;
        
        // Update paused cache
        _updateStrategyPausedCache(_strategyId);
        
        totalStrategies++;
        
        emit StrategyRegistered(_strategyId, _strategy, _cap);
    }

    /**
     * @notice Activate or deactivate a strategy
     * @param _strategyId Strategy ID
     * @param _active Whether to activate (true) or deactivate (false)
     */
    function setStrategyActive(uint256 _strategyId, bool _active) 
        external 
        onlyOwner 
        strategyExists(_strategyId) 
    {
        strategyActive[_strategyId] = _active;
        emit StrategyActivated(_strategyId, _active);
    }

    /**
     * @notice Update strategy cap
     * @param _strategyId Strategy ID
     * @param _newCap New cap value
     */
    function setStrategyCap(uint256 _strategyId, uint256 _newCap) 
        external 
        onlyOwner 
        strategyExists(_strategyId) 
    {
        if (_newCap < strategyAllocated[_strategyId]) {
            revert StrategyRouter__CapExceeded(_strategyId, _newCap, strategyAllocated[_strategyId]);
        }
        
        uint256 oldCap = strategyCap[_strategyId];
        strategyCap[_strategyId] = _newCap;
        
        emit StrategyCapUpdated(_strategyId, oldCap, _newCap);
    }

    // External Functions - Capital Management

    /**
     * @notice Deposit capital to a strategy
     * @param _strategyId Strategy ID
     * @param _amount Amount to deposit
     * @return Amount deposited
     */
    function depositToStrategy(uint256 _strategyId, uint256 _amount) 
        external 
        returns (uint256) 
    {
        _validateStrategy(_strategyId);
        _updateStrategyPausedCache(_strategyId);
        if (strategyPaused[_strategyId]) revert StrategyRouter__StrategyPaused();
        if (_amount == 0) revert StrategyRouter__InvalidAmount();
        
        uint256 available = _calculateAvailableCapacity(_strategyId);
        if (_amount > available) {
            revert StrategyRouter__CapExceeded(_strategyId, _amount, available);
        }
        
        // Transfer tokens from msg.sender to this contract
        Token token = Token(asset);
        require(token.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        
        // Call depositToStrategy on the strategy (MockS1 doesn't handle tokens, only state)
        (bool success, ) = strategies[_strategyId].call(
            abi.encodeWithSignature("depositToStrategy(uint256)", _amount)
        );
        require(success, "Strategy deposit failed");
        
        // Update allocated amount
        strategyAllocated[_strategyId] += _amount;
        
        // Update user-specific allocation tracking
        userStrategyAllocations[msg.sender][_strategyId] += _amount;
        
        emit CapitalDeposited(_strategyId, _amount, strategyAllocated[_strategyId]);
        
        return _amount;
    }

    /**
     * @notice Withdraw capital from a strategy
     * @param _strategyId Strategy ID
     * @param _amount Amount to withdraw
     * @param _maxSlippageBps Maximum slippage in basis points
     * @return Actual amount withdrawn
     */
    function withdrawFromStrategy(uint256 _strategyId, uint256 _amount, uint256 _maxSlippageBps) 
        external 
        returns (uint256) 
    {
        _validateStrategy(_strategyId);
        _updateStrategyPausedCache(_strategyId);
        if (strategyPaused[_strategyId]) revert StrategyRouter__StrategyPaused();
        if (_amount == 0) revert StrategyRouter__InvalidAmount();
        
        // Check available liquidity
        address strategyAddr = strategies[_strategyId];
        (bool success, bytes memory data) = strategyAddr.staticcall(
            abi.encodeWithSignature("totalAssets()")
        );
        require(success, "Strategy totalAssets call failed");
        if (_amount > abi.decode(data, (uint256))) revert StrategyRouter__InsufficientLiquidity();
        
        // Call withdrawFromStrategy on the strategy (MockS1 only updates state, doesn't transfer tokens)
        (success, ) = strategyAddr.call(
            abi.encodeWithSignature("withdrawFromStrategy(uint256)", _amount)
        );
        require(success, "Strategy withdrawal failed");
        
        // MockS1 doesn't transfer tokens, so we transfer from router's balance
        // For MockS1, the actual amount equals requested amount (virtual strategy, no real slippage)
        uint256 actualAmount = _amount;
        
        // Validate slippage (for MockS1, this should always pass, but we check for consistency)
        uint256 minAmount = (_amount * (10000 - _maxSlippageBps)) / 10000;
        if (actualAmount < minAmount) {
            revert StrategyRouter__SlippageExceeded(_amount, actualAmount, _maxSlippageBps);
        }
        
        // Check router has enough balance
        Token token = Token(asset);
        if (actualAmount > token.balanceOf(address(this))) {
            revert StrategyRouter__InsufficientLiquidity();
        }
        
        // Update allocated amount and store for emit
        uint256 currentAllocated = strategyAllocated[_strategyId];
        uint256 newAllocated;
        if (actualAmount <= currentAllocated) {
            newAllocated = currentAllocated - actualAmount;
            strategyAllocated[_strategyId] = newAllocated;
        } else {
            newAllocated = 0;
            strategyAllocated[_strategyId] = 0;
        }
        
        // Update user-specific allocation tracking
        uint256 userAllocated = userStrategyAllocations[msg.sender][_strategyId];
        if (actualAmount <= userAllocated) {
            userStrategyAllocations[msg.sender][_strategyId] = userAllocated - actualAmount;
        } else {
            userStrategyAllocations[msg.sender][_strategyId] = 0;
        }
        
        // Transfer tokens to msg.sender
        require(token.transfer(msg.sender, actualAmount), "Transfer to sender failed");
        
        emit CapitalWithdrawn(_strategyId, actualAmount, newAllocated);
        
        return actualAmount;
    }

    // Internal Functions

    /**
     * @notice Validate that strategy exists and is active
     * @param _strategyId Strategy ID
     */
    function _validateStrategy(uint256 _strategyId) internal view {
        if (strategies[_strategyId] == address(0)) revert StrategyRouter__StrategyNotRegistered();
        if (!strategyActive[_strategyId]) revert StrategyRouter__StrategyNotActive();
    }


    /**
     * @notice Update paused cache for a strategy
     * @param _strategyId Strategy ID
     */
    function _updateStrategyPausedCache(uint256 _strategyId) internal {
        address strategy = strategies[_strategyId];
        if (strategy == address(0)) return;
        
        (bool success, bytes memory data) = strategy.staticcall(
            abi.encodeWithSignature("paused()")
        );
        if (success) {
            strategyPaused[_strategyId] = abi.decode(data, (bool));
        }
    }

    /**
     * @notice Calculate available capacity for a strategy
     * @param _strategyId Strategy ID
     * @return Available capacity
     */
    function _calculateAvailableCapacity(uint256 _strategyId) internal view returns (uint256) {
        uint256 cap = strategyCap[_strategyId];
        uint256 allocated = strategyAllocated[_strategyId];
        if (cap <= allocated) return 0;
        return cap - allocated;
    }
}

