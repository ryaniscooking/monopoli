import type { MapConfig } from '@monopoli/engine';

type Token = MapConfig['tokens'][number];

/** A player token: the map's flat silhouette tinted with the player's color, else its emoji. */
export function TokenIcon({
  token,
  color,
  size,
}: {
  token: Token | undefined;
  color: string;
  size: number;
}) {
  if (!token) return <span style={{ color, fontSize: size }}>●</span>;
  if (!token.svg) {
    return (
      <span aria-hidden style={{ fontSize: size * 0.85, lineHeight: 1 }}>
        {token.icon}
      </span>
    );
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="block shrink-0"
      data-token={token.id}
    >
      <path d={token.svg} fill={color} />
    </svg>
  );
}
