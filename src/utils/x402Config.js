import config from "../config.json";

/**
 * Obtiene la configuración x402 para una red específica.
 */
export const getX402Config = (chainId) => {
  const chainIdStr = chainId?.toString();
  return config?.[chainIdStr]?.x402 || null;
};

/**
 * x402 solo está habilitado para Base Sepolia (84532) y si hay config x402.
 */
export const isX402Available = (chainId) => {
  const n = typeof chainId === "string" ? parseInt(chainId, 10) : chainId;
  return n === 84532 && getX402Config(chainId) !== null;
};

/**
 * URL del backend x402:
 * - Producción (Vercel / CRA): REACT_APP_BACKEND_URL
 * - Local dev: fallback a config.json
 */
export const getX402BackendUrl = (chainId) => {
  const envBackend = process.env.REACT_APP_BACKEND_URL;

  if (envBackend && envBackend.trim().length > 0) {
    return envBackend.trim().replace(/\/$/, "");
  }

  const x402 = getX402Config(chainId);
  const fromConfig = x402?.backendUrl;

  if (fromConfig && fromConfig.trim().length > 0) {
    return fromConfig.trim().replace(/\/$/, "");
  }

  return null;
};

/**
 * URL del facilitator (normalmente solo usada por el backend, no por el browser).
 */
export const getX402FacilitatorUrl = (chainId) => {
  const x402 = getX402Config(chainId);
  const fromConfig = x402?.facilitatorUrl;
  return fromConfig ? fromConfig.trim().replace(/\/$/, "") : null;
};
