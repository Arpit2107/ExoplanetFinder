/**
 * Hook to fetch and transform TCE data for the SkySphere component.
 * Handles RA/Dec to 3D sphere coordinate conversion and fallbacks.
 */

import * as THREE from 'three';
import { useSkyViewTces } from '../../api/queries';
import type { Split } from '../../api/types';
import { useMemo } from 'react';

/**
 * Convert RA (degrees) and Dec (degrees) to 3D unit sphere coordinates.
 * RA 0° = +X axis, RA 90° = +Z axis (using Three.js convention: Y up, -Z forward)
 * Dec 0° = equator, Dec +90° = +Y (north pole)
 */
export function radecToVec3(ra: number, dec: number): THREE.Vector3 {
  // Convert to radians
  const raRad = (ra * Math.PI) / 180;
  const decRad = (dec * Math.PI) / 180;

  // Spherical to Cartesian on unit sphere
  // Three.js: Y up, -Z forward
  // RA=0, Dec=0 -> (1, 0, 0) = +X
  // RA=90, Dec=0 -> (0, 0, -1) = -Z
  // Dec=90 -> (0, 1, 0) = +Y (north pole)
  const x = Math.cos(decRad) * Math.cos(raRad);
  const y = Math.sin(decRad);
  const z = -Math.cos(decRad) * Math.sin(raRad); // Negative for Three.js -Z forward

  return new THREE.Vector3(x, y, z);
}

/**
 * Convert 3D sphere coordinates back to RA/Dec (for hit testing if needed)
 */
export function vec3ToRadec(vec: THREE.Vector3): { ra: number; dec: number } {
  const x = vec.x;
  const y = vec.y;
  const z = vec.z;

  // Ensure unit vector
  const len = Math.sqrt(x * x + y * y + z * z);
  const nx = x / len;
  const ny = y / len;
  const nz = z / len;

  const dec = Math.asin(Math.max(-1, Math.min(1, ny))) * (180 / Math.PI);
  const ra = Math.atan2(-nz, nx) * (180 / Math.PI); // Negative z for Three.js convention
  const raNorm = ra < 0 ? ra + 360 : ra;

  return { ra: raNorm, dec };
}

/**
 * Data point for sphere rendering
 */
export interface SpherePoint {
  tceId: string;
  kepid: number;
  ra: number | null;
  dec: number | null;
  period: number;
  duration: number;
  depth: number;
  label: number;
  labelName: string;
  cnnProb: number | null;
  gbProb: number | null;
  split: Split;
  // Computed
  position?: THREE.Vector3;
  color?: THREE.Color;
  isError?: boolean;
  // For polar fallback
  polarX?: number; // 0-1 normalized period
  polarY?: number; // 0-1 normalized depth
}

/**
 * Sphere data result from hook
 */
export interface UseSphereDataResult {
  points: SpherePoint[];
  hasRaDec: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Get color for CNN probability: grey → amber gradient
 * Below threshold = grey, above = amber intensity based on probability
 */
export function getProbabilityColor(prob: number | null, threshold: number): THREE.Color {
  if (prob === null) {
    return new THREE.Color(0x555555); // Dark grey for missing
  }

  if (prob < threshold) {
    // Grey scale based on probability (darker = lower prob)
    const intensity = 0.3 + 0.4 * prob; // 0.3 to 0.7
    return new THREE.Color(intensity, intensity, intensity);
  }

  // Amber gradient: from yellow-amber to bright amber
  // Using design system --semantic-amber: #ffb800
  const t = (prob - threshold) / (1 - threshold); // 0 to 1 above threshold
  const r = 1.0;
  const g = 0.72 + 0.28 * t; // 0.72 to 1.0
  const b = 0.0 + 0.1 * t;   // 0 to 0.1

  return new THREE.Color(r, g, b);
}

/**
 * Hook to fetch TCEs and transform them for sphere rendering
 */
export function useSphereData(
  split: Split = 'test',
  threshold: number = 0.5
): UseSphereDataResult {
  const { data, isLoading, error, refetch } = useSkyViewTces(split);

  const result = useMemo(() => {
    if (!data) {
      return {
        points: [] as SpherePoint[],
        hasRaDec: false,
      };
    }

    // Check if we have any valid RA/Dec
    const pointsWithRaDec = data.filter(
      (tce) => tce.ra !== null && tce.dec !== null
    );
    const hasRaDec = pointsWithRaDec.length > 0;

    // Determine error flags: high prob AFP/NTP that might be label errors
    // Error = (label is AFP or NTP) AND (cnn_prob > threshold)
    const points: SpherePoint[] = data.map((tce) => {
      const prob = tce.cnn_prob ?? 0;
      const isError =
        (tce.label_name === 'AFP' || tce.label_name === 'NTP' || tce.label_name === 'AFP/NTP') &&
        prob > threshold;

      let position: THREE.Vector3 | undefined;
      let polarX: number | undefined;
      let polarY: number | undefined;

      if (hasRaDec && tce.ra !== null && tce.dec !== null) {
        position = radecToVec3(tce.ra, tce.dec);
      } else {
        // Polar fallback: normalize period and depth for scatter
        // Period: log scale 0.5 to 500 days -> 0 to 1
        // Depth: 0 to max depth in data -> 0 to 1
        polarX = Math.log10(tce.period / 0.5) / Math.log10(500 / 0.5);
        polarX = Math.max(0, Math.min(1, polarX));
        // Depth will be normalized in the component after collecting all points
        polarY = tce.depth; // Raw depth, normalized later
      }

      return {
        tceId: tce.tce_id,
        kepid: tce.kepid,
        ra: tce.ra,
        dec: tce.dec,
        period: tce.period,
        duration: tce.duration,
        depth: tce.depth,
        label: tce.label,
        labelName: tce.label_name,
        cnnProb: tce.cnn_prob,
        gbProb: tce.gb_prob,
        split: tce.split,
        position,
        polarX,
        polarY,
        color: getProbabilityColor(tce.cnn_prob, threshold),
        isError,
      };
    });

    // Normalize polarY (depth) across all points
    if (!hasRaDec && points.length > 0) {
      const maxDepth = Math.max(...points.map((p) => p.depth));
      points.forEach((p) => {
        p.polarY = maxDepth > 0 ? p.depth / maxDepth : 0.5;
      });
    }

    return { points, hasRaDec };
  }, [data, threshold]);

  return {
    points: result.points,
    hasRaDec: result.hasRaDec,
    isLoading,
    error,
    refetch,
  };
}