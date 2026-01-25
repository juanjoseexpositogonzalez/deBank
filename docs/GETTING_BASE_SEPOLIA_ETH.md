# Cómo Obtener ETH en Base Sepolia

Guía para obtener ETH en Base Sepolia para gas y desplegar contratos.

## 🌉 Opción 1: Bridge desde Sepolia (Recomendado)

### Bridge Oficial de Base

**Base Sepolia Bridge**: https://bridge.base.org/deposit

1. Conecta tu wallet
2. Selecciona "Sepolia" como red origen
3. Selecciona "Base Sepolia" como red destino
4. Ingresa la cantidad de ETH que quieres bridgear
5. Confirma la transacción
6. Espera la confirmación (puede tomar unos minutos)

### Otros Bridges

- **Base Sepolia Testnet Bridge**: Algunos bridges de terceros también soportan Sepolia → Base Sepolia
- Verifica siempre que estés usando el bridge oficial o uno confiable

## 💧 Opción 2: Faucets de Base Sepolia

Si solo necesitas ETH para gas (no necesitas mucho), puedes usar faucets:

### Faucet Oficial de Coinbase

1. Ve a: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
2. Conecta tu wallet
3. Selecciona Base Sepolia
4. Solicita ETH de prueba
5. Recibirás ETH en unos minutos

### Otros Faucets

- **Base Sepolia Faucet**: https://www.alchemy.com/faucets/base-sepolia
- **Chainlink Faucet**: https://faucets.chain.link/base-sepolia
- **QuickNode Faucet**: https://faucet.quicknode.com/base/sepolia

**Nota**: Los faucets suelen tener límites diarios (ej: 0.1-0.5 ETH por día)

## 🔄 Opción 3: Bridge Manual (Avanzado)

Si prefieres hacerlo manualmente:

1. **En Sepolia:**
   - Envía ETH a un contrato bridge específico
   - Espera confirmación

2. **En Base Sepolia:**
   - Reclama los fondos usando el mismo contrato bridge
   - Los fondos aparecerán en tu wallet

## 💡 Recomendación

Para desarrollo/testing:
- **Usa faucets** si solo necesitas ETH para gas (más rápido)
- **Usa bridge** si necesitas más cantidad o quieres mover fondos existentes

Para producción:
- Siempre usa el bridge oficial de Base

## ⚠️ Importante

- **Base Sepolia es una red de prueba**: Los tokens no tienen valor real
- **Verifica siempre la red**: Asegúrate de estar en Base Sepolia (Chain ID: 84532)
- **Gas fees**: Son muy bajos en Base Sepolia (similar a Sepolia)
- **Tiempo de bridge**: Puede tomar 5-15 minutos dependiendo del tráfico

## 📝 Checklist

Antes de desplegar contratos:

- [ ] Tienes ETH en Base Sepolia (mínimo 0.01 ETH recomendado)
- [ ] Tu wallet está conectada a Base Sepolia (84532)
- [ ] Has verificado el balance en Basescan: https://sepolia.basescan.org
- [ ] Tienes las direcciones de contratos listas para `config.json`

## 🔗 Enlaces Útiles

- **Base Sepolia Explorer**: https://sepolia.basescan.org
- **Base Sepolia RPC**: https://sepolia.base.org
- **Base Bridge**: https://bridge.base.org/deposit
- **Coinbase Faucet**: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet

## 🚀 Después de Obtener ETH

Una vez que tengas ETH en Base Sepolia:

1. **Desplegar contratos:**
   ```bash
   npx hardhat run scripts/deploy.js --network baseSepolia
   ```

2. **Actualizar config.json:**
   - Añade las direcciones desplegadas para chainId `84532`

3. **Seed inicial (opcional):**
   ```bash
   npx hardhat run scripts/seed.js --network baseSepolia
   ```

4. **Verificar contratos (opcional):**
   ```bash
   npx hardhat verify --network baseSepolia <CONTRACT_ADDRESS>
   ```
