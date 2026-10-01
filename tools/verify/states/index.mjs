import { designStates } from './design.mjs';
import { interviewStates } from './interview.mjs';
import { learnStates } from './learn.mjs';

/** Every page state the audits and screenshots cover: a path plus the steps that bring the page into that state. */
export const states = () => [...learnStates(), ...designStates(), ...interviewStates()];
