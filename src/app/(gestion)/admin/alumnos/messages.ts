export const NOTICES: Record<string, string> = {
  creado: "Listo, creamos la ficha.",
  guardado: "Listo, guardamos los cambios.",
  "notas-guardadas": "Listo, guardamos las notas.",
  inscripto: "Listo, quedó inscripto en la cuota de profe con sus horarios fijos.",
  "horario-cambiado": "Listo, cambiamos el horario fijo.",
  baja: "Listo, dimos de baja la cuota y liberamos sus lugares.",
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
  completo: "No hay lugar: uno de los horarios se completó. Elegí otro.",
  "ya-tiene": "El alumno ya tiene ese horario fijo.",
  "otro-profe": "Ese horario no es de ese profe y categoría.",
  "horarios-cantidad": "Elegí exactamente 2 horarios distintos.",
  "no-disponible": "Eso cambió mientras tanto. Recargá la página y probá de nuevo.",
};
