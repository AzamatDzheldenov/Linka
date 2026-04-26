"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { refresh } from "@/lib/api/auth";
import { useAuthStore } from "@/store/auth-store";

const publicRoutes = new Set(["/login", "/register"]);
const protectedPrefixes = ["/chats"];

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const routeState = useMemo(() => {
    const isPublicRoute = publicRoutes.has(pathname);
    const isProtectedRoute = protectedPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

    return { isPublicRoute, isProtectedRoute };
  }, [pathname]);

  useEffect(() => {
    if (routeState.isPublicRoute || !routeState.isProtectedRoute || accessToken) {
      return;
    }

    let isActive = true;

    async function restoreSession() {
      setIsRefreshing(true);

      try {
        await refresh();
      } catch {
        clearAuth();

        if (isActive) {
          router.replace("/login");
        }
      } finally {
        if (isActive) {
          setIsRefreshing(false);
        }
      }
    }

    void restoreSession();

    return () => {
      isActive = false;
    };
  }, [
    accessToken,
    clearAuth,
    routeState.isProtectedRoute,
    routeState.isPublicRoute,
    router,
  ]);

  if (routeState.isProtectedRoute && !accessToken && isRefreshing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0e1621] px-4 text-[#f5f8fb]">
        <div className="rounded-lg border border-white/5 bg-[#17212b] px-5 py-4 text-sm text-[#8fa3b5] shadow-2xl shadow-black/30">
          Restoring session...
        </div>
      </main>
    );
  }

  if (routeState.isProtectedRoute && !accessToken) {
    return null;
  }

  return children;
}
