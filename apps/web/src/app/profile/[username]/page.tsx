"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { API_BASE_URL, ApiError } from "@/lib/api/client";
import { getUserProfile, PublicUserProfile } from "@/lib/api/users";

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params.username;
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadProfile() {
      setIsLoading(true);
      setError(null);

      try {
        const user = await getUserProfile(username);

        if (isActive) {
          setProfile(user);
        }
      } catch (error) {
        if (isActive) {
          setError(getProfileError(error));
          setProfile(null);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, [username]);

  const fullName = profile
    ? [profile.firstName, profile.lastName].filter(Boolean).join(" ")
    : "Профиль";

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--text-main)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--panel-bg)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4">
          <Link
            aria-label="Назад к чатам"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover-soft)] hover:text-[var(--text-main)]"
            href="/chats"
          >
            <ArrowLeft size={22} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">
              {isLoading ? "Загрузка..." : fullName}
            </h1>
            <p className="truncate text-sm text-[var(--text-muted)]">
              @{username}
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl px-4 py-5">
        <div className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--panel-bg)] shadow-xl shadow-black/10">
          <div className="flex flex-col items-center px-5 py-8 text-center">
            {error ? (
              <div className="rounded-md border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-[var(--danger)]">
                {error}
              </div>
            ) : (
              <>
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-[var(--input-bg)] text-4xl font-semibold text-[var(--accent)]">
                  {profile?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      src={resolveUploadUrl(profile.avatarUrl)}
                    />
                  ) : (
                    fullName.slice(0, 1).toUpperCase()
                  )}
                </div>
                <h2 className="mt-4 max-w-full truncate text-2xl font-semibold">
                  {isLoading ? "Загрузка..." : formatNameWithEmoji(fullName, profile?.nameEmoji)}
                </h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {profile ? `@${profile.username}` : ""}
                </p>
                {profile?.bio ? (
                  <p className="mt-4 max-w-xl whitespace-pre-wrap break-words text-[15px] leading-6">
                    {profile.bio}
                  </p>
                ) : (
                  <p className="mt-4 text-[15px] text-[var(--text-muted)]">
                    О себе пока ничего не указано.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function resolveUploadUrl(url: string) {
  if (url.startsWith("/")) {
    return `${API_BASE_URL}${url}`;
  }

  return url;
}

function formatNameWithEmoji(name: string, nameEmoji?: string | null) {
  return [nameEmoji, name].filter(Boolean).join(" ");
}

function getProfileError(error: unknown) {
  if (error instanceof ApiError && error.status === 404) {
    return "Пользователь не найден.";
  }

  return "Не удалось загрузить профиль.";
}
