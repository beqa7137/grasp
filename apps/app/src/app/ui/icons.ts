import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  arrowForward,
  chatbubblesOutline,
  checkmark,
  checkmarkCircle,
  chevronForward,
  closeCircle,
  closeOutline,
  ellipseOutline,
  flame,
  gitNetworkOutline,
  leafOutline,
  pulseOutline,
  timeOutline,
} from 'ionicons/icons';

// The icon map (REDESIGN.md 3.2): one glyph per concept, outline glyphs except for state, which is filled. Bind one with
// `<ion-icon [icon]>`. ionicons is one module, so every glyph the app uses anywhere ships with first paint: prefer a
// glyph already in use.
export const alertIcon = alertCircleOutline;
export const goIcon = arrowForward;
export const feedbackIcon = chatbubblesOutline;
export const checkIcon = checkmark;
export const expandIcon = chevronForward;
export const closeIcon = closeOutline;
export const designIcon = gitNetworkOutline;
export const caughtUpIcon = leafOutline;
export const visualizeIcon = pulseOutline;
export const timeIcon = timeOutline;
export const doneStateIcon = checkmarkCircle;
export const missedStateIcon = closeCircle;
export const notStartedStateIcon = ellipseOutline;
export const streakStateIcon = flame;

// Also registered by concept name (`<ion-icon name="go-icon">`), which makes every page drawing kit glyphs load ionicons'
// runtime too. The glyph data and the runtime share a first-paint chunk, and a page reaching only the glyphs split them
// into two first-paint files, which cost Today about 0.25 s on `timing.mjs`'s phone (R8).
addIcons({
  alertIcon,
  goIcon,
  feedbackIcon,
  checkIcon,
  expandIcon,
  closeIcon,
  designIcon,
  caughtUpIcon,
  visualizeIcon,
  timeIcon,
  doneStateIcon,
  missedStateIcon,
  notStartedStateIcon,
  streakStateIcon,
});
