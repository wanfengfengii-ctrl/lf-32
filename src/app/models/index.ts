export enum SignalType {
  DRUM = 'DRUM',
  LANTERN = 'LANTERN',
  FLAG = 'FLAG'
}

export interface SignalTypeMeta {
  label: string;
  color: string;
}

export const SignalTypeConfig: Record<SignalType, SignalTypeMeta> = {
  [SignalType.DRUM]: { label: '更鼓', color: '#8B4513' },
  [SignalType.LANTERN]: { label: '灯号', color: '#FF6347' },
  [SignalType.FLAG]: { label: '旗号', color: '#4169E1' }
};

export enum TransmissionDirection {
  FORWARD = 'FORWARD',
  BACKWARD = 'BACKWARD',
  BIDIRECTIONAL = 'BIDIRECTIONAL'
}

export enum StationStatus {
  IDLE = 'IDLE',
  TRANSMITTING = 'TRANSMITTING',
  RECEIVING = 'RECEIVING',
  INTERRUPTED = 'INTERRUPTED',
  CONFIRMED = 'CONFIRMED'
}

export interface PostStation {
  id: string;
  name: string;
  x: number;
  y: number;
  status: StationStatus;
  currentSignal?: SignalType;
  interrupted: boolean;
  interruptionReason?: string;
}

export type CreatePostStationInput = Omit<PostStation, 'id'> & { id?: string };

export function createPostStation(input: CreatePostStationInput): PostStation {
  return {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    x: input.x,
    y: input.y,
    status: input.status,
    currentSignal: input.currentSignal,
    interrupted: input.interrupted,
    interruptionReason: input.interruptionReason
  };
}

export interface VisibilityLink {
  id: string;
  fromStationId: string;
  toStationId: string;
  direction: TransmissionDirection;
  signalTypes: SignalType[];
  delayMs: number;
}

export interface SignalConflict {
  stationId: string;
  signalType1: SignalType;
  signalType2: SignalType;
  timestamp: number;
  message: string;
}

export type TransmissionEventStatus = 'sent' | 'received' | 'failed' | 'interrupted';

export interface TransmissionEvent {
  eventId: string;
  timestamp: number;
  fromStationId: string;
  toStationId: string;
  signalType: SignalType;
  status: TransmissionEventStatus;
  delayMs: number;
  errorMessage?: string;
}

export interface InterruptionRecord {
  stationId: string;
  reason: string;
  timestamp: number;
}

export interface TransmissionRecord {
  recordId: string;
  startTime: number;
  endTime?: number;
  events: TransmissionEvent[];
  startStationId: string;
  initialSignal: SignalType;
  conflicts: SignalConflict[];
  interruptions: InterruptionRecord[];
}

export type PlaybackSpeed = 1 | 2 | 4 | 8;

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  speed: PlaybackSpeed;
  currentTime: number;
  totalTime: number;
  isPlaybackMode: boolean;
}
