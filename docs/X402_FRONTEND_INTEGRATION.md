# Integración Frontend x402

Guía de la integración x402 en el frontend de dBank.

## Componentes Modificados

### `src/components/Deposit.js`

**Cambios**:
- Añadido estado `useX402` para alternar entre depósito tradicional y x402
- Añadido estado `x402Loading` para manejar carga durante pago x402
- Añadido switch "Aportar con x402" (solo visible en Base Sepolia)
- Modificado `depositHandler` para usar `depositViaX402` cuando `useX402` está activo
- Añadido soporte para Base Sepolia en `explorerMap`

**UI**:
- Switch toggle para activar/desactivar x402
- Mensaje informativo sobre x402
- Mensaje de advertencia si x402 no está configurado pero la red es Base Sepolia
- Botón cambia texto según método seleccionado

### `src/store/interactions.js`

**Nueva función**: `depositViaX402`

**Características**:
- Verifica que la red sea Base Sepolia (84532)
- Carga configuración x402 desde `config.json`
- Importa dinámicamente `@x402/fetch` y `@x402/evm`
- Crea cliente x402 con signer viem
- Maneja automáticamente 402 Payment Required
- Genera `requestId` único para idempotencia
- Dispatch de acciones Redux para estado de depósito

**Flujo**:
1. Dispatch `depositRequest()`
2. Verificar red y configuración
3. Crear cliente x402 con signer
4. Hacer request al backend con `fetchWithPayment`
5. Cliente x402 maneja automáticamente el pago si recibe 402
6. Dispatch `depositSuccess()` con txHash
7. Retornar resultado

### `src/utils/x402Config.js`

**Nuevo archivo** con helpers:
- `getX402Config(chainId)`: Obtiene configuración x402
- `isX402Available(chainId)`: Verifica disponibilidad
- `getX402BackendUrl(chainId)`: Obtiene URL del backend
- `getX402FacilitatorUrl(chainId)`: Obtiene URL del facilitador

## Dependencias Añadidas

En `package.json`:
- `@x402/fetch`: Cliente x402 para fetch API
- `@x402/evm`: Soporte EVM para x402
- `viem`: Biblioteca para crear cuentas compatibles con x402

**Nota**: Estas dependencias pueden requerir instalación desde GitHub:
```bash
npm install github:coinbase/x402#main --save
```

## Configuración

La configuración x402 se lee desde `src/config.json`:

```json
{
  "84532": {
    "x402": {
      "facilitatorUrl": "http://localhost:4022",
      "treasuryWallet": "",
      "backendUrl": "http://localhost:4021"
    }
  }
}
```

## Uso

1. **Conectar wallet** a Base Sepolia (chainId: 84532)
2. **Navegar a Deposit**
3. **Activar switch** "Aportar con x402"
4. **Ingresar monto** en USDC
5. **Hacer clic** en "Aportar con x402"
6. **Firmar transacción** cuando el wallet lo solicite (EIP-3009)
7. **Esperar confirmación** del depósito on-chain

## Limitaciones Actuales

1. **Signer viem**: La creación del signer viem desde ethers puede no funcionar con todos los tipos de wallets. Para MetaMask, puede requerir configuración adicional.

2. **Dependencias**: Los paquetes `@x402/*` pueden no estar disponibles públicamente en npm aún. Puede requerir instalación desde GitHub.

3. **Solo Base Sepolia**: x402 solo está disponible en Base Sepolia por ahora.

## Troubleshooting

### Error: "x402 packages not installed"

**Solución**:
```bash
npm install @x402/fetch @x402/evm viem
# O desde GitHub:
npm install github:coinbase/x402#main --save
```

### Error: "Cannot access private key from provider"

**Causa**: El wallet (ej: MetaMask) no expone la private key por seguridad.

**Solución**: 
- Para desarrollo: Usa una cuenta de Hardhat local
- Para producción: El wallet debe soportar EIP-3009 signing directamente

### Error: "x402 backend URL not configured"

**Solución**: Verifica que `src/config.json` tenga la sección x402 para chainId 84532.

### El switch x402 no aparece

**Causa**: No estás en Base Sepolia o x402 no está configurado.

**Solución**: 
1. Cambia a Base Sepolia en tu wallet
2. Verifica `config.json` tiene configuración x402

## Próximos Pasos

1. Mejorar integración con MetaMask y otros wallets
2. Añadir soporte para múltiples redes (Base mainnet)
3. Mejorar manejo de errores y feedback al usuario
4. Añadir tests de componente para x402
