export const BASE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

// frame-ancestors is enforced by HTTP only; browsers ignore it in a meta policy.
export const META_CSP = BASE_CSP.replace("; frame-ancestors 'none'", '');
