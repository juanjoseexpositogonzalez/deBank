# SEED.md

Guía para ejecutar el seeding de dBank en local (Hardhat) y en Sepolia.

## Qué hace el script `scripts/seed.js`
Automatiza:
- Fondos a cuentas de prueba.
- Allowances al vault.
- Configuración inicial de `dBank` y `ConfigManager`.
- Depósitos iniciales para tener `assets` y `shares`.
- Validaciones finales de estado (totalAssets, buffer, router).

## De dónde salen las direcciones
Prioridad:  
1. Variables de entorno: si defines `token`, `dbank`, `strategyRouter`, `configManager`, `mockS1` (las mismas keys que en `config.json`) esas toman prioridad.  
2. `src/config.json` en la clave del `chainId` (p. ej. `31337` para Hardhat, `11155111` para Sepolia).

No se usan argv posicionales; Hardhat inyecta sus propios argumentos y antes causaba que se tomaran direcciones de Hardhat en Sepolia.

## Preparación
1) Asegura que `src/config.json` tenga las direcciones correctas para la red que usarás.  
2) Confirma que esos contratos existen on-chain (el script valida con `getCode` y aborta si falta bytecode).  
3) La cuenta deployer necesita gas suficiente (ETH en la red correspondiente).

## Ejecución
Hardhat local:
```bash
npx hardhat run scripts/seed.js --network localhost
```

Sepolia (usando las direcciones de `src/config.json`):
```bash
npx hardhat run scripts/seed.js --network sepolia
```

Sepolia con override puntual por entorno (usa las mismas keys que `config.json`):
```bash
token=0x... \
dbank=0x... \
strategyRouter=0x... \
configManager=0x... \
mockS1=0x... \
npx hardhat run scripts/seed.js --network sepolia
```

## Diferencias por red
- Hardhat: montos grandes (100k por usuario, depósitos 10k/5k/3k, allowances 1M).
- Sepolia: montos reducidos para no gastar balance (500 por usuario, depósitos 100/50/30, allowances 1k, caps más bajos en vault y router).
- El script detecta la red (`chainId`) y ajusta estos valores.

## Pasos internos (resumen)
1) Valida que hay bytecode en cada dirección (Token, dBank, StrategyRouter, ConfigManager, MockS1 si se pasa).  
2) Funde hasta 3 cuentas de prueba (montos según red).  
3) Configura allowances hacia dBank (más bajos en Sepolia).  
4) Configura `ConfigManager` y `dBank` solo si el deployer es owner (liquidityBuffer, slippage, caps, fees, etc.).  
5) Registra/valida estrategias en `StrategyRouter` (MockS1 esperada en ID 1).  
6) Ejecuta depósitos iniciales desde las cuentas de prueba.  
7) Muestra estado final (totalAssets, totalSupply, buffer, router assets, pricePerShare) y balances por usuario.

## Validaciones rápidas tras el seeding
- `totalAssets` ≈ `buffer + router.totalAssets` (tolerancia 0.001 tokens).  
- `pricePerShare` cercano a 1 si el vault arranca sin rendimiento.  
- Estrategia S1 registrada y activa (si se desplegó MockS1).  
- Los usuarios muestran balances de tokens y shares acorde a los depósitos.

## Si falla
- Mensaje “No contract code at …”: revisa que `src/config.json` tenga direcciones válidas para esa red o exporta las direcciones correctas en ENV.  
- Falta de gas: añade ETH a la cuenta deployer (faucet en testnet).  
- Allowance/depósitos insuficientes: revisa que los montos reducidos en Sepolia sean coherentes con el balance del token deployer.  
- Owner distinto: si el deployer no es owner de `ConfigManager`/`dBank`, esas configuraciones se omiten (se avisa en consola).

