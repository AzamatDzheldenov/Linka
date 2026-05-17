"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { MessageCircle, Settings, UserRound } from "lucide-react";
import { useI18n } from "@/providers/i18n-provider";

const tabs = [
  { href: "/chats", labelKey: "chats", icon: MessageCircle },
  { href: "/profile", labelKey: "profile", icon: UserRound },
  { href: "/settings", labelKey: "settings", icon: Settings },
] as const;

type AppBottomNavProps = {
  className?: string;
  hidden?: boolean;
};

export function AppBottomNav({ className = "", hidden = false }: AppBottomNavProps) {
  const pathname = usePathname();
  const { t } = useI18n();

  if (hidden) {
    return null;
  }

  return (
    <nav
      aria-label="Primary"
      className={`fixed inset-x-0 bottom-0 z-[60] mx-auto flex w-full justify-center px-4 pb-[calc(0.65rem+env(safe-area-inset-bottom))] lg:hidden ${className}`}
    >
      <div className="ios-glass grid h-[64px] w-full max-w-[420px] grid-cols-3 rounded-[28px] p-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const label = t.app[tab.labelKey];
          const isActive =
            pathname === tab.href ||
            (tab.href !== "/chats" && pathname.startsWith(`${tab.href}/`));

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`relative flex min-w-0 items-center justify-center rounded-[22px] text-[11px] font-semibold transition ${
                isActive ? "text-white" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
              href={tab.href}
              key={tab.href}
            >
              {isActive ? (
                <motion.span
                  className="absolute inset-0 rounded-[22px] bg-[var(--accent)] shadow-sm"
                  layoutId="linka-bottom-nav-active"
                  transition={{ type: "spring", stiffness: 480, damping: 38, mass: 0.75 }}
                />
              ) : null}
              <motion.span
                animate={{ opacity: isActive ? 1 : 0.78, scale: isActive ? 1 : 0.96 }}
                className="relative z-10 flex min-w-0 flex-col items-center gap-0.5"
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
              >
                <Icon size={20} strokeWidth={2.25} />
                <span className="truncate leading-none">{label}</span>
              </motion.span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
