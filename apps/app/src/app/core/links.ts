/** A review topic's lesson: system design topic ids start with `sd-` (REDESIGN.md 2.12). */
export const lessonLink = (topic: string) => (topic.startsWith('sd-') ? `/design/topics/${topic}` : `/coding/patterns/${topic}`);

/** Practice of one topic's review items. */
export const drillLink = (topic: string) => `${lessonLink(topic)}/drill`;
