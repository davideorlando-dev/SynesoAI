"""
La versione di Syneso, dichiarata una volta sola.

Prima di questo modulo il numero viveva in tre posti che non erano d'accordo:
pyproject diceva 0.1.0, package.json 0.1.0 e l'API 0.3.0. Un utente che segnala
un problema cita il numero che vede, quindi deve esserci un solo numero, e
dev'essere quello vero.

Questa è la fonte. I due manifest la ripetono perché i loro formati lo
richiedono, e un test (`tests/test_version.py`) fallisce se divergono, così la
duplicazione non può silenziosamente tornare a mentire.

Solo libreria standard: il launcher importa questo modulo prima del resto.
"""

APP_VERSION = "0.5.1"
