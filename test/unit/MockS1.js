const { expect, assert } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
    return ethers.utils.parseUnits(n.toString(), 'ether')
}

const ether = tokens
const addressZero = '0x0000000000000000000000000000000000000000'
const YEAR = 365 * 24 * 3600;
const SCALE = ethers.utils.parseUnits('1', 18);
const TOL = ethers.utils.parseUnits('0.01', 18);

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
            let principalBefore, principalAfter, block, amount;
            
            beforeEach('', async () => {
                // Configuration
                const aprBps = 500; // 5%
                const cap = ethers.utils.parseUnits('1000000', 18); // Big enough
                amount = ethers.utils.parseUnits('1000',18); // 1K
                
                // Initial parameters change
                principalBefore = await mockS1.principal();
                transaction = await mockS1.connect(deployer).setParams(aprBps, cap);
                await transaction.wait();

                // Deposit
                transaction = await mockS1.connect(user1).depositToStrategy(amount);
                result = await transaction.wait();

                // Parameters after depositing
                principalAfter = await mockS1.principal();
                block = await ethers.provider.getBlock(result.blockNumber);
            })

            it('deposit increases principal correcty', async () => {
                // 1. Verify that principal increased
                const expectedPrincipal = principalBefore.add(amount);
                expect(principalAfter).to.be.greaterThan(principalBefore);
                expect(principalAfter).to.be.equal(expectedPrincipal);
            })

            it('emits an S1Deposited event', async() => {
                const totalAssetsAfter = await mockS1.totalAssets(); // view function, no need to .connect(user1)
                await expect(transaction).to.emit(mockS1, 'S1Deposited')
                    .withArgs(
                        amount,
                        principalAfter,
                        totalAssetsAfter,
                        block.timestamp
                    )
            })

            it('does not accumulate yield when no time has elapsed', async () => {
                // Setup: Ya tienes un depósito del beforeEach
                const principal = await mockS1.principal();
                const accumulatorBefore = await mockS1.accumulator();
                const totalAssetsBefore = await mockS1.totalAssets();
                
                // Verificar estado inicial
                const SCALE = ethers.utils.parseUnits('1', 18);
                expect(accumulatorBefore).to.equal(SCALE);
                expect(totalAssetsBefore).to.equal(principal); // Sin yield inicial
                
                // Act: Llamar totalAssets() inmediatamente (sin avanzar tiempo)
                const totalAssetsAfter = await mockS1.totalAssets();
                const accumulatorAfter = await mockS1.accumulator();
                
                // Assert: No debe haber acumulación
                expect(totalAssetsAfter).to.equal(totalAssetsBefore);
                expect(totalAssetsAfter).to.equal(principal); // Debe ser igual al principal
                expect(accumulatorAfter).to.equal(accumulatorBefore);
                expect(accumulatorAfter).to.equal(SCALE);
            })

            it('accumulates 5% yield over 1 year', async() => {
                // Set: Initial values storage
                const principal = await mockS1.principal();
                const accumulatorBefore = await mockS1.accumulator();
                const totalAssetsBefore = await mockS1.totalAssets();

                // Verify initial state
                expect(accumulatorBefore).to.equal(SCALE);
                expect(totalAssetsBefore).to.equal(principal);

                // Fast forward time one year
                await ethers.provider.send('evm_increaseTime', [YEAR]);
                await ethers.provider.send('evm_mine', []);

                // Act: Shoot accumulation
                const totalAssetsAfter = await mockS1.totalAssets();

                // Assert
                const expectedAccumulator = ethers.utils.parseUnits('1.05', 18);
                const accumulatorAfter = await mockS1.accumulator();
                const expectedTotalAssets = principal.mul(expectedAccumulator).div(SCALE);

                expect(totalAssetsAfter).to.be.greaterThan(totalAssetsBefore);
                expect(totalAssetsAfter).to.be.closeTo(expectedTotalAssets, TOL);

                // Verify that principal didn't change
                const principalAfter = await mockS1.principal();
                expect(principalAfter).to.equal(principal);

                // Verify that accumulator en storage DID NOT change (totalAssets is view function, i.e. doesn't change the state)
                expect(accumulatorAfter).to.equal(accumulatorBefore);
                
            })

            it('_accrue() and _accrueView() produce same result', async () => {
                // Initial state
                const principalBefore = await mockS1.principal();
                const accumulatorBefore = await mockS1.accumulator();
                
                // Fast forward time
                await ethers.provider.send('evm_increaseTime', [YEAR]);
                await ethers.provider.send('evm_mine', []);
                
                // Call totalAssets() (uses _accrueView) - no modifica estado
                const totalAssetsFromView = await mockS1.totalAssets();
                const accumulatorInStorageBefore = await mockS1.accumulator();
                
                // Verificar que accumulator no cambió (porque _accrueView no modifica estado)
                expect(accumulatorInStorageBefore).to.equal(accumulatorBefore);
                
                // Calcular accumulator que usó _accrueView()
                const accumulatorCalculatedByView = totalAssetsFromView.mul(SCALE).div(principalBefore);
                
                // Make TINY deposit (1 wei) to fire _accrue() - minimiza impacto
                const tinyDeposit = ethers.utils.parseUnits('0.000000000000000001', 18); // 1 wei
                await mockS1.connect(user1).depositToStrategy(tinyDeposit);
                
                // Verificar accumulator después de _accrue()
                const accumulatorAfterAccrue = await mockS1.accumulator();
                expect(accumulatorCalculatedByView).to.be.closeTo(accumulatorAfterAccrue, TOL);
                
                // Verificar totalAssets después
                const principalAfter = await mockS1.principal();
                const totalAssetsAfterAccrue = await mockS1.totalAssets();
                
                // Verificar que totalAssets = principal * accumulator / SCALE
                const expectedTotalAssets = principalAfter.mul(accumulatorAfterAccrue).div(SCALE);
                expect(totalAssetsAfterAccrue).to.be.closeTo(expectedTotalAssets, TOL);
                
                // Verificar que el incremento es solo por el depósito (yield sobre 1 wei es despreciable)
                const increase = totalAssetsAfterAccrue.sub(totalAssetsFromView);
                expect(increase).to.be.closeTo(tinyDeposit, TOL);
            })

        })

        describe('Failure', () => {
            let availableSpace, excessAmount;
            beforeEach('', async() => {
                // Configuration
                const aprBps = 500; // 5%
                const cap = ethers.utils.parseUnits('10000', 18); // Now it is low
                amount = ethers.utils.parseUnits('1000',18); // 1K

                // Initial parameters change
                principalBefore = await mockS1.principal();
                transaction = await mockS1.connect(deployer).setParams(aprBps, cap);
                await transaction.wait();

                // Initial parameters change
                principalBefore = await mockS1.principal();
                await transaction.wait();

                // Deposit
                transaction = await mockS1.connect(user1).depositToStrategy(amount);
                result = await transaction.wait();

                // Parameters after depositing
                principalAfter = await mockS1.principal();
                block = await ethers.provider.getBlock(result.blockNumber);
                availableSpace = cap.sub(principalAfter);
                excessAmount = availableSpace.add(ethers.utils.parseUnits('1', 18));
            })

            it('reverts deposit when cap is exceeded', async () => {
                // Store principal before and after
                principalBefore = principalAfter;
                // Try to deposit more than allowed
                transaction = mockS1.connect(user1).depositToStrategy(excessAmount);
                await expect(transaction).to.be.revertedWithCustomError(mockS1, 'MockS1__CapExceeded');

                // Retrieve principalAfterTransaction
                principalAfter = await mockS1.principal();
                expect(principalAfter).to.equal(principalBefore)
            })
        })
    })

    describe('Withdraw from Strategy', () => {
        let principalBefore, accumulator, totalAssetsAfter, totalAssetsBefore, withdrawAmount;
        withdrawAmount = ethers.utils.parseUnits('100', 18);
        beforeEach('', async() => {
            // Configuration
            const aprBps = 500; // 5%
            const cap = ethers.utils.parseUnits('1000000', 18); // Big enough
            amount = ethers.utils.parseUnits('1000',18); // 1K
            
            // Initial parameters setup
            transaction = await mockS1.connect(deployer).setParams(aprBps, cap);
            await transaction.wait();
            
            // Deposit
            transaction = await mockS1.connect(user1).depositToStrategy(amount);
            result = await transaction.wait();
            
            principalBefore = await mockS1.principal();            
        })

        describe('Success', () => {
            describe('Success', () => {
                it('basic withdraw reduces principal accurately', async () => {
                    // Hacer el retiro PRIMERO
                    transaction = await mockS1.withdrawFromStrategy(withdrawAmount);
                    result = await transaction.wait();
                    
                    // Leer valores DESPUÉS del retiro
                    const principalAfter = await mockS1.principal();
                    accumulator = await mockS1.accumulator();
                    
                    // Calcular y verificar
                    const principalToReduce = withdrawAmount.mul(SCALE).div(accumulator);
                    const expectedPrincipal = principalBefore.sub(principalToReduce);
                    
                    expect(principalAfter).to.be.lessThan(principalBefore);
                    expect(principalAfter).to.be.closeTo(expectedPrincipal, TOL);
                })
                
                it('withdraw totalBalance is allowed', async () => {
                    // Guardar valores ANTES del retiro
                    const principalBeforeTest = await mockS1.principal();
                    totalAssetsBefore = await mockS1.totalAssets();
                    const accumulatorBefore = await mockS1.accumulator();
                    
                    // Retirar todo el balance
                    transaction = await mockS1.connect(user1).withdrawFromStrategy(totalAssetsBefore);
                    result = await transaction.wait();
                    
                    // Leer valores después del retiro
                    const principalAfter = await mockS1.principal();
                    totalAssetsAfter = await mockS1.totalAssets();
                    
                    // Calcular principal reducido
                    const principalToReduce = totalAssetsBefore.mul(SCALE).div(accumulatorBefore);
                    const expectedPrincipal = principalBeforeTest.sub(principalToReduce);
                    
                    // Verificar que principal disminuyó
                    expect(principalAfter).to.be.lessThan(principalBeforeTest);
                    expect(principalAfter).to.be.closeTo(expectedPrincipal, TOL);
                    
                    // Verificar que totalAssets es aproximadamente 0
                    expect(totalAssetsAfter).to.be.closeTo(ethers.utils.parseUnits('0', 18), TOL.mul(10));
                })

                it('emits a S1Withdrawn event', async () => {
                    // Setup: Valores independientes para este test
                    const withdrawAmountEvent = ethers.utils.parseUnits('100', 18);
                    const totalAssetsBeforeEvent = await mockS1.totalAssets();
                    
                    // Verificar que hay suficiente balance
                    expect(withdrawAmountEvent).to.be.lessThanOrEqual(totalAssetsBeforeEvent);
                    
                    // Hacer el retiro
                    transaction = await mockS1.connect(user1).withdrawFromStrategy(withdrawAmountEvent);
                    result = await transaction.wait();
                    
                    // Obtener timestamp del bloque
                    const block = await ethers.provider.getBlock(result.blockNumber);
                    
                    // Leer valores después del retiro
                    const principalAfterEvent = await mockS1.principal();
                    const totalAssetsAfterEvent = await mockS1.totalAssets();
                    
                    // Verificar el evento
                    await expect(transaction).to.emit(mockS1, 'S1Withdrawn')
                        .withArgs(
                            withdrawAmountEvent,
                            principalAfterEvent,
                            totalAssetsAfterEvent,
                            block.timestamp
                        )
                })
            })
        })

        describe('Failure', () => {
            it('cannot withdraw more than totalAssets()', async () => {
                withdrawAmount = (await mockS1.totalAssets()).add(ether(0.01));
                transaction = mockS1.withdrawFromStrategy(withdrawAmount);
                await(expect(transaction)).to.be.revertedWithCustomError(mockS1, 'MockS1__InsufficientBalance');
            })
        })
    })

    describe('Report', () => {
        let principalBefore, accumulatorBefore, totalAssetsBefore;
        
        beforeEach('', async () => {
            // Configuration
            const aprBps = 500; // 5%
            const cap = ethers.utils.parseUnits('1000000', 18);
            const depositAmount = ethers.utils.parseUnits('1000', 18);
            
            // Setup
            await mockS1.connect(deployer).setParams(aprBps, cap);
            await mockS1.connect(user1).depositToStrategy(depositAmount);
            
            // Avanzar tiempo para acumular yield
            await ethers.provider.send('evm_increaseTime', [YEAR]);
            await ethers.provider.send('evm_mine', []);
            
            // Disparar _accrue() para actualizar accumulator en storage
            await mockS1.connect(user1).depositToStrategy(1); // 1 wei mínimo
            
            // Guardar valores después de actualizar
            principalBefore = await mockS1.principal();
            accumulatorBefore = await mockS1.accumulator();
            totalAssetsBefore = await mockS1.totalAssets();
        })
        
        describe('Success', () => {
            it('report realizes yield and updates principal correctly', async () => {
                const principalJustBeforeReport = await mockS1.principal();
                const accumulatorBeforeReport = await mockS1.accumulator();
                
                // Calcular totalAssets esperado usando el accumulator actual
                const expectedTotalAssets = principalJustBeforeReport.mul(accumulatorBeforeReport).div(SCALE);
                
                // Llamar report()
                transaction = await mockS1.connect(deployer).report();
                result = await transaction.wait();
                
                // Leer valores después de report()
                const principalAfter = await mockS1.principal();
                const accumulatorAfter = await mockS1.accumulator();
                
                // Verificar que principal absorbió el yield (con tolerancia por _accrue() adicional)
                expect(principalAfter).to.be.closeTo(expectedTotalAssets, TOL.mul(10));
                expect(principalAfter).to.be.greaterThan(principalJustBeforeReport);
                
                // Verificar que accumulator se reseteó
                expect(accumulatorAfter).to.equal(SCALE);
            })

            it('emits S1Reported event with correct values', async () => {
                // Calcular valores antes de report()
                const totalAssetsJustBeforeReport = await mockS1.totalAssets();
                const principalJustBeforeReport = await mockS1.principal();
                const expectedGain = totalAssetsJustBeforeReport.sub(principalJustBeforeReport);
                
                // Llamar report()
                transaction = await mockS1.connect(deployer).report();
                result = await transaction.wait();
                
                // Obtener timestamp del bloque
                const block = await ethers.provider.getBlock(result.blockNumber);
                
                // Leer principal después de report()
                const principalAfter = await mockS1.principal();
                
                // Buscar el evento en los logs
                const event = result.events.find(e => e.event === 'S1Reported');
                const actualGain = event.args.gain;
                const actualNewPrincipal = event.args.newPrincipal;
                const actualTimestamp = event.args.timestamp;
                
                // Verificar valores del evento
                expect(actualGain).to.be.closeTo(expectedGain, TOL.mul(10));
                expect(actualNewPrincipal).to.equal(principalAfter);
                expect(actualTimestamp).to.equal(block.timestamp);
                
                // Verificar que el evento se emitió
                await expect(transaction).to.emit(mockS1, 'S1Reported');
            })
        })

        describe('Failure', () => {
            it('reverts report when contract is paused', async () => {
                // Pausar el contrato
                await mockS1.connect(deployer).pause(true);
                
                // Verificar que está pausado
                expect(await mockS1.paused()).to.be.true;
                
                // Intentar report() (debe revertir)
                await expect(
                    mockS1.connect(deployer).report()
                ).to.be.revertedWithCustomError(mockS1, 'MockS1__Paused');
            })

            it('reverts when principal == 0', async () => {
                // Setup: Crear un nuevo contrato sin depósitos (principal == 0)
                const MockS1 = await ethers.getContractFactory("MockS1");
                const newMockS1 = await MockS1.deploy(token.address);
                await newMockS1.connect(deployer).setParams(500, ethers.utils.parseUnits('1000000', 18));
                
                // Verificar que principal es 0
                expect(await newMockS1.principal()).to.equal(0);
                
                // Intentar report() (debe revertir)
                await expect(
                    newMockS1.connect(deployer).report()
                ).to.be.revertedWithCustomError(newMockS1, 'MockS1__InsufficientBalance');
            })

            it('reverts when aprBps == 0', async () => {
                // Setup: Configurar APR en 0
                await mockS1.connect(deployer).setParams(0, ethers.utils.parseUnits('1000000', 18));
                
                // Verificar que aprBps es 0
                const params = await mockS1.params();
                expect(params[0]).to.equal(0);
                
                // Intentar report() (debe revertir)
                await expect(
                    mockS1.connect(deployer).report()
                ).to.be.revertedWithCustomError(mockS1, 'MockS1__InsufficientBalance');
            })

            it('reverts when accumulator == SCALE (no yield accumulated)', async () => {
                // Setup: Crear nuevo contrato, depositar pero NO avanzar tiempo
                const MockS1 = await ethers.getContractFactory("MockS1");
                const newMockS1 = await MockS1.deploy(token.address);
                await newMockS1.connect(deployer).setParams(500, ethers.utils.parseUnits('1000000', 18));
                await newMockS1.connect(user1).depositToStrategy(ethers.utils.parseUnits('1000', 18));
                
                // Verificar que accumulator es SCALE (sin yield acumulado)
                const accumulator = await newMockS1.accumulator();
                expect(accumulator).to.equal(SCALE);
                
                // Intentar report() (debe revertir porque no hay yield)
                await expect(
                    newMockS1.connect(deployer).report()
                ).to.be.revertedWithCustomError(newMockS1, 'MockS1__InsufficientBalance');
            })

            it('reverts when not owner calls report', async () => {
                // Intentar report() desde user1 (no es owner)
                await expect(
                    mockS1.connect(user1).report()
                ).to.be.reverted;
            })
        })
    })

})
