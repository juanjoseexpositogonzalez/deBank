# x402 Backend para dBank

Servicio backend que acepta pagos x402 y ejecuta depósitos en el contrato dBank.

## Instalación

```bash
npm install
```

## Configuración

1. Copiar `.env.example` a `.env`
2. Configurar variables de entorno:
   - `PORT`: Puerto del servidor (default: 4021)
   - `FACILITATOR_URL`: URL del facilitador (default: http://localhost:4022)
   - `NETWORK`: Red CAIP-2 (default: eip155:84532)
   - `TREASURY_WALLET`: Dirección del wallet tesorería
   - `TREASURY_PRIVATE_KEY`: Private key del wallet tesorería
   - `DBANK_ADDRESS`: Dirección del contrato dBank
   - `BASE_SEPOLIA_RPC_URL`: URL del RPC de Base Sepolia
   - `MIN_DEPOSIT_USD`: Depósito mínimo en USD
   - `MAX_DEPOSIT_USD`: Depósito máximo en USD

## Uso

```bash
# Desarrollo
npm run dev

# Producción
npm start
```

## Endpoints

- `GET /health`: Health check
- `POST /api/x402/deposit`: Endpoint protegido por x402 para depósitos

## Nota

El middleware x402 está comentado en `server.js` hasta que se instalen las dependencias `@x402/express`, `@x402/evm`, y `@x402/core`.

## Ver más

Ver `docs/X402_IMPLEMENTATION_GUIDE.md` para documentación completa.
