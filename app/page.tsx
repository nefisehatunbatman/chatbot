import { redirect } from "next/navigation";
import Chat from "@/components/Chat";
import { getUser } from "@/lib/auth";
import { buildMe } from "@/lib/me";
import type { Me } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  let me: Me | null = null;
  try {
    const user = await getUser();
    if (user) me = await buildMe(user);
  } catch (e) {
    return (
      <div className="login">
        <div className="login-card">
          <h1>Kurulum eksik</h1>
          <div className="error-box">{(e as Error).message}</div>
          <p className="muted small">Ayrıntılar için repodaki README dosyasına bak.</p>
        </div>
      </div>
    );
  }
  if (!me) redirect("/login");
  return <Chat initialMe={me} />;
}
