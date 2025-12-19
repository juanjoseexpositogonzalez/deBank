//SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;

// errors    
error ConfigManager__NotOwner();
error ConfigManager__OutOfBounds(bytes32 key, uint256 value);
error ConfigManager__zeroAddress(bytes32 key);

/**
 * @title A decentralized Bank Contract
 * @author Juan José Expósito González
 * @notice This contract implements a Vault
 * @dev 
 */

contract ConfigManager {
    // ---------------------------------
    // Canonical Keys (bytes32)
    // ---------------------------------
    // Numeric parameters (BPS, caps, durations)
    bytes32 constant private LIQUIDITY_BUFFER_BPS = keccak256("LIQUIDITY_BUFFER_BPS");
    bytes32 constant private SLIPPAGE_BPS       = keccak256("SLIPPAGE_BPS");
    bytes32 constant private TVL_GLOBAL_CAP         = keccak256("TVL_GLOBAL_CAP");
    bytes32 constant private PER_TX_CAP             = keccak256("PER_TX_CAP");
    bytes32 constant private PERFORMANCE_FEE_BPS    = keccak256("PERFORMANCE_FEE_BPS");
    bytes32 constant private EPOCH_DURATION         = keccak256("EPOCH_DURATION");
    bytes32 constant private SETTLEMENT_WINDOW_UTC  = keccak256("SETTLEMENT_WINDOW_UTC");
    // Addresses
    bytes32 constant private FEE_RECIPIENT          = keccak256("FEE_RECIPIENT");
    bytes32 constant private PRIMARY_ORACLE         = keccak256("PRIMARY_ORACLE");
    // Strategy caps
    bytes32 constant private STRATEGY_CAP_S1        = keccak256("STRATEGY_CAP_S1");
    bytes32 constant private STRATEGY_CAP_S2        = keccak256("STRATEGY_CAP_S2");
    bytes32 constant private STRATEGY_CAP_S3        = keccak256("STRATEGY_CAP_S3");
    // Roles
    bytes32 constant private OWNER = keccak256("OWNER");
    bytes32 constant private ROLE_PAUSER            = keccak256("ROLE_PAUSER");
    bytes32 constant private ROLE_HARVESTER         = keccak256("ROLE_HARVESTER");
    bytes32 constant private ROLE_ALLOCATOR         = keccak256("ROLE_ALLOCATOR");

    // ---------------------------------
    // Boundary constants
    // ---------------------------------
    uint16 constant private MAX_LIQUIDITY_BUFFER_BPS = 10_000;
    uint16 constant MAX_SLIPPAGE_BPS = 500;
    uint256 constant MAX_TVL_GLOBAL_CAP = 200000e6;
    uint16 constant private MAX_PERFORMANCE_FEES = 50_000;
    uint32 constant private MAX_EPOCH_DURATION = 30 * 24 * 3600;
    uint32 constant private MAX_SETTLEMENT_WINDOW_UTC = 86400;
    
    // ---------------------------------
    // State variables (numeric)
    // ---------------------------------
    address public owner;
    uint16 public liquidityBufferBps = 1200;
    uint8 public maxSlippageBps = 30;
    uint256 public tvlGlobalCap = 100000e6;
    uint256 public perTxCap = 5000e6;
    uint32 public performanceFeeBps = 2500;
    uint8 public epochDuration = 7;
    uint32 public settlementWindowUTC = 12 * 3600;
    uint256 public strategyCapS1 = 100000e6;
    uint256 public strategyCapS2 = 50000e6;
    uint256 public strategyCapS3 = 25000e6;
    // ---------------------------------
    // State variables (addresses)
    // ---------------------------------
    address public feeRecipient;
    address public primaryOracle;
    address public pauser;
    address public harvester;
    address public allocator;
    // ---------------------------------
    // State variables (Arrays)
    // ---------------------------------
    address[] public allowedVenues;

    // ---------------------------------
    // Events
    // ---------------------------------
    event ConfigUpdated(bytes32 indexed key, uint256 oldValue, uint256 newValue);

    event AddressUpdated(bytes32 indexed key, address oldValue, address newValue);

    // modifiers
    modifier onlyOwner() {
        if (msg.sender != owner) revert ConfigManager__NotOwner();
        _;
    }

    // constructor
    constructor() {
        owner = msg.sender;
    }

    // receive

    // fallback

    // external
    function setOwner(address _newOwner) external onlyOwner returns(bool success) {
        // New owner must not be address 0
        require(_newOwner != address(0), "Address zero is not allowed as owner");

        address _oldOwner = owner;

        owner = _newOwner;

        emit AddressUpdated(
            OWNER,
            _oldOwner,
            _newOwner
        );

        return true;
    }

    function setLiquidityBufferBps(uint16 _newLiquidityBufferBps) external onlyOwner returns(bool success) {
        if(_newLiquidityBufferBps > MAX_LIQUIDITY_BUFFER_BPS) revert ConfigManager__OutOfBounds(LIQUIDITY_BUFFER_BPS, _newLiquidityBufferBps);

        uint256 _oldLiquidityBufferBps = liquidityBufferBps;

        liquidityBufferBps = _newLiquidityBufferBps;

        emit ConfigUpdated(
            LIQUIDITY_BUFFER_BPS,
            _oldLiquidityBufferBps,
            _newLiquidityBufferBps
        );

        return true;
    }

    function setMaxSlippageBps(uint8 _newMaxSlippageBps) external onlyOwner returns(bool success) {
        if(_newMaxSlippageBps > MAX_SLIPPAGE_BPS) revert ConfigManager__OutOfBounds(SLIPPAGE_BPS, _newMaxSlippageBps);

        uint256 _oldMaxSlippageBps = maxSlippageBps;

        maxSlippageBps = _newMaxSlippageBps;

        emit ConfigUpdated(
            SLIPPAGE_BPS,
            _oldMaxSlippageBps,
            _newMaxSlippageBps
        );

        return true;
    }

    function setTvlGlobalCap(uint256 _newTvlGlobalCap) external onlyOwner returns(bool success) {
        if(_newTvlGlobalCap > MAX_TVL_GLOBAL_CAP) revert ConfigManager__OutOfBounds(TVL_GLOBAL_CAP, _newTvlGlobalCap);

        uint256 _oldTvlGlobalCap = tvlGlobalCap;

        tvlGlobalCap = _newTvlGlobalCap;

        emit ConfigUpdated(
            TVL_GLOBAL_CAP,
            _oldTvlGlobalCap,
            _newTvlGlobalCap
        );

        return true;
    }

    function setPerTxCap(uint256 _newPerTxCap) external onlyOwner returns(bool success) {
        if(_newPerTxCap > tvlGlobalCap) revert ConfigManager__OutOfBounds(PER_TX_CAP, _newPerTxCap);

        uint256 _oldPerTxCap = perTxCap;

        perTxCap = _newPerTxCap;

        emit ConfigUpdated(
            PER_TX_CAP,
            _oldPerTxCap,
            _newPerTxCap
        );

        return true;
    }

    function setPerformanceFeeBps(uint32 _newPerformanceFeeBps) external onlyOwner returns(bool success) {
        if(_newPerformanceFeeBps > MAX_PERFORMANCE_FEES) revert ConfigManager__OutOfBounds(PERFORMANCE_FEE_BPS, _newPerformanceFeeBps);

        uint256 _oldPerformanceFeeBps = performanceFeeBps;

        performanceFeeBps = _newPerformanceFeeBps;

        emit ConfigUpdated(
            PERFORMANCE_FEE_BPS,
            _oldPerformanceFeeBps,
            _newPerformanceFeeBps
        );

        return true;
    }

    function setEpochDuration(uint8 _newEpochDuration) external onlyOwner returns(bool success) {
        if(_newEpochDuration > MAX_EPOCH_DURATION) revert ConfigManager__OutOfBounds(EPOCH_DURATION, _newEpochDuration);

        uint256 _oldEpochDuration = epochDuration;

        epochDuration = _newEpochDuration;

        emit ConfigUpdated(
            EPOCH_DURATION,
            _oldEpochDuration,
            _newEpochDuration
        );

        return true;
    }

    function setSettlementWindowUTC(uint32 _newSettlementWindowUTC) external onlyOwner returns(bool success) {
        if(_newSettlementWindowUTC > MAX_SETTLEMENT_WINDOW_UTC) revert ConfigManager__OutOfBounds(SETTLEMENT_WINDOW_UTC, _newSettlementWindowUTC);

        uint256 _oldSettlementWindowUTC = settlementWindowUTC;

        settlementWindowUTC = _newSettlementWindowUTC;

        emit ConfigUpdated(
            SETTLEMENT_WINDOW_UTC,
            _oldSettlementWindowUTC,
            _newSettlementWindowUTC
        );

        return true;
    }

    function setStrategyCapS1(uint256 _newStrategyCapS1) external onlyOwner returns(bool success) {
        if(_newStrategyCapS1 > tvlGlobalCap) revert ConfigManager__OutOfBounds(STRATEGY_CAP_S1, _newStrategyCapS1);

        uint256 _oldStrategyCapS1 = strategyCapS1;

        strategyCapS1 = _newStrategyCapS1;

        emit ConfigUpdated(
            STRATEGY_CAP_S1,
            _oldStrategyCapS1,
            _newStrategyCapS1
        );

        return true;
    }

    function setStrategyCapS2(uint256 _newStrategyCapS2) external onlyOwner returns(bool success) {
        if(_newStrategyCapS2 > tvlGlobalCap) revert ConfigManager__OutOfBounds(STRATEGY_CAP_S2, _newStrategyCapS2);

        uint256 _oldStrategyCapS2 = strategyCapS2;

        strategyCapS2 = _newStrategyCapS2;

        emit ConfigUpdated(
            STRATEGY_CAP_S2,
            _oldStrategyCapS2,
            _newStrategyCapS2
        );

        return true;
    }

    function setStrategyCapS3(uint256 _newStrategyCapS3) external onlyOwner returns(bool success) {
        if(_newStrategyCapS3 > tvlGlobalCap) revert ConfigManager__OutOfBounds(STRATEGY_CAP_S3, _newStrategyCapS3);

        uint256 _oldStrategyCapS3 = strategyCapS3;

        strategyCapS3 = _newStrategyCapS3;

        emit ConfigUpdated(
            STRATEGY_CAP_S3,
            _oldStrategyCapS3,
            _newStrategyCapS3
        );

        return true;
    }

    function setFeeRecipient(address _newFeeRecipient) external onlyOwner returns(bool success) {
        if(_newFeeRecipient == address(0)) revert ConfigManager__zeroAddress(FEE_RECIPIENT);

        address _oldFeeRecipient = feeRecipient;

        feeRecipient = _newFeeRecipient;

        emit AddressUpdated(
            FEE_RECIPIENT,
            _oldFeeRecipient,
            _newFeeRecipient
        );

        return true;
    }

    function setPrimaryOracle(address _newPrimaryOracle) external onlyOwner returns(bool success) {
        if(_newPrimaryOracle == address(0)) revert ConfigManager__zeroAddress(PRIMARY_ORACLE);

        address _oldPrimaryOracle = primaryOracle;

        primaryOracle = _newPrimaryOracle;

        emit AddressUpdated(
            PRIMARY_ORACLE,
            _oldPrimaryOracle,
            _newPrimaryOracle
        );

        return true;
    }

    function setPauser(address _newPauser) external onlyOwner returns(bool success) {
        if(_newPauser == address(0)) revert ConfigManager__zeroAddress(ROLE_PAUSER);

        address _oldPauser = pauser;

        pauser = _newPauser;

        emit AddressUpdated(
            ROLE_PAUSER,
            _oldPauser,
            _newPauser
        );

        return true;
    }

    function setHarvester(address _newHarvester) external onlyOwner returns(bool success) {
        if(_newHarvester == address(0)) revert ConfigManager__zeroAddress(ROLE_HARVESTER);

        address _oldHarvester = harvester;

        harvester = _newHarvester;

        emit AddressUpdated(
            ROLE_HARVESTER,
            _oldHarvester,
            _newHarvester
        );

        return true;
    }

    function setAllocator(address _newAllocator) external onlyOwner returns(bool success) {
        if(_newAllocator == address(0)) revert ConfigManager__zeroAddress(ROLE_ALLOCATOR);

        address _oldAllocator = allocator;

        allocator = _newAllocator;

        emit AddressUpdated(
            ROLE_ALLOCATOR,
            _oldAllocator,
            _newAllocator
        );

        return true;
    }

    function addAllowedVenue(address _venue) external onlyOwner returns(bool success) {
        if(_venue == address(0)) revert ConfigManager__zeroAddress(keccak256("ALLOWED_VENUE"));

        allowedVenues.push(_venue);

        emit AddressUpdated(
            keccak256("ALLOWED_VENUE"),
            address(0),
            _venue
        );

        return true;
    }

}
