# Guía de Pruebas x402 en la DApp

Esta guía te ayudará a probar la integración x402 en la DApp paso a paso.

## Opción 1: Pruebas en Base Sepolia (Recomendado)

### Paso 1: Configurar Facilitador

1. **Crear archivo `.env` en `facilitator/`**:
```bash
cd facilitator
cp .env.example .env
```

2. **Editar `facilitator/.env`**:
```env
FACILITATOR_PORT=4022
NETWORK=eip155:84532
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
DATABASE_PATH=./facilitator.db
MAX_PAYMENT_AGE_SECONDS=300
```

### Paso 2: Configurar Backend

1. **Crear archivo `.env` en `backend/`**:
```bash
cd backend
cp .env.example .env
```

2. **Editar `backend/.env`**:
```env
PORT=4021
FACILITATOR_URL=http://localhost:4022
NETWORK=eip155:84532
TREASURY_WALLET=0xTU_DIRECCION_TREASURY
TREASURY_PRIVATE_KEY=0xTU_PRIVATE_KEY_TREASURY
DBANK_ADDRESS=0xDIRECCION_DBANK_DESPLEGADO
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
MIN_DEPOSIT_USD=1.00
MAX_DEPOSIT_USD=10000.00
```

**⚠️ IMPORTANTE**: 
- `TREASURY_WALLET`: Debe ser una dirección con USDC en Base Sepolia
- `TREASURY_PRIVATE_KEY`: La clave privada de esa wallet (solo para testing)
- `DBANK_ADDRESS`: Dirección del contrato dBank desplegado en Base Sepolia

### Paso 3: Desplegar Contratos en Base Sepolia

1. **Obtener faucet de Base Sepolia**:
   - Ve a https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
   - Obtén ETH para gas

2. **Obtener USDC de prueba**:
   - El USDC en Base Sepolia está en: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
   - Puedes usar un faucet o bridge desde Sepolia

3. **Desplegar contratos**:
```bash
# Asegúrate de tener Base Sepolia configurado en hardhat.config.js
npx hardhat run scripts/deploy.js --network baseSepolia
```

4. **Actualizar `src/config.json`** con las direcciones desplegadas:
```json
"84532": {
  "token": {
    "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
  },
  "dbank": {
    "address": "0xDIRECCION_DBANK_DESPLEGADA"
  },
  "strategyRouter": {
    "address": "0xDIRECCION_STRATEGY_ROUTER_DESPLEGADA"
  },
  "configManager": {
    "address": "0xDIRECCION_CONFIG_MANAGER_DESPLEGADA"
  },
  "mockS1": {
    "address": "0xDIRECCION_MOCK_S1_DESPLEGADA"
  },
  "x402": {
    "facilitatorUrl": "http://localhost:4022",
    "treasuryWallet": "0xTU_DIRECCION_TREASURY",
    "backendUrl": "http://localhost:4021"
  }
}
```

### Paso 4: Preparar Treasury Wallet

1. **Crear o usar una wallet para treasury**:
   - Debe tener ETH para gas en Base Sepolia
   - Debe tener USDC (token de prueba) para hacer depósitos
   - Aprobar dBank para gastar USDC:
   ```javascript
   // En la consola del navegador o usando ethers
   const usdc = await ethers.getContractAt('Token', '0x036CbD53842c5426634e7929541eC2318f3dCF7e');
   await usdc.approve(DBANK_ADDRESS, ethers.constants.MaxUint256);
   ```

### Paso 5: Instalar Dependencias

```bash
# En la raíz del proyecto
npm install

# En facilitator
cd facilitator
npm install

# En backend
cd ../backend
npm install
```

### Paso 6: Iniciar Servicios

**Opción A: Script automático** (recomendado):
```bash
./scripts/start-x402.sh
```

**Opción B: Manual**:
```bash
# Terminal 1: Facilitador
cd facilitator
npm start

# Terminal 2: Backend
cd backend
npm start

# Terminal 3: Frontend
npm start
```

### Paso 7: Probar en la DApp

1. **Conectar wallet a Base Sepolia**:
   - Abre MetaMask o tu wallet
   - Cambia a la red Base Sepolia (Chain ID: 84532)
   - Si no está configurada, añádela:
     - Network Name: Base Sepolia
     - RPC URL: https://sepolia.base.org
     - Chain ID: 84532
     - Currency Symbol: ETH
     - Block Explorer: https://sepolia.basescan.org

2. **Navegar a la página de Deposit**:
   - Abre la DApp (normalmente http://localhost:3000)
   - Ve a la sección "Deposit"

3. **Activar x402**:
   - Verás un switch/toggle para "Usar x402"
   - Actívalo
   - Deberías ver información sobre x402

4. **Hacer un depósito**:
   - Ingresa un monto (ej: 10 USDC)
   - Haz clic en "Deposit"
   - Tu wallet pedirá firmar un mensaje (EIP-3009)
   - Acepta la firma
   - El backend procesará el pago y hará el depósito
   - Verás la transacción confirmada

5. **Verificar**:
   - Revisa tu balance de shares en dBank
   - Verifica la transacción en Basescan
   - Revisa los logs del backend y facilitador

## Opción 2: Pruebas en Localhost (Desarrollo)

Para desarrollo local, puedes usar Hardhat local network:

### Paso 1: Configurar para Localhost

1. **Modificar `facilitator/.env`**:
```env
NETWORK=eip155:31337
BASE_SEPOLIA_RPC_URL=http://localhost:8545
USDC_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3  # Token local
```

2. **Modificar `backend/.env`**:
```env
NETWORK=eip155:31337
BASE_SEPOLIA_RPC_URL=http://localhost:8545
DBANK_ADDRESS=0x0165878A594ca255338adfa4d48449f69242Eb8F  # dBank local
```

3. **Actualizar `src/config.json`**:
```json
"31337": {
  "x402": {
    "facilitatorUrl": "http://localhost:4022",
    "treasuryWallet": "0xDIRECCION_TREASURY_LOCAL",
    "backendUrl": "http://localhost:4021"
  }
}
```

### Paso 2: Iniciar Blockchain Local

```bash
# Terminal 1: Hardhat node
npx hardhat node

# Terminal 2: Desplegar contratos
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/seed.js --network localhost
```

### Paso 3: Configurar Treasury en Localhost

El treasury debe ser una de las cuentas de Hardhat con fondos. Puedes usar la cuenta del deployer o crear una específica.

### Paso 4: Iniciar Servicios y Frontend

Igual que en la Opción 1, pero usando localhost.

## Troubleshooting

### Error: "x402 no está disponible"

- Verifica que estés en Base Sepolia (84532) o localhost (31337)
- Verifica que `src/config.json` tenga la configuración x402 para tu chainId

### Error: "Failed to fetch" al hacer depósito

- Verifica que el backend esté corriendo en `http://localhost:4021`
- Verifica que el facilitador esté corriendo en `http://localhost:4022`
- Revisa los logs del backend para más detalles

### Error: "Treasury balance insufficient"

- Asegúrate de que el treasury tenga USDC suficiente
- Verifica que el treasury haya aprobado dBank para gastar USDC

### Error: "Payment verification failed"

- Verifica que el facilitador esté corriendo
- Revisa los logs del facilitador
- Verifica que el USDC tenga soporte EIP-3009 (en Base Sepolia sí lo tiene)

### La wallet no pide firmar

- Verifica que tu wallet soporte EIP-3009 (`signTypedData`)
- Algunas wallets pueden requerir configuración adicional
- Prueba con MetaMask o Coinbase Wallet

### Los servicios no inician

- Verifica que los puertos 4021 y 4022 estén libres
- Revisa que las dependencias estén instaladas (`npm install` en cada directorio)
- Verifica que los archivos `.env` estén configurados correctamente

## Verificación de Logs

### Logs del Facilitador

```bash
# Ver logs en tiempo real
tail -f facilitator.log

# O si usas el script start-x402.sh, los logs aparecen en la terminal
```

### Logs del Backend

```bash
# Ver logs en tiempo real
tail -f backend.log

# O revisa la salida de la terminal donde corre el backend
```

Los logs incluyen:
- Requests recibidos
- Verificaciones de pago
- Transacciones on-chain
- Errores y warnings

## Próximos Pasos

Una vez que funcione en desarrollo:

1. **Testing exhaustivo**: Prueba diferentes montos, edge cases
2. **Monitoreo**: Configura alertas y monitoreo para producción
3. **Seguridad**: Revisa y audita el código antes de producción
4. **Documentación**: Actualiza la documentación con lecciones aprendidas

## Notas Importantes

⚠️ **SEGURIDAD**:
- Nunca expongas `TREASURY_PRIVATE_KEY` en producción
- Usa un wallet hardware o servicio de gestión de claves para producción
- Limita los montos de depósito según tu modelo de negocio

⚠️ **REDES**:
- Base Sepolia es una red de prueba
- Los tokens no tienen valor real
- Para producción, usa Base Mainnet (`eip155:8453`)

⚠️ **COSTOS**:
- El treasury paga el gas por cada depósito
- Considera esto en tu modelo de negocio
- Puedes cobrar una pequeña fee o absorber el costo
