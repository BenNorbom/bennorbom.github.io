export interface Project64EngineHandle {
  runScenario(name: string): void
  resetBoardStandard(): void
  resetBoardWithMagnet(): void
  setCameraPreset(preset: string): void
  toggleRuleMode(checked: boolean): void
  toggleXray(checked: boolean): void
  toggleRadii(checked: boolean): void
  togglePause(): void
  skipCurrentAnimation(): void
  clearSelection(): void
  executeAlgebraicInput(): void
  updateParam(key: 'squareMm' | 'edgeMarginMm' | 'simSpeed', val: string | number): void
  zoomBy(delta: number): void
  setViewportActive(active: boolean): void
  isAnimating(): boolean
  getState(): {
    commandCount: number
    activeCmdIndex: number
    gantry: { x: number; y: number; magnetOn: boolean; carryingPieceId: number | null }
    pieceCount: number
  }
  dispose(): void
}

export function initProject64Engine(root: HTMLElement): Project64EngineHandle
