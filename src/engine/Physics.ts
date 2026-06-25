export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  isBouncePad?: boolean;
  isOpen?: boolean; // Sliding doors state
}

export interface CollisionResult {
  collided: boolean;
  overlapX: number;
  overlapY: number;
  normalX: number;
  normalY: number;
}

/**
 * Checks and resolves collision between a Circle and an AABB.
 * Returns a CollisionResult with normal pointing OUT of the AABB.
 */
export function testCircleVsAABB(circle: Circle, aabb: AABB): CollisionResult {
  // Bypassed if the wall/door is open
  if (aabb.isOpen) {
    return { collided: false, overlapX: 0, overlapY: 0, normalX: 0, normalY: 0 };
  }

  // Find the closest point on the AABB to the circle center
  const closestX = Math.max(aabb.minX, Math.min(circle.x, aabb.maxX));
  const closestY = Math.max(aabb.minY, Math.min(circle.y, aabb.maxY));

  // Calculate distance between circle center and closest point
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  const distanceSq = dx * dx + dy * dy;

  if (distanceSq >= circle.radius * circle.radius) {
    return { collided: false, overlapX: 0, overlapY: 0, normalX: 0, normalY: 0 };
  }

  const distance = Math.sqrt(distanceSq);

  // If the circle's center is exactly on the edge or inside the AABB
  if (distance === 0) {
    // Determine which side of the box center the circle center is closer to
    const centerX = (aabb.minX + aabb.maxX) / 2;
    const centerY = (aabb.minY + aabb.maxY) / 2;
    const pX = circle.x - centerX;
    const pY = circle.y - centerY;
    const halfWidth = (aabb.maxX - aabb.minX) / 2;
    const halfHeight = (aabb.maxY - aabb.minY) / 2;

    const dx1 = halfWidth - Math.abs(pX);
    const dy1 = halfHeight - Math.abs(pY);

    if (dx1 < dy1) {
      const sx = Math.sign(pX) || 1;
      return {
        collided: true,
        overlapX: (circle.radius + dx1) * sx,
        overlapY: 0,
        normalX: sx,
        normalY: 0
      };
    } else {
      const sy = Math.sign(pY) || 1;
      return {
        collided: true,
        overlapX: 0,
        overlapY: (circle.radius + dy1) * sy,
        normalX: 0,
        normalY: sy
      };
    }
  }

  const normalX = dx / distance;
  const normalY = dy / distance;
  const overlap = circle.radius - distance;

  return {
    collided: true,
    overlapX: normalX * overlap,
    overlapY: normalY * overlap,
    normalX,
    normalY
  };
}

/**
 * Checks and resolves collision between two Circles.
 */
export function testCircleVsCircle(c1: Circle, c2: Circle): CollisionResult {
  const dx = c1.x - c2.x;
  const dy = c1.y - c2.y;
  const distanceSq = dx * dx + dy * dy;
  const radiusSum = c1.radius + c2.radius;

  if (distanceSq >= radiusSum * radiusSum) {
    return { collided: false, overlapX: 0, overlapY: 0, normalX: 0, normalY: 0 };
  }

  const distance = Math.sqrt(distanceSq);
  if (distance === 0) {
    // Displace randomly
    return {
      collided: true,
      overlapX: radiusSum,
      overlapY: 0,
      normalX: 1,
      normalY: 0
    };
  }

  const normalX = dx / distance;
  const normalY = dy / distance;
  const overlap = radiusSum - distance;

  return {
    collided: true,
    overlapX: normalX * overlap,
    overlapY: normalY * overlap,
    normalX,
    normalY
  };
}

/**
 * Reflects a velocity vector against a collision normal.
 */
export function reflectVector(vx: number, vy: number, nx: number, ny: number, bounciness: number = 1): { x: number; y: number } {
  // Dot product of velocity and normal
  const dot = vx * nx + vy * ny;
  
  // If moving away, don't reflect
  if (dot >= 0) return { x: vx, y: vy };

  // R = V - 2 * (V . N) * N
  return {
    x: vx - 2 * dot * nx * bounciness,
    y: vy - 2 * dot * ny * bounciness
  };
}
