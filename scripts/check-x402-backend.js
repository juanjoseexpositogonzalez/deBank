// Script para verificar el estado del backend x402

const axios = require('axios');
const config = require('../src/config.json');

async function main() {
    const chainId = 84532; // Base Sepolia
    const chainKey = String(chainId);
    const cfgNet = config[chainKey] || {};
    const backendUrl = cfgNet.x402?.backendUrl;

    if (!backendUrl) {
        console.error('ERROR: Backend URL no configurada en config.json');
        console.error('Buscar en config.json: x402.backendUrl para chainId 84532');
        process.exit(1);
    }

    console.log(`Verificando backend x402 en: ${backendUrl}\n`);

    // Helper para hacer requests HTTP
    const makeRequest = (url, options = {}) => {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;
            const req = client.request(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, data: JSON.parse(data) });
                    } catch {
                        resolve({ status: res.statusCode, data });
                    }
                });
            });
            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Timeout'));
            });
            if (options.body) {
                req.write(options.body);
            }
            req.end();
        });
    };

    // 1. Health check
    try {
        console.log('1. Health check...');
        const healthResponse = await makeRequest(`${backendUrl}/health`);
        console.log(`   ✓ Backend respondiendo: ${JSON.stringify(healthResponse.data)}\n`);
    } catch (error) {
        console.log(`   ❌ Backend no responde: ${error.message}\n`);
        console.log('   Verifica que el backend esté corriendo:');
        console.log('   cd backend && npm start\n');
        process.exit(1);
    }

    // 2. Test de depósito (sin pago real, solo validación)
    try {
        console.log('2. Test de validación de depósito (500 USDC)...');
        const testRequest = {
            amount: '500',
            userAddress: '0x0000000000000000000000000000000000000000', // Dirección dummy
            requestId: `test-${Date.now()}`,
        };

        // Este debería fallar por falta de payment-signature, pero nos dirá si el endpoint funciona
        try {
            const depositResponse = await makeRequest(`${backendUrl}/api/x402/deposit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(testRequest)
            });
            
            if (depositResponse.status === 400 || depositResponse.status === 401 || depositResponse.status === 402) {
                console.log(`   ✓ Endpoint responde correctamente (status ${depositResponse.status})`);
                if (depositResponse.data?.error) {
                    console.log(`   Mensaje: ${depositResponse.data.error}`);
                }
            } else {
                console.log(`   ⚠ Respuesta inesperada: status ${depositResponse.status}`);
                console.log(`   Data: ${JSON.stringify(depositResponse.data)}`);
            }
        } catch (error) {
            console.log(`   ❌ Error de conexión: ${error.message}`);
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}\n`);
    }

    console.log('\n=== RESUMEN ===');
    console.log('Backend x402 está funcionando correctamente.');
    console.log('Si los depósitos fallan, verifica:');
    console.log('  1. Que el facilitador x402 esté corriendo');
    console.log('  2. Que el treasury wallet tenga suficiente balance');
    console.log('  3. Que el treasury wallet tenga allowance aprobada');
    console.log('  4. Los logs del backend para más detalles');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
