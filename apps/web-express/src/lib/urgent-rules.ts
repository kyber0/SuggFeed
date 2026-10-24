/** TODO: school staff must finalize these heuristic rules and the escalation process.
 * These are review signals, not diagnoses or factual conclusions about a person.
 */
export const urgentRules = [
 {id:'bullying',pattern:'\\b(bully|bullying|binubully|nambubully|inaapi|pang.?aapi)\\b'},
 {id:'threat',pattern:'\\b(kill you|kill them|death threat|papatayin|patayin|sasaksakin|babarilin|may baril|may bomba)\\b'},
 {id:'harassment',pattern:'\\b(harass(?:ment|ing)?|hinaharass|sexual assault|molest(?:ed|ation)?|ginahasa|hinipuan|panghihipo)\\b'},
 {id:'abuse',pattern:'\\b(abuse|abused|inaabuso|binubugbog|sinasaktan|karahasan)\\b'},
 {id:'self-harm',pattern:'\\b(suicid(?:e|al)|self.?harm|kill myself|want to die|magpakamatay|saktan ang sarili|ayoko nang mabuhay)\\b'},
];
