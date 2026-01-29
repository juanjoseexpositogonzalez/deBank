//SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;

// imports
import {IERC4626} from "./openzeppelin/IERC4626.sol";
import {Token} from "./Token.sol";
import {ConfigManager} from "./ConfigManager.sol";
import {StrategyRouter} from "./StrategyRouter.sol";
import {Math} from "./openzeppelin/Math.sol";

/**
 * @title A decentralized Bank Contract
 * @author Juan José Expósito González
 * @notice This contract implements a Vault4626
 * @dev 
 */
contract dBank {
    // Constants
    uint256 private constant SCALE = 1e18;
    uint256 private constant MAX_BPS = 10000;
    uint256 private constant EPOCH_DURATION = 7 days;

    // Custom Errors
    error dBank__NotOwner();
    error dBank__ZeroAddress();
    error dBank__Paused();
    error dBank__CapExceeded(uint256 requested, uint256 available);
    error dBank__InsufficientLiquidity(uint256 requested, uint256 available);
    error dBank__SlippageExceeded(uint256 expected, uint256 actual, uint256 maxSlippageBps);
    error dBank__InvalidAmount();
    error dBank__InsufficientShares();
    error dBank__InvalidReceiver();
    error dBank__EpochNotComplete();
    error dBank__InsufficientAllowance();
    error dBank__InvalidStrategy();
    error dBank__AllocationFailed();
    error dBank__SharesAllocated(uint256 allocatedShares);
    
    // State Variables
    Token public immutable asset;
    address public owner;
    address public strategyRouter;
    address public configManager;
    
    // ERC-20 state (for shares)
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    // State mapppings
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // liquidity buffer
    uint256 public buffer;
    uint256 public bufferTargetBps;

    // performance fees
    uint256 public performanceFeeBps;
    address public feeRecipient;
    uint256 public lastEpochTimeStamp;
    uint256 public highWaterMark;

    // limits and caps
    uint256 public tvlCap;
    uint256 public perTxCap;

    // pause and safety
    bool public paused;

    // Events - ERC-4626 required events
    event Deposit(
        address indexed sender,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    event Withdraw(
        address indexed sender,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    // Events - ERC-20
    event Transfer(
        address indexed from,
        address indexed to,
        uint256 value
    );

    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    // Events - custom events
    event BufferUpdated(uint256 oldBuffer, uint256 newBuffer);
    event FeesCrystallized(uint256 gain, uint256 feeAmount, uint256 newHighWaterMark, uint256 timestamp);
    event ConfigUpdated(bytes32 indexed key, uint256 oldValue, uint256 newValue);
    event Paused(bool paused);
    event Allocated(uint256 indexed strategyId, uint256 amount, uint256 newBuffer);
    event WithdrawnFromStrategy(uint256 indexed strategyId, uint256 amount);

    // modifiers
    modifier onlyOwner() {
        if (msg.sender != owner) revert dBank__NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert dBank__Paused();
        _;
    }

    modifier validAddress(address _addr) {
        if (_addr == address(0)) revert dBank__ZeroAddress();
        _;
    }


    // constructor
    constructor(
        Token _asset,
        string memory _name,
        string memory _symbol,
        address _strategyRouter,
        address _configManager
    ) {
        asset = _asset;
        owner = msg.sender;
        strategyRouter = _strategyRouter;
        configManager = _configManager;
        name = _name;
        symbol = _symbol;
        decimals = uint8(_asset.decimals() >= 0 ? _asset.decimals() : 18);
        totalSupply = 0;
        bufferTargetBps = ConfigManager(configManager).liquidityBufferBps();
        performanceFeeBps = ConfigManager(configManager).performanceFeeBps();
        feeRecipient = ConfigManager(configManager).feeRecipient();
        lastEpochTimeStamp = block.timestamp;
        highWaterMark = 0;
        tvlCap = ConfigManager(configManager).tvlGlobalCap();
        perTxCap = ConfigManager(configManager).perTxCap();
        paused = false;
    }

    // view functions
    function totalAssets() external view returns (uint256) {
        return buffer + StrategyRouter(strategyRouter).totalAssets();
    }

    // conversion functions
    function convertToShares(uint256 _assets) external view returns (uint256 shares) {
        uint256 _totalAssets = this.totalAssets();
        if (totalSupply == 0) {
            shares = _assets;
        } else {
            shares = _assets * totalSupply / _totalAssets;
        }
        return shares; // Math.floor is implicit in Solidity division
    }

    function convertToAssets(uint256 _shares) external view returns (uint256 assets) {
        if (totalSupply == 0) {
            assets = 0;
        } else {
            assets = _shares * this.totalAssets() / totalSupply;
        }
        return assets; // Math.floor is implicit in Solidity division
    }

    // Max functions
    function maxDeposit(address /* _receiver */) external view returns (uint256) {
        uint256 _totalAssets = this.totalAssets();
        uint256 maxAssets = _totalAssets >= tvlCap ? 0 : tvlCap - _totalAssets;
        if (maxAssets < perTxCap) {
            return maxAssets;
        }
        return perTxCap;
    }

    function maxMint(address _receiver) external view returns (uint256) {
        return this.convertToShares(this.maxDeposit(_receiver));
    }

    function maxWithdraw(address _owner) external view returns (uint256) {
        return this.convertToAssets(balanceOf[_owner]);
    }

    function maxRedeem(address _owner) external view returns (uint256) {
        return balanceOf[_owner];
    }

    // Preview functions
    function previewDeposit(uint256 _assets) external view returns (uint256 shares) {
        return this.convertToShares(_assets);
    }

    function previewMint(uint256 _shares) external view returns (uint256 assets) {
        return this.convertToAssets(_shares);
    }

    function previewWithdraw(uint256 _assets) external view returns (uint256 shares) {
        return this.convertToShares(_assets);
    }

    function previewRedeem(uint256 _shares) external view returns (uint256 assets) {
        return this.convertToAssets(_shares);
    }

    //===========================================================
    // ERC-4626 Required External Functions
    //===========================================================

    function deposit(uint256 _assets, address _receiver) external whenNotPaused validAddress(_receiver) returns (uint256 shares) {
        // 1. Verify assets
        if (_assets == 0) revert dBank__InvalidAmount();
        // 2. Verify receiver
        if (_receiver == address(0)) revert dBank__InvalidReceiver();
        // 3. Convert to shares
        shares = this.convertToShares(_assets);
        // 4. Verify max deposit
        if (_assets > this.maxDeposit(_receiver)) revert dBank__CapExceeded(_assets, this.maxDeposit(_receiver));
        // 5. Update buffer
        buffer += _assets;
        // 6. Transfer assets from sender to contract
        asset.transferFrom(msg.sender, address(this), _assets);
        // 7. Update total supply and balance of receiver
        totalSupply += shares;
        balanceOf[_receiver] += shares;
        // 8. Emit event
        emit Deposit(msg.sender, _receiver, _assets, shares);
        return shares;
    }

    function mint(uint256 _shares, address _receiver) external whenNotPaused validAddress(_receiver) returns (uint256 assets) {
        // 1. Verify shares
        if (_shares == 0) revert dBank__InvalidAmount();
        // 2. Verify receiver
        if (_receiver == address(0)) revert dBank__InvalidReceiver();
        // 3. Convert to assets
        assets = this.convertToAssets(_shares);
        // 4. Verify max deposit
        if (assets > this.maxDeposit(_receiver)) revert dBank__CapExceeded(assets, this.maxDeposit(_receiver));
        // 5. Transfer assets from sender to contract
        asset.transferFrom(msg.sender, address(this), assets);
        // 6. Update buffer
        buffer += assets;
        // 7. Mint shares to receiver
        _mint(_receiver, _shares);
        // 8. Emit event
        emit Deposit(msg.sender, _receiver, assets, _shares);
        return assets;
    }

    // Withdrawal functions
    function withdraw(uint256 _assets, address _receiver, address _owner) external whenNotPaused validAddress(_receiver) validAddress(_owner) returns (uint256 shares) {
        // 1. Verify assets
        if (_assets == 0) revert dBank__InvalidAmount();
        // 2. Verify assets <= maxWithdraw(owner)
        if (_assets > this.maxWithdraw(_owner)) revert dBank__CapExceeded(_assets, this.maxWithdraw(_owner));
        // 3. Convert to shares
        shares = this.convertToShares(_assets);
        // 4. Verify shares <= balanceOf[owner]
        if (shares > balanceOf[_owner]) revert dBank__InsufficientShares();
        // 4.5. Prevent withdrawals while user has allocated shares
        _revertIfAllocatedShares(_owner, shares);
        // 5. Burn shares from owner
        _burn(_owner, shares);
        // 6. Serve withdrawal
        if (_assets <= buffer) {
            // Serve from buffer
            buffer -= _assets;
        } else {
            // Serve from buffer + withdraw from router (sync)
            uint256 bufferToServe = buffer;
            uint256 assetsToWithdraw = _assets - bufferToServe;
            buffer = 0;

            // Withdraw from strategies via router
            uint256 maxSlippageBps = ConfigManager(configManager).maxSlippageBps();
            uint256 withdrawn = _withdrawFromStrategies(assetsToWithdraw, maxSlippageBps);
            if (withdrawn < assetsToWithdraw) {
                revert dBank__InsufficientLiquidity(assetsToWithdraw, withdrawn);
            }
        }
        // 7. Transfer assets to receiver
        asset.transfer(_receiver, _assets);
        // 8. Emit event
        emit Withdraw(msg.sender, _receiver, _owner, _assets, shares);
        return shares;
    }

    function redeem(uint256 _shares, address _receiver, address _owner) external whenNotPaused validAddress(_receiver) validAddress(_owner) returns (uint256 assets) {
        // 1. Verify shares
        if (_shares == 0) revert dBank__InvalidAmount();
        // 2. Calculate assets
        assets = this.convertToAssets(_shares);
        // 2.5. Prevent redemptions while user has allocated shares
        _revertIfAllocatedShares(_owner, _shares);
        // 3. Handle approval if owner != msg.sender
        if (_owner != msg.sender) {
            if (allowance[_owner][msg.sender] < _shares) revert dBank__InsufficientAllowance();
            allowance[_owner][msg.sender] -= _shares;
        }
        // 4. Burn shares from owner
        _burn(_owner, _shares);
        // 5. Serve withdrawal
        if (assets <= buffer) {
            buffer -= assets;
        } else {
            uint256 bufferToServe = buffer;
            uint256 assetsToWithdraw = assets - bufferToServe;
            buffer = 0;

            // Withdraw from strategies via router
            uint256 maxSlippageBps = ConfigManager(configManager).maxSlippageBps();
            uint256 withdrawn = _withdrawFromStrategies(assetsToWithdraw, maxSlippageBps);
            if (withdrawn < assetsToWithdraw) {
                revert dBank__InsufficientLiquidity(assetsToWithdraw, withdrawn);
            }
        }
        // 6. Transfer assets to receiver
        asset.transfer(_receiver, assets);
        // 7. Emit event
        emit Withdraw(msg.sender, _receiver, _owner, assets, _shares);
        return assets;
    }

    //===========================================================
    // ERC-20 Functions (for Shares)
    //===========================================================

    function transfer(address _to, uint256 _amount) external returns (bool) {
        _transfer(msg.sender, _to, _amount);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _amount) external returns (bool) {
        if (allowance[_from][msg.sender] < _amount) revert dBank__InsufficientAllowance();
        allowance[_from][msg.sender] -= _amount;
        _transfer(_from, _to, _amount);
        return true;
    }

    function approve(address _spender, uint256 _amount) external returns (bool) {
        if (_spender == address(0)) revert dBank__ZeroAddress();
        allowance[msg.sender][_spender] = _amount;
        emit Approval(msg.sender, _spender, _amount);
        return true;
    }

    function increaseAllowance(address _spender, uint256 _addedValue) external returns (bool) {
        if (_spender == address(0)) revert dBank__ZeroAddress();
        allowance[msg.sender][_spender] += _addedValue;
        emit Approval(msg.sender, _spender, allowance[msg.sender][_spender]);
        return true;
    }

    function decreaseAllowance(address _spender, uint256 _subtractedValue) external returns (bool) {
        if (_spender == address(0)) revert dBank__ZeroAddress();
        if (allowance[msg.sender][_spender] < _subtractedValue) revert dBank__InsufficientAllowance();
        allowance[msg.sender][_spender] -= _subtractedValue;
        emit Approval(msg.sender, _spender, allowance[msg.sender][_spender]);
        return true;
    }

    // Internal ERC-20 helpers
    function _transfer(address _from, address _to, uint256 _amount) internal {
        if (_to == address(0)) revert dBank__ZeroAddress();
        if (balanceOf[_from] < _amount) revert dBank__InsufficientShares();
        
        balanceOf[_from] -= _amount;
        balanceOf[_to] += _amount;
        
        emit Transfer(_from, _to, _amount);
    }

    function _mint(address _to, uint256 _amount) internal {
        if (_to == address(0)) revert dBank__ZeroAddress();
        
        totalSupply += _amount;
        balanceOf[_to] += _amount;
        
        emit Transfer(address(0), _to, _amount);
    }

    function _burn(address _from, uint256 _amount) internal {
        if (balanceOf[_from] < _amount) revert dBank__InsufficientShares();
        
        balanceOf[_from] -= _amount;
        totalSupply -= _amount;
        
        emit Transfer(_from, address(0), _amount);
    }

    /**
     * @notice This function was removed because it contained a bug.
     * 
     * THE BUG: The function assumed that tokens allocated to strategies via 
     * StrategyRouter came from the dBank vault, but they actually come from 
     * the user's wallet (see StrategyRouter.depositToStrategy line 302:
     * token.transferFrom(msg.sender, address(this), _amount)).
     * 
     * This caused users to be unable to withdraw their dBank deposits even 
     * though their strategy allocations were completely separate.
     * 
     * SOLUTION: Removed the check entirely. The dBank vault and strategy 
     * allocations are independent systems. Users can withdraw their full 
     * vault balance regardless of their strategy allocations.
     * 
     * If in the future we want to link vault shares with strategy allocations,
     * the StrategyRouter.depositToStrategy function should withdraw tokens 
     * from dBank (burning shares) instead of from the user's wallet directly.
     */
    function _revertIfAllocatedShares(address /* _owner */, uint256 /* _requestedShares */) internal pure {
        // No-op: Strategy allocations don't affect vault withdrawals
        // See comment above for explanation of the bug that was fixed
    }

    //===========================================================
    // Custom Functions - Fee Management
    //===========================================================

    function crystallizeFees() external {
        if (block.timestamp < lastEpochTimeStamp + EPOCH_DURATION) {
            revert dBank__EpochNotComplete();
        }
        
        uint256 _totalAssets = this.totalAssets();
        uint256 _totalSupply = totalSupply;
        
        if (_totalSupply == 0) {
            lastEpochTimeStamp = block.timestamp;
            return;
        }
        
        uint256 currentPricePerShare = (_totalAssets * SCALE) / _totalSupply;
        uint256 gain = 0;
        
        if (currentPricePerShare > highWaterMark) {
            gain = currentPricePerShare - highWaterMark;
        }
        
        if (gain > 0) {
            // Fee calculation (not yet implemented - would transfer to feeRecipient)
            // uint256 feeAmount = (gain * performanceFeeBps) / MAX_BPS;
            // Fee is taken from total assets, reducing shares value
            // In practice, this would be transferred to feeRecipient
            // For now, we just update the high water mark
        }
        
        if (currentPricePerShare > highWaterMark) {
            highWaterMark = currentPricePerShare;
        }
        
        lastEpochTimeStamp = block.timestamp;
        
        emit FeesCrystallized(gain, 0, highWaterMark, block.timestamp);
    }

    function pricePerShare() external view returns (uint256) {
        if (totalSupply == 0) {
            return SCALE; // 1:1 initial
        }
        return (this.totalAssets() * SCALE) / totalSupply;
    }

    //===========================================================
    // Custom Functions - Configuration
    //===========================================================

    function setBufferTargetBps(uint256 _newTargetBps) external onlyOwner {
        if (_newTargetBps > MAX_BPS) revert dBank__CapExceeded(_newTargetBps, MAX_BPS);
        
        uint256 oldValue = bufferTargetBps;
        bufferTargetBps = _newTargetBps;
        
        // Trigger buffer update
        _updateBuffer();
        
        emit ConfigUpdated(keccak256("BUFFER_TARGET_BPS"), oldValue, _newTargetBps);
    }

    function setPerformanceFeeBps(uint256 _newFeeBps) external onlyOwner {
        if (_newFeeBps > MAX_BPS) revert dBank__CapExceeded(_newFeeBps, MAX_BPS);
        
        uint256 oldValue = performanceFeeBps;
        performanceFeeBps = _newFeeBps;
        
        emit ConfigUpdated(keccak256("PERFORMANCE_FEE_BPS"), oldValue, _newFeeBps);
    }

    function setFeeRecipient(address _newRecipient) external onlyOwner validAddress(_newRecipient) {
        address oldValue = feeRecipient;
        feeRecipient = _newRecipient;
        
        emit ConfigUpdated(keccak256("FEE_RECIPIENT"), uint256(uint160(oldValue)), uint256(uint160(_newRecipient)));
    }

    function setTvlCap(uint256 _newCap) external onlyOwner {
        uint256 oldValue = tvlCap;
        tvlCap = _newCap;
        
        emit ConfigUpdated(keccak256("TVL_CAP"), oldValue, _newCap);
    }

    function setPerTxCap(uint256 _newCap) external onlyOwner {
        uint256 oldValue = perTxCap;
        perTxCap = _newCap;
        
        emit ConfigUpdated(keccak256("PER_TX_CAP"), oldValue, _newCap);
    }

    function pause(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    //===========================================================
    // Custom Functions - Strategy Allocation
    //===========================================================

    /**
     * @notice Allocate assets from buffer to a strategy via the router
     * @param _strategyId The strategy ID to allocate to
     * @param _amount The amount of assets to allocate
     * @return The amount actually allocated
     */
    function allocate(uint256 _strategyId, uint256 _amount) external onlyOwner whenNotPaused returns (uint256) {
        if (_amount == 0) revert dBank__InvalidAmount();
        if (_amount > buffer) revert dBank__InsufficientLiquidity(_amount, buffer);

        // Approve router to spend tokens
        asset.approve(strategyRouter, _amount);

        // Deposit to strategy via router
        uint256 allocated = StrategyRouter(strategyRouter).depositToStrategy(_strategyId, _amount);

        // Update buffer
        uint256 oldBuffer = buffer;
        buffer -= allocated;

        emit Allocated(_strategyId, allocated, buffer);
        emit BufferUpdated(oldBuffer, buffer);

        return allocated;
    }

    /**
     * @notice Internal function to withdraw assets from strategies
     * @param _amount The amount of assets to withdraw
     * @param _maxSlippageBps Maximum slippage in basis points
     * @return totalWithdrawn The total amount withdrawn
     */
    function _withdrawFromStrategies(uint256 _amount, uint256 _maxSlippageBps) internal returns (uint256 totalWithdrawn) {
        StrategyRouter router = StrategyRouter(strategyRouter);
        uint256 remaining = _amount;
        uint256 totalStrategies = router.totalStrategies();

        // Iterate through strategies and withdraw until we have enough
        for (uint256 i = 1; i <= totalStrategies && remaining > 0; i++) {
            (address strategyAddr, bool active, , ) = router.getStrategy(i);

            if (strategyAddr == address(0) || !active) continue;

            // Get available assets in this strategy
            (bool success, bytes memory data) = strategyAddr.staticcall(
                abi.encodeWithSignature("totalAssets()")
            );
            if (!success) continue;

            uint256 strategyAssets = abi.decode(data, (uint256));
            if (strategyAssets == 0) continue;

            // Withdraw min(remaining, strategyAssets)
            uint256 toWithdraw = remaining > strategyAssets ? strategyAssets : remaining;

            try router.withdrawFromStrategy(i, toWithdraw, _maxSlippageBps) returns (uint256 withdrawn) {
                totalWithdrawn += withdrawn;
                remaining -= withdrawn;
                buffer += withdrawn;
                emit WithdrawnFromStrategy(i, withdrawn);
            } catch {
                // Strategy withdrawal failed, try next strategy
                continue;
            }
        }

        return totalWithdrawn;
    }

    //===========================================================
    // Custom Functions - Buffer Management
    //===========================================================

    function _updateBuffer() internal {
        uint256 _totalAssets = this.totalAssets();
        uint256 targetBuffer = (_totalAssets * bufferTargetBps) / MAX_BPS;
        uint256 oldBuffer = buffer;

        if (buffer < targetBuffer) {
            // Need to fill buffer - withdraw from strategies
            uint256 needed = targetBuffer - buffer;
            uint256 maxSlippageBps = ConfigManager(configManager).maxSlippageBps();
            _withdrawFromStrategies(needed, maxSlippageBps);
            // Note: buffer is updated inside _withdrawFromStrategies
        }
        // Note: We don't auto-deposit excess buffer to router
        // Use allocate() function to manually allocate excess buffer

        if (oldBuffer != buffer) {
            emit BufferUpdated(oldBuffer, buffer);
        }
    }

    function _fillBuffer(uint256 targetAmount) internal {
        uint256 needed = targetAmount > buffer ? targetAmount - buffer : 0;
        if (needed > 0) {
            // Withdraw from strategies via router
            uint256 maxSlippageBps = ConfigManager(configManager).maxSlippageBps();
            _withdrawFromStrategies(needed, maxSlippageBps);
        }
    }
}