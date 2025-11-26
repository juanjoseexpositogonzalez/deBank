//SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;

import { Token } from './Token.sol';

// errors
error MockS1__Paused();
error MockS1__CapExceeded();

contract MockS1 {
    // State variables
    Token public token;    
    uint256 public principal;           // USDC assigned to this strategy
    uint256 public accumulator = 1e18;  // Growing factor
    int256 public aprBps;              // APR in basis points (500 -> 5%)
    uint256 public lastAcrualsTs;      // Timestamp for the last update for accmulator
    uint256 public cap;                // TVL max that S1 can manage
    bool public paused = false;        // Safety flag (true -> no deposits/withdrawals)
    address public owner;               // Owner of contract
    uint256 public totalAssets;


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

    function setTotalAssets() onlyOwner external {
        _accrue();
        totalAssets = principal * accumulator;
    }

    function depositToStrategy(uint256 _amount) external {
        if(paused) revert MockS1__Paused();
        _accrue();
        if(principal + _amount > cap) revert MockS1__CapExceeded();
        
        principal += _amount;

        emit S1Deposited(
            _amount,
            principal,
            totalAssets,
            block.timestamp
        );

    }
    
    // internal
    function _accrue() internal returns (bool success){
        if (lastAcrualsTs == 0) {
            lastAcrualsTs = block.timestamp;
            accumulator = 1e18;
            return true;
        }

        uint256 dt = block.timestamp - lastAcrualsTs;

        if (dt == 0) return true;
        if (aprBps == 0) {
            lastAcrualsTs = block.timestamp;
            return true;
        }

        uint256 aprBps_pos = uint256(aprBps > 0 ? aprBps : -aprBps);

        uint256 factor = aprBps > 0 ? 1 + aprBps_pos/10_000 * dt / 365: 1 - aprBps_pos/10_000 * dt / 365;

        accumulator *= factor;
        lastAcrualsTs = block.timestamp;

        return true;

    }

}
