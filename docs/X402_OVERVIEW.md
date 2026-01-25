# x402 Overview para dBank

## ¿Qué es x402?

x402 es un protocolo de pago abierto desarrollado por Coinbase que permite pagos instantáneos y automáticos de stablecoins directamente sobre HTTP. Revive el código de estado HTTP 402 Payment Required, permitiendo que los servicios monetizen APIs y contenido digital on-chain.

## ¿Por qué usar x402 en dBank?

- **Pagos programáticos**: Los usuarios pueden aportar a dBank sin necesidad de cuentas o flujos de pago manuales complejos
- **Sin intermediarios**: Pagos directos on-chain sin fees adicionales (con facilitador propio)
- **Micropagos**: Permite aportes pequeños y frecuentes
- **AI-friendly**: Los agentes de IA pueden pagar automáticamente por acceso

## Flujo HTTP 402 Payment Required

1. El cliente (frontend) solicita un recurso del servidor (backend x402)
2. Si se requiere pago, el servidor responde con **402 Payment Required**, incluyendo instrucciones de pago en el header `PAYMENT-REQUIRED`
3. El cliente construye y envía un payload de pago vía el header `PAYMENT-SIGNATURE`
4. El servidor verifica y liquida el pago vía el facilitador. Si es válido, retorna el recurso solicitado

## Facilitadores

### Facilitador Propio (Recomendado)

Implementamos nuestro propio facilitador para:
- **Control total**: Sin dependencias de terceros
- **Costos reducidos**: Sin fees del facilitador de Coinbase
- **Customización**: Ajustar lógica de verificación y liquidación
- **Privacidad**: Datos de pagos no salen de nuestra infraestructura

### Facilitadores Públicos

- **x402.org testnet**: `https://x402.org/facilitator` (sin API key, solo testnet)
- **CDP Facilitator**: `https://api.cdp.coinbase.com/platform/v2/x402` (requiere API keys, producción)

## Redes y Tokens Soportados

### Base Sepolia (Testnet)
- **CAIP-2**: `eip155:84532`
- **USDC EIP-3009**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **RPC**: `https://sepolia.base.org`

### Base Mainnet (Producción)
- **CAIP-2**: `eip155:8453`
- **USDC EIP-3009**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

## Ventajas vs. Pagos Tradicionales

- ✅ **Sin chargebacks**: Pagos finales on-chain
- ✅ **Sin cuentas**: No requiere registro de usuarios
- ✅ **Bajos fees**: Solo gas de la blockchain
- ✅ **Programático**: Ideal para automatización y agentes IA
- ✅ **Compliance integrado**: KYT screening de Coinbase (si usas CDP facilitator)

## Referencias

- [Documentación oficial x402](https://docs.cdp.coinbase.com/x402/docs/welcome)
- [x402 GitHub](https://github.com/coinbase/x402)
- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009)
