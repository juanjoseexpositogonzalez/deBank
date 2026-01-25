# Code Review - Seguridad de Smart Contracts
## dBank DeFi Vault

---

## 1. dBank.sol - Contrato Principal del Vault

### 1.1 Vulnerabilidad de Reentrancy (CRITICO)

**Ubicacion:** `withdraw()` lineas 263-298, `redeem()` lineas 300-334

**Problema:**
El patron CEI (Checks-Effects-Interactions) no se sigue estrictamente. La transferencia de tokens ocurre despues de modificar el buffer pero antes de completar todas las actualizaciones de estado.

```solidity
// Linea 294 - Transferencia DESPUES de modificar buffer
asset.transfer(_receiver, _assets);
// Linea 296 - Evento DESPUES de transferencia
emit Withdraw(msg.sender, _receiver, _owner, _assets, shares);
```

**Riesgo:**
Un contrato malicioso podria re-entrar en `withdraw()` antes de que se complete la ejecucion, potencialmente drenando el buffer.

**Solucion recomendada:**
```solidity
// Agregar import
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// Agregar herencia
contract dBank is ReentrancyGuard {

    // Agregar modifier a funciones criticas
    function withdraw(...) external whenNotPaused nonReentrant returns (uint256) {
        // ...
    }

    function redeem(...) external whenNotPaused nonReentrant returns (uint256) {
        // ...
    }
}
```

### 1.2 Performance Fees No Implementadas (CRITICO)

**Ubicacion:** `crystallizeFees()` lineas 416-451

**Problema:**
La logica de cobro de fees esta comentada:

```solidity
// Lineas 437-441 - Codigo comentado, no ejecutado
if (gain > 0) {
    // Fee calculation (not yet implemented - would transfer to feeRecipient)
    // uint256 feeAmount = (gain * performanceFeeBps) / MAX_BPS;
    // ...
}
```

**Riesgo:**
- El sistema no cobra fees aunque esten configuradas
- El `feeRecipient` nunca recibe pagos
- Inconsistencia entre documentacion y comportamiento real

**Solucion recomendada:**
```solidity
if (gain > 0) {
    uint256 feeAmount = (gain * _totalSupply * performanceFeeBps) / (MAX_BPS * SCALE);
    if (feeAmount > 0 && feeRecipient != address(0)) {
        // Mint fee shares to recipient
        _mint(feeRecipient, feeAmount);
    }
}
```

### 1.3 Llamadas Externas con `this.` (MEDIO)

**Ubicacion:** Multiples funciones

**Problema:**
El uso de `this.totalAssets()` hace una llamada externa en lugar de interna:

```solidity
// Linea 154
return buffer + StrategyRouter(strategyRouter).totalAssets();

// Linea 160 - Llamada externa innecesaria
uint256 _totalAssets = this.totalAssets();
```

**Riesgo:**
- Mayor consumo de gas
- Potencial vector de reentrancy (aunque menor)

**Solucion recomendada:**
Crear funcion interna `_totalAssets()` y usarla internamente:

```solidity
function _totalAssets() internal view returns (uint256) {
    return buffer + StrategyRouter(strategyRouter).totalAssets();
}

function totalAssets() external view returns (uint256) {
    return _totalAssets();
}
```

### 1.4 Falta Validacion en Constructor

**Ubicacion:** Constructor lineas 128-151

**Problema:**
No se valida que `_strategyRouter` y `_configManager` sean contratos validos:

```solidity
constructor(...) {
    // Sin validacion de que sean contratos
    strategyRouter = _strategyRouter;
    configManager = _configManager;
}
```

**Solucion recomendada:**
```solidity
constructor(...) {
    require(_strategyRouter != address(0), "Invalid router");
    require(_configManager != address(0), "Invalid config");
    require(_strategyRouter.code.length > 0, "Router not contract");
    require(_configManager.code.length > 0, "Config not contract");
    // ...
}
```

### 1.5 Bloqueo Total de Retiros con Alocaciones (MEDIO)

**Ubicacion:** `_revertIfAllocatedShares()` lineas 403-410

**Problema:**
La logica actual bloquea TODOS los retiros si el usuario tiene CUALQUIER alocacion:

```solidity
function _revertIfAllocatedShares(address _owner, uint256 /* _requestedShares */) internal view {
    uint256 userTotalAllocated = router.getUserTotalAllocated(_owner);
    if (userTotalAllocated == 0) return;
    // Revierte siempre que haya alocacion, sin importar el monto
    revert dBank__SharesAllocated(allocatedShares);
}
```

**Riesgo:**
- UX pobre - usuarios no pueden retirar parcialmente
- El parametro `_requestedShares` no se usa

**Solucion recomendada:**
Permitir retiros parciales hasta el balance no alocado:

```solidity
function _revertIfAllocatedShares(address _owner, uint256 _requestedShares) internal view {
    uint256 userTotalAllocated = router.getUserTotalAllocated(_owner);
    if (userTotalAllocated == 0) return;

    uint256 allocatedShares = this.convertToShares(userTotalAllocated);
    uint256 availableShares = balanceOf[_owner] - allocatedShares;

    if (_requestedShares > availableShares) {
        revert dBank__SharesAllocated(allocatedShares);
    }
}
```

---

## 2. StrategyRouter.sol - Router de Estrategias

### 2.1 Sin Control de Acceso en depositToStrategy (ALTO)

**Ubicacion:** `depositToStrategy()` lineas 286-319

**Problema:**
Cualquier address puede llamar esta funcion:

```solidity
function depositToStrategy(uint256 _strategyId, uint256 _amount)
    external  // Sin modifier de acceso
    returns (uint256)
{
    // ...
}
```

**Riesgo:**
- Usuarios pueden depositar directamente sin pasar por el vault
- El tracking de `userStrategyAllocations` se desincroniza
- Posible manipulacion de caps

**Solucion recomendada:**
```solidity
address public vault;

modifier onlyVaultOrOwner() {
    require(msg.sender == vault || msg.sender == owner, "Unauthorized");
    _;
}

function depositToStrategy(...) external onlyVaultOrOwner returns (uint256) {
    // ...
}
```

### 2.2 Low-level Calls sin Verificacion Completa (MEDIO)

**Ubicacion:** `depositToStrategy()` lineas 305-308

**Problema:**
```solidity
(bool success, ) = strategies[_strategyId].call(
    abi.encodeWithSignature("depositToStrategy(uint256)", _amount)
);
require(success, "Strategy deposit failed");
```

**Riesgo:**
- Solo se verifica `success`, no el return data
- Si la estrategia revierte con mensaje, se pierde informacion

**Solucion recomendada:**
```solidity
(bool success, bytes memory returnData) = strategies[_strategyId].call(
    abi.encodeWithSignature("depositToStrategy(uint256)", _amount)
);
if (!success) {
    if (returnData.length > 0) {
        assembly {
            revert(add(returnData, 32), mload(returnData))
        }
    }
    revert("Strategy deposit failed");
}
```

### 2.3 Iteracion sobre MAX_STRATEGIES Fija (BAJO)

**Ubicacion:** `totalAssets()` lineas 133-163

**Problema:**
```solidity
for (uint256 i = 1; i <= MAX_STRATEGIES; i++) {
    // Itera sobre 10 slots aunque solo haya 1 estrategia
}
```

**Riesgo:**
- Consumo de gas innecesario
- Si MAX_STRATEGIES aumenta, puede causar out-of-gas

**Solucion recomendada:**
Usar un array dinamico de estrategias activas o iterar solo hasta `totalStrategies`.

---

## 3. ConfigManager.sol - Gestor de Configuracion

### 3.1 Inconsistencia de Decimales (CRITICO)

**Ubicacion:** Variables de estado lineas 56-65

**Problema:**
```solidity
uint256 public tvlGlobalCap = 100000e6;  // 6 decimales (USDC)
uint256 public perTxCap = 5000e6;        // 6 decimales
uint256 public strategyCapS1 = 100000e6; // 6 decimales
```

Pero en dBank y tests se usan 18 decimales:
```javascript
// test/unit/dBank.js
const depositAmount = tokens(10000); // tokens() usa parseUnits(..., 18)
```

**Riesgo:**
- Caps completamente incorrectos al deployar con USDC real
- Un perTxCap de 5000e6 = 0.000000005 ETH con 18 decimales
- Usuarios podrian depositar cantidades enormes

**Solucion recomendada:**
Decidir una estrategia de decimales:

Opcion A: Usar decimales del token
```solidity
uint8 public tokenDecimals;

constructor(uint8 _tokenDecimals) {
    tokenDecimals = _tokenDecimals;
    // Ajustar caps segun decimales
}
```

Opcion B: Normalizar todo a 18 decimales internamente
```solidity
uint256 public tvlGlobalCap = 100000e18;
uint256 public perTxCap = 5000e18;
```

### 3.2 Sin Funcion para Remover Allowed Venues (BAJO)

**Ubicacion:** `addAllowedVenue()` linea 359

**Problema:**
Solo existe `addAllowedVenue()`, no hay forma de remover venues:

```solidity
function addAllowedVenue(address _venue) external onlyOwner returns(bool success) {
    allowedVenues.push(_venue);
    // No hay funcion para remover
}
```

**Solucion recomendada:**
```solidity
function removeAllowedVenue(uint256 index) external onlyOwner {
    require(index < allowedVenues.length, "Index out of bounds");
    allowedVenues[index] = allowedVenues[allowedVenues.length - 1];
    allowedVenues.pop();
}
```

### 3.3 Tipo uint8 para maxSlippageBps (BAJO)

**Ubicacion:** Linea 57

**Problema:**
```solidity
uint8 public maxSlippageBps = 30;  // Max 255, pero MAX_SLIPPAGE_BPS = 500
```

El tipo `uint8` tiene maximo 255, pero la constante permite hasta 500.

**Solucion recomendada:**
```solidity
uint16 public maxSlippageBps = 30;
```

---

## 4. MockS1.sol - Estrategia Mock

### 4.1 Sin Transferencia Real de Tokens (ALTO - Por diseño)

**Ubicacion:** `depositToStrategy()` y `withdrawFromStrategy()`

**Problema documentado:**
La estrategia es virtual - no maneja tokens reales:

```solidity
function depositToStrategy(uint256 _amount) external {
    // Solo actualiza principal, NO transfiere tokens
    principal += _amount;
}
```

**Riesgo:**
- El router debe tener tokens suficientes para cubrir yields
- No es adecuado para produccion

**Recomendacion:**
Documentar claramente en comments y README que es solo para testing.

### 4.2 Codigo Duplicado en _accrue y _accrueView (MEDIO)

**Ubicacion:** Lineas 111-164 y 166-209

**Problema:**
Ambas funciones tienen logica casi identica (~50 lineas duplicadas).

**Solucion recomendada:**
```solidity
function _calculateAccruedFactor(uint256 dt) internal view returns (uint256) {
    if (dt == 0 || aprBps == 0 || principal == 0) return accumulator;

    uint256 absApr = aprBps > 0 ? uint256(aprBps) : uint256(-aprBps);
    uint256 ratePerSecondScaled = absApr * SCALE / (10_000 * YEAR);
    uint256 deltaScaled = ratePerSecondScaled * dt;

    if (aprBps > 0) {
        return accumulator * (SCALE + deltaScaled) / SCALE;
    } else {
        uint256 factor = SCALE > deltaScaled ? SCALE - deltaScaled : 0;
        return accumulator * factor / SCALE;
    }
}
```

---

## 5. Token.sol - Token Mock

### 5.1 Import de Hardhat Console en Produccion (BAJO)

**Ubicacion:** Linea 4

**Problema:**
```solidity
import "hardhat/console.sol";
```

**Riesgo:**
- No es necesario en produccion
- Aumenta tamano del bytecode

**Solucion:**
Remover el import antes de deployment.

### 5.2 Sin Funcion Burn (BAJO)

**Problema:**
No hay forma de quemar tokens, lo cual puede ser necesario para el vault.

---

## 6. Resumen de Prioridades

| Prioridad | Issue | Contrato | Linea |
|-----------|-------|----------|-------|
| CRITICO | Reentrancy en withdraw/redeem | dBank.sol | 263-334 |
| CRITICO | Fees no implementadas | dBank.sol | 436-442 |
| CRITICO | Inconsistencia decimales | ConfigManager.sol | 56-65 |
| ALTO | Sin control acceso depositToStrategy | StrategyRouter.sol | 286 |
| ALTO | MockS1 virtual sin tokens | MockS1.sol | 91-107 |
| MEDIO | Llamadas this.function() | dBank.sol | Multiple |
| MEDIO | Bloqueo total retiros con alocacion | dBank.sol | 403-410 |
| BAJO | Import hardhat/console | Token.sol | 4 |
| BAJO | uint8 para slippage | ConfigManager.sol | 57 |

---

## 7. Checklist de Seguridad Pre-Deployment

- [ ] Agregar ReentrancyGuard a funciones criticas
- [ ] Implementar logica de performance fees
- [ ] Alinear decimales entre contratos
- [ ] Agregar control de acceso al router
- [ ] Validar contratos en constructores
- [ ] Remover imports de desarrollo
- [ ] Ejecutar slither/mythril para analisis estatico
- [ ] Obtener auditoria profesional
