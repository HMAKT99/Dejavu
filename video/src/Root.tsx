import { Composition } from 'remotion';
import { Install, INSTALL_DURATION, FPS } from './Install';

export const Root: React.FC = () => (
  <Composition
    id="Install"
    component={Install}
    durationInFrames={INSTALL_DURATION}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
