# DEPLOY.md

## Objective
Step-by-step guide to deploy dBank (ERC-4626) contracts and dependencies, without including code snippets.

## Prerequisites
- Node.js and pnpm/npm installed.
- Environment variables defined: `RPC_URL`, `PRIVATE_KEY_DEPLOYER`, optional `ETHERSCAN_API_KEY`.
- Deployer account with sufficient funds on target network for gas.
- Contracts compiled: `npx hardhat compile`.

## Network configuration (Hardhat)
- In `hardhat.config.js`, define the target network (`sepolia`, `mainnet`, etc.) using `RPC_URL` and `accounts: [PRIVATE_KEY_DEPLOYER]`.
- Verify `chainId` and gas policy of the network.

## Deployment parameters
- Base token (e.g. `Token` USDC mock): `NAME`, `SYMBOL`, `MAX_SUPPLY`.
- MockS1 (Strategy S1): `aprBps` (500 = 5%), `cap` (1M tokens by default).
- dBank Vault: asset address (USDC), `strategyRouter`, `configManager`, owner (deployer).
- Suggested initial config: `bufferTargetBps` 12% (1200 bps), `performanceFeeBps`, `feeRecipient`, `tvlCap`, `perTxCap`, `pause` set to `false`.

## Deployment order (implemented in scripts/deploy.js)
1) Deploy underlying token (USDC mock or real asset).
2) Deploy `ConfigManager`.
3) Deploy `StrategyRouter` passing: asset (token), configManager.
4) Deploy `MockS1` (Strategy S1) passing: asset (token).
5) Configure `MockS1` with `setParams(aprBps, cap)`.
6) Register `MockS1` in `StrategyRouter` with `registerStrategy(strategyId, address, cap)`.
7) Deploy `dBank` (ERC-4626 Vault) passing: asset, router, config manager.

## Script execution
- Typical command: `npx hardhat run scripts/deploy.js --network <network>`.
- The script automatically deploys all contracts in the correct order:
  - Token (USDC)
  - ConfigManager
  - StrategyRouter
  - MockS1 (Strategy S1) with initial configuration
  - dBank (ERC-4626 Vault)
- Record addresses returned in console: token, config manager, router, mockS1, vault.
- Save a snapshot of the output for audit and front/back integration.

## Verification (optional)
- The script includes automatic verification if `ETHERSCAN_API_KEY` is configured.
- Manual verification: `npx hardhat verify --network <network> <contractAddress> <args...>`.
- Contracts to verify: Token, ConfigManager, StrategyRouter, MockS1, dBank.

## Post-deployment configuration (owner)
- `setBufferTargetBps(1200)` or configured value.
- `setPerformanceFeeBps` and `setFeeRecipient`.
- `setTvlCap` and `setPerTxCap`.
- `pause(false)` if applicable.
- Approve router to move assets if necessary (from vault to router).

## Quick checks
- `totalAssets` = `buffer + router.totalAssets()`.
- `pricePerShare` = 1e18 if `totalSupply == 0`; after a deposit, `totalAssets/totalSupply`.
- Events emitted according to smoke tests: `ConfigUpdated`, `Paused`, `Deposit`/`Withdraw`.

