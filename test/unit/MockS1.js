const { expect, assert } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
    return ethers.utils.parseUnits(n.toString(), 'ether')
}

const ether = tokens
const addressZero = '0x0000000000000000000000000000000000000000'

describe('ConfigManager', () => {
    let mockS1, token, accounts, deployer, transaction, result, receiver, user1

    beforeEach(async () => {
        const tokenName = 'USDC Token';
        const tokenSymbol = 'USDC';
        const tokenInitialAmount = '10000000';
        // Deploy Token contract
        const Token = await ethers.getContractFactory('Token');
        token = await Token.deploy(
            tokenName,
            tokenSymbol,
            tokenInitialAmount
        ); // 10 Million Tokens

        const MockS1 = await ethers.getContractFactory("MockS1")
        mockS1 = await MockS1.deploy(token.address)

        accounts = await ethers.getSigners()
        deployer = accounts[0]
        receiver = accounts[1]
        user1 = accounts[2]

    })

    describe('Deployment', () => {
        it('returns correct owner', async () => {
            expect(await mockS1.owner()).to.equal(await deployer.address);
        })

        it('tracks token address', async () => {
            expect(await mockS1.token()).to.equal(token.address);
        })

        it('sets correct initial value for principal', async () => {
            expect(await mockS1.principal()).to.equal(0);
        })

        it('sets correct initial value for accumulator', async () => {
            expect(await mockS1.accumulator()).to.equal(BigInt(1e18));
        })

        it('checks correcta value for paused', async () => {
            expect(await mockS1.paused()).to.be.false;
        })

    })

    describe('Parameter Settings', () => {
        beforeEach(async () => {
            // Setting params in mock
            transaction = await mockS1.setParams(500, ethers.utils.parseUnits('1000000', 18));
            await transaction.wait();
        })

        describe('Success', () => {
            it('checks correct initial parameter settings', async () => {
                let result;
                result = await mockS1.params()
                expect(result[0]).to.equal(500);
                expect(result[1]).to.equal(ethers.utils.parseUnits('1000000', 18));
            })

            it('emits an S1ParamsUpdatedEvent', async () => {
                await expect(transaction).to.emit(mockS1, 'S1ParamsUpdated').withArgs(
                    500,
                    ethers.utils.parseUnits('1000000', 18)
                )
            })

            it('checks contract is correctly paused', async () => {
                let pauseStatusBefore = await mockS1.paused();
                expect(pauseStatusBefore).to.be.false;

                // Pause contract
                transaction = await mockS1.pause(true);
                await transaction.wait();

                let pauseStatusAFter = await mockS1.paused();
                expect(pauseStatusAFter).to.be.true;
                assert(pauseStatusAFter != pauseStatusBefore);
            })
        })

        describe('Failure', () => {
            it('reverts if not owner changes params', async () => {
                await expect(mockS1.connect(user1).setParams(500, 1)).to.be.reverted;
            })

            it('reverts deposit if contract is paused', async () => {
                // Set
                transaction = await mockS1.pause(true);
                await transaction.wait();

                await expect(mockS1.depositToStrategy(ether('1000'))).to.be.reverted;
            })
        })

    })

    describe('Deposit to Strategy', () => {

        it('checks totalAssets equal to principal if not deposits/withdrawals', async () => {
            expect(await mockS1.totalAssets()).to.equal(await mockS1.principal())
        })
        describe('Success', () => {
            it('', async () => {

            })

        })

        describe('Failure', () => {

        })
    })

})
