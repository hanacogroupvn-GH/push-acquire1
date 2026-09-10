import { Canvas } from '@react-three/fiber'
import { GameProvider, useGameState } from './game/GameContext'
import { useAIDriver } from './game/useAIDriver'
import Scene from './components/board/Scene'
import PlayerSetup from './components/setup/PlayerSetup'
import GameHUD from './components/hud/GameHUD'
import UndoButton from './components/hud/UndoButton'
import './App.css'

function GameScreen() {
  useAIDriver()
  return (
    <div className="app-root">
      <Canvas shadows dpr={[1, 2]}>
        <Scene />
      </Canvas>
      <GameHUD />
      <UndoButton />
    </div>
  )
}

function AppInner() {
  const state = useGameState()
  return state ? <GameScreen /> : <PlayerSetup />
}

function App() {
  return (
    <GameProvider>
      <AppInner />
    </GameProvider>
  )
}

export default App
