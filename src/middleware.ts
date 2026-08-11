// Protects every route behind Supabase Auth when Supabase is configured
// (build prompt §8: "Authentication required... not something to leave
// publicly reachable"). When no Supabase env vars are set, the app is
// running in standalone/offline LocalStorage mode on a single device, so
// there is no remote data to protect and the auth gate is skipped
// entirely (CLAUDE.md "Offline Resilience").

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isPublicPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

// /api is excluded: API routes return JSON and manage their own auth
// (e.g. /api/account/delete validates its own bearer token independent
// of cookies) — redirecting them to /login would mean a browser fetch()
// silently follows the redirect to a 200 HTML page instead of getting a
// clean 401, which a caller checking res.ok would misread as success.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
