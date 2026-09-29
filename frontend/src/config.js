// Configure VITE_API_BASE_URL for a deployed frontend. The relative default
// works with the Vite development proxy and same-origin deployments.
export const API = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
