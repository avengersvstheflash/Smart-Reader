import { DECOR_REGISTRY } from '../registry';

export function Scatter({ theme }: { theme: string }) {
  const items = DECOR_REGISTRY[theme];
  if (!items || items.length === 0) return null;

  return (
    <>
      {items.map((item, i) => (
        <item.Component
          key={i}
          className={`decor-item ${item.drift ? 'decor-drift' : ''} ${item.twinkle ? 'decor-twinkle' : ''}`}
          style={{
            left: `${item.x}%`,
            top: `${item.y}%`,
            width: item.size,
            height: item.size,
            opacity: item.opacity,
            transform: `translate(-50%, -50%) rotate(${item.rotation || 0}deg)`,
          }}
        />
      ))}
    </>
  );
}
