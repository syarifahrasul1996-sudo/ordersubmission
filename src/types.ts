export interface AppState {
  mainType: string;
  subType: string;
  urgency: string | null;
  baseHours: number;
  addons: string[];
  template: string;
  language: 'ms' | 'en';
  softcopyLang: string;
  clLangs: string[];
  resumeLangs: string[];
  isEditMode: boolean;
  extraHours: number;
  customDoc: string;
}

export type ViewType = 'home' | 'resume-type' | 'resume-form-fields' | 'general-form' | 'confirmation' | 'output' | 'history';

export interface OrderHistoryItem {
  id: string;
  timestamp: number;
  state: AppState;
  messages: string[];
}

export const INITIAL_STATE: AppState = {
  mainType: '',
  subType: '',
  urgency: null,
  baseHours: 0,
  addons: [],
  template: 'L1',
  language: 'ms',
  softcopyLang: 'Melayu',
  clLangs: ['Melayu'],
  resumeLangs: ['Melayu'],
  isEditMode: false,
  extraHours: 0,
  customDoc: ''
};
