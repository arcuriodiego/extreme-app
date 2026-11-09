/** Se vuelve a montar en cada cambio de pantalla: la pantalla nueva aparece con un fundido corto. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="pantalla-entra flex flex-col gap-8">{children}</div>;
}
