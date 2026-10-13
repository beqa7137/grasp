// The icon map (REDESIGN.md 3.2): one glyph per concept, outline glyphs except for state, which is filled. Named
// re-exports rather than one object, so a page imports only the concepts it renders. Bind one with `<ion-icon [icon]>`.
// ionicons is one module, so every glyph the app uses anywhere ships with first paint: prefer a glyph already in use.
export {
  alertCircleOutline as alertIcon,
  arrowForward as goIcon,
  chatbubblesOutline as feedbackIcon,
  checkmark as checkIcon,
  chevronForward as expandIcon,
  closeOutline as closeIcon,
  gitNetworkOutline as designIcon,
  leafOutline as caughtUpIcon,
  pulseOutline as visualizeIcon,
  timeOutline as timeIcon,
  checkmarkCircle as doneStateIcon,
  closeCircle as missedStateIcon,
  ellipseOutline as notStartedStateIcon,
  flame as streakStateIcon,
} from 'ionicons/icons';
