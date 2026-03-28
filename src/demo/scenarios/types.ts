export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  supportsPlay: boolean;
  window: 'overlay' | 'launcher';
  populate: () => void;
  play?: () => () => void; // Returns cleanup fn to cancel timers
}
