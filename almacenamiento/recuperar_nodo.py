import csv
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Cada nodo recupera sus datos desde la réplica que conserva otro nodo.
REPLICAS = {
    1: 2,
    2: 3,
    3: 4,
    4: 1
}


def cargar_eventos(ruta):
    with open(ruta, "r", encoding="utf-8", newline="") as archivo:
        return list(csv.DictReader(archivo))


def recuperar_nodo(numero_nodo, directorio_pruebas):
    if numero_nodo not in REPLICAS:
        raise ValueError("El nodo debe estar entre 1 y 4.")

    nodo_origen = REPLICAS[numero_nodo]

    ruta_replica = (
        BASE_DIR / f"nodo_{nodo_origen}" / "replicas" /
        f"eventos_replica_nodo_{numero_nodo}.csv"
    )

    ruta_destino = (
        directorio_pruebas / f"nodo_{numero_nodo}" /
        "primarios" / "eventos_primarios.csv"
    )

    if not ruta_replica.exists():
        raise FileNotFoundError("No se encontró la réplica de respaldo.")

    eventos = cargar_eventos(ruta_replica)

    if len(eventos) != 252:
        raise ValueError("La réplica no contiene los 252 eventos esperados.")

    ids = [int(evento["id"]) for evento in eventos]

    if len(set(ids)) != 252:
        raise ValueError("La réplica contiene identificadores duplicados.")

    ruta_destino.parent.mkdir(parents=True, exist_ok=True)

    # Copiamos la réplica a una carpeta de pruebas.
    shutil.copy2(ruta_replica, ruta_destino)

    recuperados = cargar_eventos(ruta_destino)

    if recuperados != eventos:
        raise ValueError("La validación posterior a la recuperación falló.")

    print(f"\nRECUPERACION DEL NODO {numero_nodo}")
    print(f"Nodo de respaldo: {nodo_origen}")
    print(f"Eventos recuperados: {len(recuperados)}")
    print("Integridad: CORRECTA")
    print(f"Archivo recuperado: {ruta_destino}")


if __name__ == "__main__":
    print("SMARTMARKET - SISTEMA DE RECUPERACION")

    carpeta_pruebas = BASE_DIR / "pruebas_recuperacion"

    import sys

    numero_nodo = int(sys.argv[1]) if len(sys.argv) > 1 else 1

    recuperar_nodo(numero_nodo, carpeta_pruebas)

    print("\nPRUEBA DE RECUPERACION FINALIZADA")
