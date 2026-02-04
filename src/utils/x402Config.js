/**
 * Obtiene la URL del backend x402 para una red específica
 * Prioridad:
 *  1) REACT_APP_BACKEND_URL (producción / Vercel)
 *  2) config.json (local dev)
 */
export const getX402BackendUrl = (chainId) => {
    // 1) Producción (Vercel): inyectado en build time por CRA
    const envBackend = process.env.REACT_APP_BACKEND_URL;
    if (envBackend && envBackend.trim().length > 0) {
        return envBackend.trim();
    }

    // 2) Local dev: src/config.json
    const x402Config = getX402Config(chainId);
    return x402Config?.backendUrl || null;
};

/**
 * Obtiene la URL del facilitador x402 para una red específica
 * NOTA: El frontend NO debería necesitar esto en producción.
 * Lo dejamos para desarrollo local o debugging.
 */
export const getX402FacilitatorUrl = (chainId) => {
    const x402Config = getX402Config(chainId);
    return x402Config?.facilitatorUrl || null;
};
