const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
  return ethers.utils.parseUnits(n.toString(), 'ether')
}

const ether = tokens
const addressZero = '0x0000000000000000000000000000000000000000'
const LIQUIDITY_BUFFER_BPS = 1200;
const MAX_SLIPPAGE_BPS = 30;
const TVL_GLOBAL_CAP = 100_000e6;
const PER_TX_CAP = 5_000e6;
const PERFORMANCE_FEE_BPS = 2500;
const EPOCH_DURATION = 7;
const SETTLEMENT_WINDOW_UTC = 12 * 3600;
const STRATEGY_CAP_S1 = 100_000e6;
const STRATEGY_CAP_S2 = 50_000e6;
const STRATEGY_CAP_S3 = 25_000e6;

describe('ConfigManager', () => {
  let configManager, accounts, deployer, transaction, result, receiver, user1

  beforeEach(async () => {
    const ConfigManager = await ethers.getContractFactory("ConfigManager")
    configManager = await ConfigManager.deploy()

    accounts = await ethers.getSigners()
    deployer = accounts[0]
    receiver = accounts[1]
    user1 = accounts[2]
  })

  describe('Deployment', () => {

    it('returns correct owner', async () => {
      expect(await configManager.owner()).to.equal(await deployer.address);

    })
    it('returns correct value for liquidityBufferBps', async () => {
      expect(await configManager.liquidityBufferBps()).to.equal(LIQUIDITY_BUFFER_BPS);
    })

    it('returns correct value for maxSlippageBps', async () => {
      expect(await configManager.maxSlippageBps()).to.equal(MAX_SLIPPAGE_BPS);
    })

    it('returns correct value for tvlGlobalCap', async () => {
      expect(await configManager.tvlGlobalCap()).to.equal(TVL_GLOBAL_CAP);
    })

    it('returns correct value for perTxCap', async () => {
      expect(await configManager.perTxCap()).to.equal(PER_TX_CAP);
    })

    it('returns correct value for performanceFeeBps', async () => {
      expect(await configManager.performanceFeeBps()).to.equal(PERFORMANCE_FEE_BPS);
    })

    it('returns correct value for epochDuration', async () => {
      expect(await configManager.epochDuration()).to.equal(EPOCH_DURATION);
    })

    it('returns correct value for settlementWindowUTC', async () => {
      expect(await configManager.settlementWindowUTC()).to.equal(SETTLEMENT_WINDOW_UTC);
    })

    it('returns correct value for strategyCapS1', async () => {
      expect(await configManager.strategyCapS1()).to.equal(STRATEGY_CAP_S1);
    })

    it('returns correct value for strategyCapS2', async () => {
      expect(await configManager.strategyCapS2()).to.equal(STRATEGY_CAP_S2);
    })

    it('returns correct value for strategyCapS3', async () => {
      expect(await configManager.strategyCapS3()).to.equal(STRATEGY_CAP_S3);
    })
  })

  describe('Owner modification', () => {

    beforeEach(async () => {
      transaction = await configManager.connect(deployer).setOwner(receiver.address);
      result = await transaction.wait();
    })

    describe('Success', () => {

      it('correctly assigns a new owner', async () => {
        expect(await configManager.owner()).to.equal(await receiver.address)
      })

      it('emits an AddressUpdated event', async () => {
        await expect(transaction).to.emit(configManager, 'AddressUpdated').withArgs(
          ethers.utils.id("OWNER"),
          deployer.address,
          receiver.address
        )
      })

    })

    describe('Failure', () => {
      it('reverts when non owner calls setOwner', async () => {
        await expect(configManager.connect(user1).setOwner(deployer.address)).to.be.reverted;
      })

      it('reverts with newOnwer is address zero', async () => {
        await expect(configManager.connect(receiver).setOwner(addressZero)).to.be.revertedWith("Address zero is not allowed as owner")
      })

    })

  })

  describe('LiquidityBufferBps modification', () => {

    beforeEach(async () => {
      transaction = await configManager.connect(deployer).setLiquidityBufferBps(1800);
      result = await transaction.wait();
    })

    describe('Success', () => {

      it('correctly assigns a new liquidity buffer value', async () => {
        expect(await configManager.liquidityBufferBps()).to.equal(1800)
      })

      it('emits an ConfigUpdate event', async () => {
        await expect(transaction).to.emit(configManager, 'ConfigUpdated').withArgs(
          ethers.utils.id("LIQUIDITY_BUFFER_BPS"),
          1200,
          1800
        )
      })

    })

    describe('Failure', () => {
      it('reverts when non owner calls setLiquidityBufferBps', async () => {
        await expect(configManager.connect(user1).setLiquidityBufferBps(2500)).to.be.reverted;
      })

    })

  })

  describe('MaxSlippageBps modification', () => {

    beforeEach(async () => {
      transaction = await configManager.connect(deployer).setMaxSlippageBps(20);
      result = await transaction.wait();
    })

    describe('Success', () => {

      it('correctly assigns a new maximum slippage value', async () => {
        expect(await configManager.maxSlippageBps()).to.equal(20)
      })

      it('emits an ConfigUpdate event', async () => {
        await expect(transaction).to.emit(configManager, 'ConfigUpdated').withArgs(
          ethers.utils.id("SLIPPAGE_BPS"),
          30,
          20
        )
      })

    })

    describe('Failure', () => {
      it('reverts when non owner calls setMaxSlippageBps', async () => {
        await expect(configManager.connect(user1).setMaxSlippageBps(30)).to.be.reverted;
      })

    })

  })

  describe('TvlGlobalCap modification', () => {

    beforeEach(async () => {
      transaction = await configManager.connect(deployer).setTvlGlobalCap(80000e6);
      result = await transaction.wait();
    })

    describe('Success', () => {

      it('correctly assigns a new global cap for tvl value', async () => {
        expect(await configManager.tvlGlobalCap()).to.equal(80000e6)
      })

      it('emits an ConfigUpdate event', async () => {
        await expect(transaction).to.emit(configManager, 'ConfigUpdated').withArgs(
          ethers.utils.id("TVL_GLOBAL_CAP"),
          100000e6,
          80000e6
        )
      })

    })

    describe('Failure', () => {
      it('reverts when non owner calls setTvlGlobalCap', async () => {
        await expect(configManager.connect(user1).setTvlGlobalCap(80000e6)).to.be.reverted;
      })

    })

  })

  describe('PerTxCap modification', () => {

    beforeEach(async () => {
      transaction = await configManager.connect(deployer).setPerTxCap(4000e6);
      result = await transaction.wait();
    })

    describe('Success', () => {

      it('correctly assigns a new per transaction cap value', async () => {
        expect(await configManager.perTxCap()).to.equal(4000e6)
      })

      it('emits an ConfigUpdate event', async () => {
        await expect(transaction).to.emit(configManager, 'ConfigUpdated').withArgs(
          ethers.utils.id("PER_TX_CAP"),
          5000e6,
          4000e6
        )
      })

    })

    describe('Failure', () => {
      it('reverts when non owner calls setPerTxCap', async () => {
        await expect(configManager.connect(user1).setPerTxCap(4000e6)).to.be.reverted;
      })

    })

  })

  describe('PerformanceFeeBps modification', () => {

    beforeEach(async () => {
      transaction = await configManager.connect(deployer).setPerformanceFeeBps(3000);
      result = await transaction.wait();
    })

    describe('Success', () => {

      it('correctly assigns a new performance fee value', async () => {
        expect(await configManager.performanceFeeBps()).to.equal(3000)
      })

      it('emits an ConfigUpdate event', async () => {
        await expect(transaction).to.emit(configManager, 'ConfigUpdated').withArgs(
          ethers.utils.id("PERFORMANCE_FEE_BPS"),
          2500,
          3000
        )
      })

    })

    describe('Failure', () => {
      it('reverts when non owner calls setPerformanceFeeBps', async () => {
        await expect(configManager.connect(user1).setPerformanceFeeBps(3000)).to.be.reverted;
      })

    })

  })

  describe('EpochDuration modification', () => {

    beforeEach(async () => {
      transaction = await configManager.connect(deployer).setEpochDuration(14);
      result = await transaction.wait();
    })

    describe('Success', () => {

      it('correctly assigns a new epoch duration value', async () => {
        expect(await configManager.epochDuration()).to.equal(14)
      })

      it('emits an ConfigUpdate event', async () => {
        await expect(transaction).to.emit(configManager, 'ConfigUpdated').withArgs(
          ethers.utils.id("EPOCH_DURATION"),
          7,
          14
        )
      })

    })

    describe('Failure', () => {
      it('reverts when non owner calls setEpochDuration', async () => {
        await expect(configManager.connect(user1).setEpochDuration(14)).to.be.reverted;
      })

    })

  })

  describe('SettlementWindowUTC modification', () => {

    beforeEach(async () => {
      transaction = await configManager.connect(deployer).setSettlementWindowUTC(6 * 3600);
      result = await transaction.wait();
    })

    describe('Success', () => {

      it('correctly assigns a new settlement window value', async () => {
        expect(await configManager.settlementWindowUTC()).to.equal(6 * 3600)
      })

      it('emits an ConfigUpdate event', async () => {
        await expect(transaction).to.emit(configManager, 'ConfigUpdated').withArgs(
          ethers.utils.id("SETTLEMENT_WINDOW_UTC"),
          12 * 3600,
          6 * 3600
        )
      })

    })

    describe('Failure', () => {
      it('reverts when non owner calls setSettlementWindowUTC', async () => {
        await expect(configManager.connect(user1).setSettlementWindowUTC(6 * 3600)).to.be.reverted;
      })

    })

  })

  describe('StrategyCapS1 modification', () => {

    beforeEach(async () => {
      transaction = await configManager.connect(deployer).setStrategyCapS1(90000e6);
      result = await transaction.wait();
    })

    describe('Success', () => {

      it('correctly assigns a new strategy cap S1 value', async () => {
        expect(await configManager.strategyCapS1()).to.equal(90000e6)
      })

      it('emits an ConfigUpdate event', async () => {
        await expect(transaction).to.emit(configManager, 'ConfigUpdated').withArgs(
          ethers.utils.id("STRATEGY_CAP_S1"),
          100000e6,
          90000e6
        )
      })

    })

    describe('Failure', () => {
      it('reverts when non owner calls setStrategyCapS1', async () => {
        await expect(configManager.connect(user1).setStrategyCapS1(90000e6)).to.be.reverted;
      })

    })

  })

  describe('StrategyCapS2 modification', () => {

    beforeEach(async () => {
      transaction = await configManager.connect(deployer).setStrategyCapS2(40000e6);
      result = await transaction.wait();
    })

    describe('Success', () => {

      it('correctly assigns a new strategy cap S2 value', async () => {
        expect(await configManager.strategyCapS2()).to.equal(40000e6)
      })

      it('emits an ConfigUpdate event', async () => {
        await expect(transaction).to.emit(configManager, 'ConfigUpdated').withArgs(
          ethers.utils.id("STRATEGY_CAP_S2"),
          50000e6,
          40000e6
        )
      })

    })

    describe('Failure', () => {
      it('reverts when non owner calls setStrategyCapS2', async () => {
        await expect(configManager.connect(user1).setStrategyCapS2(40000e6)).to.be.reverted;
      })

    })

  })

  describe('StrategyCapS3 modification', () => {

    beforeEach(async () => {
      transaction = await configManager.connect(deployer).setStrategyCapS3(20000e6);
      result = await transaction.wait();
    })

    describe('Success', () => {

      it('correctly assigns a new strategy cap S3 value', async () => {
        expect(await configManager.strategyCapS3()).to.equal(20000e6)
      })

      it('emits an ConfigUpdate event', async () => {
        await expect(transaction).to.emit(configManager, 'ConfigUpdated').withArgs(
          ethers.utils.id("STRATEGY_CAP_S3"),
          25000e6,
          20000e6
        )
      })

    })

    describe('Failure', () => {
      it('reverts when non owner calls setStrategyCapS3', async () => {
        await expect(configManager.connect(user1).setStrategyCapS3(20000e6)).to.be.reverted;
      })

    })

  })


})
