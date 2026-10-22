import { GRILLA_ERRORS } from "@/lib/grilla";

export const NOTICES: Record<string, string> = {
  "grupo-creado": "Listo, creamos el grupo. Ahora agregale sus horarios.",
  "grupo-guardado": "Listo, guardamos los cambios del grupo.",
  "horario-agregado": "Listo, agregamos el horario.",
  "horario-quitado": "Listo, quitamos el horario.",
  agregado: "Listo, lo agregamos.",
  activado: "Listo, quedó activo.",
  desactivado: "Listo, quedó desactivado. Ya no se ofrece para grupos nuevos.",
  "profe-guardado": "Listo, guardamos el nombre del profe.",
};

export const ERRORS: Record<string, string> = {
  ...GRILLA_ERRORS,
  "falta-estilo": "Elegí el estilo.",
  "falta-categoria": "Elegí la categoría de edad.",
  cupo: "El cupo tiene que ser un número entre 1 y 200.",
  nombre: "Escribí un nombre de hasta 40 letras.",
  "nombre-profe": "Escribí un nombre de hasta 60 letras.",
  "horario-weekday": "Elegí el día del horario.",
  "horario-start": "Revisá la hora de inicio (por ejemplo 19:00).",
  "horario-end": "Revisá la hora de fin: tiene que ser al menos 15 minutos después del inicio.",
  "horario-roomId": "Elegí la sala.",
};

export const STATUS_LABELS = { active: "Activo", paused: "Pausado", closed: "Cerrado" } as const;
