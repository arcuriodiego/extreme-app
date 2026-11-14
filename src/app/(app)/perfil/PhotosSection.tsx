import { ImagePicker } from "@/components/images/ImagePicker";
import { TeacherAvatar } from "@/components/images/TeacherAvatar";
import { SmallSubmit } from "@/components/forms/fields";
import { getActiveStudent } from "@/lib/active-student";
import { imageUrl } from "@/lib/image-url";
import { studentPhotoUrls } from "@/lib/images";
import type { createClient } from "@/lib/supabase/server";
import { removeMyTeacherPhoto, removeStudentPhoto, setMyTeacherPhoto, setStudentPhoto } from "./actions";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Fotos en el perfil:
 * - el profe, su foto para la grilla (la ven los alumnos);
 * - la foto de cada alumno a cargo (la propia o la de los hijos), sólo para que
 *   recepción reconozca a quien entra. Los menores no la suben solos: la sube su tutor/a.
 */
export async function PhotosSection({ supabase, profileId, isTeacher }: { supabase: Client; profileId: string; isTeacher: boolean }) {
  const [{ data: teacher }, { options }] = await Promise.all([
    isTeacher
      ? supabase.from("teachers").select("id, display_name, photo_path").eq("profile_id", profileId).eq("active", true).maybeSingle()
      : Promise.resolve({ data: null }),
    getActiveStudent(),
  ]);
  const t = teacher as { id: string; display_name: string; photo_path: string | null } | null;

  const ids = options.map((o) => o.id);
  const { data: rows } = ids.length > 0 ? await supabase.from("students").select("id, photo_path").in("id", ids) : { data: [] };
  const paths = new Map(((rows ?? []) as { id: string; photo_path: string | null }[]).map((r) => [r.id, r.photo_path]));
  const [urls, allowed] = await Promise.all([
    studentPhotoUrls(supabase, [...paths.values()]),
    Promise.all(
      options.map(async (o) => {
        const { data } = await supabase.rpc("can_manage_student_photo", { p_student_id: o.id });
        return [o.id, data === true] as const;
      }),
    ).then((pairs) => new Map(pairs)),
  ]);

  if (!t && options.length === 0) return null;
  const teacherUrl = imageUrl(t?.photo_path);

  return (
    <section id="fotos" className="flex flex-col gap-5 border-t border-line pt-6">
      {t && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Tu foto de profe</h2>
          <p className="text-[15px] text-muted">La ven los alumnos en la grilla y en sus clases, así te reconocen.</p>
          <div className="flex items-center gap-4">
            <TeacherAvatar name={t.display_name} url={teacherUrl} size={72} />
            {teacherUrl && (
              <form action={removeMyTeacherPhoto}>
                <SmallSubmit tone="danger">Quitar la foto</SmallSubmit>
              </form>
            )}
          </div>
          <form action={setMyTeacherPhoto} className="flex flex-col gap-3">
            <ImagePicker kind="profes" current={null} label={teacherUrl ? "Cambiar mi foto" : "Elegir mi foto"} submitLabel="Subir foto" />
          </form>
        </div>
      )}

      {options.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">{options.length > 1 ? "Fotos para recepción" : "Foto para recepción"}</h2>
          <p className="text-[15px] text-muted">
            Sirve para que en recepción te reconozcan al entrar. Es privada: sólo la ve el personal de la academia, nunca se publica.
          </p>
          <ul className="flex flex-col gap-4">
            {options.map((o) => {
              const url = urls.get(paths.get(o.id) ?? "") ?? null;
              const can = allowed.get(o.id) ?? false;
              return (
                <li key={o.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line p-4">
                  <div className="flex items-center gap-4">
                    <TeacherAvatar name={o.name} url={url} size={64} />
                    <span className="font-semibold">{o.isSelf ? "Vos" : o.name}</span>
                  </div>
                  {can ? (
                    <>
                      <form action={setStudentPhoto} className="flex flex-col gap-3">
                        <input type="hidden" name="student_id" value={o.id} />
                        <ImagePicker kind="alumnos" current={null} label={url ? "Cambiar la foto" : "Elegir una foto"} submitLabel="Subir foto" />
                      </form>
                      {url && (
                        <form action={removeStudentPhoto}>
                          <input type="hidden" name="student_id" value={o.id} />
                          <SmallSubmit tone="danger">Quitar la foto</SmallSubmit>
                        </form>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted">
                      {o.isSelf
                        ? "Como sos menor de edad, tu foto la carga tu mamá, papá o tutor/a desde su cuenta, o recepción. Si ya sos mayor, completá tu fecha de nacimiento arriba."
                        : "La foto la puede cargar recepción."}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
