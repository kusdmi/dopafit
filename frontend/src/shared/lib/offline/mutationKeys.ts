// Stable, serializable mutation keys so paused mutations survive dehydrate/hydrate.
export const SAVE_MEASUREMENT_KEY = ['measurements', 'save'] as const;
export const UPDATE_MEASUREMENT_KEY = ['measurements', 'update'] as const;
export const SET_FAVORITE_KEY = ['exercises', 'favorite'] as const;
export const SAVE_PROGRAM_KEY = ['programs', 'save'] as const;
export const ADD_EXERCISE_TO_PROGRAM_KEY = ['programs', 'add-exercise'] as const;
export const SYNC_WORKOUT_KEY = ['workouts', 'sync'] as const;
export const MARK_NOTIFICATIONS_READ_KEY = ['notifications', 'read'] as const;
export const SAVE_NOTIFICATION_SETTINGS_KEY = ['notifications', 'settings'] as const;
export const CREATE_SUPPORT_TICKET_KEY = ['support', 'create-ticket'] as const;
export const ADD_SUPPORT_REPLY_KEY = ['support', 'add-reply'] as const;
