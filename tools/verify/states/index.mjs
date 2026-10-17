import { designStates } from './design.mjs';
import { interviewStates } from './interview.mjs';
import { learnStates } from './learn.mjs';
import { todayStates } from './today.mjs';

/** Every page state the audits and screenshots cover: a path plus the steps that bring the page into that state. */
export const states = () => [...learnStates(), ...todayStates(), ...designStates(), ...interviewStates()];
