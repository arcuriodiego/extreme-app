export const NOTICES: Record<string, string> = {
  creado: "Listo, creamos la ficha.",
  guardado: "Listo, guardamos los cambios.",
  "notas-guardadas": "Listo, guardamos las notas.",
};

export const ERRORS: Record<string, string> = {
  "campo-firstName": "Escribí el nombre (hasta 80 letras).",
  "campo-lastName": "El apellido puede tener hasta 80 letras.",
  "campo-dni": "Revisá el DNI: sólo números (o letras si es pasaporte), entre 6 y 12.",
  "campo-birthDate": "Revisá la fecha de nacimiento.",
  "campo-phone": "Revisá el teléfono: sólo números, espacios, + y guiones.",
  "campo-status": "Elegí el estado.",
  "dni-repetido": "Ya hay otra ficha con ese DNI. Buscala en la lista.",
  "sin-permiso": "No tenés permiso para hacer este cambio.",
  datos: "Revisá los datos: hay algo que no es válido.",
  generico: "No pudimos guardar el cambio. Probá de nuevo.",
};
