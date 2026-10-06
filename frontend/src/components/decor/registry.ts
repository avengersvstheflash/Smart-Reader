import type React from 'react';
import { WaterDrop } from './stickers/spring/WaterDrop';
import { Leaf } from './stickers/spring/Leaf';
import { WindSwirl } from './stickers/spring/WindSwirl';
import { GrassTuft } from './stickers/spring/GrassTuft';

import { CherryBlossom } from './stickers/sakura/CherryBlossom';
import { Petal } from './stickers/sakura/Petal';
import { Branch } from './stickers/sakura/Branch';
import { BlossomBud } from './stickers/sakura/BlossomBud';

export interface DecorItem {
  Component: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  x: number;           // 0-100 % from left
  y: number;           // 0-100 % from top
  size: number;
  opacity?: number;
  rotation?: number;
  drift?: boolean;
  twinkle?: boolean;
}

export const DECOR_REGISTRY: Record<string, DecorItem[]> = {
  spring: [
    // Row y≈4 (6 items)
    { Component: WaterDrop, x: 6, y: 4, size: 36, opacity: 0.14, rotation: -12, drift: true },
    { Component: Leaf, x: 22, y: 3, size: 28, opacity: 0.12, rotation: 18 },
    { Component: WindSwirl, x: 40, y: 5, size: 44, opacity: 0.11, rotation: -5, drift: true },
    { Component: GrassTuft, x: 58, y: 4, size: 32, opacity: 0.13, rotation: 4 },
    { Component: WaterDrop, x: 76, y: 3, size: 24, opacity: 0.12, rotation: 8, twinkle: true },
    { Component: Leaf, x: 92, y: 5, size: 38, opacity: 0.15, rotation: -22, drift: true },

    // Row y≈18 (5 items)
    { Component: WindSwirl, x: 12, y: 17, size: 50, opacity: 0.13, rotation: 15, drift: true },
    { Component: GrassTuft, x: 30, y: 19, size: 26, opacity: 0.11, rotation: -8 },
    { Component: WaterDrop, x: 50, y: 18, size: 22, opacity: 0.12, rotation: 0, twinkle: true },
    { Component: Leaf, x: 70, y: 18, size: 42, opacity: 0.14, rotation: 25, drift: true },
    { Component: GrassTuft, x: 88, y: 19, size: 30, opacity: 0.13, rotation: 10 },

    // Row y≈30 (5 items)
    { Component: Leaf, x: 5, y: 29, size: 34, opacity: 0.13, rotation: -30, drift: true },
    { Component: WaterDrop, x: 20, y: 31, size: 28, opacity: 0.11, rotation: 12 },
    { Component: GrassTuft, x: 48, y: 30, size: 32, opacity: 0.12, rotation: -5 },
    { Component: WindSwirl, x: 80, y: 31, size: 48, opacity: 0.12, rotation: -10, drift: true },
    { Component: WaterDrop, x: 95, y: 29, size: 32, opacity: 0.14, rotation: 6, twinkle: true },

    // Row y≈52 (2 items - flanking cards)
    { Component: GrassTuft, x: 8, y: 52, size: 36, opacity: 0.14, rotation: 0 },
    { Component: Leaf, x: 92, y: 53, size: 40, opacity: 0.15, rotation: 35, drift: true },

    // Row y≈68 (2 items - flanking cards)
    { Component: WaterDrop, x: 5, y: 68, size: 30, opacity: 0.13, rotation: -8, twinkle: true },
    { Component: WindSwirl, x: 95, y: 67, size: 52, opacity: 0.12, rotation: 18, drift: true },

    // Row y≈82 (3 items - sparse in center)
    { Component: Leaf, x: 8, y: 81, size: 36, opacity: 0.14, rotation: -15, drift: true },
    { Component: WaterDrop, x: 50, y: 83, size: 22, opacity: 0.10, rotation: 5, twinkle: true },
    { Component: GrassTuft, x: 92, y: 82, size: 34, opacity: 0.13, rotation: 8 },

    // Row y≈94 (5 items)
    { Component: GrassTuft, x: 14, y: 94, size: 38, opacity: 0.15, rotation: -4 },
    { Component: WindSwirl, x: 34, y: 93, size: 46, opacity: 0.12, rotation: -12, drift: true },
    { Component: WaterDrop, x: 54, y: 95, size: 26, opacity: 0.11, rotation: 0, twinkle: true },
    { Component: GrassTuft, x: 74, y: 94, size: 32, opacity: 0.13, rotation: 6 },
    { Component: Leaf, x: 88, y: 93, size: 44, opacity: 0.15, rotation: 28, drift: true },
  ],

  sakura: [
    // Row y≈4 (6 items)
    { Component: CherryBlossom, x: 6, y: 4, size: 36, opacity: 0.14, rotation: -15, drift: true },
    { Component: Petal, x: 22, y: 3, size: 24, opacity: 0.12, rotation: 22 },
    { Component: Branch, x: 40, y: 5, size: 48, opacity: 0.11, rotation: -8, drift: true },
    { Component: BlossomBud, x: 58, y: 4, size: 20, opacity: 0.13, rotation: 5, twinkle: true },
    { Component: Petal, x: 76, y: 3, size: 22, opacity: 0.12, rotation: 30 },
    { Component: CherryBlossom, x: 92, y: 5, size: 42, opacity: 0.15, rotation: -20, drift: true },

    // Row y≈18 (5 items)
    { Component: Branch, x: 12, y: 17, size: 50, opacity: 0.13, rotation: 12, drift: true },
    { Component: Petal, x: 30, y: 19, size: 26, opacity: 0.11, rotation: -18 },
    { Component: BlossomBud, x: 50, y: 18, size: 18, opacity: 0.12, rotation: 0, twinkle: true },
    { Component: CherryBlossom, x: 70, y: 18, size: 38, opacity: 0.14, rotation: 25, drift: true },
    { Component: Petal, x: 88, y: 19, size: 28, opacity: 0.13, rotation: 14 },

    // Row y≈30 (5 items)
    { Component: Petal, x: 5, y: 29, size: 26, opacity: 0.13, rotation: -32, drift: true },
    { Component: CherryBlossom, x: 20, y: 31, size: 34, opacity: 0.12, rotation: 10 },
    { Component: BlossomBud, x: 48, y: 30, size: 22, opacity: 0.11, rotation: -6, twinkle: true },
    { Component: Branch, x: 80, y: 31, size: 52, opacity: 0.12, rotation: -12, drift: true },
    { Component: Petal, x: 95, y: 29, size: 24, opacity: 0.14, rotation: 16 },

    // Row y≈52 (2 items - flanking cards)
    { Component: BlossomBud, x: 8, y: 52, size: 24, opacity: 0.14, rotation: 8 },
    { Component: CherryBlossom, x: 92, y: 53, size: 40, opacity: 0.15, rotation: 35, drift: true },

    // Row y≈68 (2 items - flanking cards)
    { Component: Petal, x: 5, y: 68, size: 26, opacity: 0.13, rotation: -10, twinkle: true },
    { Component: Branch, x: 95, y: 67, size: 46, opacity: 0.12, rotation: 15, drift: true },

    // Row y≈82 (3 items - sparse in center)
    { Component: CherryBlossom, x: 8, y: 81, size: 36, opacity: 0.14, rotation: -15, drift: true },
    { Component: Petal, x: 50, y: 83, size: 20, opacity: 0.10, rotation: 8, twinkle: true },
    { Component: BlossomBud, x: 92, y: 82, size: 22, opacity: 0.13, rotation: -4 },

    // Row y≈94 (5 items)
    { Component: Petal, x: 14, y: 94, size: 28, opacity: 0.14, rotation: -25 },
    { Component: Branch, x: 34, y: 93, size: 48, opacity: 0.12, rotation: -10, drift: true },
    { Component: CherryBlossom, x: 54, y: 95, size: 32, opacity: 0.12, rotation: 18, twinkle: true },
    { Component: Petal, x: 74, y: 94, size: 24, opacity: 0.13, rotation: 5 },
    { Component: CherryBlossom, x: 88, y: 93, size: 44, opacity: 0.15, rotation: 28, drift: true },
  ],
};
