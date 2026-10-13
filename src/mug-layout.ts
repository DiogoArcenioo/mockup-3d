export type ViewPreset = 'duo' | 'single' | 'detail';

export interface MugPose {
  position: [number, number, number];
  rotationY: number;
  scale: number;
  visible: boolean;
}

export function getMugPoses(view: ViewPreset, rotationDegrees = 0): [MugPose, MugPose] {
  const turn = rotationDegrees * Math.PI / 180;
  // Give inward-facing handles room, keeping both mugs on the same plane and scale.
  const halfSpacing = Math.max(1.06, 0.06 + 0.135 + 1.63 * Math.max(0, -Math.cos(turn)));
  const frontAngle = view === 'duo' ? Math.PI : Math.PI - (view === 'single' ? 0.24 : 0.7);
  return [
    {
      position: view === 'duo' ? [-halfSpacing, 0, 0] : [-0.18, 0, 0],
      rotationY: frontAngle + turn,
      scale: 1,
      visible: true,
    },
    {
      position: [halfSpacing, 0, 0],
      rotationY: turn,
      scale: 1,
      visible: view === 'duo',
    },
  ];
}
