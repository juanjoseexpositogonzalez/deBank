# x402 Runbook Operacional

Guía operacional para el facilitador y backend x402 de dBank.

## Checklist de Despliegue

### Pre-despliegue

- [ ] Contratos desplegados en Base Sepolia
- [ ] Direcciones actualizadas en `src/config.json`
- [ ] Wallet tesorería con USDC en Base Sepolia
- [ ] Variables de entorno configuradas (`.env` en facilitator y backend)
- [ ] Dependencias instaladas (`npm install` en ambos directorios)

### Despliegue Facilitador

1. **Verificar configuración**:
   ```bash
   cd facilitator
   cat .env | grep -v PRIVATE_KEY  # Verificar sin exponer keys
   ```

2. **Iniciar servicio**:
   ```bash
   npm start
   # O con PM2:
   pm2 start src/server.js --name x402-facilitator
   ```

3. **Verificar health**:
   ```bash
   curl http://localhost:4022/health
   ```

4. **Monitorear logs**:
   ```bash
   tail -f facilitator.log
   # O con PM2:
   pm2 logs x402-facilitator
   ```

### Despliegue Backend

1. **Verificar configuración**:
   ```bash
   cd backend
   cat .env | grep -v PRIVATE_KEY
   ```

2. **Verificar conectividad con facilitador**:
   ```bash
   curl http://localhost:4022/health
   ```

3. **Iniciar servicio**:
   ```bash
   npm start
   # O con PM2:
   pm2 start src/server.js --name x402-backend
   ```

4. **Verificar health**:
   ```bash
   curl http://localhost:4021/health
   ```

5. **Monitorear logs**:
   ```bash
   tail -f backend.log
   # O con PM2:
   pm2 logs x402-backend
   ```

## Verificación de Pagos

### Verificar pago específico

```bash
# Consultar base de datos del facilitador
sqlite3 facilitator/facilitator.db "SELECT * FROM payments WHERE tx_hash = '0x...';"
```

### Verificar depósito on-chain

```bash
# Usando Hardhat console
npx hardhat console --network baseSepolia
> const dBank = await ethers.getContractAt("dBank", "<ADDRESS>");
> const receipt = await ethers.provider.getTransactionReceipt("0x...");
> console.log(receipt);
```

### Verificar balance del treasury

```bash
npx hardhat console --network baseSepolia
> const usdc = await ethers.getContractAt("Token", "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
> const balance = await usdc.balanceOf("<TREASURY_ADDRESS>");
> console.log(ethers.utils.formatUnits(balance, 18));
```

## Monitoreo y Alertas

### Métricas Clave

1. **Facilitador**:
   - Requests por minuto
   - Tasa de verificación exitosa
   - Tiempo promedio de verificación
   - Errores por tipo

2. **Backend**:
   - Depósitos por minuto
   - Tasa de éxito de depósitos
   - Gas usado promedio
   - Errores por tipo

### Logs Estructurados

Todos los logs están en formato JSON. Para análisis:

```bash
# Contar errores en facilitador
cat facilitator.log | jq 'select(.level=="error")' | wc -l

# Ver últimos depósitos exitosos
cat backend.log | jq 'select(.message=="Deposit successful")' | tail -10
```

### Alertas Recomendadas

- Facilitador no responde (health check falla)
- Backend no responde (health check falla)
- Tasa de errores > 5%
- Balance del treasury < umbral mínimo
- Base de datos del facilitador > tamaño límite

## Procedimientos de Emergencia

### Facilitador caído

1. Verificar logs: `tail -f facilitator.log`
2. Verificar recursos: `top` o `htop`
3. Reiniciar servicio:
   ```bash
   pm2 restart x402-facilitator
   # O manualmente:
   cd facilitator && npm start
   ```

### Backend caído

1. Verificar logs: `tail -f backend.log`
2. Verificar conectividad con facilitador
3. Verificar configuración (`.env`)
4. Reiniciar servicio:
   ```bash
   pm2 restart x402-backend
   ```

### Pago duplicado detectado

1. Verificar en base de datos:
   ```bash
   sqlite3 facilitator/facilitator.db "SELECT * FROM payments WHERE id = '<paymentId>';"
   ```

2. Si es duplicado legítimo, el sistema ya lo maneja (retorna txHash existente)
3. Si es un error, investigar logs del facilitador

### Balance del treasury insuficiente

1. Verificar balance actual
2. Transferir USDC adicional al treasury wallet
3. Verificar que el depósito se procesó correctamente

### Contrato dBank pausado

1. Verificar estado:
   ```bash
   npx hardhat console --network baseSepolia
   > const dBank = await ethers.getContractAt("dBank", "<ADDRESS>");
   > await dBank.paused();
   ```

2. Si está pausado, contactar owner para unpause
3. Verificar logs del backend para ver si hay intentos de depósito fallidos

## Rollback

### Rollback del Facilitador

1. Detener servicio actual
2. Restaurar versión anterior:
   ```bash
   git checkout <previous-commit> -- facilitator/
   cd facilitator && npm install
   npm start
   ```

### Rollback del Backend

1. Detener servicio actual
2. Restaurar versión anterior:
   ```bash
   git checkout <previous-commit> -- backend/
   cd backend && npm install
   npm start
   ```

### Rollback de Contratos

⚠️ **No es posible rollback de contratos desplegados**. Si hay un bug crítico:
1. Pausar contrato dBank
2. Desplegar nueva versión
3. Migrar usuarios manualmente si es necesario

## Mantenimiento

### Backup de Base de Datos

```bash
# Backup diario recomendado
cp facilitator/facilitator.db facilitator/facilitator.db.backup.$(date +%Y%m%d)
```

### Limpieza de Logs

```bash
# Rotar logs si crecen demasiado
mv facilitator.log facilitator.log.old
mv backend.log backend.log.old
```

### Actualización de Dependencias

```bash
# Facilitador
cd facilitator
npm update
npm audit fix

# Backend
cd backend
npm update
npm audit fix
```

## Troubleshooting Común

### Error: "Cannot find module '@x402/...'"

**Causa**: Dependencias no instaladas o paquetes no disponibles públicamente.

**Solución**:
```bash
# Instalar desde GitHub si no están en npm
npm install github:coinbase/x402#main --save
```

### Error: "ECONNREFUSED" al conectar con facilitador

**Causa**: Facilitador no está corriendo o URL incorrecta.

**Solución**:
1. Verificar que facilitador esté corriendo: `curl http://localhost:4022/health`
2. Verificar `FACILITATOR_URL` en backend `.env`

### Error: "Insufficient balance"

**Causa**: Treasury wallet no tiene suficiente USDC.

**Solución**:
1. Verificar balance del treasury
2. Transferir USDC adicional
3. Verificar que la transferencia se completó

### Error: "Contract not deployed"

**Causa**: `DBANK_ADDRESS` incorrecto o contrato no desplegado.

**Solución**:
1. Verificar dirección en `src/config.json`
2. Verificar en explorer: `https://sepolia.basescan.org/address/<ADDRESS>`
3. Actualizar `DBANK_ADDRESS` en backend `.env`

## Contactos y Recursos

- **Documentación x402**: https://docs.cdp.coinbase.com/x402/docs/welcome
- **Base Sepolia Explorer**: https://sepolia.basescan.org
- **x402 GitHub**: https://github.com/coinbase/x402
- **Discord x402**: https://discord.gg/cdp
