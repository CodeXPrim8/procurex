export type FaceRegion = 'skull' | 'outline' | 'cheek' | 'jaw' | 'brow' | 'nose' | 'lipU' | 'lipL' | 'chin' | 'eye'

export type FaceVert = {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  region: FaceRegion
  size: number
  hue: number
}

export type FaceMesh = {
  verts: FaceVert[]
  edges: Array<[number, number]>
  eyeL: { x: number; y: number; z: number; rx: number; ry: number }
  eyeR: { x: number; y: number; z: number; rx: number; ry: number }
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function pushVert(
  verts: FaceVert[],
  x: number,
  y: number,
  z: number,
  region: FaceRegion,
  size: number,
  hue: number
) {
  verts.push({ x, y, z, rx: x, ry: y, rz: z, region, size, hue })
}

function headPoint(u: number, v: number) {
  const phi = (u - 0.5) * Math.PI * 1.22
  const theta = 0.08 + v * Math.PI * 0.9
  let rx = 0.7
  let ry = 1.02
  let rz = 0.76
  const yy = Math.cos(theta) * ry
  let x = Math.sin(theta) * Math.sin(phi) * rx
  let z = Math.sin(theta) * Math.cos(phi) * rz
  let y = yy

  if (y < -0.08) {
    const t = Math.min(1, (-0.08 - y) / 0.82)
    x *= 1 - 0.48 * t
    z *= 1 - 0.18 * t
    y -= 0.04 * t
  }
  if (y > 0.35) {
    const t = (y - 0.35) / 0.7
    x *= 1 - 0.06 * t
    z *= 1 + 0.04 * t
  }
  const cheek = Math.exp(-((y - 0.02) * (y - 0.02)) / 0.07) * Math.exp(-((Math.abs(x) - 0.38) * (Math.abs(x) - 0.38)) / 0.08)
  x += Math.sign(x || 1) * 0.06 * cheek
  z += 0.03 * cheek
  return { x, y, z }
}

function inEye(x: number, y: number, z: number, eye: { x: number; y: number; z: number; rx: number; ry: number }) {
  const dx = (x - eye.x) / eye.rx
  const dy = (y - eye.y) / eye.ry
  const dz = (z - eye.z) / 0.18
  return dx * dx + dy * dy + dz * dz < 1
}

function addRing(
  verts: FaceVert[],
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  count: number,
  region: FaceRegion,
  size: number,
  hue: number
) {
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2
    const jx = (hash(i + 21) - 0.5) * 0.012
    const jy = (hash(i + 51) - 0.5) * 0.01
    pushVert(verts, cx + Math.cos(a) * rx + jx, cy + Math.sin(a) * ry + jy, cz + Math.sin(a) * 0.02, region, size, hue)
  }
}

export function buildFaceMesh(density: number): FaceMesh {
  const verts: FaceVert[] = []
  const lat = Math.max(18, Math.round(28 * density))
  const lon = Math.max(22, Math.round(36 * density))
  const eyeL = { x: -0.23, y: 0.1, z: 0.58, rx: 0.125, ry: 0.095 }
  const eyeR = { x: 0.23, y: 0.1, z: 0.58, rx: 0.125, ry: 0.095 }

  for (let i = 0; i <= lat; i += 1) {
    for (let j = 0; j <= lon; j += 1) {
      const u = j / lon
      const v = i / lat
      const p = headPoint(u + (hash(i * 80 + j) - 0.5) * 0.012, v + (hash(j * 40 + i) - 0.5) * 0.01)
      if (inEye(p.x, p.y, p.z, eyeL) || inEye(p.x, p.y, p.z, eyeR)) continue
      const edge = v < 0.04 || v > 0.96 || u < 0.04 || u > 0.96
      const region: FaceRegion = p.y < -0.42 ? 'chin' : p.y < -0.18 ? 'jaw' : p.y < 0.18 && Math.abs(p.x) > 0.28 ? 'cheek' : edge ? 'outline' : 'skull'
      const hue = region === 'outline' || region === 'chin' ? 0.18 : 0.62
      const size = edge ? 1.35 : 0.78 + hash(i * 9 + j) * 0.5
      pushVert(verts, p.x, p.y, p.z, region, size, hue)
    }
  }

  addRing(verts, eyeL.x, eyeL.y, eyeL.z + 0.02, eyeL.rx, eyeL.ry, Math.round(28 * density), 'eye', 1.15, 0.2)
  addRing(verts, eyeR.x, eyeR.y, eyeR.z + 0.02, eyeR.rx, eyeR.ry, Math.round(28 * density), 'eye', 1.15, 0.2)
  addRing(verts, eyeL.x, eyeL.y, eyeL.z + 0.01, eyeL.rx * 0.72, eyeL.ry * 0.7, Math.round(16 * density), 'eye', 0.85, 0.55)
  addRing(verts, eyeR.x, eyeR.y, eyeR.z + 0.01, eyeR.rx * 0.72, eyeR.ry * 0.7, Math.round(16 * density), 'eye', 0.85, 0.55)

  const browN = Math.round(18 * density)
  for (let i = 0; i < browN; i += 1) {
    const t = i / Math.max(1, browN - 1)
    const x = -0.38 + t * 0.76
    const y = 0.22 + Math.sin(t * Math.PI) * 0.045 - Math.abs(x) * 0.04
    pushVert(verts, x, y, 0.6, 'brow', 1.05, 0.48)
  }

  const noseN = Math.round(22 * density)
  for (let i = 0; i < noseN; i += 1) {
    const t = i / Math.max(1, noseN - 1)
    const y = 0.14 - t * 0.3
    const z = 0.58 + t * 0.22
    const w = t > 0.72 ? (t - 0.72) * 0.28 : 0.012 + t * 0.03
    pushVert(verts, 0, y, z, 'nose', t > 0.85 ? 1.7 : 1.05, t > 0.8 ? 0.08 : 0.22)
    if (t > 0.55) {
      pushVert(verts, w, y - 0.01, z - 0.02, 'nose', 0.95, 0.28)
      pushVert(verts, -w, y - 0.01, z - 0.02, 'nose', 0.95, 0.28)
    }
  }
  addRing(verts, 0, -0.14, 0.78, 0.07, 0.045, Math.round(12 * density), 'nose', 1.25, 0.12)

  const lipN = Math.round(24 * density)
  for (let i = 0; i < lipN; i += 1) {
    const t = i / Math.max(1, lipN - 1)
    const x = (t - 0.5) * 0.42
    const cupid = Math.cos((t - 0.5) * Math.PI) * 0.018
    pushVert(verts, x, -0.3 + cupid, 0.66, 'lipU', 1.1, 0.16)
    pushVert(verts, x * 0.96, -0.345 - Math.abs(x) * 0.04, 0.65, 'lipL', 1.05, 0.2)
  }

  const jawN = Math.round(20 * density)
  for (let i = 0; i < jawN; i += 1) {
    const t = i / Math.max(1, jawN - 1)
    const a = Math.PI * 0.15 + t * Math.PI * 0.7
    const x = Math.cos(a) * 0.58
    const y = -0.22 + Math.sin(a) * 0.42
    pushVert(verts, x, y, 0.42, 'jaw', 1.2, 0.35)
  }

  const aura = Math.round(40 * density)
  for (let i = 0; i < aura; i += 1) {
    const a = (i / aura) * Math.PI * 2
    const r = 0.95 + hash(i + 3) * 0.18
    const x = Math.cos(a) * 0.62 * r
    const y = Math.sin(a) * 0.95 * r
    if (y < -1.05) continue
    pushVert(verts, x, y, -0.05, 'outline', 0.55 + hash(i) * 0.4, 0.15 + hash(i + 8) * 0.2)
  }

  const edges: Array<[number, number]> = []
  const maxDist = 0.13 / Math.max(0.7, density)
  const neighborCap = density < 0.85 ? 2 : 3
  const cell = maxDist
  const grid = new Map<string, number[]>()
  const cellKey = (x: number, y: number, z: number) =>
    `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`
  for (let i = 0; i < verts.length; i += 1) {
    const v = verts[i]
    const key = cellKey(v.x, v.y, v.z)
    const bucket = grid.get(key)
    if (bucket) bucket.push(i)
    else grid.set(key, [i])
  }
  for (let i = 0; i < verts.length; i += 1) {
    const a = verts[i]
    const cx = Math.floor(a.x / cell)
    const cy = Math.floor(a.y / cell)
    const cz = Math.floor(a.z / cell)
    const nearest: Array<{ j: number; d: number }> = []
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`)
          if (!bucket) continue
          for (let b = 0; b < bucket.length; b += 1) {
            const j = bucket[b]
            if (j <= i) continue
            const o = verts[j]
            const ddx = a.x - o.x
            const ddy = a.y - o.y
            const ddz = a.z - o.z
            const d = ddx * ddx + ddy * ddy + ddz * ddz
            if (d > maxDist * maxDist) continue
            nearest.push({ j, d })
          }
        }
      }
    }
    nearest.sort((p, q) => p.d - q.d)
    const take = nearest.slice(0, neighborCap)
    for (let k = 0; k < take.length; k += 1) {
      edges.push([i, take[k].j])
    }
  }

  return { verts, edges, eyeL, eyeR }
}

export function resetFaceMesh(mesh: FaceMesh) {
  const { verts } = mesh
  for (let i = 0; i < verts.length; i += 1) {
    const v = verts[i]
    v.x = v.rx
    v.y = v.ry
    v.z = v.rz
  }
}

export function deformFace(
  mesh: FaceMesh,
  mouth: { jaw: number; open: number; width: number; round: number; fv: number },
  blink: number,
  headYaw: number,
  headPitch: number
) {
  const { verts, eyeL, eyeR } = mesh
  const hingeY = -0.2
  const jawA = mouth.jaw * 0.28
  const cosJ = Math.cos(jawA)
  const sinJ = Math.sin(jawA)
  const cy = Math.cos(headYaw)
  const sy = Math.sin(headYaw)
  const cp = Math.cos(headPitch)
  const sp = Math.sin(headPitch)

  for (let i = 0; i < verts.length; i += 1) {
    const v = verts[i]
    let x = v.rx
    let y = v.ry
    let z = v.rz

    if (v.region === 'jaw' || v.region === 'chin' || v.region === 'lipL') {
      const dy = y - hingeY
      const y2 = hingeY + dy * cosJ + (z - 0.5) * sinJ * 0.35
      const z2 = z - dy * sinJ * 0.45
      y = y2
      z = z2
    }

    if (v.region === 'lipU') {
      y += mouth.open * 0.045
      x *= 1 + mouth.width * 0.22
      z += mouth.round * 0.035
    }
    if (v.region === 'lipL') {
      y -= mouth.open * 0.055 + mouth.jaw * 0.02
      x *= 1 + mouth.width * 0.18
      if (mouth.fv > 0) {
        y += mouth.fv * 0.035
        z += mouth.fv * 0.04
      }
      z += mouth.round * 0.02
    }
    if (v.region === 'chin') {
      y -= mouth.jaw * 0.03
    }

    if (v.region === 'eye') {
      const eye = x < 0 ? eyeL : eyeR
      y = eye.y + (y - eye.y) * (1 - blink * 0.82)
    }

    const xz = x * cy + z * sy
    const zz = -x * sy + z * cy
    const yz = y * cp - zz * sp
    const zf = y * sp + zz * cp
    v.x = xz
    v.y = yz
    v.z = zf
  }
}
