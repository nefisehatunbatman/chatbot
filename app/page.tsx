import { redirect } from "next/navigation";
import Chat from "@/components/Chat";
import { getUser } from "@/lib/auth";
import { blobAccess, blobEnabled } from "@/lib/blobstore";
import type { Me } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  let user;
  try {
    user = await getUser();
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
  if (!user) redirect("/login");

  const me: Me = {
    user: { id: user.id, username: user.username, settings: user.settings || {} },
    blob: { enabled: blobEnabled(), access: blobAccess() },
  };
  return <Chat initialMe={me} />;
}
