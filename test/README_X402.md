# Tests x402

Guía para ejecutar y entender los tests de x402.

## Estructura de Tests

### Tests Unitarios

- `test/unit/Facilitator.js`: Tests unitarios del facilitador
  - Parsing de PAYMENT-SIGNATURE
  - Operaciones de base de datos
  - Verificación de payment requests

- `test/unit/Backend.js`: Tests unitarios del backend
  - Validación de requests de depósito
  - Idempotencia
  - Registro de pagos

### Tests de Integración

- `test/integration/X402Flow.js`: Tests de flujo x402
  - Flujo completo de depósito
  - Idempotencia
  - Yield accrual con x402

- `test/integration/X402EndToEnd.js`: Tests end-to-end
  - Requiere facilitador y backend corriendo
  - Health checks de servicios
  - Endpoints de API
  - Flujo completo simulado

## Ejecutar Tests

### Tests Unitarios

```bash
# Todos los tests unitarios
npx hardhat test test/unit/Facilitator.js
npx hardhat test test/unit/Backend.js

# Test específico
npx hardhat test test/unit/Facilitator.js --grep "parsePaymentSignature"
```

### Tests de Integración

```bash
# Test de flujo (no requiere servicios corriendo)
npx hardhat test test/integration/X402Flow.js

# Test end-to-end (requiere servicios corriendo)
# 1. Iniciar servicios primero:
./scripts/start-x402.sh

# 2. En otra terminal, ejecutar tests:
npx hardhat test test/integration/X402EndToEnd.js
```

### Todos los Tests x402

```bash
# Tests unitarios y de integración (sin end-to-end)
npx hardhat test test/unit/Facilitator.js test/unit/Backend.js test/integration/X402Flow.js
```

## Helpers de Test

El archivo `test/helpers/x402Helpers.js` proporciona funciones útiles:

- `checkX402Services()`: Verifica si servicios están corriendo
- `createMockPaymentRequest()`: Crea payment request mock
- `createMockPaymentSignature()`: Crea signature mock
- `waitForTransaction()`: Espera confirmación de transacción
- `getUserShares()`: Obtiene shares del usuario
- `getUserBalance()`: Obtiene balance de tokens
- `fundAddress()`: Transfiere tokens a una dirección

## Configuración

Los tests usan variables de entorno opcionales:

```bash
FACILITATOR_URL=http://localhost:4022
BACKEND_URL=http://localhost:4021
```

Si no se especifican, usan los valores por defecto.

## Notas

1. **Tests End-to-End**: Requieren que facilitador y backend estén corriendo. Si no están disponibles, los tests se saltan automáticamente.

2. **Mock Data**: Los tests usan datos mock para payment signatures. Para tests reales, necesitarías firmas EIP-3009 válidas.

3. **Network**: Los tests están diseñados para funcionar en cualquier red (localhost, Sepolia, Base Sepolia). Ajusta según necesidad.

4. **Dependencias**: Asegúrate de tener `axios` instalado para tests end-to-end:
   ```bash
   npm install --save-dev axios
   ```

## Troubleshooting

### Error: "Cannot find module 'axios'"

```bash
npm install --save-dev axios
```

### Tests end-to-end se saltan

Verifica que los servicios estén corriendo:
```bash
curl http://localhost:4022/health
curl http://localhost:4021/health
```

### Error en tests de base de datos

Los tests de base de datos usan SQLite en memoria. Si hay problemas, verifica permisos de escritura.
