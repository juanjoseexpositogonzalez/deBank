# Annex: Low-Level Calls in Solidity

## Table of Contents

1. [Introduction](#introduction)
2. [Why Not Call Functions Directly?](#why-not-call-functions-directly)
3. [What Are Low-Level Calls?](#what-are-low-level-calls)
4. [Types of Low-Level Calls](#types-of-low-level-calls)
5. [ABI Encoding](#abi-encoding)
6. [Decoding Return Values](#decoding-return-values)
7. [Why StrategyRouter Uses Low-Level Calls: Deep Dive](#why-strategyrouter-uses-low-level-calls-deep-dive)
8. [Practical Examples](#practical-examples)
9. [Best Practices](#best-practices)
10. [Common Pitfalls](#common-pitfalls)

---

## Introduction

In Solidity, there are two main ways to interact with other contracts:

1. **High-Level Calls**: Using interfaces and direct function calls
2. **Low-Level Calls**: Using `call`, `delegatecall`, `staticcall` with encoded data

The StrategyRouter uses **low-level calls** because strategies don't share a common interface. This annex explains how they work and **why we can't use direct function calls**.

---

## Why Not Call Functions Directly?

### The Problem: No Common Interface

In a perfect world, you would call functions directly like this:

```solidity
// ❌ This doesn't work in StrategyRouter!
interface IStrategy {
    function totalAssets() external view returns (uint256);
    function depositToStrategy(uint256 amount) external;
    function withdrawFromStrategy(uint256 amount) external;
    function paused() external view returns (bool);
}

function totalAssets() external view returns (uint256) {
    IStrategy strategy = IStrategy(strategies[1]);
    return strategy.totalAssets(); // Direct call - clean and simple!
}
```

**But this approach has a critical limitation**: All strategies must implement the **exact same interface**.

### Real-World Scenario

In dBank, we have different strategy types:

- **MockS1**: Virtual yield accumulator (for testing)
- **MockS2**: Future yield farming strategy
- **MockS3**: Future arbitrage strategy
- **Real Strategy A**: Might use Aave's interface
- **Real Strategy B**: Might use Compound's interface
- **Real Strategy C**: Custom implementation

Each strategy might have:
- Different function signatures
- Different parameter names
- Different return types
- Additional functions we don't need

### Example: Why Direct Calls Fail

Imagine we want to support both Aave and Compound strategies:

```solidity
// Aave strategy interface
interface IAaveStrategy {
    function getTotalAssets() external view returns (uint256); // Different name!
    function deposit(uint256 amount) external; // Different name!
}

// Compound strategy interface  
interface ICompoundStrategy {
    function totalAssets() external view returns (uint256);
    function depositToStrategy(uint256 amount) external;
}

// ❌ Problem: How do we write one function that works with both?
function aggregateAssets() external view returns (uint256) {
    // Can't use both interfaces at once!
    // Would need separate functions for each strategy type
}
```

### Solution: Low-Level Calls

Low-level calls solve this by:
1. **Calling functions by signature** (string representation)
2. **Not requiring interfaces** at compile time
3. **Handling return values dynamically**
4. **Working with any contract** that has matching function signatures

```solidity
// ✅ Works with ANY contract that has totalAssets() function
function aggregateAssets() external view returns (uint256) {
    address strategy = strategies[1];
    
    // Call by signature - doesn't need interface!
    (bool success, bytes memory data) = strategy.staticcall(
        abi.encodeWithSignature("totalAssets()")
    );
    
    if (success) {
        return abi.decode(data, (uint256));
    }
    return 0;
}
```

### When to Use Each Approach

#### Use High-Level Calls (Direct Function Calls) When:

✅ **All contracts share the same interface**
```solidity
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

IERC20 token = IERC20(tokenAddress);
token.transfer(recipient, amount); // Direct call - clean!
```

✅ **You know the contract type at compile time**
```solidity
MockS1 strategy = MockS1(strategyAddress);
strategy.depositToStrategy(amount); // Direct call - type-safe!
```

✅ **Type safety is important**
- Compiler catches errors
- Better IDE support
- Clearer code

#### Use Low-Level Calls When:

✅ **Contracts have different interfaces** (like StrategyRouter)
```solidity
// Strategies might have different interfaces
address strategy = strategies[id];
strategy.call(abi.encodeWithSignature("deposit(uint256)", amount));
```

✅ **You don't know the contract type at compile time**
```solidity
// Strategy address stored in mapping - type unknown
address strategy = strategies[_strategyId];
strategy.staticcall(abi.encodeWithSignature("totalAssets()"));
```

✅ **You need maximum flexibility**
- Support multiple contract types
- Dynamic strategy registration
- Future-proof for new strategies

✅ **You're building a router/registry pattern**
- StrategyRouter (our case)
- Plugin systems
- Upgradeable contracts

### Concrete Example: StrategyRouter's Challenge

In StrategyRouter, we face this exact problem:

```solidity
contract StrategyRouter {
    mapping(uint256 => address) public strategies; // Just addresses!
    
    // Problem: We don't know what type each strategy is
    // - Could be MockS1
    // - Could be MockS2  
    // - Could be a future Aave strategy
    // - Could be a future Compound strategy
    
    function totalAssets() external view returns (uint256) {
        uint256 total = 0;
        
        for (uint256 i = 1; i <= MAX_STRATEGIES; i++) {
            address strategy = strategies[i]; // Just an address!
            
            // ❌ Can't do this - we don't know the type!
            // MockS1(strategy).totalAssets(); // What if it's not MockS1?
            // IAaveStrategy(strategy).totalAssets(); // What if it's not Aave?
            
            // ✅ Solution: Low-level call by signature
            (bool success, bytes memory data) = strategy.staticcall(
                abi.encodeWithSignature("totalAssets()")
            );
            
            if (success) {
                total += abi.decode(data, (uint256));
            }
        }
        
        return total;
    }
}
```

### Trade-offs

| Aspect | High-Level Calls | Low-Level Calls |
|--------|------------------|-----------------|
| **Type Safety** | ✅ Compile-time checks | ❌ Runtime checks only |
| **Flexibility** | ❌ Fixed interface | ✅ Works with any signature |
| **Gas Cost** | ✅ Slightly cheaper | ⚠️ Slightly more expensive |
| **Code Clarity** | ✅ Very clear | ⚠️ More verbose |
| **Error Handling** | ✅ Automatic | ⚠️ Manual (check `success`) |
| **IDE Support** | ✅ Full autocomplete | ❌ Limited support |
| **Use Case** | Same interface contracts | Different interface contracts |

### Real-World Analogy

Think of it like:

**High-Level Call (Direct Function Call)**:
- Like calling a **specific restaurant** you know
- "Hi, I'd like to order a pizza" (you know their menu)
- Fast, clear, but only works with that restaurant

**Low-Level Call**:
- Like calling a **restaurant directory service**
- "Call this number and ask for 'pizza menu'" (you don't know which restaurant)
- More flexible, works with any restaurant, but requires more steps

---

## What Are Low-Level Calls?

Low-level calls are **assembly-like** operations that allow you to:
- Call functions on contracts without knowing their interface at compile time
- Call functions by their signature (string representation)
- Handle return values manually
- Have more control over gas and error handling

### Analogy

Think of it like:
- **High-level call**: "Call John's phone number" (you know John's number)
- **Low-level call**: "Call this number and say 'Hello, is this John?'" (you don't know if it's John, but you can try)

---

## Types of Low-Level Calls

### 1. `call` - State-Modifying Calls

```solidity
(bool success, bytes memory data) = targetAddress.call(
    abi.encodeWithSignature("functionName(uint256)", value)
);
```

**Characteristics**:
- Can modify state in the target contract
- Returns `(bool success, bytes memory data)`
- `success`: `true` if call succeeded, `false` if it reverted
- `data`: Return value encoded as bytes (empty if function returns nothing)

**Use Case**: Calling state-changing functions like `depositToStrategy()`, `withdrawFromStrategy()`.

**Example from StrategyRouter**:
```solidity
// Line 315-317: Call withdrawFromStrategy (modifies strategy state)
(bool success, ) = strategyAddr.call(
    abi.encodeWithSignature("withdrawFromStrategy(uint256)", _amount)
);
require(success, "Strategy withdrawal failed");
```

---

### 2. `staticcall` - Read-Only Calls

```solidity
(bool success, bytes memory data) = targetAddress.staticcall(
    abi.encodeWithSignature("functionName()")
);
```

**Characteristics**:
- **Cannot modify state** (enforced by EVM)
- Same return format as `call`
- Gas-efficient for read operations
- Reverts if target tries to modify state

**Use Case**: Calling view functions like `totalAssets()`, `paused()`.

**Example from StrategyRouter**:
```solidity
// Lines 308-310: Call totalAssets() (read-only)
(bool success, bytes memory data) = strategyAddr.staticcall(
    abi.encodeWithSignature("totalAssets()")
);
require(success, "Strategy totalAssets call failed");
uint256 assets = abi.decode(data, (uint256));
```

---

### 3. `delegatecall` - Context-Preserving Calls

```solidity
(bool success, bytes memory data) = targetAddress.delegatecall(
    abi.encodeWithSignature("functionName()")
);
```

**Characteristics**:
- Executes code in target contract **but in current contract's context**
- Uses current contract's storage
- Used for proxy patterns and libraries
- **Not used in StrategyRouter** (advanced topic)

---

## ABI Encoding

### What is ABI?

**ABI** (Application Binary Interface) is a way to encode function calls and data for the EVM.

Think of it like:
- **Human-readable**: `depositToStrategy(1000000)`
- **ABI-encoded**: `0x1234abcd...` (hex bytes)

### `abi.encodeWithSignature`

Encodes a function call into bytes.

**Syntax**:
```solidity
abi.encodeWithSignature("functionName(type1,type2)", value1, value2)
```

**Function Signature Format**:
- `"functionName()"` - No parameters
- `"functionName(uint256)"` - One uint256 parameter
- `"functionName(uint256,address)"` - Two parameters

**Examples**:

```solidity
// Call totalAssets() with no parameters
abi.encodeWithSignature("totalAssets()")
// Result: Bytes representing the function call

// Call depositToStrategy(uint256) with amount = 1000000
abi.encodeWithSignature("depositToStrategy(uint256)", 1000000)
// Result: Bytes representing function call with parameter

// Call setParams(int256,uint256) with two parameters
abi.encodeWithSignature("setParams(int256,uint256)", 500, 1000000)
```

**Important**: The signature must **exactly match** the function signature in the target contract, including:
- Function name
- Parameter types (order matters!)
- No parameter names (only types)

---

## Decoding Return Values

When a low-level call succeeds, it returns data as `bytes`. You need to **decode** it to get the actual value.

### `abi.decode`

Decodes bytes back into Solidity types.

**Syntax**:
```solidity
(type1, type2, ...) = abi.decode(bytes, (type1, type2, ...))
```

**Examples**:

```solidity
// Decode a single uint256
uint256 assets = abi.decode(data, (uint256));

// Decode multiple values
(uint256 amount, bool active) = abi.decode(data, (uint256, bool));

// Decode an address
address strategy = abi.decode(data, (address));
```

**Important**: The types in `abi.decode` must **match** the return types of the function you called.

---

## Why StrategyRouter Uses Low-Level Calls: Deep Dive

### The Registration Problem

When a strategy is registered, we only store its **address**:

```solidity
function registerStrategy(uint256 _strategyId, address _strategy, uint256 _cap) external {
    strategies[_strategyId] = _strategy; // Just an address!
    // No type information stored!
}
```

**Problem**: Solidity is a **statically typed** language. At compile time, we need to know the type to call functions directly.

### What Happens If We Try Direct Calls?

```solidity
// ❌ This won't compile!
function totalAssets() external view returns (uint256) {
    address strategy = strategies[1];
    
    // Error: "Member "totalAssets" not found or not visible"
    return strategy.totalAssets(); // address type doesn't have this function!
}
```

**Why it fails**: `address` is a primitive type. It doesn't have contract functions. You need to cast it to a contract type first.

### Attempting Type Casting

```solidity
// ❌ This also won't work!
function totalAssets() external view returns (uint256) {
    address strategyAddr = strategies[1];
    
    // Error: "Explicit type conversion not allowed"
    MockS1 strategy = MockS1(strategyAddr); // What if it's not MockS1?
    
    return strategy.totalAssets();
}
```

**Why it fails**: 
1. We're **assuming** it's a MockS1, but it might be MockS2, MockS3, or a future strategy
2. If the address doesn't match MockS1's interface, the call will fail at runtime
3. We'd need separate code paths for each strategy type

### The Compiler's Perspective

The Solidity compiler needs to know:
1. **What functions exist** on the contract
2. **What parameters** they take
3. **What they return**
4. **How to encode/decode** the call

With just an `address`, the compiler has **none of this information**.

### Low-Level Calls: The Solution

Low-level calls work around this by:
1. **Encoding the function call manually** (we provide the signature)
2. **Sending raw bytes** to the address
3. **Decoding the response manually** (we know what to expect)
4. **Handling errors manually** (check `success` flag)

```solidity
// ✅ This works!
function totalAssets() external view returns (uint256) {
    address strategyAddr = strategies[1];
    
    // We manually encode: "I want to call totalAssets()"
    bytes memory callData = abi.encodeWithSignature("totalAssets()");
    
    // We send raw bytes - compiler doesn't need to know the type
    (bool success, bytes memory returnData) = strategyAddr.staticcall(callData);
    
    // We manually decode: "I expect a uint256 back"
    if (success) {
        return abi.decode(returnData, (uint256));
    }
    
    return 0;
}
```

### Comparison: Direct vs Low-Level

#### Direct Call (What We'd Like to Do)

```solidity
// Clean, simple, type-safe
MockS1 strategy = MockS1(strategies[1]);
uint256 assets = strategy.totalAssets();
```

**Requirements**:
- Must know it's MockS1 at compile time
- Must import MockS1 contract
- Can't work with other strategy types

#### Low-Level Call (What We Actually Do)

```solidity
// More verbose, but flexible
address strategyAddr = strategies[1];
(bool success, bytes memory data) = strategyAddr.staticcall(
    abi.encodeWithSignature("totalAssets()")
);
require(success, "Call failed");
uint256 assets = abi.decode(data, (uint256));
```

**Requirements**:
- Only need the address
- Works with any contract that has `totalAssets()`
- No imports needed
- Runtime flexibility

### When Would Direct Calls Work?

Direct calls would work if we had a **common interface**:

```solidity
// Define common interface
interface IStrategy {
    function totalAssets() external view returns (uint256);
    function depositToStrategy(uint256 amount) external;
    function withdrawFromStrategy(uint256 amount) external;
    function paused() external view returns (bool);
}

// All strategies implement IStrategy
contract MockS1 is IStrategy { ... }
contract MockS2 is IStrategy { ... }
contract MockS3 is IStrategy { ... }

// Now we can use direct calls!
function totalAssets() external view returns (uint256) {
    IStrategy strategy = IStrategy(strategies[1]); // Cast to interface
    return strategy.totalAssets(); // Direct call works!
}
```

**Why we don't do this**:
1. **Future strategies** might not fit the interface
2. **Real DeFi protocols** (Aave, Compound) have their own interfaces
3. **Less flexible** - forces all strategies into same mold
4. **Harder to integrate** existing protocols

### The Flexibility Trade-off

Low-level calls give us **maximum flexibility**:

```solidity
// Can call ANY function on ANY contract
function callAnyFunction(address contractAddr, string memory functionSig) external {
    contractAddr.call(abi.encodeWithSignature(functionSig));
}

// Can support strategies with different interfaces
// - Strategy A: totalAssets()
// - Strategy B: getTotalValue()  
// - Strategy C: balance()
// All work as long as we know the signature!
```

**Trade-off**: We lose compile-time safety but gain runtime flexibility.

---

## Practical Examples

### Example 1: Calling `totalAssets()`

```solidity
// Step 1: Encode the function call
bytes memory callData = abi.encodeWithSignature("totalAssets()");

// Step 2: Make the staticcall (read-only)
(bool success, bytes memory returnData) = strategyAddress.staticcall(callData);

// Step 3: Check if call succeeded
require(success, "Call failed");

// Step 4: Decode the return value
uint256 totalAssets = abi.decode(returnData, (uint256));
```

**Combined (as in StrategyRouter)**:
```solidity
(bool success, bytes memory data) = strategyAddr.staticcall(
    abi.encodeWithSignature("totalAssets()")
);
require(success, "Strategy totalAssets call failed");
uint256 assets = abi.decode(data, (uint256));
```

---

### Example 2: Calling `depositToStrategy(uint256)`

```solidity
// Step 1: Encode function call with parameter
bytes memory callData = abi.encodeWithSignature(
    "depositToStrategy(uint256)", 
    _amount
);

// Step 2: Make the call (state-modifying)
(bool success, bytes memory returnData) = strategyAddress.call(callData);

// Step 3: Check if call succeeded
require(success, "Deposit failed");

// Note: depositToStrategy() doesn't return a value, so we ignore returnData
```

**Combined (as in StrategyRouter)**:
```solidity
(bool success, ) = strategies[_strategyId].call(
    abi.encodeWithSignature("depositToStrategy(uint256)", _amount)
);
require(success, "Strategy deposit failed");
```

---

### Example 3: Calling `paused()`

```solidity
// Call paused() function (returns bool)
(bool success, bytes memory data) = strategy.staticcall(
    abi.encodeWithSignature("paused()")
);

if (success) {
    bool isPaused = abi.decode(data, (bool));
    // Use isPaused...
}
```

---

## Best Practices

### 1. Always Check `success`

```solidity
(bool success, bytes memory data) = target.call(...);
require(success, "Call failed"); // Always check!
```

**Why?**: If the call reverts, `success` will be `false`. You need to handle this.

### 2. Use `staticcall` for View Functions

```solidity
// ✅ Good: Use staticcall for read-only
(bool success, bytes memory data) = target.staticcall(...);

// ❌ Bad: Using call for read-only (wastes gas, allows state changes)
(bool success, bytes memory data) = target.call(...);
```

**Why?**: `staticcall` is more gas-efficient and prevents accidental state changes.

### 3. Handle Decoding Errors

```solidity
if (success) {
    // Only decode if call succeeded
    uint256 value = abi.decode(data, (uint256));
} else {
    // Handle failure case
    revert("Call failed");
}
```

### 4. Match Function Signatures Exactly

```solidity
// ✅ Correct: Matches function signature exactly
abi.encodeWithSignature("totalAssets()")

// ❌ Wrong: Extra spaces, wrong name, wrong types
abi.encodeWithSignature("totalAssets ()")  // Space
abi.encodeWithSignature("getTotalAssets()") // Wrong name
abi.encodeWithSignature("totalAssets(uint256)") // Wrong signature
```

### 5. Use Named Return Values for Clarity

```solidity
// ✅ Good: Clear what each value means
(bool callSuccess, bytes memory returnData) = target.call(...);

// ❌ Less clear
(bool success, bytes memory data) = target.call(...);
```

---

## Common Pitfalls

### Pitfall 1: Forgetting to Check `success`

```solidity
// ❌ Bad: Doesn't check if call succeeded
(bool success, bytes memory data) = target.call(...);
uint256 value = abi.decode(data, (uint256)); // Might decode garbage!

// ✅ Good: Checks success first
(bool success, bytes memory data) = target.call(...);
require(success, "Call failed");
uint256 value = abi.decode(data, (uint256));
```

### Pitfall 2: Wrong Function Signature

```solidity
// ❌ Wrong: Function signature doesn't match
abi.encodeWithSignature("totalAssets(uint256)", 0) // totalAssets() takes no params!

// ✅ Correct: Matches actual function signature
abi.decodeWithSignature("totalAssets()")
```

### Pitfall 3: Wrong Decode Types

```solidity
// ❌ Wrong: Decoding as wrong type
bool value = abi.decode(data, (bool)); // But function returns uint256!

// ✅ Correct: Match return type
uint256 value = abi.decode(data, (uint256));
```

### Pitfall 4: Using `call` Instead of `staticcall`

```solidity
// ❌ Bad: Using call for view function
(bool success, bytes memory data) = target.call(
    abi.encodeWithSignature("totalAssets()")
);

// ✅ Good: Using staticcall for view function
(bool success, bytes memory data) = target.staticcall(
    abi.encodeWithSignature("totalAssets()")
);
```

### Pitfall 5: Not Handling Empty Return Values

```solidity
// ❌ Bad: Trying to decode when function returns nothing
(bool success, bytes memory data) = target.call(...);
uint256 value = abi.decode(data, (uint256)); // Function returns void!

// ✅ Good: Ignore return data if function returns nothing
(bool success, ) = target.call(...);
require(success, "Call failed");
```

---

## Gas Costs

Low-level calls have different gas costs:

- **`call`**: ~21,000 gas base + function execution gas
- **`staticcall`**: ~21,000 gas base + function execution gas (slightly cheaper)
- **`delegatecall`**: ~21,000 gas base + function execution gas

**Optimization**: Use `staticcall` when possible (read-only operations).

---

## Security Considerations

### 1. Reentrancy

Low-level calls can trigger reentrancy attacks if not handled properly.

**Mitigation**: Use checks-effects-interactions pattern or ReentrancyGuard.

### 2. Unchecked Return Values

Always check `success` before using return data.

### 3. Malicious Contracts

Low-level calls can call any contract. Validate target addresses.

**Mitigation**: Use whitelist or registry of trusted contracts.

---

## Summary

### Quick Reference

| Concept | Description | Example |
|---------|-------------|---------|
| `call` | State-modifying call | `target.call(abi.encodeWithSignature("deposit(uint256)", amount))` |
| `staticcall` | Read-only call | `target.staticcall(abi.encodeWithSignature("totalAssets()"))` |
| `abi.encodeWithSignature` | Encode function call | `abi.encodeWithSignature("functionName(uint256)", value)` |
| `abi.decode` | Decode return value | `uint256 value = abi.decode(data, (uint256))` |
| `success` | Call success flag | `require(success, "Call failed")` |

### Key Takeaway: Why Low-Level Calls?

**Use low-level calls when**:
- ✅ Contracts have **different interfaces** (like StrategyRouter)
- ✅ Contract type is **unknown at compile time** (stored as `address`)
- ✅ You need **maximum flexibility** (support multiple contract types)
- ✅ You're building a **router/registry pattern**

**Use direct calls when**:
- ✅ All contracts share the **same interface**
- ✅ Contract type is **known at compile time**
- ✅ **Type safety** is more important than flexibility

**In StrategyRouter's case**: We use low-level calls because strategies are stored as `address` types and we need to support multiple strategy types with potentially different interfaces.

---

## Further Reading

- [Solidity Documentation: Low-Level Calls](https://docs.soliditylang.org/en/latest/units-and-global-variables.html#members-of-address-types)
- [ABI Specification](https://docs.soliditylang.org/en/latest/abi-spec.html)
- [Ethereum Yellow Paper](https://ethereum.github.io/yellowpaper/paper.pdf)

---

**Last Updated**: [Current Date]  
**Version**: 1.0  
**Author**: Juan José Expósito González

