import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, tokenFor } from "./lib/auth";

// Her isteği kapıdaki görevli gibi kontrol eder: doğru çerez yoksa /login'e yollar.
// ACCESS_PASSWORD ayarlı değilse site KAPALI kalır (OpenRouter bakiyeni korumak için).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  const pw = process.env.ACCESS_PASSWORD;
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (pw && cookie && cookie === (await tokenFor(pw))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Yetkisiz. Lütfen tekrar giriş yap." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
