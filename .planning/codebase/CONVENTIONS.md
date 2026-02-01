# Coding Conventions

**Analysis Date:** 2026-02-01

## Naming Patterns

**Files:**
- React components: PascalCase (e.g., `src/components/Deposit.js`, `src/components/Navigation.js`)
- Reducer files: camelCase with domain prefix (e.g., `src/store/reducers/dBank.js`, `src/store/reducers/strategyRouter.js`)
- Utility files: camelCase descriptive (e.g., `src/utils/format.js`, `src/utils/x402Config.js`)
- Hook files: camelCase with `use` prefix (e.g., `src/hooks/useDebounce.js`)
- Test files: Match contract name (e.g., `test/unit/dBank.js`, `test/integration/Flow.js`)
- Solidity contracts: PascalCase (e.g., `contracts/dBank.sol`, `contracts/ConfigManager.sol`)

**Functions:**
- Frontend: camelCase (e.g., `formatWithMaxDecimals`, `isSupportedChain`, `loadTokens`)
- Reducer actions: camelCase with contextual verb prefix (e.g., `setContract`, `depositRequest`, `withdrawSuccess`)
- Helper functions in tests: camelCase (e.g., `tokens()` for amount parsing)
- Solidity functions: camelCase (e.g., `deposit()`, `withdraw()`, `allocate()`)

**Variables:**
- State variables in components: camelCase (e.g., `usdcAmount`, `isDepositing`, `vaultValue`)
- Redux state slices: camelCase with domain (e.g., `dBank.depositing.isSuccess`, `provider.chainId`)
- Constants: UPPER_SNAKE_CASE (e.g., `SUPPORTED_CHAINS`, `SCALE`, `EPOCH_DURATION`, `MAX_BPS`)
- Temporary/loop variables: single letter or descriptive camelCase (e.g., `i`, `error`, `currentAccount`)

**Types/Classes:**
- Solidity custom errors: PascalCase with double underscore prefix (e.g., `dBank__NotOwner`, `dBank__CapExceeded`)
- Redux slices: camelCase with semantic names (e.g., `provider`, `tokens`, `strategyRouter`, `charts`)

## Code Style

**Formatting:**
- No explicit linter/formatter configured (uses default react-scripts ESLint)
- Imports organized: external dependencies first, then local imports
- Trailing commas: Used in multi-line structures
- Quotes: Single quotes preferred in source code, double quotes in JSON

**Linting:**
- ESLint config: `react-app` and `react-app/jest` (from package.json)
- No custom ESLint rules file (uses Create React App defaults)
- No Prettier config detected (formatting handled by react-scripts defaults)

## Import Organization

**Order:**
1. External libraries (e.g., `import { ethers } from 'ethers'`)
2. React core and hooks (e.g., `import { useEffect, useState } from 'react'`)
3. Redux imports (e.g., `import { useDispatch, useSelector } from 'react-redux'`)
4. UI library imports (e.g., `import { Card, Button } from 'react-bootstrap'`)
5. Local component imports (e.g., `import Navigation from './Navigation'`)
6. Store/action imports (e.g., `import { depositFunds } from '../store/interactions'`)
7. Utility/helper imports (e.g., `import { formatWithMaxDecimals } from '../utils/format'`)
8. Config imports (e.g., `import config from '../config.json'`)

**Path Aliases:**
- No explicit path aliases configured (standard relative imports used throughout)
- Relative path pattern: `../` for traversing up, `.` for current directory

## Error Handling

**Patterns:**
- Thrown errors include descriptive messages for context (e.g., `throw new Error('Chain ID ${chainId} is not configured. Please connect to a supported network.')`)
- Try-catch blocks wrap async operations and contract calls with specific error logging
- Error messages guide users on next steps (e.g., "Please install MetaMask to connect", "Please switch to a supported network")
- Contract reverts caught and decoded where possible: `console.error('Error decoding revert:', decodeError)`
- Fallback UI alerts for critical errors with actionable troubleshooting steps
- Redux dispatch failure states set (e.g., `depositFail`, `withdrawFail`) to manage UI states
- Errors logged at different levels: `console.error()` for critical, `console.warn()` for non-critical

**Example patterns from `src/store/interactions.js`:**
```javascript
try {
    // async operation
} catch (error) {
    console.error('Error in [operation]:', error);
    throw new Error('[User-friendly message]');
}
```

## Logging

**Framework:** Console API (`console.log`, `console.warn`, `console.error`)

**Patterns:**
- Logs prefixed with context labels: `console.log('loadBalances - Raw values:', {...})`
- Debug logs: `console.log()` for step-by-step tracing during data flow
- Warning logs: `console.warn()` for non-fatal issues (e.g., `Error loading strategy ${i}`)
- Error logs: `console.error()` for failures in critical paths
- No structured logging library (direct console methods used)
- Logs include relevant data: addresses, amounts, states, error messages
- Location: Throughout `src/store/interactions.js`, `src/components/App.js`, components handling async operations

## Comments

**When to Comment:**
- High-level intent in complex logic blocks (e.g., "Load balances/shares if account already connected")
- TODO-style markers for future work (none currently detected)
- Explanations of why, not what (code should be self-documenting for "what")
- Complex state management flows with multiple dispatch calls
- Workaround explanations (e.g., "Small delay to let MetaMask RPC fully switch")

**JSDoc/TSDoc:**
- JSDoc comments used for utility functions with parameter and return documentation
- Format: Standard JSDoc with `@param`, `@returns`, `@description` tags
- Example from `src/utils/format.js`:
```javascript
/**
 * Format a number with a maximum number of decimal places
 * Removes trailing zeros for cleaner display
 * @param {string|number} value - The value to format
 * @param {number} maxDecimals - Maximum decimal places (default: 4)
 * @returns {string} Formatted number string
 */
```

## Function Design

**Size:**
- Frontend handlers and async operations: 50-100 lines (e.g., `handleChainChanged` in `src/components/App.js`)
- Helper functions: 10-30 lines (e.g., `formatWithMaxDecimals`)
- Reducer actions: 5-15 lines per action
- No strict line length limits enforced

**Parameters:**
- Redux thunk actions: `(dispatch) => { }` or async arrow functions
- Contract interaction functions: `(contract, args, address, dispatch)` pattern
- Component handlers: Named handler functions with clear intent (e.g., `handleChainChanged`, `handleAccountsChanged`)
- Event handlers: Prefixed with `handle` (e.g., `handleAccountsChanged`)

**Return Values:**
- Async functions return awaited contract calls or undefined
- Helper functions return formatted values or derived computations
- Event handlers return nothing (void pattern)
- Selector functions return specific Redux state slices

## Module Design

**Exports:**
- Components: Default export (e.g., `export default App`)
- Utilities: Named exports for multiple functions (e.g., `export const formatWithMaxDecimals = ...`)
- Redux slices: Named export of slice actions and exported reducer as default
- Config constants: Named exports from utility files

**Barrel Files:**
- No explicit barrel files (index.js) detected in the codebase
- Imports reference specific files directly (e.g., `import from './Deposit'`)
- Config and ABIs imported directly (e.g., `import config from '../config.json'`)

## Solidity Specific Conventions

**Contract Structure:**
- Constants defined at top with `private constant` (e.g., `uint256 private constant SCALE = 1e18`)
- Custom errors defined before state variables (e.g., `error dBank__NotOwner()`)
- Events documented with indexed parameters for filter optimization
- State variables organized by category: core (asset, owner), ERC-20 (name, symbol, balanceOf), operational (buffer, fees)

**Naming (Solidity):**
- State variables: lowercase with underscores where needed (e.g., `highWaterMark`, `performanceFeeBps`)
- Private constants: UPPER_SNAKE_CASE (e.g., `MAX_BPS`, `EPOCH_DURATION`)
- Functions: camelCase (e.g., `deposit()`, `convertToAssets()`)
- Custom error names: PascalCase with contract prefix (e.g., `dBank__CapExceeded`)

**Error Handling (Solidity):**
- Custom errors preferred over require strings for gas efficiency
- Error messages embed context: `error dBank__CapExceeded(uint256 requested, uint256 available)`
- Immutable for safety-critical addresses (e.g., `Token public immutable asset`)

---

*Convention analysis: 2026-02-01*
