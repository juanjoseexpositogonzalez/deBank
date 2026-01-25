# Guía de Testing x402 con Todo Desplegado

Esta guía te ayudará a probar la integración x402 cuando todo está desplegado en producción (Netlify + servicios backend).

## 📋 Prerrequisitos

1. **Contratos desplegados en Base Sepolia**
   - dBank
   - StrategyRouter
   - ConfigManager
   - MockS1
   - Direcciones actualizadas en `src/config.json` para chainId `84532`

2. **Servicios backend corriendo**
   - Facilitador x402 (puerto 4022)
   - Backend x402 (puerto 4021)
   - Ambos configurados con variables de entorno correctas

3. **Treasury Wallet configurada**
   - Tiene ETH para gas en Base Sepolia
   - Tiene USDC de prueba
   - Ha aprobado dBank para gastar USDC

4. **Frontend desplegado**
   - En Netlify o similar
   - Con Base Sepolia añadido al selector de red

## 🚀 Pasos para Probar

### Paso 1: Acceder al Frontend Desplegado

1. Abre la URL de tu frontend desplegado (ej: `https://tu-app.netlify.app`)
2. Conecta tu wallet (MetaMask o similar)

### Paso 2: Cambiar a Base Sepolia

1. **Usando el selector de red en el frontend:**
   - En la barra de navegación, selecciona "Base Sepolia" del dropdown
   - MetaMask pedirá confirmación para cambiar de red
   - Si Base Sepolia no está en MetaMask, se añadirá automáticamente

2. **O manualmente en MetaMask:**
   - Abre MetaMask
   - Click en el nombre de la red (arriba)
   - Click en "Add Network" o "Add a network manually"
   - Usa estos datos:
     - **Network Name**: Base Sepolia
     - **RPC URL**: `https://sepolia.base.org`
     - **Chain ID**: `84532`
     - **Currency Symbol**: `ETH`
     - **Block Explorer**: `https://sepolia.basescan.org`

### Paso 3: Verificar Configuración x402

1. Ve a la página de **Deposit**
2. Deberías ver:
   - Un switch/toggle para "Aportar con x402 (pago on-chain automático)"
   - Si no aparece, verifica que `src/config.json` tenga la configuración x402 para `84532`

### Paso 4: Obtener USDC de Prueba

Necesitas USDC en Base Sepolia para probar. Opciones:

**Opción A: Bridge desde Sepolia**
1. Ve a un bridge de Sepolia a Base Sepolia
2. Bridge algunos USDC de prueba

**Opción B: Usar un faucet**
- Busca faucets de Base Sepolia USDC
- El token USDC está en: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

**Opción C: Solicitar al treasury**
- Si tienes acceso al treasury wallet, puedes transferir USDC de prueba

### Paso 5: Hacer un Depósito x402

1. **Activa x402:**
   - En la página Deposit, activa el switch "Aportar con x402"

2. **Ingresa un monto:**
   - Ingresa un monto válido (ej: 10 USDC)
   - Verifica que esté dentro de los límites (MIN_DEPOSIT_USD - MAX_DEPOSIT_USD)

3. **Haz clic en "Aportar con x402":**
   - Tu wallet pedirá firmar un mensaje (EIP-3009)
   - **Acepta la firma**
   - El frontend enviará la request al backend x402

4. **Proceso automático:**
   - El backend verifica el pago con el facilitador
   - El facilitador confirma el pago on-chain
   - El backend ejecuta el depósito desde el treasury
   - Verás la confirmación en la UI

### Paso 6: Verificar el Depósito

1. **En la UI:**
   - Tu balance de shares debería aumentar
   - Deberías ver un mensaje de éxito

2. **En Basescan:**
   - Click en el link de la transacción
   - Verifica que la transacción fue exitosa
   - Verifica que el `from` es el treasury wallet
   - Verifica que el `to` es el contrato dBank

3. **En los logs del backend:**
   - Revisa los logs del backend para ver el proceso completo
   - Deberías ver: request recibido → pago verificado → depósito ejecutado

## 🔍 Troubleshooting

### Error: "x402 no está disponible"

**Causas posibles:**
- No estás en Base Sepolia (84532)
- `config.json` no tiene configuración x402 para 84532
- El backend no está corriendo o no es accesible

**Solución:**
1. Verifica que estés en Base Sepolia (84532)
2. Verifica `src/config.json` tiene:
   ```json
   "84532": {
     "x402": {
       "facilitatorUrl": "https://tu-facilitador.com",
       "treasuryWallet": "0x...",
       "backendUrl": "https://tu-backend.com"
     }
   }
   ```
3. Verifica que el backend esté accesible desde el frontend

### Error: "Failed to fetch" al hacer depósito

**Causas posibles:**
- Backend no está corriendo
- CORS no configurado correctamente
- URL del backend incorrecta

**Solución:**
1. Verifica que el backend esté corriendo
2. Verifica CORS en el backend permite tu dominio de Netlify
3. Verifica la URL del backend en `config.json`

### Error: "Payment verification failed"

**Causas posibles:**
- Facilitador no está corriendo
- Facilitador no puede acceder a Base Sepolia RPC
- USDC no tiene soporte EIP-3009

**Solución:**
1. Verifica que el facilitador esté corriendo
2. Verifica que `BASE_SEPOLIA_RPC_URL` esté correcto
3. Verifica que el USDC en Base Sepolia soporte EIP-3009

### Error: "Treasury balance insufficient"

**Causas posibles:**
- Treasury no tiene suficiente USDC
- Treasury no ha aprobado dBank

**Solución:**
1. Verifica balance del treasury en Basescan
2. Verifica que el treasury haya aprobado dBank:
   ```javascript
   // En consola del navegador o script
   const usdc = await ethers.getContractAt('Token', '0x036CbD53842c5426634e7929541eC2318f3dCF7e');
   const allowance = await usdc.allowance(TREASURY_ADDRESS, DBANK_ADDRESS);
   console.log('Allowance:', ethers.utils.formatUnits(allowance, 6));
   ```

### La wallet no pide firmar

**Causas posibles:**
- Wallet no soporta EIP-3009 (`signTypedData`)
- Error en la creación del signer viem

**Solución:**
1. Prueba con MetaMask o Coinbase Wallet
2. Verifica que tu wallet esté actualizada
3. Revisa la consola del navegador para errores

## 📊 Verificación Completa

### Checklist de Verificación

- [ ] Frontend desplegado y accesible
- [ ] Base Sepolia añadido al selector de red
- [ ] Wallet conectada a Base Sepolia
- [ ] Configuración x402 visible en Deposit
- [ ] USDC de prueba disponible
- [ ] Backend x402 corriendo y accesible
- [ ] Facilitador corriendo y accesible
- [ ] Treasury tiene USDC y ha aprobado dBank
- [ ] Depósito x402 funciona end-to-end
- [ ] Transacción visible en Basescan
- [ ] Shares actualizadas en la UI

## 🔗 URLs Importantes

- **Base Sepolia Explorer**: https://sepolia.basescan.org
- **Base Sepolia RPC**: https://sepolia.base.org
- **USDC Base Sepolia**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Chain ID**: `84532` (0x14a34 en hex)

## 📝 Notas

- Los tokens en Base Sepolia son de prueba, no tienen valor real
- El treasury paga el gas por cada depósito
- Los depósitos x402 son idempotentes (mismo `requestId` no se procesa dos veces)
- El facilitador verifica pagos on-chain antes de confirmar

## 🆘 Soporte

Si encuentras problemas:
1. Revisa los logs del backend y facilitador
2. Revisa la consola del navegador (F12)
3. Verifica las transacciones en Basescan
4. Consulta `docs/X402_TESTING_GUIDE.md` para más detalles
