/**
 * SkySphere - Kepler Field Celestial Sphere
 *
 * Features:
 * - Orthographic camera (celestial sphere projection)
 * - Faint lat/long graticule (15° spacing)
 * - Highlighted Kepler Cygnus-Lyra field patch (RA 285-305°, Dec 30-55°)
 * - Points for each TCE at ra/dec, colored by CNN prob (grey→amber gradient)
 * - Red ring for flagged errors (high prob AFP/NTP)
 * - Drag to rotate (OrbitControls)
 * - Hover tooltip (kepid, label, probability)
 * - Click to select (dispatches to store)
 * - Red LeaderLine from point to inspector (when selected)
 * - Threshold recoloring: above threshold = amber, below = grey
 * - Fallback: if ra/dec missing, render polar scatter (period vs depth) on canvas
 */

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useSphereData, type SpherePoint, radecToVec3, getProbabilityColor } from './useSphereData';
import { useAppStore, useSelectTce, useSetHovered, useThreshold } from '../../store/useAppStore';
import { LeaderLine } from '../LeaderLine';
import './SkySphere.css';

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const SPHERE_RADIUS = 1;
const POINT_SIZE = 0.008; // Relative to sphere radius
const ERROR_RING_SIZE = POINT_SIZE * 1.8;
const KEPLER_PATCH_RA_MIN = 285;
const KEPLER_PATCH_RA_MAX = 305;
const KEPLER_PATCH_DEC_MIN = 30;
const KEPLER_PATCH_DEC_MAX = 55;
const GRATICULE_SPACING = 15; // degrees

// Color palette from design system
const COLOR_RED = new THREE.Color(0xff3d3d);
const COLOR_GRATICULE = new THREE.Color(0x1e242b); // --line-secondary
const COLOR_PATCH = new THREE.Color(0xffb800);
const COLOR_PATCH_OPACITY = 0.08;

// ──────────────────────────────────────────────────────────────
// Three.js Object Creation
// ──────────────────────────────────────────────────────────────

function createGraticule(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: COLOR_GRATICULE,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });

  // Latitude lines (parallels)
  for (let dec = -75; dec <= 75; dec += GRATICULE_SPACING) {
    const points: THREE.Vector3[] = [];
    for (let ra = 0; ra <= 360; ra += 5) {
      points.push(radecToVec3(ra, dec).multiplyScalar(SPHERE_RADIUS * 1.001));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geometry, material));
  }

  // Longitude lines (meridians)
  for (let ra = 0; ra < 360; ra += GRATICULE_SPACING) {
    const points: THREE.Vector3[] = [];
    for (let dec = -90; dec <= 90; dec += 5) {
      points.push(radecToVec3(ra, dec).multiplyScalar(SPHERE_RADIUS * 1.001));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geometry, material));
  }

  // Equator (highlighted)
  const equatorPoints: THREE.Vector3[] = [];
  for (let ra = 0; ra <= 360; ra += 2) {
    equatorPoints.push(radecToVec3(ra, 0).multiplyScalar(SPHERE_RADIUS * 1.002));
  }
  const equatorGeo = new THREE.BufferGeometry().setFromPoints(equatorPoints);
  const equatorMat = new THREE.LineBasicMaterial({
    color: COLOR_GRATICULE,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  group.add(new THREE.Line(equatorGeo, equatorMat));

  return group;
}

function createKeplerPatch(): THREE.Mesh {
  // Create a spherical patch for the Kepler field (Cygnus-Lyra)
  // Using a spherical cap geometry
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];

  // Generate vertices for the patch
  // RA: 285-305, Dec: 30-55
  const raSteps = 20;
  const decSteps = 20;

  for (let i = 0; i <= raSteps; i++) {
    const ra = KEPLER_PATCH_RA_MIN + (KEPLER_PATCH_RA_MAX - KEPLER_PATCH_RA_MIN) * (i / raSteps);
    for (let j = 0; j <= decSteps; j++) {
      const dec = KEPLER_PATCH_DEC_MIN + (KEPLER_PATCH_DEC_MAX - KEPLER_PATCH_DEC_MIN) * (j / decSteps);
      const vec = radecToVec3(ra, dec).multiplyScalar(SPHERE_RADIUS * 1.003);
      positions.push(vec.x, vec.y, vec.z);
    }
  }

  // Generate indices for triangles
  for (let i = 0; i < raSteps; i++) {
    for (let j = 0; j < decSteps; j++) {
      const a = i * (decSteps + 1) + j;
      const b = a + 1;
      const c = (i + 1) * (decSteps + 1) + j;
      const d = c + 1;
      indices.push(a, b, d);
      indices.push(d, c, a);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color: COLOR_PATCH,
    transparent: true,
    opacity: COLOR_PATCH_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  return new THREE.Mesh(geometry, material);
}

function createPointsMesh(points: SpherePoint[], threshold: number): THREE.Points {
  const count = points.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const indices = new Float32Array(count);

  points.forEach((point, i) => {
    if (point.position) {
      positions[i * 3] = point.position.x * SPHERE_RADIUS;
      positions[i * 3 + 1] = point.position.y * SPHERE_RADIUS;
      positions[i * 3 + 2] = point.position.z * SPHERE_RADIUS;
    } else {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }

    // Color will be updated via uniform threshold
    const color = point.color || getProbabilityColor(point.cnnProb, threshold);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    sizes[i] = POINT_SIZE * SPHERE_RADIUS * 100; // Scale for shader
    indices[i] = i;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('index', new THREE.BufferAttribute(indices, 1));

  // Custom shader for point rendering with threshold-based coloring
  const material = new THREE.PointsMaterial({
    size: POINT_SIZE * SPHERE_RADIUS * 100,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    sizeAttenuation: true,
  });

  return new THREE.Points(geometry, material);
}

function createErrorRings(points: SpherePoint[]): THREE.Group {
  const group = new THREE.Group();
  const ringGeometry = new THREE.RingGeometry(
    ERROR_RING_SIZE * SPHERE_RADIUS,
    ERROR_RING_SIZE * SPHERE_RADIUS * 1.15,
    32
  );

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: COLOR_RED,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  points.forEach((point) => {
    if (point.isError && point.position) {
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.copy(point.position.clone().multiplyScalar(SPHERE_RADIUS));
      // Orient ring to face camera (will be updated in render loop)
      ring.userData.position = point.position.clone();
      group.add(ring);
    }
  });

  return group;
}

function createSphereWireframe(): THREE.LineSegments {
  const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 32, 32);
  const edges = new THREE.EdgesGeometry(geometry);
  const material = new THREE.LineBasicMaterial({
    color: COLOR_GRATICULE,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  });
  return new THREE.LineSegments(edges, material);
}

// ──────────────────────────────────────────────────────────────
// Polar Scatter Fallback (Canvas 2D)
// ──────────────────────────────────────────────────────────────

interface PolarScatterProps {
  points: SpherePoint[];
  selectedIndex: number | null;
  hoveredIndex: number | null;
  threshold: number;
  onPointClick: (index: number) => void;
  onPointHover: (index: number | null, x?: number, y?: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function PolarScatter({
  points,
  selectedIndex,
  hoveredIndex,
  threshold,
  onPointClick,
  onPointHover,
  containerRef,
}: PolarScatterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [containerRef]);

  // Draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.scale(dpr, dpr);

    const width = size.width;
    const height = size.height;
    const padding = 40;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    // Clear
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#1e242b';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const x = padding + (plotWidth * i) / 5;
      const y = padding + (plotHeight * i) / 5;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + plotHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + plotWidth, y);
      ctx.stroke();
    }

    // Axes labels
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#8b929c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 5; i++) {
      const period = 0.5 * Math.pow(1000, i / 5);
      const x = padding + (plotWidth * i) / 5;
      ctx.fillText(period.toFixed(1), x, height - padding + 4);
    }
    ctx.fillText('PERIOD (days)', width / 2, height - padding + 22);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(padding - 8, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('DEPTH (relative)', 0, 0);
    ctx.restore();

    // Plot points
    points.forEach((point, i) => {
      if (point.polarX === undefined || point.polarY === undefined) return;

      const x = padding + point.polarX * plotWidth;
      const y = padding + (1 - point.polarY) * plotHeight; // Invert Y for depth

      const isSelected = i === selectedIndex;
      const isHovered = i === hoveredIndex;
      const prob = point.cnnProb ?? 0;
      const isAboveThreshold = prob >= threshold;

      // Color
      let color: string;
      if (prob === null) {
        color = '#555555';
      } else if (isAboveThreshold) {
        const t = (prob - threshold) / (1 - threshold);
        const g = Math.round(184 + 71 * t);
        color = `rgb(255, ${g}, 0)`;
      } else {
        const intensity = Math.round(77 + 102 * prob);
        color = `rgb(${intensity}, ${intensity}, ${intensity})`;
      }

      // Draw point
      const radius = isSelected ? 6 : isHovered ? 5 : 3;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Error ring
      if (point.isError) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff3d3d';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffb800';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Hover tooltip
    if (hoveredIndex !== null && hoveredIndex < points.length) {
      const point = points[hoveredIndex];
      if (point.polarX !== undefined && point.polarY !== undefined) {
        const x = padding + point.polarX * plotWidth;
        const y = padding + (1 - point.polarY) * plotHeight;

        const prob = point.cnnProb ?? 0;
        const label = point.labelName;
        const tooltipText = `KEPID: ${point.kepid} | ${label} | P: ${prob.toFixed(3)}`;

        ctx.font = '11px "IBM Plex Mono", monospace';
        const textWidth = ctx.measureText(tooltipText).width + 16;
        const tooltipX = Math.min(x + 12, width - textWidth - 12);
        const tooltipY = Math.max(y - 30, 20);

        ctx.fillStyle = 'rgba(5, 7, 10, 0.95)';
        ctx.strokeStyle = '#ffb800';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // roundRect fallback for older browsers
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(tooltipX, tooltipY, textWidth, 24, 3);
        } else {
          const r = 3;
          ctx.moveTo(tooltipX + r, tooltipY);
          ctx.lineTo(tooltipX + textWidth - r, tooltipY);
          ctx.quadraticCurveTo(tooltipX + textWidth, tooltipY, tooltipX + textWidth, tooltipY + r);
          ctx.lineTo(tooltipX + textWidth, tooltipY + 24 - r);
          ctx.quadraticCurveTo(tooltipX + textWidth, tooltipY + 24, tooltipX + textWidth - r, tooltipY + 24);
          ctx.lineTo(tooltipX + r, tooltipY + 24);
          ctx.quadraticCurveTo(tooltipX, tooltipY + 24, tooltipX, tooltipY + 24 - r);
          ctx.lineTo(tooltipX, tooltipY + r);
          ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + r, tooltipY);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e8ecef';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(tooltipText, tooltipX + 8, tooltipY + 12);
      }
    }
  }, [points, size, selectedIndex, hoveredIndex, threshold]);

  // Draw on changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Click handler
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const padding = 40;
      const plotWidth = size.width - padding * 2;
      const plotHeight = size.height - padding * 2;

      // Find closest point
      let minDist = Infinity;
      let closestIndex = -1;

      points.forEach((point, i) => {
        if (point.polarX === undefined || point.polarY === undefined) return;
        const px = padding + point.polarX * plotWidth;
        const py = padding + (1 - point.polarY) * plotHeight;
        const dist = Math.hypot(px - x, py - y);
        if (dist < minDist && dist < 15) {
          minDist = dist;
          closestIndex = i;
        }
      });

      if (closestIndex >= 0) {
        onPointClick(closestIndex);
      }
    },
    [points, size, onPointClick]
  );

  // Mouse move handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const padding = 40;
      const plotWidth = size.width - padding * 2;
      const plotHeight = size.height - padding * 2;

      let closestIndex = -1;
      let minDist = Infinity;

      points.forEach((point, i) => {
        if (point.polarX === undefined || point.polarY === undefined) return;
        const px = padding + point.polarX * plotWidth;
        const py = padding + (1 - point.polarY) * plotHeight;
        const dist = Math.hypot(px - x, py - y);
        if (dist < minDist && dist < 20) {
          minDist = dist;
          closestIndex = i;
        }
      });

      onPointHover(closestIndex >= 0 ? closestIndex : null, x, y);
    },
    [points, size, onPointHover]
  );

  return (
    <div
      ref={containerRef}
      className="skysphere-polar-fallback"
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => onPointHover(null)}
        style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
      />
      <div className="polar-fallback-label">
        POLAR FALLBACK: Period vs Depth (RA/Dec unavailable)
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Tooltip Component
// ──────────────────────────────────────────────────────────────

interface TooltipProps {
  visible: boolean;
  x: number;
  y: number;
  content: React.ReactNode;
}

function Tooltip({ visible, x, y, content }: TooltipProps) {
  if (!visible) return null;

  return (
    <div
      className="skysphere-tooltip"
      style={{
        left: x + 12,
        top: y + 12,
      }}
    >
      {content}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main SkySphere Component
// ──────────────────────────────────────────────────────────────

export const SkySphere: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const polarContainerRef = useRef<HTMLDivElement>(null);

  const { points, hasRaDec, isLoading, error } = useSphereData();
  const threshold = useThreshold();
  const selectTce = useSelectTce();
  const setHovered = useSetHovered();
  const selectedTceId = useAppStore((s) => s.selectedTceId);
  const mode = useAppStore((s) => s.mode);

  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsMeshRef = useRef<THREE.Points | null>(null);
  const errorRingsRef = useRef<THREE.Group | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // State for interaction
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [polarHoveredIndex, setPolarHoveredIndex] = useState<number | null>(null);
  const [leaderLinePos, setLeaderLinePos] = useState<{
    x1: number; y1: number; x2: number; y2: number;
  } | null>(null);

  // Selected point for leader line
  const selectedPoint = useMemo(() => {
    return points.findIndex((p) => p.tceId === selectedTceId);
  }, [points, selectedTceId]);

  // ──────────────────────────────────────────────────────────────
  // Three.js Initialization
  // ──────────────────────────────────────────────────────────────

  const initThree = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || sceneRef.current) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const aspect = width / height;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Orthographic camera for celestial sphere projection
    const frustumSize = 1.5;
    const camera = new THREE.OrthographicCamera(
      -frustumSize * aspect,
      frustumSize * aspect,
      frustumSize,
      -frustumSize,
      0.1,
      100
    );
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x05070a, 1);
    rendererRef.current = renderer;

    // Controls - OrbitControls for drag rotation
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.enablePan = false; // No panning for celestial sphere
    controls.minZoom = 0.5;
    controls.maxZoom = 3;
    controls.autoRotate = false;
    controls.rotateSpeed = 0.8;
    controlsRef.current = controls;

    // Add objects to scene
    scene.add(createSphereWireframe());
    scene.add(createGraticule());
    scene.add(createKeplerPatch());

    // Points mesh
    const pointsMesh = createPointsMesh(points, threshold);
    pointsMeshRef.current = pointsMesh;
    scene.add(pointsMesh);

    // Error rings
    const errorRings = createErrorRings(points);
    errorRingsRef.current = errorRings;
    scene.add(errorRings);

    // Handle window resize
    const handleResize = () => {
      const container = containerRef.current;
      if (!container || !cameraRef.current || !rendererRef.current) return;

      const width = container.clientWidth;
      const height = container.clientHeight;
      const aspect = width / height;
      const frustumSize = 1.5;

      cameraRef.current.left = -frustumSize * aspect;
      cameraRef.current.right = frustumSize * aspect;
      cameraRef.current.top = frustumSize;
      cameraRef.current.bottom = -frustumSize;
      cameraRef.current.updateProjectionMatrix();

      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      if (controlsRef.current) {
        controlsRef.current.update();
      }

      // Update error rings to face camera
      if (errorRingsRef.current && cameraRef.current) {
        errorRingsRef.current.children.forEach((ring) => {
          ring.lookAt(cameraRef.current!.position);
        });
      }

      rendererRef.current?.render(scene, cameraRef.current!);
    };

    animate();

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      pointsMeshRef.current = null;
      errorRingsRef.current = null;
    };
  }, [points, threshold]);

  // Initialize Three.js only when canvas is mounted (hasRaDec branch renders)
  useEffect(() => {
    if (!hasRaDec || !canvasRef.current) return;
    const cleanup = initThree();
    return cleanup;
  }, [initThree, hasRaDec]);

  // ──────────────────────────────────────────────────────────────
  // Update Points Color on Threshold Change
  // ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!pointsMeshRef.current || !pointsMeshRef.current.geometry) return;

    const colors = pointsMeshRef.current.geometry.getAttribute('color') as THREE.BufferAttribute;
    if (!colors) return;

    points.forEach((point, i) => {
      const color = getProbabilityColor(point.cnnProb, threshold);
      colors.setXYZ(i, color.r, color.g, color.b);
    });
    colors.needsUpdate = true;
  }, [points, threshold]);

  // ──────────────────────────────────────────────────────────────
  // Raycasting for Hover/Click
  // ──────────────────────────────────────────────────────────────

  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!hasRaDec || !cameraRef.current || !rendererRef.current || !pointsMeshRef.current) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, cameraRef.current);
      const intersects = raycaster.current.intersectObject(pointsMeshRef.current);

      if (intersects.length > 0) {
        const index = intersects[0].index;
        if (typeof index === 'number') {
          const point = points[index];
          if (point) {
            setHoveredIndex(index);
            setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            setHovered({ tceId: point.tceId, x: e.clientX, y: e.clientY });
          }
        }
      } else {
        setHoveredIndex(null);
        setHovered(null);
      }
    },
    [hasRaDec, points, setHovered]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!hasRaDec || !cameraRef.current || !pointsMeshRef.current) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, cameraRef.current);
      const intersects = raycaster.current.intersectObject(pointsMeshRef.current);

      if (intersects.length > 0) {
        const index = intersects[0].index;
        if (typeof index === 'number') {
          const point = points[index];
          if (point) {
            setSelectedIndex(index);
            selectTce(point.tceId);
          }
        }
      } else {
        setSelectedIndex(null);
        selectTce(null);
      }
    },
    [hasRaDec, points, selectTce]
  );

  // ──────────────────────────────────────────────────────────────
  // Leader Line Position Update
  // ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!hasRaDec || selectedPoint === -1 || !points[selectedPoint] || !containerRef.current) {
      setLeaderLinePos(null);
      return;
    }

    const container = containerRef.current;
    const point = points[selectedPoint];
    if (!point.position || !cameraRef.current || !rendererRef.current) {
      setLeaderLinePos(null);
      return;
    }

    // Project 3D point to 2D screen coordinates
    const vector = point.position.clone().multiplyScalar(SPHERE_RADIUS);
    vector.project(cameraRef.current);

    const rect = container.getBoundingClientRect();
    const x1 = ((vector.x + 1) / 2) * rect.width;
    const y1 = ((-vector.y + 1) / 2) * rect.height;

    // Inspector panel position (right side)
    const x2 = rect.width - 20; // Right edge of container
    const y2 = y1; // Same Y level

    setLeaderLinePos({ x1, y1, x2, y2 });
  }, [hasRaDec, selectedPoint, points]);

  // ──────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="skysphere-container" ref={containerRef}>
        <div className="skysphere-loading">LOADING CELESTIAL SPHERE...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="skysphere-container" ref={containerRef}>
        <div className="skysphere-error">ERROR: {error.message}</div>
      </div>
    );
  }

  // Polar fallback when RA/Dec unavailable
  if (!hasRaDec) {
    return (
      <div className="skysphere-container" ref={containerRef}>
        <PolarScatter
          points={points}
          selectedIndex={selectedIndex}
          hoveredIndex={polarHoveredIndex}
          threshold={threshold}
          onPointClick={setSelectedIndex}
          onPointHover={setPolarHoveredIndex}
          containerRef={polarContainerRef}
        />
      </div>
    );
  }

  return (
    <div className="skysphere-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="skysphere-canvas"
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        style={{ touchAction: 'none' }}
      />
      {leaderLinePos && (
        <LeaderLine
          x1={leaderLinePos.x1}
          y1={leaderLinePos.y1}
          x2={leaderLinePos.x2}
          y2={leaderLinePos.y2}
          color="red"
          strokeWidth={1.5}
        />
      )}
      <Tooltip
        visible={hoveredIndex !== null && hoveredIndex < points.length}
        x={tooltipPos.x}
        y={tooltipPos.y}
        content={
          hoveredIndex !== null && hoveredIndex < points.length ? (
            <>
              <div className="tooltip-row">
                <span className="tooltip-label">KEPID</span>
                <span className="tooltip-value">{points[hoveredIndex].kepid}</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">LABEL</span>
                <span className="tooltip-value">{points[hoveredIndex].labelName}</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">CNN PROB</span>
                <span className="tooltip-value text-amber">
                  {points[hoveredIndex].cnnProb?.toFixed(3) ?? 'N/A'}
                </span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">PERIOD</span>
                <span className="tooltip-value">{points[hoveredIndex].period.toFixed(2)} d</span>
              </div>
              <div className="tooltip-row">
                <span className="tooltip-label">DEPTH</span>
                <span className="tooltip-value">{points[hoveredIndex].depth.toFixed(4)}</span>
              </div>
              {points[hoveredIndex].isError && (
                <div className="tooltip-row text-red">
                  <span>⚠ POSSIBLE LABEL ERROR</span>
                </div>
              )}
            </>
          ) : null
        }
      />
      <div className="skysphere-legend">
        <div className="legend-item">
          <span className="legend-swatch" style={{ background: 'linear-gradient(90deg, #555, #999)' }} />
          <span className="legend-text">Below Threshold</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch" style={{ background: 'linear-gradient(90deg, #ffb800, #ffe066)' }} />
          <span className="legend-text">Above Threshold</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch legend-ring" style={{ borderColor: '#ff3d3d' }} />
          <span className="legend-text">Possible Label Error</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch legend-patch" style={{ background: 'rgba(255,184,0,0.15)' }} />
          <span className="legend-text">Kepler Field (Cygnus-Lyra)</span>
        </div>
      </div>
      <div className="skysphere-mode-indicator">MODE: {mode.toUpperCase()}</div>
    </div>
  );
};

export default SkySphere;