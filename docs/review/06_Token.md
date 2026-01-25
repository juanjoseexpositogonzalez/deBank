# Token.sol - Technical Documentation

## Overview

`Token` is a **basic ERC-20 implementation** used as the underlying asset (USDC representation) for the dBank protocol. In production, this would be replaced with actual USDC or other stablecoin.

**File**: `contracts/Token.sol`
**Solidity**: `^0.8.19`
**Standard**: ERC-20

---

## Purpose in Protocol

```
┌─────────────────────────────────────────────────────────────────┐
│                         Token (USDC)                            │
│  - Represents user deposits                                     │
│  - Underlying asset for dBank vault                             │
│  - Used by StrategyRouter for strategy deposits                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## State Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `name` | `string` | constructor | Token name |
| `symbol` | `string` | constructor | Token symbol |
| `decimals` | `uint256` | 18 | Decimal places |
| `totalSupply` | `uint256` | constructor | Total supply |
| `balanceOf` | `mapping(address => uint256)` | - | User balances |
| `allowance` | `mapping(address => mapping(address => uint256))` | - | Approvals |

---

## Events

```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
event Approval(address indexed owner, address indexed spender, uint256 value);
```

---

## Functions

### Constructor

```solidity
constructor(string memory _name, string memory _symbol, uint256 _totalSupply)
```

**Parameters:**
- `_name`: Token name (e.g., "USDC Token")
- `_symbol`: Token symbol (e.g., "USDC")
- `_totalSupply`: Initial supply (in whole tokens, scaled by decimals)

**Example:**
```javascript
// Deploy with 10 million tokens
const token = await Token.deploy("USDC Token", "USDC", "10000000");
// totalSupply = 10,000,000 * 10^18 = 10e24 wei
```

---

### View Functions

#### `balanceOf(address)`
Returns token balance for an address.

#### `allowance(address owner, address spender)`
Returns approved amount that spender can transfer from owner.

---

### Transfer Functions

#### `transfer(address _to, uint256 _value)`
```solidity
function transfer(address _to, uint256 _value) public returns (bool success)
```

**Requirements:**
- Caller must have sufficient balance
- Recipient cannot be zero address

**Flow:**
1. Verify `balanceOf[msg.sender] >= _value`
2. Call internal `_transfer()`
3. Return true

#### `transferFrom(address _from, address _to, uint256 _value)`
```solidity
function transferFrom(address _from, address _to, uint256 _value) public returns (bool success)
```

**Requirements:**
- `_from` must have sufficient balance
- Caller must have sufficient allowance from `_from`

**Flow:**
1. Verify `balanceOf[_from] >= _value`
2. Verify `allowance[_from][msg.sender] >= _value`
3. Reduce allowance
4. Call internal `_transfer()`
5. Return true

#### `_transfer(address _from, address _to, uint256 _value)` (internal)
```solidity
function _transfer(address _from, address _to, uint256 _value) internal
```

**Flow:**
1. Verify `_to != address(0)`
2. Subtract from sender: `balanceOf[_from] -= _value`
3. Add to recipient: `balanceOf[_to] += _value`
4. Emit `Transfer` event

---

### Approval Functions

#### `approve(address _spender, uint256 _value)`
```solidity
function approve(address _spender, uint256 _value) public returns (bool success)
```

**Requirements:**
- Spender cannot be zero address

**Flow:**
1. Verify `_spender != address(0)`
2. Set allowance: `allowance[msg.sender][_spender] = _value`
3. Emit `Approval` event
4. Return true

---

## Usage in dBank Protocol

### User Deposit Flow

```solidity
// 1. User approves dBank to spend their USDC
token.approve(dbank.address, amount);

// 2. dBank transfers USDC from user
// Inside dBank.deposit():
asset.transferFrom(msg.sender, address(this), _assets);
```

### Strategy Allocation Flow

```solidity
// 1. dBank approves router
asset.approve(strategyRouter, _amount);

// 2. Router transfers from dBank
// Inside StrategyRouter.depositToStrategy():
asset.transferFrom(msg.sender, address(this), _amount);
```

---

## Test Setup

```javascript
// Deploy token
const Token = await ethers.getContractFactory('Token');
token = await Token.deploy('USDC Token', 'USDC', '10000000'); // 10M tokens

// Distribute to test users
await token.transfer(user1.address, tokens(100000));
await token.transfer(user2.address, tokens(100000));

// Approve contracts
await token.connect(user1).approve(dbank.address, tokens(50000));
```

---

## Differences from Production USDC

| Feature | This Token | Real USDC |
|---------|------------|-----------|
| Decimals | 18 | 6 |
| Minting | Fixed supply | Controlled by Centre |
| Blacklisting | None | Has blacklist |
| Pausable | No | Yes |
| Upgradeable | No | Proxy pattern |

---

## Security Notes

### Overflow Protection
- Solidity 0.8.x provides built-in overflow checks
- Safe subtraction in transfers

### Zero Address Checks
- `_transfer()` checks recipient is not zero
- `approve()` checks spender is not zero

### Missing Features (vs OpenZeppelin)
- No `increaseAllowance` / `decreaseAllowance`
- No permit (EIP-2612)
- No hooks for extensions

---

## Production Recommendations

For mainnet deployment, replace with:
1. **Actual USDC**: `0xA0b86a33E6441d8b8B4b3a88e1e8C7a4F9c9c6F7` (Ethereum)
2. **USDC decimals**: Update dBank to handle 6 decimals
3. **Approval patterns**: Consider using permit for gas-less approvals
