import { liveInterviewScenario } from './liveInterview';
import { liveLectureScenario } from './liveLecture';
import { pastMeetingScenario } from './pastMeeting';
import { settingsScenario } from './settings';
import { ragContextScenario } from './ragContext';
import type { DemoScenario } from './types';

export const demoScenarios: DemoScenario[] = [
  liveInterviewScenario,
  liveLectureScenario,
  pastMeetingScenario,
  settingsScenario,
  ragContextScenario,
];

export type { DemoScenario } from './types';
