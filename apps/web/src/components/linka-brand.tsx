import Image from "next/image";
import { t as ru } from "@/lib/i18n";

type LinkaIconProps = {
  alt?: string;
  className?: string;
  priority?: boolean;
  size?: number;
};

export function LinkaIcon({
  alt = "",
  className = "",
  priority = false,
  size = 44,
}: LinkaIconProps) {
  return (
    <span
      aria-hidden={alt ? undefined : true}
      className={`relative inline-flex shrink-0 overflow-hidden rounded-[24%] bg-white shadow-sm ${className}`}
      style={{ height: size, width: size }}
    >
      <Image
        alt={alt}
        className="object-cover"
        fill
        priority={priority}
        sizes={`${size}px`}
        src="/linka-icon.png"
      />
    </span>
  );
}

type LinkaBrandProps = {
  className?: string;
  iconSize?: number;
  priority?: boolean;
  textClassName?: string;
};

export function LinkaBrand({
  className = "",
  iconSize = 40,
  priority = false,
  textClassName = "",
}: LinkaBrandProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LinkaIcon priority={priority} size={iconSize} />
      <span
        className={`font-logo text-lg font-semibold leading-none tracking-normal ${textClassName}`}
      >
        {ru.app.name}
      </span>
    </div>
  );
}
