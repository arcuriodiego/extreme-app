import { initials } from "@/domain/images/images";

/** Foto redonda del profe; si todavía no tiene, sus iniciales. */
export function TeacherAvatar({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} loading="lazy" style={style} className="shrink-0 rounded-full bg-surface object-cover" />;
  }
  return (
    <span aria-hidden style={{ ...style, fontSize: Math.round(size * 0.38) }} className="flex shrink-0 items-center justify-center rounded-full bg-surface font-bold text-muted">
      {initials(name)}
    </span>
  );
}
