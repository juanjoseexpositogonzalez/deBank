# Guía de Implementación x402 para dBank

Esta guía te lleva paso a paso a través de la implementación completa de x402 en dBank.

## Prerrequisitos

- Node.js 18+ y npm
- Wallet con USDC en Base Sepolia (para testing)
- Cuenta en Coinbase Developer Platform (opcional, para facilitador CDP)
- RPC endpoint para Base Sepolia (Alchemy/Infura o público)

## Paso 1: Configuración de Red Base Sepolia

### 1.1 Actualizar Hardhat

El archivo `hardhat.config.js` ya está configurado con Base Sepolia. Verifica que tengas:

```javascript
baseSepolia: {
  url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
  accounts: privateKeys.split(":").filter(key => key !== ""),
  chainId: 84532
}
```

### 1.2 Configurar Variables de Entorno

Crea o actualiza `.env` en la raíz del proyecto:

```env
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
# O usa Alchemy/Infura:
# BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEYS=0x...:0x...
```

### 1.3 Desplegar Contratos

```bash
npx hardhat run scripts/deploy.js --network baseSepolia
```

Actualiza `src/config.json` con las direcciones desplegadas:

```json
{
  "84532": {
    "token": {
      "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    },
    "dbank": {
      "address": "<DEPLOYED_ADDRESS>"
    },
    ...
  }
}
```

## Paso 2: Configurar Facilitador

### 2.1 Instalar Dependencias

```bash
cd facilitator
npm install
```

**Nota**: Los paquetes `@x402/*` pueden requerir instalación desde GitHub:
```bash
npm install @coinbase/x402#main --save
# O desde npm cuando estén disponibles:
# npm install @x402/core @x402/evm
```

### 2.2 Configurar Variables de Entorno

```bash
cd facilitator
cp .env.example .env
```

Edita `.env`:

```env
FACILITATOR_PORT=4022
NETWORK=eip155:84532
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
DATABASE_PATH=./facilitator.db
MAX_PAYMENT_AGE_SECONDS=300
```

### 2.3 Iniciar Facilitador

```bash
npm start
# O en modo desarrollo:
npm run dev
```

Verifica que esté corriendo:

```bash
curl http://localhost:4022/health
```

Deberías ver:
```json
{
  "status": "ok",
  "network": "eip155:84532",
  "timestamp": "..."
}
```

## Paso 3: Configurar Backend

### 3.1 Instalar Dependencias

```bash
cd backend
npm install
```

### 3.2 Configurar Variables de Entorno

```bash
cd backend
cp .env.example .env
```

Edita `.env`:

```env
PORT=4021
FACILITATOR_URL=http://localhost:4022
NETWORK=eip155:84532
TREASURY_WALLET=0x...  # Tu wallet tesorería
TREASURY_PRIVATE_KEY=0x...  # Private key del wallet tesorería
DBANK_ADDRESS=0x...  # Dirección del contrato dBank desplegado
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
MIN_DEPOSIT_USD=1.00
MAX_DEPOSIT_USD=10000.00
```

**⚠️ IMPORTANTE**: 
- El `TREASURY_WALLET` debe tener USDC en Base Sepolia
- El `TREASURY_PRIVATE_KEY` debe ser del wallet tesorería
- Nunca commitees el `.env` con claves privadas

### 3.3 Habilitar Middleware x402

Una vez instaladas las dependencias `@x402/*`, descomenta el código en `backend/src/server.js`:

```javascript
const { paymentMiddleware, x402ResourceServer } = require('@x402/express');
const { ExactEvmScheme } = require('@x402/evm/exact/server');
const { HTTPFacilitatorClient } = require('@x402/core/server');

const facilitatorClient = new HTTPFacilitatorClient({
  url: config.facilitatorUrl,
});

const server = new x402ResourceServer(facilitatorClient)
  .register(config.network, new ExactEvmScheme());

app.use(paymentMiddleware({
  'POST /api/x402/deposit': {
    accepts: [{
      scheme: 'exact',
      price: '$1.00',
      network: config.network,
      payTo: config.treasuryWallet,
    }],
    description: 'Deposit funds to dBank vault via x402',
    mimeType: 'application/json',
  },
}, server));
```

### 3.4 Iniciar Backend

```bash
npm start
# O en modo desarrollo:
npm run dev
```

Verifica que esté corriendo:

```bash
curl http://localhost:4021/health
```

## Paso 4: Script de Inicio Automático

Usa el script proporcionado para iniciar ambos servicios:

```bash
./scripts/start-x402.sh
```

Este script:
- Verifica dependencias
- Crea `.env` desde `.env.example` si no existen
- Instala dependencias si faltan
- Inicia facilitador y backend
- Muestra logs y PIDs

Para detener:
```bash
# Encuentra los PIDs
ps aux | grep "node.*server.js"

# O usa los PIDs mostrados por el script
kill <FACILITATOR_PID> <BACKEND_PID>
```

## Paso 5: Testing Manual

### 5.1 Test del Facilitador

```bash
# Health check
curl http://localhost:4022/health

# Verificar pago (requiere PAYMENT-SIGNATURE válido)
curl -X POST http://localhost:4022/verify \
  -H "Content-Type: application/json" \
  -d '{
    "paymentSignature": "...",
    "paymentRequest": {...}
  }'
```

### 5.2 Test del Backend

```bash
# Health check
curl http://localhost:4021/health

# Intentar depósito (debería retornar 402 sin pago)
curl -X POST http://localhost:4021/api/x402/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "10.00",
    "userAddress": "0x...",
    "requestId": "test-1"
  }'
```

## Paso 6: Troubleshooting

### Facilitador no inicia

1. Verifica que el puerto 4022 esté libre:
   ```bash
   lsof -i :4022
   ```

2. Revisa logs:
   ```bash
   tail -f facilitator.log
   ```

3. Verifica variables de entorno:
   ```bash
   cd facilitator && cat .env
   ```

### Backend no inicia

1. Verifica que el puerto 4021 esté libre
2. Verifica que el facilitador esté corriendo
3. Revisa que `TREASURY_PRIVATE_KEY` y `DBANK_ADDRESS` estén configurados
4. Revisa logs: `tail -f backend.log`

### Error "Contract not deployed"

- Verifica que `DBANK_ADDRESS` en `.env` sea correcto
- Verifica que el contrato esté desplegado en Base Sepolia:
  ```bash
  npx hardhat verify --network baseSepolia <ADDRESS>
  ```

### Error "Insufficient balance"

- El wallet tesorería necesita USDC en Base Sepolia
- Obtén USDC de testnet faucet o transfiere desde otro wallet

## Paso 7: Próximos Pasos

1. ✅ Facilitador y backend funcionando
2. ⏳ Integrar frontend con cliente x402
3. ⏳ Tests de integración end-to-end
4. ⏳ Despliegue en producción

## Referencias

- [Documentación x402](https://docs.cdp.coinbase.com/x402/docs/welcome)
- [x402 GitHub](https://github.com/coinbase/x402)
- [Base Sepolia Explorer](https://sepolia.basescan.org)
