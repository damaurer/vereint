import { fileURLToPath } from 'node:url';

export const AUTH_DIR = fileURLToPath(new URL('../.auth', import.meta.url));
export const credentialsFile = `${AUTH_DIR}/users.json`;
