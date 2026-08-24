import * as THREE from 'three';
import { type AABB } from '../engine/Physics';
import { PowerUpType } from '../entities/PowerUp';

export interface TrialStage {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  tip: string;
  parTime: number; // For 3 stars (seconds)
  maxShots: number; // Max shots for 3 stars
  star2Time: number;
  playerSpawn: { x: number; y: number };
  dummies: { id: string; x: number; y: number; health: number; radius: number; isMoving?: boolean; moveAxis?: 'x' | 'y'; moveRange?: number; moveSpeed?: number }[];
  walls: AABB[];
  powerups?: { x: number; y: number; type: PowerUpType }[];
  portals?: { id1: string; x1: number; y1: number; id2: string; x2: number; y2: number }[];
  bouncePads?: AABB[];
  speedRunes?: { id: string; x: number; y: number }[];
}

export interface TargetDummy {
  id: string;
  x: number;
  y: number;
  radius: number;
  health: number;
  maxHealth: number;
  isDead: boolean;
  mesh: THREE.Group;
  isMoving?: boolean;
  baseX?: number;
  baseY?: number;
  moveAxis?: 'x' | 'y';
  moveRange?: number;
  moveSpeed?: number;
  movePhase?: number;
}

export const TRIAL_STAGES: TrialStage[] = [
  {
    id: 0,
    title: "Stage 0: Academy Basics",
    subtitle: "Movement, Dashing & Curved Spellcraft",
    description: "Welcome to the Arcane Academy! Learn the fundamentals of moving, dashing, and curving magic spells around obstacles.",
    tip: "Use Left Stick / WASD to move, [Space] / Dash button to burst forward, and Mouse / Right Stick to guide your curved projectile in mid-air.",
    parTime: 18.0,
    maxShots: 6,
    star2Time: 30.0,
    playerSpawn: { x: -8, y: 0 },
    dummies: [
      { id: "dummy_0a", x: 0, y: -5, health: 30, radius: 0.75 },
      { id: "dummy_0b", x: 8, y: 5, health: 30, radius: 0.75 }
    ],
    walls: [
      { minX: -16, minY: -12, maxX: -15, maxY: 12 },
      { minX: 15, minY: -12, maxX: 16, maxY: 12 },
      { minX: -16, minY: -12, maxX: 16, maxY: -11 },
      { minX: -16, minY: 11, maxX: 16, maxY: 12 },
      // Central partition
      { minX: -1, minY: -2, maxX: 1, maxY: 6 }
    ],
    powerups: [
      { x: -3, y: 0, type: PowerUpType.HASTE }
    ]
  },
  {
    id: 1,
    title: "Stage 1: The Curved Arc",
    subtitle: "Curving Behind Solid Pillars",
    description: "A shielded training dummy hides directly behind a massive stone pillar. Curve your spell in mid-air around the pillar to hit it.",
    tip: "Fire past the side of the pillar, then immediately steer your target reticle towards the dummy behind cover.",
    parTime: 8.0,
    maxShots: 2,
    star2Time: 14.0,
    playerSpawn: { x: 0, y: -7 },
    dummies: [
      { id: "dummy_1", x: 0, y: 6, health: 35, radius: 0.75 }
    ],
    walls: [
      { minX: -14, minY: -10, maxX: -13, maxY: 10 },
      { minX: 13, minY: -10, maxX: 14, maxY: 10 },
      { minX: -14, minY: -10, maxX: 14, maxY: -9 },
      { minX: -14, minY: 9, maxX: 14, maxY: 10 },
      // Solid central pillar
      { minX: -3.5, minY: -1, maxX: 3.5, maxY: 2.5 }
    ]
  },
  {
    id: 2,
    title: "Stage 2: Double Ricochet",
    subtitle: "Mastering Wall Bounces",
    description: "The target is enclosed in a U-bend corridor with no direct line of sight. Bank your projectile off the angled walls into the target.",
    tip: "Spells bounce off walls with enhanced velocity. Aim for a 45-degree angle to bank around the corner.",
    parTime: 10.0,
    maxShots: 3,
    star2Time: 16.0,
    playerSpawn: { x: -8, y: -6 },
    dummies: [
      { id: "dummy_2", x: 8, y: 6, health: 35, radius: 0.75 }
    ],
    walls: [
      { minX: -14, minY: -10, maxX: -13, maxY: 10 },
      { minX: 13, minY: -10, maxX: 14, maxY: 10 },
      { minX: -14, minY: -10, maxX: 14, maxY: -9 },
      { minX: -14, minY: 9, maxX: 14, maxY: 10 },
      // U-Bend maze walls
      { minX: -6, minY: -4, maxX: 10, maxY: -2 },
      { minX: -10, minY: 2, maxX: 6, maxY: 4 }
    ],
    powerups: [
      { x: -8, y: -2, type: PowerUpType.BOUNCE }
    ]
  },
  {
    id: 3,
    title: "Stage 3: Wall Glider",
    subtitle: "Tangent Wall-Running Precision",
    description: "Cast your spell parallel to the long stone hallway to trigger a Wall Glide, hugging the corridor edge to strike the hidden target.",
    tip: "When a curved projectile hits a wall at a shallow angle (<28°), it commits into a high-speed Wall-Run tangent glide.",
    parTime: 9.0,
    maxShots: 2,
    star2Time: 15.0,
    playerSpawn: { x: -9, y: 0 },
    dummies: [
      { id: "dummy_3", x: 9, y: 5.5, health: 40, radius: 0.75 }
    ],
    walls: [
      { minX: -14, minY: -8, maxX: -13, maxY: 8 },
      { minX: 13, minY: -8, maxX: 14, maxY: 8 },
      { minX: -14, minY: -8, maxX: 14, maxY: -7 },
      { minX: -14, minY: 7, maxX: 14, maxY: 8 },
      // Long glide guide wall
      { minX: -5, minY: 2, maxX: 8, maxY: 3.5 }
    ]
  },
  {
    id: 4,
    title: "Stage 4: Split Shards",
    subtitle: "Multi-Target Fragmentation",
    description: "Two dummies are positioned on opposite sides of a divider. Grab the Split power-up and explode your spell in mid-air to hit both simultaneously.",
    tip: "A Split spell detonates into 3 secondary fragments when it collides with a wall or enemy, striking multiple targets at once.",
    parTime: 8.0,
    maxShots: 2,
    star2Time: 14.0,
    playerSpawn: { x: 0, y: -7 },
    dummies: [
      { id: "dummy_4a", x: -6, y: 4, health: 30, radius: 0.75 },
      { id: "dummy_4b", x: 6, y: 4, health: 30, radius: 0.75 }
    ],
    walls: [
      { minX: -14, minY: -10, maxX: -13, maxY: 10 },
      { minX: 13, minY: -10, maxX: 14, maxY: 10 },
      { minX: -14, minY: -10, maxX: 14, maxY: -9 },
      { minX: -14, minY: 9, maxX: 14, maxY: 10 },
      // Center wedge
      { minX: -1, minY: 0, maxX: 1, maxY: 7 }
    ],
    powerups: [
      { x: 0, y: -4, type: PowerUpType.SPLIT }
    ]
  },
  {
    id: 5,
    title: "Stage 5: Astral Portal Pass",
    subtitle: "Teleporting Projectile Trajectories",
    description: "The target dummy is sealed inside a reinforced courtyard. Curve your spell into an Arcane Portal to teleport it straight into the target.",
    tip: "Projectiles and casters preserve their momentum and direction when traveling through Arcane Portals.",
    parTime: 10.0,
    maxShots: 3,
    star2Time: 16.0,
    playerSpawn: { x: -8, y: -5 },
    dummies: [
      { id: "dummy_5", x: 6, y: 6, health: 35, radius: 0.75 }
    ],
    walls: [
      { minX: -14, minY: -10, maxX: -13, maxY: 10 },
      { minX: 13, minY: -10, maxX: 14, maxY: 10 },
      { minX: -14, minY: -10, maxX: 14, maxY: -9 },
      { minX: -14, minY: 9, maxX: 14, maxY: 10 },
      // Complete sealed enclosure around dummy except portal exit
      { minX: 2, minY: 2, maxX: 10, maxY: 3.5 },
      { minX: 2, minY: 2, maxX: 3.5, maxY: 8 }
    ],
    portals: [
      { id1: "p_in", x1: -5, y1: 4, id2: "p_out", x2: 5, y2: 4 }
    ]
  },
  {
    id: 6,
    title: "Stage 6: Portcullis Timing",
    subtitle: "Dynamic Obstacle Window",
    description: "A sliding security gate opens and closes periodically. Time your curved shot through the opening to hit the dummy on the other side.",
    tip: "Watch the rhythm of the portcullis door. Fire slightly before it reaches full extension so your bullet arrives just as it clears.",
    parTime: 11.0,
    maxShots: 3,
    star2Time: 18.0,
    playerSpawn: { x: -8, y: 0 },
    dummies: [
      { id: "dummy_6", x: 8, y: 0, health: 40, radius: 0.75 }
    ],
    walls: [
      { minX: -14, minY: -8, maxX: -13, maxY: 8 },
      { minX: 13, minY: -8, maxX: 14, maxY: 8 },
      { minX: -14, minY: -8, maxX: 14, maxY: -7 },
      { minX: -14, minY: 7, maxX: 14, maxY: 8 },
      // Barrier with small middle gap
      { minX: -0.5, minY: -8, maxX: 0.5, maxY: -2 },
      { minX: -0.5, minY: 2, maxX: 0.5, maxY: 8 }
    ]
  },
  {
    id: 7,
    title: "Stage 7: Moving Target Intercept",
    subtitle: "Predictive Curving & Leading",
    description: "The practice dummy patrols back and forth along the corridor. Lead your curved shot ahead of its trajectory to intercept it.",
    tip: "Estimate where the dummy will be in 0.8 seconds and curve your projectile toward that interception point.",
    parTime: 9.0,
    maxShots: 3,
    star2Time: 15.0,
    playerSpawn: { x: 0, y: -7 },
    dummies: [
      { id: "dummy_7", x: 0, y: 5, health: 35, radius: 0.75, isMoving: true, moveAxis: 'x', moveRange: 5.0, moveSpeed: 4.5 }
    ],
    walls: [
      { minX: -14, minY: -10, maxX: -13, maxY: 10 },
      { minX: 13, minY: -10, maxX: 14, maxY: 10 },
      { minX: -14, minY: -10, maxX: 14, maxY: -9 },
      { minX: -14, minY: 9, maxX: 14, maxY: 10 },
      { minX: -3, minY: -1, maxX: 3, maxY: 1 }
    ]
  },
  {
    id: 8,
    title: "Stage 8: Frost Shatter Synergy",
    subtitle: "Elemental Fusion Combination",
    description: "A rapid shielded dummy darts across the floor. Grab the Frost power-up, freeze it in place, then finish it with a follow-up strike.",
    tip: "Frost slows target speed by 60% and increases vulnerability to subsequent spell impacts.",
    parTime: 10.0,
    maxShots: 4,
    star2Time: 16.0,
    playerSpawn: { x: -8, y: -5 },
    dummies: [
      { id: "dummy_8", x: 6, y: 4, health: 50, radius: 0.75, isMoving: true, moveAxis: 'y', moveRange: 4.0, moveSpeed: 5.0 }
    ],
    walls: [
      { minX: -14, minY: -10, maxX: -13, maxY: 10 },
      { minX: 13, minY: -10, maxX: 14, maxY: 10 },
      { minX: -14, minY: -10, maxX: 14, maxY: -9 },
      { minX: -14, minY: 9, maxX: 14, maxY: 10 },
      { minX: -1, minY: -4, maxX: 1, maxY: 4 }
    ],
    powerups: [
      { x: -5, y: -2, type: PowerUpType.FREEZE },
      { x: -5, y: 2, type: PowerUpType.HASTE }
    ]
  },
  {
    id: 9,
    title: "Stage 9: The Needle's Eye",
    subtitle: "Winding Micro-Steering Maze",
    description: "Navigate your curved projectile through a triple-turn serpentine maze without letting it touch the side walls.",
    tip: "Maintain smooth, continuous mouse/stick movements. Over-steering will cause the projectile to skid into the outer wall.",
    parTime: 11.0,
    maxShots: 3,
    star2Time: 18.0,
    playerSpawn: { x: -10, y: -6 },
    dummies: [
      { id: "dummy_9", x: 10, y: 6, health: 30, radius: 0.75 }
    ],
    walls: [
      { minX: -14, minY: -10, maxX: -13, maxY: 10 },
      { minX: 13, minY: -10, maxX: 14, maxY: 10 },
      { minX: -14, minY: -10, maxX: 14, maxY: -9 },
      { minX: -14, minY: 9, maxX: 14, maxY: 10 },
      // Serpentine partitions
      { minX: -6, minY: -10, maxX: -4, maxY: 4 },
      { minX: 4, minY: -4, maxX: 6, maxY: 10 }
    ]
  },
  {
    id: 10,
    title: "Stage 10: Grand Archmage Gauntlet",
    subtitle: "4-Corner Elimination Trial",
    description: "The ultimate trial. Four training dummies are entrenched in all four quadrants of the arena. Destroy all four in under 12 seconds.",
    tip: "Utilize acceleration runes, bounce pads, and split power-ups to clear all corners with maximum speed.",
    parTime: 12.0,
    maxShots: 8,
    star2Time: 20.0,
    playerSpawn: { x: 0, y: 0 },
    dummies: [
      { id: "dummy_10a", x: -8, y: -8, health: 35, radius: 0.75 },
      { id: "dummy_10b", x: 8, y: -8, health: 35, radius: 0.75 },
      { id: "dummy_10c", x: -8, y: 8, health: 35, radius: 0.75 },
      { id: "dummy_10d", x: 8, y: 8, health: 35, radius: 0.75 }
    ],
    walls: [
      { minX: -14, minY: -14, maxX: -13, maxY: 14 },
      { minX: 13, minY: -14, maxX: 14, maxY: 14 },
      { minX: -14, minY: -14, maxX: 14, maxY: -13 },
      { minX: -14, minY: 13, maxX: 14, maxY: 14 },
      // Corner bunkers
      { minX: -5, minY: -5, maxX: -3, maxY: -3 },
      { minX: 3, minY: -5, maxX: 5, maxY: -3 },
      { minX: -5, minY: 3, maxX: -3, maxY: 5 },
      { minX: 3, minY: 3, maxX: 5, maxY: 5 }
    ],
    powerups: [
      { x: 0, y: -4, type: PowerUpType.SPLIT },
      { x: 0, y: 4, type: PowerUpType.BOUNCE }
    ],
    speedRunes: [
      { id: "r1", x: -4, y: 0 },
      { id: "r2", x: 4, y: 0 }
    ]
  }
];

export function buildDummyMesh(radius: number): THREE.Group {
  const group = new THREE.Group();

  // Wooden practice post body
  const bodyGeo = new THREE.CylinderGeometry(radius * 0.65, radius * 0.75, 1.2, 12);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.8,
    metalness: 0.1
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.6;
  body.castShadow = true;
  group.add(body);

  // Straw head / helmet
  const headGeo = new THREE.SphereGeometry(radius * 0.55, 10, 10);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xccaa55,
    roughness: 0.9
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.35;
  head.castShadow = true;
  group.add(head);

  // Target bullseye shield
  const shieldGeo = new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, 0.08, 16);
  const shieldMat = new THREE.MeshStandardMaterial({
    color: 0xff3344,
    emissive: 0xaa1122,
    emissiveIntensity: 0.4,
    roughness: 0.3
  });
  const shield = new THREE.Mesh(shieldGeo, shieldMat);
  shield.rotation.x = Math.PI / 2;
  shield.position.set(0, 0.75, 0.42);
  group.add(shield);

  // Bullseye inner ring
  const bullseyeGeo = new THREE.CircleGeometry(radius * 0.35, 12);
  const bullseyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const bullseye = new THREE.Mesh(bullseyeGeo, bullseyeMat);
  bullseye.position.set(0, 0.75, 0.47);
  group.add(bullseye);

  // Wooden stand cross base
  const baseGeo = new THREE.BoxGeometry(radius * 1.6, 0.1, radius * 1.6);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x5a3818, roughness: 0.9 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.05;
  group.add(base);

  return group;
}
