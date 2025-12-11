//SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;

import { Token } from './Token.sol';

// errors
error MockS1__Paused();
error MockS1__CapExceeded();
error MockS1__InsufficientBalance();

contract MockS1 {
    // Constants
    uint256 constant private SCALE = 1e18;
    uint256 constant private YEAR = 365 * 24 * 3600;
    // State variables
    Token public token;    
    uint256 public principal;           // USDC assigned to this strategy
    uint256 public accumulator = 1e18;  // Growing factor
    int256 public aprBps;              // APR in basis points (500 -> 5%)
    uint256 public lastAccrualTs;      // Timestamp for the last update for accumulator
    uint256 public cap;                // TVL max that S1 can manage
    bool public paused = false;        // Safety flag (true -> no deposits/withdrawals)
    address public owner;               // Owner of contract


    // Events
    event S1Deposited(
        uint256 amount,
        uint256 principalAfter,
        uint256 totalAssetsAfter,
        uint256 timestamp
    );

    event S1Withdrawn(
        uint256 amount,
        uint256 principalAfter,
        uint256 totalAssetsAfter,
        uint256 timestamp
    );

    event S1Reported(
        uint256 gain,
        uint256 newPrincipal,
        uint256 timestamp
    );

    event S1ParamsUpdated(
        int256 aprBps,
        uint256 cap
    );

    event S1Paused(bool paused);

    // modifiers
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    // constructor
    constructor(Token _token) {
        token = _token;
        owner = msg.sender;
    }

    // views
    function params() view external returns(int256, uint256, bool, uint256) {
        return (aprBps, cap, paused, principal);
    }

    // external
    function setParams(int256 _newAprBps, uint256 _newCap) onlyOwner external {
        aprBps = _newAprBps;
        cap = _newCap;

        emit S1ParamsUpdated(_newAprBps, _newCap);
    }
    
    function pause(bool _paused) onlyOwner external {
        paused = _paused;

        emit S1Paused(_paused);
    }

    function totalAssets() public view returns (uint256) {
       uint256 accumulatorValue = _accrueView();
       return (principal * accumulatorValue / SCALE);
    }

    function depositToStrategy(uint256 _amount) external {
        if(paused) revert MockS1__Paused();
        _accrue();
        if(principal + _amount > cap) revert MockS1__CapExceeded();
        
        principal += _amount;

        uint256 totalAssetsAfter = principal * accumulator / SCALE;


        emit S1Deposited(
            _amount,
            principal,
            totalAssetsAfter,
            block.timestamp
        );

    }
    
    // internal
    function _accrue() internal {
        // 1. First use (initialize variables)
        if (lastAccrualTs == 0) {
            lastAccrualTs = block.timestamp;
            accumulator = SCALE;
            return;
        }

        // 2. Calculate seconds from last time
        uint256 dt = block.timestamp - lastAccrualTs;

        // 3. If no time has elapsed, return
        if (dt == 0) return;

        // 4. If no money invested, or no APR, just set the clock
        if (aprBps == 0 || principal == 0) {
            lastAccrualTs = block.timestamp;
            return;
        }

        // 5. Get the absolute value of aprBps (to handle sign)
        uint256 absApr = 0;
        int256 sign = 0;
        if (aprBps > 0) {
            absApr = uint256(aprBps);
            sign = 1;            
        } else {
            absApr = uint256(-aprBps);
            sign = -1;
        }
        
        // 6. Calculate the lineal factor per second in 1e18 scale
        uint256 ratePerSecondScaled = absApr * SCALE /(10_000 * YEAR);

        // 7. Calculate how much the factor changes per dt seconds:
        uint256 deltaScaled = ratePerSecondScaled * dt;

        // 8. Build factor with 1e18 scale
        uint256 factor;
        if (sign == 1){
            factor = SCALE + deltaScaled;
        } else {
            if (SCALE < deltaScaled) {
                factor = 0;
            } else {
                factor = SCALE - deltaScaled;
            }
            
        }
        // 9. Update accumulator
        accumulator = accumulator * uint256(factor) / SCALE;

        lastAccrualTs = block.timestamp;
    }

    function _accrueView() internal view returns (uint256) {
        // 1. If no money invested, or no APR, just set the clock
        if (lastAccrualTs == 0) return SCALE;

        if (aprBps == 0 || principal == 0) return accumulator;

        // 2. Calculate seconds from last time
        uint256 dt = block.timestamp - lastAccrualTs;

        // 3. If no time has elapsed, return
        if (dt == 0) return accumulator;


        // 5. Get the absolute value of aprBps (to handle sign)
        uint256 absApr = 0;
        int256 sign = 0;
        if (aprBps > 0) {
            absApr = uint256(aprBps);
            sign = 1;            
        } else {
            absApr = uint256(-aprBps);
            sign = -1;
        }
        
        // 6. Calculate the lineal factor per second in 1e18 scale
        uint256 ratePerSecondScaled = absApr * SCALE /(10_000 * YEAR);

        // 7. Calculate how much the factor changes per dt seconds:
        uint256 deltaScaled = ratePerSecondScaled * dt;

        // 8. Build factor with 1e18 scale
        uint256 factor;
        if (sign == 1){
            factor = SCALE + deltaScaled;
        } else {
            if (SCALE < deltaScaled) {
                factor = 0;
            } else {
                factor = SCALE - deltaScaled;
            }
            
        }
        return accumulator * factor / SCALE;
    }

    function withdrawFromStrategy(uint256 _amount) external {
        // 1. Verify paused
        if(paused) revert MockS1__Paused();
        // 2. Accrue interest
        _accrue();
        // 3. Verify sufficient balance
        uint256 currentTotalAssets = principal * accumulator / SCALE;
        if(_amount > currentTotalAssets) revert MockS1__InsufficientBalance();
        
        // 4. Calculate the new principal
        uint256 principalToReduce = (_amount * SCALE) / accumulator;

        // 5. Update principal
        principal -= principalToReduce;

        uint256 totalAssetsAfter = principal * accumulator / SCALE;

        emit S1Withdrawn(
            _amount , 
            principal,
            totalAssetsAfter,
            block.timestamp
        );
    }

    function report() onlyOwner external {
        // 0. Previous verifications
        if(paused) revert MockS1__Paused();
        if(principal == 0) revert MockS1__InsufficientBalance();
        if(aprBps == 0) revert MockS1__InsufficientBalance();
        // No yield yet
        if(accumulator == SCALE) revert MockS1__InsufficientBalance();
        // 1. Call _accrue() to update the accumulator
        _accrue();
        // 2. Calculate totalAssets
        uint256 currentTotalAssets = principal * accumulator / SCALE;
        // 3. Calculate gain
        uint256 gain = currentTotalAssets - principal;
        // 4. Update principal
        principal = currentTotalAssets;
        // 5. Reset accumulator
        accumulator = SCALE;
        // 6. Update lastAccrualTs
        lastAccrualTs = block.timestamp;
        // 7. Emit event
        emit S1Reported(gain, principal, block.timestamp);
    }

}
