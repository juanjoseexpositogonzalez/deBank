# x402 Facilitator para dBank

Servicio facilitador propio para verificación y liquidación de pagos x402.

## Instalación

```bash
npm install
```

## Configuración

1. Copiar `.env.example` a `.env`
2. Configurar variables de entorno:
   - `FACILITATOR_PORT`: Puerto del servidor (default: 4022)
   - `NETWORK`: Red CAIP-2 (default: eip155:84532)
   - `BASE_SEPOLIA_RPC_URL`: URL del RPC de Base Sepolia
   - `USDC_ADDRESS`: Dirección del contrato USDC EIP-3009
   - `DATABASE_PATH`: Ruta a la base de datos SQLite

## Uso

```bash
# Desarrollo
npm run dev

# Producción
npm start
```

## Endpoints

- `GET /health`: Health check
- `POST /verify`: Verificar y liquidar pagos x402

## Ver más

Ver `docs/X402_FACILITATOR.md` para documentación completa.
