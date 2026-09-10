import { useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { PerspectiveCamera, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import Board3D from './Board3D'
import { BOARD_WIDTH, BOARD_DEPTH, FRAME_MARGIN, SEAT_MARGIN } from './constants'

const FOV = 42
const ELEVATION_DEG = 65 // tilt down from the horizon, top-down-ish view
const FIT_MARGIN = 1.15 // extra breathing room so nothing touches the frustum edge

// Fixed, self-centering camera: no free rotation, only a limited zoom so the
// whole 9x12 grid always stays inside the frame regardless of viewport size.
function BoardCamera() {
  const controlsRef = useRef(null)
  const { size } = useThree()

  const { position, minDistance, maxDistance } = useMemo(() => {
    const elevation = THREE.MathUtils.degToRad(ELEVATION_DEG)
    const direction = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation))

    // Bounding sphere around the board (grid + frame + player seat plaques
    // just outside it + a placed tile's height) guarantees everything fits
    // regardless of camera tilt.
    const seatHalfW = BOARD_WIDTH / 2 + FRAME_MARGIN + SEAT_MARGIN
    const seatHalfD = BOARD_DEPTH / 2 + FRAME_MARGIN + SEAT_MARGIN
    const boundingRadius = Math.sqrt(seatHalfW ** 2 + seatHalfD ** 2 + 2 ** 2)

    const aspect = size.width / size.height || 1
    const vFov = THREE.MathUtils.degToRad(FOV)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    const effectiveHalfFov = Math.min(vFov, hFov) / 2

    const fitDistance = (boundingRadius / Math.sin(effectiveHalfFov)) * FIT_MARGIN

    return {
      position: direction.multiplyScalar(fitDistance).toArray(),
      minDistance: fitDistance * 0.8,
      maxDistance: fitDistance * 1.25,
    }
  }, [size])

  return (
    <>
      <PerspectiveCamera makeDefault fov={FOV} near={0.1} far={100} position={position} />
      <OrbitControls
        ref={controlsRef}
        target={[0, 0, 0]}
        enableRotate={false}
        enablePan={false}
        enableZoom
        minDistance={minDistance}
        maxDistance={maxDistance}
      />
    </>
  )
}

export default function Scene() {
  return (
    <>
      <color attach="background" args={['#1b1b1f']} />
      <BoardCamera />

      <ambientLight intensity={0.55} />
      <directionalLight
        position={[9, 14, 6]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={40}
      />

      <Board3D />
    </>
  )
}
