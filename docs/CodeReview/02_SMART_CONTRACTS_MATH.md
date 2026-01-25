# Code Review - Matematicas y Calculos
## dBank DeFi Vault

---

## 1. Analisis de Formulas ERC-4626

### 1.1 convertToShares (dBank.sol:160-172)

**Formula implementada:**
```solidity
function convertToShares(uint256 _assets) external view returns (uint256) {
    uint256 _totalAssets = this.totalAssets();
    uint256 _totalSupply = totalSupply;
    if (_totalAssets == 0 || _totalSupply == 0) return _assets;
    return (_assets * _totalSupply) / _totalAssets;
}
```

**Formula matematica:**
```
shares = assets * totalSupply / totalAssets
```

**Analisis:**
- CORRECTO: La formula sigue el estandar ERC-4626
- CORRECTO: Maneja caso de vault vacio (ratio 1:1)
- PROBLEMA MENOR: Redondeo hacia abajo favorece al vault (correcto para deposits)

**Verificacion numerica:**
```
Caso: totalAssets = 1000, totalSupply = 900, assets = 100
shares = 100 * 900 / 1000 = 90 shares

Validacion: 90 shares representan 90 * 1000 / 900 = 100 assets (OK)
```

### 1.2 convertToAssets (dBank.sol:174-186)

**Formula implementada:**
```solidity
function convertToAssets(uint256 _shares) external view returns (uint256) {
    uint256 _totalSupply = totalSupply;
    if (_totalSupply == 0) return _shares;
    return (_shares * this.totalAssets()) / _totalSupply;
}
```

**Analisis:**
- CORRECTO: Formula estandar ERC-4626
- PROBLEMA MENOR: Redondeo hacia abajo (puede ser problematico en withdrawals)

**Caso edge - Division por cero:**
Si `totalSupply = 0` pero hay assets (por redondeo extremo), retorna `_shares` directamente. Esto es aceptable para el caso inicial pero podria ser un edge case.

### 1.3 previewDeposit vs previewMint

**previewDeposit (lineas 188-199):**
```solidity
return this.convertToShares(_assets);  // Redondea hacia abajo
```

**previewMint (lineas 201-212):**
```solidity
return _mulDivUp(_shares * this.totalAssets(), totalSupply);  // Redondea hacia arriba
```

**Analisis:**
- CORRECTO: previewDeposit redondea abajo (menos shares para el usuario)
- CORRECTO: previewMint redondea arriba (mas assets requeridos)
- Este es el comportamiento correcto segun ERC-4626 para proteger el vault

---

## 2. Calculo de Yield en MockS1

### 2.1 Formula de Acumulacion (MockS1.sol:111-164)

**Implementacion:**
```solidity
// Tasa por segundo escalada
uint256 ratePerSecondScaled = absApr * SCALE / (10_000 * YEAR);

// Delta de acumulacion
uint256 deltaScaled = ratePerSecondScaled * dt;

// Nuevo acumulador
if (aprBps > 0) {
    newAccumulator = accumulator * (SCALE + deltaScaled) / SCALE;
} else {
    uint256 factor = SCALE > deltaScaled ? SCALE - deltaScaled : 0;
    newAccumulator = accumulator * factor / SCALE;
}
```

**Formula matematica:**
```
Para APR positivo:
newAccumulator = oldAccumulator * (1 + rate * dt)

Para APR negativo:
newAccumulator = oldAccumulator * max(0, 1 - rate * dt)
```

**Analisis:**
- CORRECTO: Acumulacion lineal simple (no compuesta)
- PROBLEMA POTENCIAL: Con APR negativo muy alto y dt grande, puede llegar a 0
- NOTA: Esta es acumulacion LINEAL, no exponencial (compound). Para un mock es aceptable.

**Verificacion numerica:**
```
Caso: principal = 1000, APR = 5% (500 bps), tiempo = 1 ano
SCALE = 1e18
YEAR = 365 * 24 * 3600 = 31536000

ratePerSecond = 500 * 1e18 / (10000 * 31536000) = 1585489599
deltaScaled = 1585489599 * 31536000 = 49999999968544000 (aprox 0.05e18)

newAccumulator = 1e18 * (1e18 + 5e16) / 1e18 = 1.05e18

totalAssets = principal * newAccumulator / SCALE
           = 1000 * 1.05e18 / 1e18 = 1050 (5% yield - CORRECTO)
```

### 2.2 Problema de Precision con Periodos Largos

**Ubicacion:** `_accrue()` linea 134

**Problema:**
```solidity
uint256 deltaScaled = ratePerSecondScaled * dt;
```

Para `dt` muy grande (ej: varios anos), el producto puede desbordar:

```
dt_max = YEAR * 10 = 315360000 segundos (10 anos)
deltaScaled = 1585489599 * 315360000 = 5e17 (OK, no desborda)
```

**Conclusion:** Con Solidity 0.8+ y los valores actuales, no hay riesgo de overflow para periodos razonables (<100 anos).

---

## 3. Calculo de Slippage

### 3.1 withdrawFromStrategy (StrategyRouter.sol:365-405)

**Implementacion:**
```solidity
uint256 minExpected = _amount - (_amount * _slippageTolerance / 10000);
uint256 amountReceived = ... // resultado de la estrategia

require(amountReceived >= minExpected, "Slippage exceeded");
```

**Formula:**
```
minExpected = amount * (1 - slippage/10000)
```

**Analisis:**
- CORRECTO: Formula de slippage estandar
- PROBLEMA: El `_slippageTolerance` viene del usuario sin limite superior
- RECOMENDACION: Validar `_slippageTolerance <= maxSlippageBps`

**Ejemplo:**
```
amount = 1000, slippageTolerance = 50 (0.5%)
minExpected = 1000 - (1000 * 50 / 10000) = 1000 - 5 = 995
```

### 3.2 Falta Validacion de Slippage Maximo

**Problema:**
```solidity
// No hay validacion
function withdrawFromStrategy(uint256 _strategyId, uint256 _amount, uint256 _slippageTolerance)
    external returns (uint256)
{
    // Usuario podria pasar _slippageTolerance = 10000 (100%)
    // Esto aceptaria recibir 0 tokens
}
```

**Solucion recomendada:**
```solidity
require(_slippageTolerance <= MAX_SLIPPAGE_BPS, "Slippage too high");
```

---

## 4. Calculo de Buffer de Liquidez

### 4.1 Logica de Buffer (dBank.sol:231-260)

**Implementacion en deposit:**
```solidity
uint256 targetBuffer = (_totalAssets * liquidityBufferBps) / MAX_BPS;
uint256 currentBuffer = buffer;

if (currentBuffer < targetBuffer) {
    uint256 bufferDeficit = targetBuffer - currentBuffer;
    uint256 toBuffer = _assets < bufferDeficit ? _assets : bufferDeficit;
    // ...
}
```

**Formula:**
```
targetBuffer = totalAssets * 12%
deficit = targetBuffer - currentBuffer
toBuffer = min(deposit, deficit)
toRouter = deposit - toBuffer
```

**Analisis:**
- CORRECTO: Mantiene 12% en buffer
- CORRECTO: Rellena buffer primero, luego envia a estrategias
- PROBLEMA MENOR: El targetBuffer se calcula ANTES de sumar el deposito

**Ejemplo:**
```
Pre-deposit: totalAssets = 1000, buffer = 100 (10%)
Deposit: 200

targetBuffer = 1000 * 12% = 120 (deberia ser 1200 * 12% = 144)
deficit = 120 - 100 = 20
toBuffer = min(200, 20) = 20
toRouter = 180

Post-deposit: buffer = 120, totalAssets = 1200
Actual buffer % = 120/1200 = 10% (DEBERIA SER 12%)
```

**Recomendacion:**
Calcular target DESPUES de sumar el deposito:
```solidity
uint256 newTotalAssets = _totalAssets + _assets;
uint256 targetBuffer = (newTotalAssets * liquidityBufferBps) / MAX_BPS;
```

---

## 5. Calculo de Performance Fees

### 5.1 High Water Mark (dBank.sol:418-451)

**Implementacion (parcial):**
```solidity
function crystallizeFees() external {
    uint256 currentNav = totalAssets;
    if (currentNav <= highWaterMark) {
        highWaterMark = currentNav;
        lastFeeEpoch = block.timestamp;
        return; // No fees si NAV no supera HWM
    }

    uint256 gain = currentNav - highWaterMark;
    // Codigo de cobro de fees COMENTADO
}
```

**Formula esperada:**
```
gain = currentNAV - highWaterMark
feeShares = gain * totalSupply * performanceFeeBps / (totalAssets * MAX_BPS)
```

**Analisis:**
- PROBLEMA CRITICO: La logica de fees esta comentada
- El high water mark SI se actualiza
- Pero las fees nunca se cobran

### 5.2 Recomendacion de Implementacion

```solidity
if (gain > 0) {
    // Calcular fee en assets
    uint256 feeAssets = (gain * performanceFeeBps) / MAX_BPS;

    // Convertir a shares (mint nuevas shares al fee recipient)
    uint256 feeShares = (feeAssets * totalSupply) / (currentNav - feeAssets);

    if (feeShares > 0 && feeRecipient != address(0)) {
        _mint(feeRecipient, feeShares);
        emit FeesCrystallized(gain, feeShares, block.timestamp);
    }

    highWaterMark = currentNav;
}
```

---

## 6. Problemas de Precision Numerica

### 6.1 Division Entera y Perdida de Precision

**Ubicacion:** Multiples funciones

**Problema comun:**
```solidity
// Puede perder precision
result = (a * b) / c;

// Caso problematico: a = 1, b = 3, c = 2
// Esperado: 1.5
// Obtenido: 1
```

**Casos identificados:**

1. **convertToShares con assets pequenos:**
```solidity
// Si assets = 1, totalSupply = 100, totalAssets = 1000
shares = 1 * 100 / 1000 = 0 (pierde el deposito!)
```

2. **ratePerSecondScaled en MockS1:**
```solidity
// Si aprBps = 1 (0.01%)
ratePerSecond = 1 * 1e18 / (10000 * 31536000) = 3170979
// Precision aceptable
```

### 6.2 Recomendaciones

1. **Usar precision alta (18 decimales) internamente**
2. **Verificar minimos antes de operaciones**
```solidity
require(_assets >= MIN_DEPOSIT, "Deposit too small");
```

3. **Usar mulDiv con control de redondeo**
```solidity
// OpenZeppelin Math.mulDiv
shares = Math.mulDiv(assets, totalSupply, totalAssets, Math.Rounding.Down);
```

---

## 7. Tabla Resumen de Formulas

| Operacion | Formula | Estado | Notas |
|-----------|---------|--------|-------|
| convertToShares | `assets * supply / totalAssets` | OK | Redondea down |
| convertToAssets | `shares * totalAssets / supply` | OK | Redondea down |
| previewMint | `(shares * totalAssets + supply - 1) / supply` | OK | Redondea up |
| previewRedeem | `shares * totalAssets / supply` | OK | Redondea down |
| MockS1 yield | `principal * (1 + APR * dt)` | OK | Lineal, no compuesto |
| Slippage | `amount * (1 - tolerance/10000)` | WARN | Falta limite max |
| Buffer target | `totalAssets * 12%` | WARN | Calcular post-deposit |
| Performance fee | `gain * feeRate` | FAIL | No implementado |

---

## 8. Recomendaciones de Mejora

### Alta Prioridad

1. **Implementar performance fees**
   - Descomentar y completar logica en `crystallizeFees()`
   - Asegurar que `feeRecipient` recibe shares

2. **Corregir calculo de buffer**
   - Calcular target basado en totalAssets POST-deposito

3. **Validar slippage maximo**
   - Agregar `require(_slippageTolerance <= maxSlippageBps)`

### Media Prioridad

4. **Agregar minimos de operacion**
   - MIN_DEPOSIT para evitar perdida por redondeo
   - MIN_WITHDRAW por la misma razon

5. **Usar OpenZeppelin Math**
   - `Math.mulDiv()` para operaciones con control de redondeo
   - `Math.ceilDiv()` donde se necesite redondeo hacia arriba

### Baja Prioridad

6. **Considerar yield compuesto en MockS1**
   - Para MVP lineal es aceptable
   - Para produccion, evaluar acumulacion exponencial

7. **Documentar precision esperada**
   - Minimo deposito recomendado
   - Precision de conversiones
