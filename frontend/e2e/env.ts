/**
 * Porte e indirizzi dei test end-to-end.
 *
 * Diverse da quelle di sviluppo, così una sessione di test non tocca il
 * backend e i dati di chi sta lavorando. Stanno qui perché servono sia alla
 * configurazione di Playwright, che avvia i due server, sia ai test, che
 * parlano con il backend per preparare lo stato di partenza.
 */
export const FRONTEND_PORT = 3101;
export const BACKEND_PORT = 8101;
export const BACKEND_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;
export const FRONTEND_ORIGIN = `http://127.0.0.1:${FRONTEND_PORT}`;
