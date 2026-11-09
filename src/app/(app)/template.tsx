/** Se vuelve a montar en cada cambio de pantalla: la pantalla nueva aparece con un fundido corto. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="pantalla-entra flex min-w-0 flex-1 flex-col gap-6">{children}</div>;
}
