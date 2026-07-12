import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import Matter from 'matter-js';
import {
  WIDTH,
  HEIGHT,
  PLANK_LENGTH,
  PLANK_THICK,
  BOARD_DATA,
  EXIT_META,
  TOP_BOTTOM_WALL_RECTS,
  LEFT_WALL_RECTS,
  RIGHT_WALL_RECTS,
  BUG_SPEED,
  WOBBLE_TIME_STEP,
  WOBBLE_AMPLITUDE,
  WOBBLE_FREQUENCY_RATIO,
  STUCK_VELOCITY_THRESHOLD,
  STUCK_TICK_LIMIT,
  SPEED_VARIANCE,
  JITTER_CHANCE,
  JITTER_STRENGTH,
  ANGULAR_DAMPING,
  MAX_BUG_VELOCITY,
} from './constants';
import { computePivotOffset } from './pivot';
import { drawBug } from './bugRenderer';
import type { ExitMeta, Phase } from './types';

const { Engine, Render, Runner, Bodies, Composite, Body, Vector, Events, Bounds } = Matter;

interface UsePhysicsEngineOptions {
  containerRef: RefObject<HTMLDivElement>;
  phase: Phase;
  onEscape: (exit: ExitMeta) => void;
}

export function usePhysicsEngine({ containerRef, phase, onEscape }: UsePhysicsEngineOptions): void {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const prevPhaseRef = useRef<Phase>(phase);
  const bugRef = useRef<Matter.Body | null>(null);
  const isPlayingRef = useRef(false);
  const noiseTimeRef = useRef(0);
  const stuckTimerRef = useRef(0);
  const trailRef = useRef<{ x: number; y: number }[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    console.log('[physics] engine (re)created', { time: new Date().toISOString() });

    const engine = Engine.create({ gravity: { x: 0, y: 0 } });

    const render = Render.create({
      element: container,
      engine,
      options: { width: WIDTH, height: HEIGHT, wireframes: false, background: '#4a3525' },
    });
    Render.run(render);
    render.canvas.style.width = '100%';
    render.canvas.style.height = '100%';

    const runner = Runner.create();
    Runner.run(runner, engine);

    const wallOptions = {
      isStatic: true,
      render: { fillStyle: '#2b1d11' },
      friction: 0,
      restitution: 0.5,
    };
    const wallRects = [...TOP_BOTTOM_WALL_RECTS, ...LEFT_WALL_RECTS, ...RIGHT_WALL_RECTS];
    const walls = wallRects.map((w) => Bodies.rectangle(w.x, w.y, w.width, w.height, wallOptions));
    Composite.add(engine.world, walls);

    const exitSensors = EXIT_META.map((meta) =>
      Bodies.rectangle(meta.side === 'left' ? -5 : WIDTH + 5, meta.y, 40, meta.height, {
        isStatic: true,
        isSensor: true,
        render: { fillStyle: '#1a1a1a', strokeStyle: '#ffcc00', lineWidth: 1 },
      })
    );
    Composite.add(engine.world, exitSensors);

    const planks = BOARD_DATA.map((data) => {
      const angle = data.state === 1 ? Math.PI / 2 : 0;
      const plank = Bodies.rectangle(data.x, data.y, PLANK_THICK, PLANK_LENGTH, {
        isStatic: true,
        angle,
        friction: 0,
        restitution: 0.4,
        render: { fillStyle: '#8b7355', strokeStyle: '#5c4033', lineWidth: 2 },
      });
      const worldOffset = computePivotOffset(angle);
      Body.setCentre(plank, worldOffset, true);
      return plank;
    });
    Composite.add(engine.world, planks);

    const bug = Bodies.circle(WIDTH / 2, HEIGHT / 2, 14, {
      friction: 0,
      frictionAir: 0,
      restitution: 0.5,
      render: { visible: false },
    });
    Composite.add(engine.world, bug);
    bugRef.current = bug;

    Events.on(render, 'afterRender', () => {
      const ctx = render.context;

      if (trailRef.current.length > 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(95, 184, 176, 0.5)';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(trailRef.current[0].x, trailRef.current[0].y);
        for (let i = 1; i < trailRef.current.length; i++) {
          ctx.lineTo(trailRef.current[i].x, trailRef.current[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }

      drawBug(ctx, bug, noiseTimeRef.current);

      ctx.save();
      ctx.fillStyle = '#ffcc66';
      planks.forEach((plank) => {
        ctx.beginPath();
        ctx.arc(plank.position.x, plank.position.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    });

    Events.on(engine, 'beforeUpdate', () => {
      if (!isPlayingRef.current) return;

      const angle = bug.angle;
      const speedMultiplier = 1 + (Math.random() * 2 - 1) * SPEED_VARIANCE;
      // Force direction must match the head's facing direction drawn in bugRenderer.ts
      // (head is drawn at local +x, which after ctx.rotate(angle) faces (cos, sin)).
      Body.applyForce(bug, bug.position, {
        x: Math.cos(angle) * BUG_SPEED * speedMultiplier,
        y: Math.sin(angle) * BUG_SPEED * speedMultiplier,
      });

      noiseTimeRef.current += WOBBLE_TIME_STEP;
      const wobble =
        Math.sin(noiseTimeRef.current) * Math.cos(noiseTimeRef.current * WOBBLE_FREQUENCY_RATIO) * WOBBLE_AMPLITUDE;
      let angularVelocity = bug.angularVelocity * ANGULAR_DAMPING + wobble;

      if (Math.random() < JITTER_CHANCE) {
        angularVelocity += (Math.random() * 2 - 1) * JITTER_STRENGTH;
      }

      Body.setAngularVelocity(bug, angularVelocity);

      trailRef.current.push({ x: bug.position.x, y: bug.position.y });

      // Cap speed: with frictionAir 0 nothing ever decays velocity, so repeated wall
      // bounces plus SPEED_VARIANCE can otherwise build up enough speed in one tick to
      // tunnel straight through a wall segment instead of colliding with it.
      const speed = Vector.magnitude(bug.velocity);
      if (speed > MAX_BUG_VELOCITY) {
        const scale = MAX_BUG_VELOCITY / speed;
        Body.setVelocity(bug, { x: bug.velocity.x * scale, y: bug.velocity.y * scale });
      }

      if (speed < STUCK_VELOCITY_THRESHOLD) {
        stuckTimerRef.current++;
        if (stuckTimerRef.current > STUCK_TICK_LIMIT) {
          Body.setAngle(bug, bug.angle + Math.PI + (Math.random() - 0.5));
          Body.setVelocity(bug, { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 5 });
          stuckTimerRef.current = 0;
        }
      } else {
        stuckTimerRef.current = 0;
      }

      exitSensors.forEach((sensor, i) => {
        if (Bounds.contains(sensor.bounds, bug.position)) {
          console.log('[physics] exit sensor hit', {
            exitIndex: i,
            exitLabel: EXIT_META[i].label,
            bugPosition: { x: Math.round(bug.position.x), y: Math.round(bug.position.y) },
            time: new Date().toISOString(),
          });
          isPlayingRef.current = false;
          Body.setVelocity(bug, { x: 0, y: 0 });
          onEscapeRef.current(EXIT_META[i]);
        }
      });
    });

    render.canvas.addEventListener('click', (e) => {
      if (phaseRef.current !== 'setup') return;
      const rect = render.canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (WIDTH / rect.width);
      const my = (e.clientY - rect.top) * (HEIGHT / rect.height);
      planks.forEach((plank) => {
        if (Bounds.contains(plank.bounds, { x: mx, y: my })) {
          Body.setAngle(plank, plank.angle + Math.PI / 2);
        }
      });
    });

    return () => {
      Render.stop(render);
      Runner.stop(runner);
      Engine.clear(engine);
      render.canvas.remove();
    };
  }, [containerRef]);

  useEffect(() => {
    if (phase === 'running' && prevPhaseRef.current !== 'running') {
      console.log('[physics] resetting bug to center', {
        prevPhase: prevPhaseRef.current,
        newPhase: phase,
        time: new Date().toISOString(),
      });
      const bug = bugRef.current;
      if (bug) {
        Body.setPosition(bug, { x: WIDTH / 2, y: HEIGHT / 2 });
        Body.setAngle(bug, Math.random() * Math.PI * 2);
        Body.setVelocity(bug, { x: 0, y: 0 });
        noiseTimeRef.current = 0;
        stuckTimerRef.current = 0;
        trailRef.current = [];
        isPlayingRef.current = true;
      }
    }
    prevPhaseRef.current = phase;
  }, [phase]);
}
