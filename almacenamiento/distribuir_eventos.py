import csv
import json
from pathlib import Path

# ==========================================
# CONFIGURACION DEL ALMACENAMIENTO
# ==========================================

BASE_DIR = Path(__file__).resolve().parent.parent

ARCHIVO_ORIGINAL = BASE_DIR / "data" / "eventos_smartmarket.json"
DIRECTORIO_NODOS = BASE_DIR / "almacenamiento"

CAMPOS = [
    "id",
    "cliente_id",
    "tipo_evento",
    "producto_id",
    "detalles",
    "fecha_evento"
]

# Rangos de identificadores para cada nodo
RANGOS = {
    1: (1, 252),
    2: (253, 504),
    3: (505, 756),
    4: (757, 1008)
}

# Cada nodo guarda una replica del nodo indicado
REPLICAS = {
    1: 4,
    2: 1,
    3: 2,
    4: 3
}


# ==========================================
# FUNCION PARA GUARDAR LOS EVENTOS
# ==========================================

def guardar_csv(eventos, archivo):

    with open(archivo, "w", newline="", encoding="utf-8") as f:

        escritor = csv.DictWriter(
            f,
            fieldnames=CAMPOS
        )

        escritor.writeheader()

        for evento in eventos:

            fila = evento.copy()

            fila["detalles"] = json.dumps(
                evento.get("detalles", {}),
                ensure_ascii=False
            )

            escritor.writerow(fila)


# ==========================================
# CARGA Y VALIDACION DE DATOS
# ==========================================

print("\nSMARTMARKET - DISTRIBUCION DE EVENTOS")

with open(ARCHIVO_ORIGINAL, "r", encoding="utf-8") as f:
    eventos = json.load(f)

eventos.sort(key=lambda x: int(x["id"]))

ids = [int(evento["id"]) for evento in eventos]

if len(eventos) != 1008:
    raise ValueError("El total de eventos no es 1008.")

if len(set(ids)) != len(ids):
    raise ValueError("Se encontraron identificadores duplicados.")

if ids != list(range(1, 1009)):
    raise ValueError("Los identificadores no son consecutivos.")

print("Eventos originales:", len(eventos))
print("Identificadores unicos:", len(set(ids)))


# ==========================================
# DISTRIBUCION DE PARTICIONES PRIMARIAS
# ==========================================

particiones = {}

for nodo, (inicio, fin) in RANGOS.items():

    particion = [
        evento for evento in eventos
        if inicio <= int(evento["id"]) <= fin
    ]

    if len(particion) != 252:
        raise ValueError(f"Cantidad incorrecta en nodo {nodo}.")

    particiones[nodo] = particion


# ==========================================
# GUARDADO DE PRIMARIOS Y REPLICAS
# ==========================================

for nodo in range(1, 5):

    carpeta = DIRECTORIO_NODOS / f"nodo_{nodo}"

    carpeta_primarios = carpeta / "primarios"
    carpeta_replicas = carpeta / "replicas"

    carpeta_primarios.mkdir(parents=True, exist_ok=True)
    carpeta_replicas.mkdir(parents=True, exist_ok=True)

    # Datos primarios del nodo
    archivo_primario = (
        carpeta_primarios / "eventos_primarios.csv"
    )

    guardar_csv(
        particiones[nodo],
        archivo_primario
    )

    # Copia de respaldo del nodo correspondiente
    nodo_origen = REPLICAS[nodo]

    archivo_replica = (
        carpeta_replicas /
        f"eventos_replica_nodo_{nodo_origen}.csv"
    )

    guardar_csv(
        particiones[nodo_origen],
        archivo_replica
    )

    print(
        f"Nodo {nodo}: "
        f"{len(particiones[nodo])} primarios | "
        f"252 eventos replicados del nodo {nodo_origen}"
    )


# ==========================================
# RESUMEN FINAL
# ==========================================

total_primarios = sum(
    len(particion) for particion in particiones.values()
)

total_replicas = total_primarios

print("\nDISTRIBUCION COMPLETADA")
print("Total de eventos primarios:", total_primarios)
print("Total de eventos replicados:", total_replicas)
print("Total de copias almacenadas:", total_primarios + total_replicas)
print("Eventos originales conservados:", len(eventos))
