"use client";

import { useEffect, useRef, useState, CSSProperties } from "react";
import * as THREE from "three";

type Obstacle = {
  mesh: THREE.Mesh;
  laneIndex: number;
  falling: boolean;
  vy: number;
  landed: boolean;
};

type SpeedLine = { mesh: THREE.Mesh; life: number; maxLife: number };
type RainLine = { mesh: THREE.Mesh; speed: number };

type LaneColor = {
  color: number;
  uiAccent: string;
};

type GameState = {
  running: boolean;
  paused: boolean;
  gameOver: boolean;

  lastTime: number;

  laneIndex: number;
  laneStartX: number;
  laneTargetX: number;
  laneT: number;
  laneDuration: number;

  speed: number;
  difficulty: number;
  spawnTimer: number;
  spawnInterval: number;

  score: number;
  topScore: number;

  obstacles: Obstacle[];
  blocksSpawned: number;

  speedLines: SpeedLine[];
  rainLines: RainLine[];
};

const LANES = [-3, 0, 3];
const STORAGE_KEY = "falling_blocks_top_score";

const LANE_COLORS: LaneColor[] = [
  { color: 0x22ff88, uiAccent: "#22ff88" }, // green
  { color: 0xff66cc, uiAccent: "#ff66cc" }, // pink
  { color: 0xaa66ff, uiAccent: "#aa66ff" }, // purple
  { color: 0x44ccff, uiAccent: "#44ccff" }, // blue
  { color: 0xffee66, uiAccent: "#ffee66" }, // yellow
];

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<GameState | null>(null);

  const [score, setScore] = useState(0);
  const [topScore, setTopScore] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [overlayText, setOverlayText] = useState("Tap or press any key to start");
  const [laneColorIndex, setLaneColorIndex] = useState(0);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;

    const storedTop = Number(localStorage.getItem(STORAGE_KEY) || 0);
    setTopScore(storedTop);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030508, 0.12);

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      300
    );
    camera.position.set(0, 3, 7);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x030508);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // lights
    scene.add(new THREE.HemisphereLight(0x66aaff, 0x000011, 0.8));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9);
    dl.position.set(6, 12, 6);
    dl.castShadow = true;
    dl.shadow.mapSize.set(1024, 1024);
    scene.add(dl);

    // ground
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x060a10,
      metalness: 0.9,
      roughness: 0.3,
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 400),
      groundMat
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -180;
    ground.receiveShadow = true;
    scene.add(ground);

    // lanes
    const laneLines: THREE.Mesh[] = [];
    function createLaneLine(x: number) {
      const g = new THREE.PlaneGeometry(0.06, 230);
      const m = new THREE.MeshBasicMaterial({
        color: LANE_COLORS[0].color,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      });
      const line = new THREE.Mesh(g, m);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.011, -115);
      scene.add(line);
      laneLines.push(line);
    }
    createLaneLine(-3);
    createLaneLine(0);
    createLaneLine(3);

    function updateLaneColors(index: number) {
      const col = LANE_COLORS[index % LANE_COLORS.length].color;
      laneLines.forEach((line) => {
        const m = line.material as THREE.MeshBasicMaterial;
        m.color.setHex(col);
      });
      setLaneColorIndex(index % LANE_COLORS.length);
    }

    // player
    const playerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x66aaff,
      emissiveIntensity: 1.1,
      metalness: 0.9,
      roughness: 0.25,
    });
    const player = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      playerMat
    );
    player.position.set(0, 0.5, 2);
    player.castShadow = true;
    scene.add(player);

    // trail (simple ground glow under player)
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x66aaff,
      transparent: true,
      opacity: 0.2,
    });
    const trail = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 3),
      trailMat
    );
    trail.rotation.x = -Math.PI / 2;
    trail.position.y = 0.02;
    scene.add(trail);

    // speed lines & rain
    const speedLines: SpeedLine[] = [];
    const rainLines: RainLine[] = [];

    function spawnSpeedLine(intensity = 1) {
      const len = 1.2 + Math.random() * 2.0 * intensity;
      const geo = new THREE.PlaneGeometry(0.08, len);
      const colors = [0x22ff88, 0xff66cc, 0xaa66ff, 0x44ccff, 0xffee66];
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      });
      const line = new THREE.Mesh(geo, mat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(
        player.position.x + (Math.random() - 0.5) * 3,
        0.04,
        player.position.z - 2 - Math.random() * 4
      );
      scene.add(line);
      speedLines.push({
        mesh: line,
        life: 0,
        maxLife: 0.25 + Math.random() * 0.2,
      });
    }

    function spawnRainLine() {
      const geo = new THREE.PlaneGeometry(0.06, 2.0 + Math.random() * 1.2);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x3f92ff,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(
        (Math.random() - 0.5) * 20,
        0.03,
        player.position.z - 50 - Math.random() * 70
      );
      scene.add(m);
      rainLines.push({
        mesh: m,
        speed: 22 + Math.random() * 10,
      });
    }

    // game state
    gameRef.current = {
      running: false,
      paused: false,
      gameOver: false,
      lastTime: 0,

      laneIndex: 1,
      laneStartX: 0,
      laneTargetX: 0,
      laneT: 0,
      laneDuration: 0.1,

      speed: 6,
      difficulty: 1,
      spawnTimer: 0,
      spawnInterval: 1.2,

      score: 0,
      topScore: storedTop,

      obstacles: [],
      blocksSpawned: 0,

      speedLines,
      rainLines,
    };

    function tryMoveLane(delta: number) {
      const g = gameRef.current;
      if (!g || g.gameOver) return;
      const newIndex = g.laneIndex + delta;
      if (newIndex < 0 || newIndex > 2) return;
      g.laneIndex = newIndex;
      g.laneStartX = player.position.x;
      g.laneTargetX = LANES[g.laneIndex];
      g.laneT = 0;

      spawnSpeedLine(1.5);
      spawnSpeedLine(1.5);
    }

    function spawnObstacle() {
      const g = gameRef.current;
      if (!g) return;

      const laneIndex = Math.floor(Math.random() * 3);
      const x = LANES[laneIndex];
      const difficultyFactor = Math.min(2, 0.8 + g.difficulty * 0.1);

      const w = 0.8 + Math.random() * 1.5 * difficultyFactor;
      const h = 0.8 + Math.random() * 1.2 * difficultyFactor;
      const d = 0.8 + Math.random() * 1.5 * difficultyFactor;

      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xff6666,
        emissiveIntensity: 0.9,
        metalness: 0.85,
        roughness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 8 + Math.random() * 3, -40 - Math.random() * 20);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      g.obstacles.push({
        mesh,
        laneIndex,
        falling: true,
        vy: 0,
        landed: false,
      });

      g.blocksSpawned += 1;
      if (g.blocksSpawned % 10 === 0) {
        const newIndex =
          ((g.blocksSpawned / 10) | 0) % LANE_COLORS.length;
        updateLaneColors(newIndex);
      }
    }

    function resetWorld() {
      const g = gameRef.current;
      if (!g) return;

      g.obstacles.forEach((o) => scene.remove(o.mesh));
      g.obstacles = [];
      g.speedLines.forEach((s) => scene.remove(s.mesh));
      g.rainLines.forEach((r) => scene.remove(r.mesh));
      g.speedLines.length = 0;
      g.rainLines.length = 0;

      g.speed = 6;
      g.difficulty = 1;
      g.spawnInterval = 1.2;
      g.spawnTimer = 0;
      g.score = 0;
      g.blocksSpawned = 0;

      g.laneIndex = 1;
      g.laneStartX = 0;
      g.laneTargetX = 0;
      g.laneT = 0;

      player.position.set(0, 0.5, 2);
      ground.position.z = -180;
      updateLaneColors(0);
    }

    function startGame() {
      const g = gameRef.current;
      if (!g) return;
      resetWorld();
      g.running = true;
      g.paused = false;
      g.gameOver = false;
      g.lastTime = performance.now();
      setShowOverlay(false);
      setIsPaused(false);
      setScore(0);
      setOverlayText("Tap or press any key to restart");
    }

    function endGame() {
      const g = gameRef.current;
      if (!g) return;
      g.gameOver = true;
      g.running = false;
      if (g.score > g.topScore) {
        g.topScore = g.score;
        localStorage.setItem(STORAGE_KEY, String(Math.floor(g.topScore)));
        setTopScore(Math.floor(g.topScore));
      }
      setShowOverlay(true);
      setIsPaused(false);
      setOverlayText("Hit · tap or press any key to restart");
    }

    function togglePause() {
      const g = gameRef.current;
      if (!g || !g.running || g.gameOver) return;
      g.paused = !g.paused;
      setIsPaused(g.paused);
      if (!g.paused) {
        g.lastTime = performance.now();
      }
    }

    function intersectsCube(
      mesh: THREE.Mesh,
      px: number,
      py: number,
      pz: number,
      radius = 0.7
    ) {
      const box = new THREE.Box3().setFromObject(mesh);
      const cx = THREE.MathUtils.clamp(px, box.min.x, box.max.x);
      const cy = THREE.MathUtils.clamp(py, box.min.y, box.max.y);
      const cz = THREE.MathUtils.clamp(pz, box.min.z, box.max.z);
      const dx = cx - px;
      const dy = cy - py;
      const dz = cz - pz;
      return dx * dx + dy * dy + dz * dz < radius * radius;
    }

    function loop(time: number) {
      requestAnimationFrame(loop);
      const g = gameRef.current;
      if (!g) {
        renderer.render(scene, camera);
        return;
      }

      if (!g.running || g.paused) {
        renderer.render(scene, camera);
        return;
      }

      const dt = Math.min((time - g.lastTime) / 1000, 0.05);
      g.lastTime = time;

      if (g.gameOver) {
        renderer.render(scene, camera);
        return;
      }

      // score / difficulty
      g.score += dt * (8 + g.difficulty * 2);
      setScore(Math.floor(g.score));

      g.difficulty += dt * 0.03;
      g.speed = 6 + g.difficulty * 4;
      g.spawnInterval = Math.max(0.5, 1.2 - g.difficulty * 0.05);

      // lane interpolation
      if (g.laneT < g.laneDuration) {
        g.laneT += dt;
        const tNorm = Math.min(1, g.laneT / g.laneDuration);
        const smooth = tNorm * tNorm * (3 - 2 * tNorm);
        player.position.x = THREE.MathUtils.lerp(
          g.laneStartX,
          g.laneTargetX,
          smooth
        );
      } else {
        player.position.x = g.laneTargetX;
      }

      // player traits
      const speedFactor = g.speed / 30;
      const pm = player.material as THREE.MeshStandardMaterial;
      pm.emissiveIntensity =
        1.0 + speedFactor * 0.5 + Math.sin(time * 0.02) * 0.2;

      // trail
      trail.position.x = player.position.x;
      trail.position.z = player.position.z - 1.7;
      const tMat = trail.material as THREE.MeshBasicMaterial;
      tMat.opacity = 0.18 + speedFactor * 0.1;

      // camera
      const targetFov = 60 + speedFactor * 7;
      camera.fov += (targetFov - camera.fov) * 5 * dt;
      camera.updateProjectionMatrix();

      camera.position.x +=
        (player.position.x * 0.5 - camera.position.x) * 6 * dt;
      camera.position.y += (3 - camera.position.y) * 4 * dt;
      camera.position.z = player.position.z + 7;

      camera.lookAt(player.position.x, player.position.y + 0.4, player.position.z - 8);

      // world movement
      const forward = g.speed * dt;

      ground.position.z += forward;
      if (ground.position.z > 0) ground.position.z = -180;

      laneLines.forEach((line) => {
        line.position.z += forward;
        if (line.position.z > 10) line.position.z = -115;
      });

      // spawn obstacles
      g.spawnTimer += dt;
      if (g.spawnTimer > g.spawnInterval) {
        g.spawnTimer = 0;
        spawnObstacle();
      }

      // obstacles: falling then sliding
      for (let i = g.obstacles.length - 1; i >= 0; i--) {
        const o = g.obstacles[i];

        if (o.falling && !o.landed) {
          o.vy += -25 * dt;
          o.mesh.position.y += o.vy * dt;
          o.mesh.position.z += forward * 0.3; // a little drift forward while falling

          if (o.mesh.position.y <= 0.5 + o.mesh.scale.y / 2) {
            // impact
            o.mesh.position.y = 0.5 + o.mesh.scale.y / 2;
            o.falling = false;
            o.landed = true;
            o.vy = 0;
            const m = o.mesh.material as THREE.MeshStandardMaterial;
            m.emissiveIntensity = 1.5; // flash on impact
          }
        } else if (o.landed) {
          // slide toward player with world movement
          o.mesh.position.z += forward;

          // slight wobble
          o.mesh.rotation.y = Math.sin(time * 0.004 + i) * 0.15;
        }

        if (o.mesh.position.z > 10) {
          scene.remove(o.mesh);
          g.obstacles.splice(i, 1);
          continue;
        }

        if (
          intersectsCube(
            o.mesh,
            player.position.x,
            player.position.y,
            player.position.z,
            0.7
          )
        ) {
          endGame();
          break;
        }
      }

      // rain
      if (Math.random() < dt * (10 + g.speed * 0.8)) spawnRainLine();
      for (let i = g.rainLines.length - 1; i >= 0; i--) {
        const rl = g.rainLines[i];
        rl.mesh.position.z += rl.speed * dt;
        const mat = rl.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity *= 0.99;
        if (rl.mesh.position.z > player.position.z + 18) {
          scene.remove(rl.mesh);
          g.rainLines.splice(i, 1);
        }
      }

      // speed lines
      if (g.speed > 18 && Math.random() < dt * 30) spawnSpeedLine(1.1);
      if (Math.random() < dt * 10) spawnSpeedLine(0.7);

      for (let i = g.speedLines.length - 1; i >= 0; i--) {
        const sl = g.speedLines[i];
        sl.life += dt;
        sl.mesh.position.z += forward * 1.4;
        const tNorm = sl.life / sl.maxLife;
        const mat = sl.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.9 * (1 - tNorm));
        if (sl.life > sl.maxLife) {
          scene.remove(sl.mesh);
          g.speedLines.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    }

    requestAnimationFrame(loop);

    function handleStartOrRestart() {
      const g = gameRef.current;
      if (!g) return;
      if (!g.running || g.gameOver) {
        startGame();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      const g = gameRef.current;
      if (!g) return;

      if (e.code !== "KeyP" && e.code !== "Escape") {
        handleStartOrRestart();
      }

      if (e.code === "ArrowLeft" || e.code === "KeyA") tryMoveLane(-1);
      if (e.code === "ArrowRight" || e.code === "KeyD") tryMoveLane(1);

      if (e.code === "Escape" || e.code === "KeyP") togglePause();
    }

    function onKeyUp(_e: KeyboardEvent) {
      // no-op for now
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // touch / mobile
    let sx = 0,
      sy = 0,
      st = 0;

    function onTouchStart(e: TouchEvent) {
      const t = e.changedTouches[0];
      sx = t.clientX;
      sy = t.clientY;
      st = performance.now();
      handleStartOrRestart();
    }

    function onTouchEnd(e: TouchEvent) {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const g = gameRef.current;
      if (!g) return;

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const threshold = 40;

      if (absX > absY && absX > threshold) {
        if (dx < 0) tryMoveLane(-1);
        else tryMoveLane(1);
        return;
      }

      if (absY > absX && absY > threshold) {
        // we could add a future mechanic here (e.g., slow time)
        return;
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    function onClick() {
      const g = gameRef.current;
      if (!g) return;
      if (g.paused && g.running && !g.gameOver) {
        togglePause();
      }
    }
    window.addEventListener("click", onClick);

    function onResize() {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    }
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);
      container.removeChild(renderer.domElement);
    };
  }, []);

  const laneAccent = LANE_COLORS[laneColorIndex].uiAccent;

  const hudStyle: CSSProperties = {
    position: "fixed",
    top: 14,
    left: "50%",
    transform: "translateX(-50%)",
    padding: "6px 14px",
    background: "rgba(5,10,18,0.9)",
    borderRadius: 999,
    border: `1px solid ${laneAccent}80`,
    backdropFilter: "blur(16px)",
    display: "flex",
    alignItems: "center",
    gap: 14,
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "white",
    zIndex: 20,
  };

  const overlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.8)",
    backdropFilter: "blur(12px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    color: "white",
    zIndex: 30,
    textAlign: "center",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "black",
      }}
    >
      <div
        ref={mountRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />

      {/* HUD */}
      <div style={hudStyle}>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 16,
            color: "#e6ffff",
          }}
        >
          {score.toString().padStart(4, "0")}
        </div>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 11,
            opacity: 0.85,
            color: "#a5b4ff",
          }}
        >
          TOP {topScore.toString().padStart(4, "0")}
        </div>
      </div>

      {/* Start / game over overlay */}
      {showOverlay && (
        <div style={overlayStyle}>
          <h2
            style={{
              fontSize: 18,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              marginBottom: 6,
              color: "#e6ffff",
            }}
          >
            FALLING LANES
          </h2>
          <p style={{ opacity: 0.9, fontSize: 13, marginBottom: 4, color: "#a5f3fc" }}>
            A / D / ← → or swipe left/right to dodge
          </p>
          <p style={{ opacity: 0.8, fontSize: 12, color: "#cbd5f5" }}>{overlayText}</p>
        </div>
      )}

      {/* Pause overlay */}
      {isPaused && !showOverlay && (
        <div style={overlayStyle}>
          <div
            style={{
              fontSize: 18,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              opacity: 0.9,
              color: "#e5f9ff",
            }}
          >
            PAUSED
          </div>
          <p style={{ marginTop: 8, opacity: 0.85, fontSize: 12, color: "#cbd5f5" }}>
            Click anywhere or press Esc / P to resume
          </p>
        </div>
      )}
    </div>
  );
}
