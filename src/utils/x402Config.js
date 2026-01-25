import config from '../config.json';

/**
 * Obtiene la configuración x402 para una red específica
 * @param {number|string} chainId - Chain ID de la red
 * @returns {object|null} Configuración x402 o null si no está disponible
 */
export const getX402Config = (chainId) => {
    const chainIdStr = chainId?.toString();
    const chainConfig = config[chainIdStr];
    return chainConfig?.x402 || null;
};

/**
 * Verifica si x402 está disponible para una red específica
 * @param {number|string} chainId - Chain ID de la red
 * @returns {boolean} true si x402 está disponible
 */
export const isX402Available = (chainId) => {
    const chainIdNum = typeof chainId === 'string' ? parseInt(chainId) : chainId;
    // Solo Base Sepolia (84532) soporta x402 por ahora
    return chainIdNum === 84532 && getX402Config(chainId) !== null;
};

/**
 * Obtiene la URL del backend x402 para una red específica
 * @param {number|string} chainId - Chain ID de la red
 * @returns {string|null} URL del backend o null si no está configurado
 */
export const getX402BackendUrl = (chainId) => {
    const x402Config = getX402Config(chainId);
    return x402Config?.backendUrl || null;
};

/**
 * Obtiene la URL del facilitador x402 para una red específica
 * @param {number|string} chainId - Chain ID de la red
 * @returns {string|null} URL del facilitador o null si no está configurado
 */
export const getX402FacilitatorUrl = (chainId) => {
    const x402Config = getX402Config(chainId);
    return x402Config?.facilitatorUrl || null;
};
