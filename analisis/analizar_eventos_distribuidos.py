import os

from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col,
    count,
    desc,
    from_json,
    coalesce,
    lit
)
from pyspark.sql.types import StructType, StructField, StringType


# 1. Configurar Spark
BASE = "/home/ec2-user/smartmarket"
SALIDA = os.path.join(BASE, "analisis", "resultados_distribuidos")

spark = (
    SparkSession.builder
    .appName("SmartMarketAnalisisDistribuido")
    .master("local[2]")
    .getOrCreate()
)

spark.sparkContext.setLogLevel("ERROR")


# 2. Definir las cuatro particiones primarias
rutas = [
    os.path.join(
        BASE,
        "almacenamiento",
        f"nodo_{n}",
        "primarios",
        "eventos_primarios.csv"
    )
    for n in range(1, 5)
]


# 3. Leer los CSV distribuidos
eventos = (
    spark.read
    .option("header", "true")
    .option("escape", '"')
    .csv(rutas)
)


# 4. Comprobar cantidad e identificadores
total = eventos.count()
unicos = eventos.select("id").distinct().count()

print("\n========== VALIDACION DE DATOS ==========")
print(f"Eventos procesados: {total}")
print(f"Identificadores unicos: {unicos}")

if total == 0 or total != unicos:
    raise ValueError(
        "La validacion fallo: existen eventos vacios o identificadores duplicados."
    )


# 5. Interpretar la columna detalles como JSON
esquema_detalles = StructType([
    StructField("origen", StringType(), True),
    StructField("dispositivo", StringType(), True),
    StructField("cantidad", StringType(), True),
    StructField("lote", StringType(), True)
])

eventos = eventos.withColumn(
    "detalles_json",
    from_json(col("detalles"), esquema_detalles)
)

eventos = (
    eventos
    .withColumn(
        "origen",
        coalesce(col("detalles_json.origen"), lit("sin_dato"))
    )
    .withColumn(
        "dispositivo",
        coalesce(col("detalles_json.dispositivo"), lit("sin_dato"))
    )
)


# 6. Crear carpeta de resultados
os.makedirs(SALIDA, exist_ok=True)


# 7. Analizar eventos por categoria
resumen_categoria = (
    eventos.groupBy("tipo_evento")
    .agg(count("*").alias("cantidad"))
    .orderBy(desc("cantidad"))
)

print("\n========== EVENTOS POR CATEGORIA ==========")
resumen_categoria.show(truncate=False)

resumen_categoria.coalesce(1).write.mode("overwrite").option(
    "header", True
).csv(os.path.join(SALIDA, "eventos_por_categoria"))


# 8. Analizar eventos por dispositivo
resumen_dispositivo = (
    eventos.groupBy("dispositivo")
    .agg(count("*").alias("cantidad"))
    .orderBy(desc("cantidad"))
)

print("\n========== EVENTOS POR DISPOSITIVO ==========")
resumen_dispositivo.show(truncate=False)

resumen_dispositivo.coalesce(1).write.mode("overwrite").option(
    "header", True
).csv(os.path.join(SALIDA, "eventos_por_dispositivo"))


# 9. Analizar eventos por origen
resumen_origen = (
    eventos.groupBy("origen")
    .agg(count("*").alias("cantidad"))
    .orderBy(desc("cantidad"))
)

print("\n========== EVENTOS POR ORIGEN ==========")
resumen_origen.show(truncate=False)

resumen_origen.coalesce(1).write.mode("overwrite").option(
    "header", True
).csv(os.path.join(SALIDA, "eventos_por_origen"))


# 10. Finalizar Spark
spark.stop()

print("\n============================================")
print("ANALISIS DISTRIBUIDO COMPLETADO")
print(f"Total de eventos procesados: {total}")
print(f"Resultados guardados en: {SALIDA}")
print("============================================")
