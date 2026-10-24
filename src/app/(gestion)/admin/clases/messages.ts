import { IMAGE_ERRORS } from "@/domain/images/images";
import { GRILLA_ERRORS } from "@/lib/grilla";

export const NOTICES: Record<string, string> = {
  "grupo-creado": "Listo, creamos el grupo. Ahora agregale sus horarios.",
  "grupo-guardado": "Listo, guardamos los cambios del grupo.",
  "grupo-eliminado": "Listo, eliminamos el grupo.",
  "grupo-archivado": "Listo, eliminamos el grupo de la lista. Como ya tuvo clases o alumnos, queda guardado en el historial (lo ves en \"Grupos cerrados\").",
  "horario-agregado": "Listo, agregamos el horario.",
  "horario-quitado": "Listo, quitamos el horario.",
  "horario-terminado": "Listo, el horario terminó. Queda en el historial porque tuvo alumnos fijos.",
  agregado: "Listo, lo agregamos.",
  activado: "Listo, quedó activo.",
  desactivado: "Listo, quedó desactivado. Ya no se ofrece para grupos nuevos.",
  "profe-guardado": "Listo, guardamos el nombre del profe.",
  "foto-guardada": "Listo, subimos la foto del profe: ya aparece en las clases.",
  "foto-quitada": "Listo, quitamos la foto del profe.",
  "clase-suspendida": "Listo, la clase quedó suspendida.",
  "clase-reactivada": "Listo, la clase vuelve a estar programada.",
  "reemplazo-guardado": "Listo, guardamos el reemplazo.",
  "reemplazo-quitado": "Listo, la clase vuelve a darla su profe.",
  "feriado-agregado": "Listo, cargamos el día. Las clases de esa fecha quedaron suspendidas.",
  "feriado-quitado": "Listo, quitamos el día. Sus clases vuelven a estar programadas.",
};

export const ERRORS: Record<string, string> = {
  ...GRILLA_ERRORS,
  ...IMAGE_ERRORS,
  "falta-estilo": "Elegí el estilo.",
  "falta-categoria": "Elegí la categoría de edad.",
  cupo: "El cupo tiene que ser un número entre 1 y 200.",
  nombre: "Escribí un nombre de hasta 40 letras.",
  "nombre-profe": "Escribí un nombre de hasta 60 letras.",
  "horario-weekday": "Elegí el día del horario.",
  "horario-start": "Revisá la hora de inicio (por ejemplo 19:00).",
  "horario-end": "Revisá la hora de fin: tiene que ser al menos 15 minutos después del inicio.",
  "horario-roomId": "Elegí la sala.",
  "feriado-fecha": "Elegí la fecha.",
  "feriado-fecha-pasada": "La fecha ya pasó.",
  "feriado-motivo": "Escribí el motivo (hasta 80 letras), por ejemplo \"Feriado nacional\".",
  "feriado-repetido": "Ya hay un feriado o cierre cargado ese día.",
};

export const STATUS_LABELS = { active: "Activo", paused: "Pausado", closed: "Cerrado" } as const;
